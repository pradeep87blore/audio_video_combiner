import { spawn } from 'child_process'
import { mkdir, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { tmpdir } from 'os'
import { appendSceneFades } from './transitions'
import { resolveVideoEncoder, type EncoderPreference, type VideoEncoderConfig } from './encoders'
import {
  buildOverlayScaleFilter,
  buildScalePadFilter,
  resolveGpuAccel,
  type GpuAccelConfig
} from './hwaccel'
import { getFfmpegPath } from './paths'
import { probeMedia, probeWavDuration } from './probe'
import {
  ClipInfo,
  ClipSegment,
  getCanvasSize,
  getTargetFps
} from './planner'
import { buildCompleteSegments } from './bookends'
import { buildClipInfos, buildImageInfos } from './clip-info'
import type { OverlayLayer } from '../../src/types'

export interface CombineJobOptions {
  primaryFolder: string
  primaryMode: 'videos' | 'images'
  primaryPaths: string[]
  introPath?: string
  outroPath?: string
  overlays: OverlayLayer[]
  wavPath: string
  outputPath: string
  encoderPreference: EncoderPreference
  sceneTransitions: boolean
}

export interface ProgressCallback {
  (percent: number, message: string): void
}

/** Windows command-line limit — keep each FFmpeg invoke under this many inputs. */
const MAX_SEGMENTS_PER_PASS = 12

function toConcatListLine(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/').replace(/'/g, "'\\''")
  return `file '${normalized}'`
}

function parseTimeToSeconds(time: string): number {
  const match = time.match(/(\d+):(\d+):(\d+(?:\.\d+)?)/)
  if (!match) return 0
  const hours = parseInt(match[1], 10)
  const minutes = parseInt(match[2], 10)
  const seconds = parseFloat(match[3])
  return hours * 3600 + minutes * 60 + seconds
}

function runFfmpeg(
  args: string[],
  targetDuration: number,
  onProgress: ProgressCallback,
  phaseStart: number,
  phaseWeight: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(getFfmpegPath(), args, { windowsHide: true })
    let stderr = ''

    proc.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      stderr += text

      const timeMatch = text.match(/time=(\d+:\d+:\d+(?:\.\d+)?)/)
      if (timeMatch && targetDuration > 0) {
        const elapsed = parseTimeToSeconds(timeMatch[1])
        const phasePercent = Math.min(100, (elapsed / targetDuration) * 100)
        const totalPercent = phaseStart + (phasePercent / 100) * phaseWeight
        onProgress(Math.min(99, totalPercent), 'Processing video...')
      }
    })

    proc.on('close', (code) => {
      if (code === 0) {
        resolve()
      } else {
        const lines = stderr.trim().split('\n').slice(-20).join('\n')
        reject(new Error(`FFmpeg failed (exit ${code}):\n${lines}`))
      }
    })

    proc.on('error', reject)
  })
}

function buildConcatFilter(
  segments: ClipSegment[],
  width: number,
  height: number,
  fps: number,
  globalOffset: number,
  globalSegmentCount: number,
  sceneTransitions: boolean,
  accel: GpuAccelConfig | null
): { filterComplex: string; inputArgs: string[] } {
  const inputArgs: string[] = []
  const filterParts: string[] = []

  segments.forEach((segment, localIndex) => {
    const globalIndex = globalOffset + localIndex

    if (segment.isImage) {
      // Images stay on the CPU path — CUDA hwaccel does not apply.
      inputArgs.push('-loop', '1', '-i', segment.path)
    } else if (accel) {
      inputArgs.push(...accel.inputArgs, '-i', segment.path)
    } else {
      inputArgs.push('-i', segment.path)
    }

    const useCudaScale = Boolean(accel) && !segment.isImage
    let chain =
      `[${localIndex}:v]trim=duration=${segment.duration},setpts=PTS-STARTPTS,` +
      buildScalePadFilter(width, height, fps, useCudaScale ? accel : null)
    chain = appendSceneFades(
      chain,
      segment.duration,
      globalIndex,
      globalSegmentCount,
      sceneTransitions
    )
    filterParts.push(`${chain}[v${localIndex}]`)
  })

  const concatInputs = segments.map((_, index) => `[v${index}]`).join('')
  filterParts.push(`${concatInputs}concat=n=${segments.length}:v=1:a=0[outv]`)

  return {
    filterComplex: filterParts.join(';'),
    inputArgs
  }
}

async function runConcatPass(
  segments: ClipSegment[],
  globalOffset: number,
  globalSegmentCount: number,
  width: number,
  height: number,
  fps: number,
  outputPath: string,
  encoder: VideoEncoderConfig,
  onProgress: ProgressCallback,
  phaseStart: number,
  phaseWeight: number,
  sceneTransitions: boolean,
  accel: GpuAccelConfig | null
): Promise<void> {
  const passDuration = segments.reduce((sum, segment) => sum + segment.duration, 0)
  const { filterComplex, inputArgs } = buildConcatFilter(
    segments,
    width,
    height,
    fps,
    globalOffset,
    globalSegmentCount,
    sceneTransitions,
    accel
  )

  await runFfmpeg(
    [
      ...inputArgs,
      '-filter_complex',
      filterComplex,
      '-map',
      '[outv]',
      '-an',
      ...encoder.args,
      '-y',
      outputPath
    ],
    passDuration,
    onProgress,
    phaseStart,
    phaseWeight
  )
}

