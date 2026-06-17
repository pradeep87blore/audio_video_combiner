export interface ClipInfo {
  path: string
  duration: number
  width: number
  height: number
  fps: number
}

export interface ClipSegment {
  path: string
  duration: number
  isImage?: boolean
}

function shuffle<T>(items: T[]): T[] {
  const arr = [...items]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

export function buildPlaylist(clips: ClipInfo[], targetDuration: number): ClipSegment[] {
  if (clips.length === 0) {
    throw new Error('No primary video clips available')
  }
  if (targetDuration <= 0) {
    throw new Error('Target duration must be positive')
  }

  const segments: ClipSegment[] = []
  let accumulated = 0
  let pool = shuffle(clips)
  let poolIndex = 0

  while (accumulated < targetDuration - 1e-6) {
    if (poolIndex >= pool.length) {
      pool = shuffle(clips)
      poolIndex = 0
    }

    const clip = pool[poolIndex++]
    const remaining = targetDuration - accumulated
    const useDuration = Math.min(clip.duration, remaining)

    segments.push({ path: clip.path, duration: useDuration })
    accumulated += useDuration
  }

  return segments
}

export function buildImagePlaylist(imagePaths: string[], targetDuration: number): ClipSegment[] {
  if (imagePaths.length === 0) {
    throw new Error('No primary images available')
  }
  if (targetDuration <= 0) {
    throw new Error('Target duration must be positive')
  }

  const shuffled = shuffle(imagePaths)
  const count = shuffled.length
  const baseDuration = targetDuration / count

  return shuffled.map((path, index) => ({
    path,
    duration: index === count - 1 ? targetDuration - baseDuration * (count - 1) : baseDuration,
    isImage: true
  }))
}

export function getCanvasSize(clips: ClipInfo[]): { width: number; height: number } {
  const width = Math.max(...clips.map((c) => c.width))
  const height = Math.max(...clips.map((c) => c.height))
  return { width, height }
}

export function getTargetFps(clips: ClipInfo[]): number {
  const fpsValues = clips.map((c) => c.fps).filter((fps) => fps > 0)
  if (fpsValues.length === 0) return 30

  const first = fpsValues[0]
  const allMatch = fpsValues.every((fps) => Math.abs(fps - first) < 0.01)
  return allMatch ? Math.round(first) : 30
}
