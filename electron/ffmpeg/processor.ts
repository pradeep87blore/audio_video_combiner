import { spawn } from 'child_process'
import { mkdir, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { tmpdir } from 'os'
import { appendSceneFades } from './transitions'
import { resolveVideoEncoder, type EncoderPreference, type VideoEncoderConfig } from './encoders'
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

export interface CombineJobOptions {
  primaryFolder: string
  primaryMode: 'videos' | 'images'
  primaryPaths: string[]
  introPath?: string
  outroPath?: string
  overlayPath?: string
  overlayOpacity: number
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

function buildScalePadFilter(width: number, height: number, fps: number): string {
  return (
    `scale=${width}:${height}:force_original_aspect_ratio=decrease:force_divisible_by=2,` +
    `format=yuv420p,` +
    `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black,` +
    `fps=${fps},setsar=1`
  )
}

function buildConcatFilter(
  segments: ClipSegment[],
  width: number,
  height: number,
  fps: number,
  globalOffset: number,
  globalSegmentCount: number,
  sceneTransitions: boolean
): { filterComplex: string; inputArgs: string[] } {
  const inputArgs: string[] = []
  const filterParts: string[] = []

  segments.forEach((segment, localIndex) => {
    const globalIndex = globalOffset + localIndex

    if (segment.isImage) {
      inputArgs.push('-loop', '1', '-i', segment.path)
    } else {
      inputArgs.push('-i', segment.path)
    }

    let chain =
      `[${localIndex}:v]trim=duration=${segment.duration},setpts=PTS-STARTPTS,` +
      buildScalePadFilter(width, height, fps)
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
  sceneTransitions: boolean
): Promise<void> {
  const passDuration = segments.reduce((sum, segment) => sum + segment.duration, 0)
  const { filterComplex, inputArgs } = buildConcatFilter(
    segments,
    width,
    height,
    fps,
    globalOffset,
    globalSegmentCount,
    sceneTransitions
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
  sceneTransitions: boolean
): Promise<string> {
  const { width, height } = getCanvasSize([...clips, ...bookendClips])
  const fps = isImageMode ? 30 : getTargetFps([...clips, ...bookendClips])
  const totalDuration = segments.reduce((sum, s) => sum + s.duration, 0)
  const outputPath = join(tempDir, 'primary.mp4')
  const globalSegmentCount = segments.length

  onProgress(
    5,
    isImageMode ? 'Building slideshow from images...' : 'Concatenating primary clips...'
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
      sceneTransitions
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
      sceneTransitions
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

async function renderFinal(
  primaryPath: string,
  wavPath: string,
  outputPath: string,
  targetDuration: number,
  canvasWidth: number,
  canvasHeight: number,
  overlayPath: string | undefined,
  overlayOpacity: number,
  onProgress: ProgressCallback,
  encoder: VideoEncoderConfig
): Promise<void> {
  onProgress(60, 'Rendering final output...')

  const opacity = Math.max(0, Math.min(1, overlayOpacity / 100))
  const args: string[] = ['-i', primaryPath]

  let filterComplex: string | undefined

  if (overlayPath) {
    args.push('-i', overlayPath)
    filterComplex =
      `[1:v]loop=-1:size=32767:start=0,trim=duration=${targetDuration},setpts=PTS-STARTPTS,` +
      `scale=${canvasWidth}:${canvasHeight}:force_original_aspect_ratio=decrease,` +
      `pad=${canvasWidth}:${canvasHeight}:(ow-iw)/2:(oh-ih)/2,` +
      `format=rgba,colorchannelmixer=aa=${opacity.toFixed(4)}[ovl];` +
      `[0:v][ovl]overlay=0:0:format=auto[outv]`
  }

  args.push('-i', wavPath)

  const audioInputIndex = overlayPath ? 2 : 1

  if (filterComplex) {
    args.push('-filter_complex', filterComplex, '-map', '[outv]')
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

    onProgress(2, `Encoding with ${encoder.label}...`)

    const clips = isImageMode
      ? await buildImageInfos(options.primaryPaths)
      : await buildClipInfos(options.primaryPaths)

    if (options.overlayPath) {
      const overlayInfo = await probeMedia(options.overlayPath)
      if (!overlayInfo.hasVideo) {
        throw new Error('Overlay file does not contain a video stream')
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

    const primaryPath = await concatPrimary(
      segments,
      clips,
      bookendClips,
      tempDir,
      onProgress,
      isImageMode,
      encoder,
      options.sceneTransitions
    )

    await renderFinal(
      primaryPath,
      options.wavPath,
      options.outputPath,
      targetDuration,
      width,
      height,
      options.overlayPath,
      options.overlayOpacity,
      onProgress,
      encoder
    )

    onProgress(100, 'Done!')
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {})
  }
}
