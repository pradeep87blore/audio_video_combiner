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
    removeBlack: true,
    lockAspectRatio: true,
    ...DEFAULT_OVERLAY_PLACEMENT
  }
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value))
}

function roundPercent(value: number): number {
  return Math.round(value * 10) / 10
}

export function normalizeOverlayLayer(overlay: Partial<OverlayLayer>): OverlayLayer {
  return {
    id: overlay.id ?? crypto.randomUUID(),
    path: overlay.path ?? '',
    opacity: clampPercent(overlay.opacity ?? 50),
    x: clampPercent(overlay.x ?? 0),
    y: clampPercent(overlay.y ?? 0),
    width: Math.max(1, clampPercent(overlay.width ?? 100)),
    height: Math.max(1, clampPercent(overlay.height ?? 100)),
    removeBlack: overlay.removeBlack ?? true,
    lockAspectRatio: overlay.lockAspectRatio ?? true
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
    overlays: legacyPath ? [createOverlayLayer(legacyPath, legacyOpacity)] : [],
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

export function centerOverlayHorizontally(
  overlay: Pick<OverlayLayer, 'width'>
): Pick<OverlayLayer, 'x'> {
  return { x: roundPercent(clampPercent((100 - overlay.width) / 2)) }
}

export function centerOverlayVertically(
  overlay: Pick<OverlayLayer, 'height'>
): Pick<OverlayLayer, 'y'> {
  return { y: roundPercent(clampPercent((100 - overlay.height) / 2)) }
}

export function centerOverlayBoth(
  overlay: Pick<OverlayLayer, 'width' | 'height'>
): Pick<OverlayLayer, 'x' | 'y'> {
  return {
    ...centerOverlayHorizontally(overlay),
    ...centerOverlayVertically(overlay)
  }
}

/** Keep width/height changes aspect-locked to the current box ratio. */
export function applyLockedSizeChange(
  overlay: Pick<OverlayLayer, 'x' | 'y' | 'width' | 'height'>,
  field: 'width' | 'height',
  nextValue: number
): Pick<OverlayLayer, 'x' | 'y' | 'width' | 'height'> {
  const minSize = 1
  const ratio = overlay.width / Math.max(overlay.height, 0.0001)

  if (field === 'width') {
    let width = Math.max(minSize, clampPercent(nextValue))
    let height = width / ratio
    if (overlay.y + height > 100) {
      height = Math.max(minSize, 100 - overlay.y)
      width = height * ratio
    }
    if (overlay.x + width > 100) {
      width = Math.max(minSize, 100 - overlay.x)
      height = width / ratio
    }
    return {
      x: overlay.x,
      y: overlay.y,
      width: roundPercent(width),
      height: roundPercent(height)
    }
  }

  let height = Math.max(minSize, clampPercent(nextValue))
  let width = height * ratio
  if (overlay.x + width > 100) {
    width = Math.max(minSize, 100 - overlay.x)
    height = width / ratio
  }
  if (overlay.y + height > 100) {
    height = Math.max(minSize, 100 - overlay.y)
    width = height * ratio
  }
  return {
    x: overlay.x,
    y: overlay.y,
    width: roundPercent(width),
    height: roundPercent(height)
  }
}

export type OverlayResizeHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

export function applyOverlayDrag(
  origin: Pick<OverlayLayer, 'x' | 'y' | 'width' | 'height'>,
  mode: 'move' | OverlayResizeHandle,
  dxPercent: number,
  dyPercent: number,
  lockAspectRatio: boolean
): Pick<OverlayLayer, 'x' | 'y' | 'width' | 'height'> {
  const minSize = 5
  const clamp = (value: number, min: number, max: number): number =>
    Math.max(min, Math.min(max, value))

  if (mode === 'move') {
    return {
      x: roundPercent(clamp(origin.x + dxPercent, 0, 100 - origin.width)),
      y: roundPercent(clamp(origin.y + dyPercent, 0, 100 - origin.height)),
      width: origin.width,
      height: origin.height
    }
  }

  if (!lockAspectRatio) {
    let { x, y, width, height } = origin

    if (mode.includes('e')) {
      width = clamp(origin.width + dxPercent, minSize, 100 - origin.x)
    }
    if (mode.includes('s')) {
      height = clamp(origin.height + dyPercent, minSize, 100 - origin.y)
    }
    if (mode.includes('w')) {
      const nextWidth = clamp(origin.width - dxPercent, minSize, origin.x + origin.width)
      x = origin.x + origin.width - nextWidth
      width = nextWidth
    }
    if (mode.includes('n')) {
      const nextHeight = clamp(origin.height - dyPercent, minSize, origin.y + origin.height)
      y = origin.y + origin.height - nextHeight
      height = nextHeight
    }

    return {
      x: roundPercent(x),
      y: roundPercent(y),
      width: roundPercent(width),
      height: roundPercent(height)
    }
  }

  const ratio = origin.width / Math.max(origin.height, 0.0001)
  const right = origin.x + origin.width
  const bottom = origin.y + origin.height

  const fitWithin = (
    width: number,
    height: number,
    x: number,
    y: number,
    anchor: 'nw' | 'ne' | 'sw' | 'se' | 'center'
  ): Pick<OverlayLayer, 'x' | 'y' | 'width' | 'height'> => {
    let w = Math.max(minSize, width)
    let h = Math.max(minSize, height)

    // Reconcile against canvas bounds while preserving ratio.
    if (w > 100) {
      w = 100
      h = w / ratio
    }
    if (h > 100) {
      h = 100
      w = h * ratio
    }

    let nextX = x
    let nextY = y
    if (anchor === 'se') {
      nextX = right - w
      nextY = bottom - h
    } else if (anchor === 'sw') {
      nextX = origin.x
      nextY = bottom - h
    } else if (anchor === 'ne') {
      nextX = right - w
      nextY = origin.y
    } else if (anchor === 'nw') {
      nextX = origin.x
      nextY = origin.y
    } else {
      nextX = origin.x + (origin.width - w) / 2
      nextY = origin.y + (origin.height - h) / 2
    }

    nextX = clamp(nextX, 0, 100 - w)
    nextY = clamp(nextY, 0, 100 - h)

    return {
      x: roundPercent(nextX),
      y: roundPercent(nextY),
      width: roundPercent(w),
      height: roundPercent(h)
    }
  }

  if (mode === 'e' || mode === 'se' || mode === 'ne') {
    const width = clamp(origin.width + dxPercent, minSize, 100 - origin.x)
    const height = width / ratio
    if (mode === 'e') return fitWithin(width, height, origin.x, origin.y, 'center')
    if (mode === 'se') return fitWithin(width, height, origin.x, origin.y, 'nw')
    return fitWithin(width, height, origin.x, origin.y, 'sw')
  }

  if (mode === 'w' || mode === 'sw' || mode === 'nw') {
    const width = clamp(origin.width - dxPercent, minSize, right)
    const height = width / ratio
    if (mode === 'w') return fitWithin(width, height, origin.x, origin.y, 'center')
    if (mode === 'sw') return fitWithin(width, height, origin.x, origin.y, 'ne')
    return fitWithin(width, height, origin.x, origin.y, 'se')
  }

  if (mode === 's') {
    const height = clamp(origin.height + dyPercent, minSize, 100 - origin.y)
    const width = height * ratio
    return fitWithin(width, height, origin.x, origin.y, 'center')
  }

  // mode === 'n'
  const height = clamp(origin.height - dyPercent, minSize, bottom)
  const width = height * ratio
  return fitWithin(width, height, origin.x, origin.y, 'center')
}
