import { spawn } from 'child_process'
import { getFfmpegPath } from './paths'

export type EncoderPreference = 'auto' | 'gpu' | 'cpu'

export type EncoderKind = 'nvenc' | 'qsv' | 'amf' | 'cpu'

export interface VideoEncoderConfig {
  kind: EncoderKind
  label: string
  codec: string
  args: string[]
}

const CPU_ENCODER: VideoEncoderConfig = {
  kind: 'cpu',
  label: 'CPU (libx264)',
  codec: 'libx264',
  args: ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23']
}

const GPU_ENCODERS: Array<{ kind: EncoderKind; label: string; codec: string; args: string[] }> = [
  {
    kind: 'nvenc',
    label: 'NVIDIA NVENC',
    codec: 'h264_nvenc',
    args: ['-c:v', 'h264_nvenc', '-preset', 'p4', '-rc', 'vbr', '-cq', '23', '-b:v', '0']
  },
  {
    kind: 'qsv',
    label: 'Intel Quick Sync',
    codec: 'h264_qsv',
    args: ['-c:v', 'h264_qsv', '-global_quality', '23', '-look_ahead', '0']
  },
  {
    kind: 'amf',
    label: 'AMD AMF',
    codec: 'h264_amf',
    args: ['-c:v', 'h264_amf', '-quality', 'balanced', '-rc', 'cqp', '-qp_i', '23', '-qp_p', '23']
  }
]

let cachedEncoder: VideoEncoderConfig | null = null

function testEncoder(codec: string): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn(
      getFfmpegPath(),
      [
        '-y',
        '-hide_banner',
        '-loglevel',
        'error',
        '-f',
        'lavfi',
        '-i',
        'color=c=black:s=320x240:d=0.1',
        '-frames:v',
        '1',
        '-c:v',
        codec,
        '-f',
        'null',
        process.platform === 'win32' ? 'NUL' : '/dev/null'
      ],
      { windowsHide: true }
    )

    proc.on('close', (code) => resolve(code === 0))
    proc.on('error', () => resolve(false))
  })
}

async function detectGpuEncoder(): Promise<VideoEncoderConfig | null> {
  for (const encoder of GPU_ENCODERS) {
    if (await testEncoder(encoder.codec)) {
      return encoder
    }
  }
  return null
}

export async function resolveVideoEncoder(
  preference: EncoderPreference = 'auto'
): Promise<VideoEncoderConfig> {
  if (preference === 'cpu') {
    return CPU_ENCODER
  }

  if (!cachedEncoder) {
    cachedEncoder = await detectGpuEncoder()
  }

  if (preference === 'gpu') {
    if (cachedEncoder) {
      return cachedEncoder
    }
    throw new Error(
      'GPU encoding requested but no hardware encoder is available. Install GPU drivers or choose Auto/CPU.'
    )
  }

  // auto
  return cachedEncoder ?? CPU_ENCODER
}

export function resetEncoderCache(): void {
  cachedEncoder = null
}
