import { spawn } from 'child_process'
import { getFfprobePath } from './paths'

export interface MediaInfo {
  duration: number
  width?: number
  height?: number
  fps?: number
  hasVideo: boolean
  hasAudio: boolean
}

interface FfprobeStream {
  codec_type?: string
  width?: number
  height?: number
  r_frame_rate?: string
  avg_frame_rate?: string
}

interface FfprobeOutput {
  format?: { duration?: string }
  streams?: FfprobeStream[]
}

function parseFps(rate?: string): number | undefined {
  if (!rate || rate === '0/0') return undefined
  const [num, den] = rate.split('/').map(Number)
  if (!den) return undefined
  return num / den
}

function runFfprobe(filePath: string): Promise<FfprobeOutput> {
  return new Promise((resolve, reject) => {
    const proc = spawn(getFfprobePath(), [
      '-v',
      'quiet',
      '-print_format',
      'json',
      '-show_format',
      '-show_streams',
      filePath
    ])

    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })
    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ffprobe failed for ${filePath}: ${stderr || 'unknown error'}`))
        return
      }
      try {
        resolve(JSON.parse(stdout) as FfprobeOutput)
      } catch {
        reject(new Error(`Failed to parse ffprobe output for ${filePath}`))
      }
    })

    proc.on('error', reject)
  })
}

export async function probeMedia(filePath: string): Promise<MediaInfo> {
  const data = await runFfprobe(filePath)
  const duration = parseFloat(data.format?.duration ?? '0')
  const videoStream = data.streams?.find((s) => s.codec_type === 'video')
  const audioStream = data.streams?.find((s) => s.codec_type === 'audio')

  const fps =
    parseFps(videoStream?.avg_frame_rate) ?? parseFps(videoStream?.r_frame_rate)

  return {
    duration,
    width: videoStream?.width,
    height: videoStream?.height,
    fps,
    hasVideo: Boolean(videoStream),
    hasAudio: Boolean(audioStream)
  }
}

export async function probeWavDuration(wavPath: string): Promise<number> {
  const info = await probeMedia(wavPath)
  if (!info.duration || info.duration <= 0) {
    throw new Error('Could not determine WAV duration')
  }
  return info.duration
}
