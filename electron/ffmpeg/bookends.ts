import { probeMedia } from './probe'
import {
  buildImagePlaylist,
  buildPlaylist,
  ClipInfo,
  ClipSegment
} from './planner'

export interface BookendInput {
  introPath?: string
  outroPath?: string
}

export interface BookendAllocation {
  introDuration: number
  primaryDuration: number
  outroDuration: number
}

export async function probeBookendVideo(path: string): Promise<ClipInfo> {
  const info = await probeMedia(path)
  if (!info.hasVideo || !info.width || !info.height || !info.duration) {
    throw new Error(`Bookend clip must be a valid video file: ${path}`)
  }
  return {
    path,
    duration: info.duration,
    width: info.width,
    height: info.height,
    fps: info.fps ?? 30
  }
}

export function allocateBookendDurations(
  targetDuration: number,
  introFullDuration?: number,
  outroFullDuration?: number
): BookendAllocation {
  let remaining = targetDuration
  let introDuration = 0
  let outroDuration = 0

  if (introFullDuration !== undefined) {
    introDuration = Math.min(introFullDuration, remaining)
    remaining -= introDuration
  }

  if (outroFullDuration !== undefined) {
    outroDuration = Math.min(outroFullDuration, remaining)
    remaining -= outroDuration
  }

  if (remaining <= 0 && (introFullDuration !== undefined || outroFullDuration !== undefined)) {
    throw new Error(
      'Intro and outro clips are too long for the selected music. Use shorter clips or a longer WAV.'
    )
  }

  return {
    introDuration,
    primaryDuration: remaining,
    outroDuration
  }
}

export function assembleSegments(
  introPath: string | undefined,
  introDuration: number,
  primarySegments: ClipSegment[],
  outroPath: string | undefined,
  outroDuration: number
): ClipSegment[] {
  const segments: ClipSegment[] = []

  if (introPath && introDuration > 0) {
    segments.push({ path: introPath, duration: introDuration })
  }

  segments.push(...primarySegments)

  if (outroPath && outroDuration > 0) {
    segments.push({ path: outroPath, duration: outroDuration })
  }

  return segments
}

export async function buildPrimarySegments(
  primaryMode: 'videos' | 'images',
  primaryPaths: string[],
  clips: ClipInfo[],
  primaryDuration: number
): Promise<ClipSegment[]> {
  if (primaryDuration <= 0) {
    return []
  }

  return primaryMode === 'images'
    ? buildImagePlaylist(primaryPaths, primaryDuration)
    : buildPlaylist(clips, primaryDuration)
}

export async function buildCompleteSegments(options: {
  targetDuration: number
  primaryMode: 'videos' | 'images'
  primaryPaths: string[]
  clips: ClipInfo[]
  introPath?: string
  outroPath?: string
}): Promise<{ segments: ClipSegment[]; bookendClips: ClipInfo[] }> {
  const bookendClips: ClipInfo[] = []
  let introFullDuration: number | undefined
  let outroFullDuration: number | undefined

  if (options.introPath) {
    const intro = await probeBookendVideo(options.introPath)
    bookendClips.push(intro)
    introFullDuration = intro.duration
  }

  if (options.outroPath) {
    const outro = await probeBookendVideo(options.outroPath)
    bookendClips.push(outro)
    outroFullDuration = outro.duration
  }

  const { introDuration, primaryDuration, outroDuration } = allocateBookendDurations(
    options.targetDuration,
    introFullDuration,
    outroFullDuration
  )

  const primarySegments = await buildPrimarySegments(
    options.primaryMode,
    options.primaryPaths,
    options.clips,
    primaryDuration
  )

  if (primarySegments.length === 0 && bookendClips.length === 0) {
    throw new Error('No video content to render')
  }

  const segments = assembleSegments(
    options.introPath,
    introDuration,
    primarySegments,
    options.outroPath,
    outroDuration
  )

  return { segments, bookendClips }
}