async function mergeChunkVideos(
  chunkPaths: string[],
  listPath: string,
  outputPath: string,
  encoder: VideoEncoderConfig,
  totalDuration: number,
  onProgress: ProgressCallback,
  phaseStart: number,
  phaseWeight: number
): Promise<void> {
  const listContent = chunkPaths.map(toConcatListLine).join('\n')
  await writeFile(listPath, listContent, 'utf-8')

  await runFfmpeg(
    [
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      listPath,
      '-an',
      ...encoder.args,
      '-y',
      outputPath
    ],
    totalDuration,
    onProgress,
    phaseStart,
    phaseWeight
  )
}

async function concatPrimary(
  segments: ClipSegment[],
  clips: ClipInfo[],
  bookendClips: ClipInfo[],
  tempDir: string,
  onProgress: ProgressCallback,
  isImageMode: boolean,
  encoder: VideoEncoderConfig,
  sceneTransitions: boolean,
  accel: GpuAccelConfig | null
): Promise<string> {
  const { width, height } = getCanvasSize([...clips, ...bookendClips])
  const fps = isImageMode ? 30 : getTargetFps([...clips, ...bookendClips])
  const totalDuration = segments.reduce((sum, s) => sum + s.duration, 0)
  const outputPath = join(tempDir, 'primary.mp4')
  const globalSegmentCount = segments.length

  onProgress(
    5,
    isImageMode
      ? 'Building slideshow from images...'
      : accel
        ? `Concatenating primary clips (${accel.label})...`
        : 'Concatenating primary clips...'
  )

  if (globalSegmentCount <= MAX_SEGMENTS_PER_PASS) {
    await runConcatPass(
      segments,
      0,
      globalSegmentCount,
      width,
      height,
      fps,
      outputPath,
      encoder,
      onProgress,
      5,
      50,
      sceneTransitions,
      accel
    )
    return outputPath
  }

  const chunkCount = Math.ceil(globalSegmentCount / MAX_SEGMENTS_PER_PASS)
  onProgress(5, `Concatenating ${globalSegmentCount} segments in ${chunkCount} batches...`)

  const chunkPaths: string[] = []
  const passWeight = 45 / chunkCount

  for (let offset = 0; offset < globalSegmentCount; offset += MAX_SEGMENTS_PER_PASS) {
    const chunk = segments.slice(offset, offset + MAX_SEGMENTS_PER_PASS)
    const chunkPath = join(tempDir, `chunk_${chunkPaths.length}.mp4`)

    await runConcatPass(
      chunk,
      offset,
      globalSegmentCount,
      width,
      height,
      fps,
      chunkPath,
      encoder,
      onProgress,
      5 + chunkPaths.length * passWeight,
      passWeight,
      sceneTransitions,
      accel
    )
    chunkPaths.push(chunkPath)
  }

  const listPath = join(tempDir, 'chunks.txt')
  await mergeChunkVideos(
    chunkPaths,
    listPath,
    outputPath,
    encoder,
    totalDuration,
    onProgress,
    50,
    5
  )

  return outputPath
}

function buildOverlayFilterChain(
  overlays: OverlayLayer[],
  canvasWidth: number,
  canvasHeight: number,
  targetDuration: number,
  accel: GpuAccelConfig | null,
  baseLabel = '[0:v]'
): string {
  const activeOverlays = overlays.filter((overlay) => overlay.path)
  const filterParts: string[] = []
  let currentLabel = baseLabel

  activeOverlays.forEach((overlay, index) => {
    const inputIndex = index + 1
    const opacity = Math.max(0, Math.min(1, overlay.opacity / 100))
    const targetWidth = Math.max(2, Math.round((canvasWidth * overlay.width) / 100))
    const targetHeight = Math.max(2, Math.round((canvasHeight * overlay.height) / 100))
    const posX = Math.round((canvasWidth * overlay.x) / 100)
    const posY = Math.round((canvasHeight * overlay.y) / 100)
    const ovlLabel = `[ovl${index}]`
    const outLabel = index === activeOverlays.length - 1 ? '[outv]' : `[tmp${index}]`

    const keyFilter = overlay.removeBlack ? 'colorkey=0x000000:0.28:0.12,' : ''
    const scaleFilter = buildOverlayScaleFilter(
      targetWidth,
      targetHeight,
      overlay.lockAspectRatio !== false,
      accel
    )

    filterParts.push(
      `[${inputIndex}:v]loop=-1:size=32767:start=0,trim=duration=${targetDuration},setpts=PTS-STARTPTS,` +
        `${scaleFilter},` +
        `${keyFilter}format=rgba,colorchannelmixer=aa=${opacity.toFixed(4)}${ovlLabel}`
    )
    filterParts.push(`${currentLabel}${ovlLabel}overlay=${posX}:${posY}:format=auto${outLabel}`)
    currentLabel = outLabel
  })

  return filterParts.join(';')
}

