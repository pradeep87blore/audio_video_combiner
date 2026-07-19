import { spawn } from 'child_process'
import { getFfmpegPath } from './paths'
import type { EncoderPreference } from './encoders'

export interface GpuAccelConfig {
  kind: 'cuda'
  label: string
  /** Args placed immediately before each video `-i` input. */
  inputArgs: string[]
}

const CUDA_ACCEL: GpuAccelConfig = {
  kind: 'cuda',
  label: 'NVIDIA CUDA (decode + scale)',
  inputArgs: ['-hwaccel', 'cuda', '-hwaccel_output_format', 'cuda']
}

let cachedCuda: GpuAccelConfig | null | undefined

function runProbe(args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn(getFfmpegPath(), args, { windowsHide: true })
    proc.on('close', (code) => resolve(code === 0))
    proc.on('error', () => resolve(false))
  })
}

/** Probe whether CUDA decode + scale_cuda work with this FFmpeg build/drivers. */
export async function detectCudaAccel(): Promise<GpuAccelConfig | null> {
  if (cachedCuda !== undefined) {
    return cachedCuda
  }

  const ok = await runProbe([
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-init_hw_device',
    'cuda=cuda:0',
    '-filter_hw_device',
    'cuda',
    '-f',
    'lavfi',
    '-i',
    'color=c=black:s=320x240:d=0.1',
    '-vf',
    'format=nv12,hwupload_cuda,scale_cuda=160:120,hwdownload,format=nv12',
    '-frames:v',
    '1',
    '-f',
    'null',
    process.platform === 'win32' ? 'NUL' : '/dev/null'
  ])

  cachedCuda = ok ? CUDA_ACCEL : null
  return cachedCuda
}

/**
 * Resolve GPU filter/decode acceleration.
 * Enabled for Auto/GPU when CUDA is available; disabled for CPU preference.
 */
export async function resolveGpuAccel(
  preference: EncoderPreference = 'auto'
): Promise<GpuAccelConfig | null> {
  if (preference === 'cpu') {
    return null
  }
  return detectCudaAccel()
}

export function resetGpuAccelCache(): void {
  cachedCuda = undefined
}

/**
 * Scale + pad (+ fps) for primary clips.
 * When CUDA accel is on, scale on GPU then download for pad/fade/concat (CPU).
 */
export function buildScalePadFilter(
  width: number,
  height: number,
  fps: number,
  accel: GpuAccelConfig | null
): string {
  if (accel?.kind === 'cuda') {
    return (
      `scale_cuda=${width}:${height}:force_original_aspect_ratio=decrease,` +
      `hwdownload,format=nv12,format=yuv420p,` +
      `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black,` +
      `fps=${fps},setsar=1`
    )
  }

  return (
    `scale=${width}:${height}:force_original_aspect_ratio=decrease:force_divisible_by=2,` +
    `format=yuv420p,` +
    `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black,` +
    `fps=${fps},setsar=1`
  )
}

/** Overlay scale filter — GPU scale when possible, then CPU colorkey/opacity. */
export function buildOverlayScaleFilter(
  targetWidth: number,
  targetHeight: number,
  lockAspectRatio: boolean,
  accel: GpuAccelConfig | null
): string {
  if (accel?.kind === 'cuda') {
    const scale =
      lockAspectRatio !== false
        ? `scale_cuda=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease`
        : `scale_cuda=${targetWidth}:${targetHeight}`
    return `${scale},hwdownload,format=nv12`
  }

  return lockAspectRatio !== false
    ? `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease`
    : `scale=${targetWidth}:${targetHeight}`
}
