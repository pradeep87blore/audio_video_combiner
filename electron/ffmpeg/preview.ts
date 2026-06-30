import { spawn } from 'child_process'
import { extname, basename } from 'path'
import { getFfmpegPath } from './paths'
import { probeMedia, probeWavDuration } from './probe'
import { buildCompleteSegments } from './bookends'
import { buildClipInfos, buildImageInfos } from './clip-info'
import { IMAGE_EXTENSIONS } from '../../src/types'
import type { OverlayLayer } from '../../src/types'

export interface PreviewSegment {
  path: string
  name: string
  duration: number
  start: number
  kind?: 'intro' | 'primary' | 'outro'
  isImage?: boolean
}

export interface PreviewOverlayFrame {
  id: string
  frame: string
}

export interface PreviewData {
  duration: number
  primaryFrame: string
  overlayFrames: PreviewOverlayFrame[]
  segments: PreviewSegment[]
}

export interface PreviewRequest {
  primaryMode: 'videos' | 'images'
  primaryPaths: string[]
  introPath?: string
  outroPath?: string
  overlays: OverlayLayer[]
  wavPath: string
}

export interface PreviewFrameRequest {
  timestamp: number
  segments: PreviewSegment[]
  overlays: OverlayLayer[]
}

export interface PreviewFrameData {
  timestamp: number
  primaryFrame: string
  overlayFrames: PreviewOverlayFrame[]
  segmentName: string
}

function isImagePath(filePath: string): boolean {
  return IMAGE_EXTENSIONS.includes(extname(filePath).toLowerCase())
}

function extractFrameToDataUrl(
  filePath: string,
  seekSeconds = 0,
  isImage = false
): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    const args = isImage
      ? ['-i', filePath, '-vframes', '1', '-f', 'image2pipe', '-vcodec', 'png', 'pipe:1']
      : [
          '-ss',
          String(Math.max(0, seekSeconds)),
          '-i',
          filePath,
          '-vframes',
          '1',
          '-f',
          'image2pipe',
          '-vcodec',
          'png',
          'pipe:1'
        ]

    const proc = spawn(getFfmpegPath(), args, { windowsHide: true })

    proc.stdout.on('data', (chunk: Buffer) => chunks.push(chunk))
    proc.stderr.on('data', () => {})

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Failed to extract frame from ${basename(filePath)}`))
        return
      }
      const base64 = Buffer.concat(chunks).toString('base64')
      resolve(`data:image/png;base64,${base64}`)
    })

    proc.on('error', reject)
  })
}

function findSegmentAtTime(segments: PreviewSegment[], time: number): PreviewSegment {
  if (segments.length === 0) {
    throw new Error('No timeline segments available')
  }

  const totalDuration = segments.reduce((sum, segment) => sum + segment.duration, 0)
  const clamped = Math.max(0, Math.min(time, Math.max(0, totalDuration - 0.001)))

  for (const segment of segments) {
    if (clamped >= segment.start && clamped < segment.start + segment.duration) {
      return segment
    }
  }

  return segments[segments.length - 1]
}

async function extractOverlayFrameAtTime(
  overlayPath: string,
  globalTime: number
): Promise<string> {
  const info = await probeMedia(overlayPath)
  if (!info.duration || info.duration <= 0) {
    return extractFrameToDataUrl(overlayPath, 0, false)
  }
  const overlayTime = globalTime % info.duration
  return extractFrameToDataUrl(overlayPath, overlayTime, false)
}

async function extractOverlayFramesAtTime(
  overlays: OverlayLayer[],
  globalTime: number
): Promise<PreviewOverlayFrame[]> {
  const frames: PreviewOverlayFrame[] = []

  for (const overlay of overlays) {
    if (!overlay.path) continue
    const frame = await extractOverlayFrameAtTime(overlay.path, globalTime)
    frames.push({ id: overlay.id, frame })
  }

  return frames
}

export async function extractPreviewFrame(
  request: PreviewFrameRequest
): Promise<PreviewFrameData> {
  const segment = findSegmentAtTime(request.segments, request.timestamp)
  const localTime = request.timestamp - segment.start
  const isImage = segment.isImage ?? isImagePath(segment.path)

  const primaryFrame = await extractFrameToDataUrl(segment.path, localTime, isImage)
  const overlayFrames = await extractOverlayFramesAtTime(request.overlays, request.timestamp)

  return {
    timestamp: request.timestamp,
    primaryFrame,
    overlayFrames,
    segmentName: segment.name
  }
}

function segmentsToTimeline(
  segments: { path: string; duration: number; isImage?: boolean }[],
  introPath?: string,
  outroPath?: string
): PreviewSegment[] {
  const timeline: PreviewSegment[] = []
  let start = 0

  for (const segment of segments) {
    let kind: PreviewSegment['kind'] = 'primary'
    if (introPath && segment.path === introPath) {
      kind = 'intro'
    } else if (outroPath && segment.path === outroPath) {
      kind = 'outro'
    }

    timeline.push({
      path: segment.path,
      name: basename(segment.path),
      duration: segment.duration,
      start,
      kind,
      isImage: segment.isImage
    })
    start += segment.duration
  }

  return timeline
}

export async function buildPreviewData(request: PreviewRequest): Promise<PreviewData> {
  const duration = await probeWavDuration(request.wavPath)

  const clips =
    request.primaryMode === 'images'
      ? await buildImageInfos(request.primaryPaths)
      : await buildClipInfos(request.primaryPaths)

  const { segments } = await buildCompleteSegments({
    targetDuration: duration,
    primaryMode: request.primaryMode,
    primaryPaths: request.primaryPaths,
    clips,
    introPath: request.introPath,
    outroPath: request.outroPath
  })

  const timeline = segmentsToTimeline(segments, request.introPath, request.outroPath)
  const frame = await extractPreviewFrame({
    timestamp: 0,
    segments: timeline,
    overlays: request.overlays
  })

  return {
    duration,
    primaryFrame: frame.primaryFrame,
    overlayFrames: frame.overlayFrames,
    segments: timeline
  }
}
