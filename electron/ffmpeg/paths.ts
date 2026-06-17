import ffmpegPath from 'ffmpeg-static'
import ffprobeStatic from 'ffprobe-static'

export function getFfmpegPath(): string {
  if (!ffmpegPath) {
    throw new Error('FFmpeg binary not found. Re-run npm install.')
  }
  return ffmpegPath
}

export function getFfprobePath(): string {
  const path = ffprobeStatic.path
  if (!path) {
    throw new Error('FFprobe binary not found. Re-run npm install.')
  }
  return path
}
