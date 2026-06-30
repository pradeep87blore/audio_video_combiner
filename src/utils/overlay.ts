import type { AppSettings, OverlayLayer } from '../types'

export const DEFAULT_OVERLAY_PLACEMENT = {
  x: 0,
  y: 0,
  width: 100,
  height: 100
} as const

export function createOverlayLayer(path = '', opacity = 50): OverlayLayer {
  return {
    id: crypto.randomUUID(),
    path,
    opacity,
    ...DEFAULT_OVERLAY_PLACEMENT
  }
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value))
}

export function normalizeOverlayLayer(overlay: Partial<OverlayLayer>): OverlayLayer {
  return {
    id: overlay.id ?? crypto.randomUUID(),
    path: overlay.path ?? '',
    opacity: clampPercent(overlay.opacity ?? 50),
    x: clampPercent(overlay.x ?? 0),
    y: clampPercent(overlay.y ?? 0),
    width: Math.max(1, clampPercent(overlay.width ?? 100)),
    height: Math.max(1, clampPercent(overlay.height ?? 100))
  }
}

export function migrateAppSettings(settings: Partial<AppSettings> & Record<string, unknown>): AppSettings {
  if (Array.isArray(settings.overlays)) {
    return {
      primaryMode: settings.primaryMode ?? 'videos',
      primaryFolder: settings.primaryFolder ?? '',
      introPath: settings.introPath ?? '',
      outroPath: settings.outroPath ?? '',
      overlays: settings.overlays.map((entry) => normalizeOverlayLayer(entry as Partial<OverlayLayer>)),
      wavPath: settings.wavPath ?? '',
      outputPath: settings.outputPath ?? '',
      encoderPreference: settings.encoderPreference ?? 'auto',
      sceneTransitions: settings.sceneTransitions ?? true
    }
  }

  const legacyPath = typeof settings.overlayPath === 'string' ? settings.overlayPath : ''
  const legacyOpacity = typeof settings.overlayOpacity === 'number' ? settings.overlayOpacity : 50

  return {
    primaryMode: settings.primaryMode ?? 'videos',
    primaryFolder: settings.primaryFolder ?? '',
    introPath: settings.introPath ?? '',
    outroPath: settings.outroPath ?? '',
    overlays: legacyPath
      ? [createOverlayLayer(legacyPath, legacyOpacity)]
      : [],
    wavPath: settings.wavPath ?? '',
    outputPath: settings.outputPath ?? '',
    encoderPreference: settings.encoderPreference ?? 'auto',
    sceneTransitions: settings.sceneTransitions ?? true
  }
}

export function activeOverlays(overlays: OverlayLayer[]): OverlayLayer[] {
  return overlays.filter((overlay) => overlay.path.length > 0)
}

export function overlayRect(
  canvasWidth: number,
  canvasHeight: number,
  overlay: OverlayLayer
): { x: number; y: number; width: number; height: number } {
  return {
    x: Math.round((canvasWidth * overlay.x) / 100),
    y: Math.round((canvasHeight * overlay.y) / 100),
    width: Math.round((canvasWidth * overlay.width) / 100),
    height: Math.round((canvasHeight * overlay.height) / 100)
  }
}
