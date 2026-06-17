import { spawn } from 'child_process'
import { basename } from 'path'
import { getFfmpegPath } from './paths'
import { probeMedia, probeWavDuration } from './probe'
import { buildCompleteSegments } from './bookends'
import { buildClipInfos, buildImageInfos } from './clip-info'

export interface PreviewSegment {
  path: string
  name: string
  duration: number
  start: number
  kind?: 'intro' | 'primary' | 'outro'
}

export interface PreviewData {
  duration: number
  primaryFrame: string
  overlayFrame?: string
  segments: PreviewSegment[]
}

export interface PreviewRequest {
  primaryMode: 'videos' | 'images'
  primaryPaths: string[]
  introPath?: string
  outroPath?: string
  overlayPath?: string
  wavPath: string
}

function extractFrameToDataUrl(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    const proc = spawn(
      getFfmpegPath(),
      ['-i', filePath, '-vframes', '1', '-f', 'image2pipe', '-vcodec', 'png', 'pipe:1'],
      { windowsHide: true }
    )

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

function segmentsToTimeline(
  segments: { path: string; duration: number }[],
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
      kind
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

  const previewPath =
    (request.introPath && segments[0]?.path === request.introPath
      ? request.introPath
      : segments[0]?.path) ?? request.primaryPaths[0]

  const primaryFrame = await extractFrameToDataUrl(previewPath)
  const overlayFrame = request.overlayPath
    ? await extractFrameToDataUrl(request.overlayPath)
    : undefined

  return {
    duration,
    primaryFrame,
    overlayFrame,
    segments: segmentsToTimeline(segments, request.introPath, request.outroPath)
  }
}
