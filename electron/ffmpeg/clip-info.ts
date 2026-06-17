import { probeMedia } from './probe'
import { ClipInfo } from './planner'

export async function buildClipInfos(paths: string[]): Promise<ClipInfo[]> {
  const clips: ClipInfo[] = []

  for (const path of paths) {
    const info = await probeMedia(path)
    if (!info.hasVideo || !info.width || !info.height) {
      throw new Error(`No video stream found: ${path}`)
    }
    clips.push({
      path,
      duration: info.duration,
      width: info.width,
      height: info.height,
      fps: info.fps ?? 30
    })
  }

  return clips
}

export async function buildImageInfos(paths: string[]): Promise<ClipInfo[]> {
  const clips: ClipInfo[] = []

  for (const path of paths) {
    const info = await probeMedia(path)
    if (!info.width || !info.height) {
      throw new Error(`Could not read image dimensions: ${path}`)
    }
    clips.push({
      path,
      duration: 0,
      width: info.width,
      height: info.height,
      fps: 30
    })
  }

  return clips
}