async function renderFinal(
  primaryPath: string,
  wavPath: string,
  outputPath: string,
  targetDuration: number,
  canvasWidth: number,
  canvasHeight: number,
  overlays: OverlayLayer[],
  onProgress: ProgressCallback,
  encoder: VideoEncoderConfig,
  accel: GpuAccelConfig | null
): Promise<void> {
  onProgress(
    60,
    accel ? `Rendering final output (${accel.label})...` : 'Rendering final output...'
  )

  const activeOverlays = overlays.filter((overlay) => overlay.path)
  const args: string[] = []

  if (accel) {
    args.push(...accel.inputArgs)
  }
  args.push('-i', primaryPath)

  for (const overlay of activeOverlays) {
    if (accel) {
      args.push(...accel.inputArgs)
    }
    args.push('-i', overlay.path)
  }

  args.push('-i', wavPath)
  const audioInputIndex = 1 + activeOverlays.length

  if (activeOverlays.length > 0) {
    const parts: string[] = []
    let baseLabel = '[0:v]'
    if (accel) {
      parts.push('[0:v]hwdownload,format=nv12,format=yuv420p[base0]')
      baseLabel = '[base0]'
    }
    parts.push(
      buildOverlayFilterChain(
        activeOverlays,
        canvasWidth,
        canvasHeight,
        targetDuration,
        accel,
        baseLabel
      )
    )
    args.push('-filter_complex', parts.join(';'), '-map', '[outv]')
  } else if (accel) {
    args.push('-vf', 'hwdownload,format=nv12,format=yuv420p', '-map', '0:v')
  } else {
    args.push('-map', '0:v')
  }

  args.push(
    '-map',
    `${audioInputIndex}:a`,
    '-t',
    String(targetDuration),
    ...encoder.args,
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-y',
    outputPath
  )

  await runFfmpeg(args, targetDuration, onProgress, 60, 39)
}

export async function runCombineJob(
  options: CombineJobOptions,
  onProgress: ProgressCallback
): Promise<void> {
  const jobId = randomUUID()
  const tempDir = join(tmpdir(), 'audio-video-combiner', jobId)

  try {
    await mkdir(tempDir, { recursive: true })
    onProgress(1, 'Analyzing media files...')

    const targetDuration = await probeWavDuration(options.wavPath)
    const isImageMode = options.primaryMode === 'images'
    const encoder = await resolveVideoEncoder(options.encoderPreference)
    const accel = await resolveGpuAccel(options.encoderPreference)

    const encodeMsg = accel
      ? `Encoding with ${encoder.label} + ${accel.label}...`
      : `Encoding with ${encoder.label}...`
    onProgress(2, encodeMsg)

    const clips = isImageMode
      ? await buildImageInfos(options.primaryPaths)
      : await buildClipInfos(options.primaryPaths)

    if (options.overlays.length > 0) {
      for (const overlay of options.overlays) {
        if (!overlay.path) continue
        const overlayInfo = await probeMedia(overlay.path)
        if (!overlayInfo.hasVideo) {
          throw new Error(
            `Overlay "${overlay.path.split(/[/\\]/).pop()}" does not contain a video stream`
          )
        }
      }
    }

    const { segments, bookendClips } = await buildCompleteSegments({
      targetDuration,
      primaryMode: options.primaryMode,
      primaryPaths: options.primaryPaths,
      clips,
      introPath: options.introPath,
      outroPath: options.outroPath
    })

    const { width, height } = getCanvasSize([...clips, ...bookendClips])

    // CUDA scale helps video clips; image slideshows stay on CPU filters.
    const concatAccel = isImageMode ? null : accel

    let primaryPath: string
    try {
      primaryPath = await concatPrimary(
        segments,
        clips,
        bookendClips,
        tempDir,
        onProgress,
        isImageMode,
        encoder,
        options.sceneTransitions,
        concatAccel
      )
    } catch (err) {
      if (!concatAccel) throw err
      onProgress(5, 'CUDA concat failed — retrying without GPU decode/scale...')
      primaryPath = await concatPrimary(
        segments,
        clips,
        bookendClips,
        tempDir,
        onProgress,
        isImageMode,
        encoder,
        options.sceneTransitions,
        null
      )
    }

    try {
      await renderFinal(
        primaryPath,
        options.wavPath,
        options.outputPath,
        targetDuration,
        width,
        height,
        options.overlays,
        onProgress,
        encoder,
        accel
      )
    } catch (err) {
      if (!accel) throw err
      onProgress(60, 'CUDA final render failed — retrying without GPU decode/scale...')
      await renderFinal(
        primaryPath,
        options.wavPath,
        options.outputPath,
        targetDuration,
        width,
        height,
        options.overlays,
        onProgress,
        encoder,
        null
      )
    }

    onProgress(100, 'Done!')
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {})
  }
}
