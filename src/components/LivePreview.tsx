import { useCallback, useEffect, useRef, useState } from 'react'
import type { OverlayLayer, PreviewData, PreviewOverlayFrame } from '../types'
import {
  activeOverlays,
  applyOverlayDrag,
  overlayRect,
  type OverlayResizeHandle
} from '../utils/overlay'
import { formatDuration } from '../utils/formatDuration'
import './LivePreview.css'

interface LivePreviewProps {
  preview: PreviewData | null
  overlays: OverlayLayer[]
  onOverlaysChange?: (overlays: OverlayLayer[]) => void
  loading: boolean
  error: string | null
  primaryMode: 'videos' | 'images'
}

interface DragState {
  overlayId: string
  mode: 'move' | OverlayResizeHandle
  startX: number
  startY: number
  origin: Pick<OverlayLayer, 'x' | 'y' | 'width' | 'height'>
  lockAspectRatio: boolean
}

const SEGMENT_COLORS = [
  '#3d5a80',
  '#4a6fa5',
  '#5c8ebf',
  '#2d6a5a',
  '#4a8f6a',
  '#6b4a8f',
  '#8f6b4a',
  '#8f4a6b'
]

const RESIZE_HANDLES: OverlayResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

function drawCompositeFrame(
  canvas: HTMLCanvasElement,
  primaryFrame: string,
  overlays: OverlayLayer[],
  overlayFrames: PreviewOverlayFrame[]
): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const primary = new Image()
  primary.onload = () => {
    const maxWidth = 640
    const scale = Math.min(1, maxWidth / primary.width)
    const width = Math.round(primary.width * scale)
    const height = Math.round(primary.height * scale)

    canvas.width = width
    canvas.height = height
    ctx.clearRect(0, 0, width, height)
    ctx.drawImage(primary, 0, 0, width, height)

    const frameById = new Map(overlayFrames.map((entry) => [entry.id, entry.frame]))
    const layers = activeOverlays(overlays)

    let pending = layers.filter((layer) => frameById.has(layer.id)).length
    if (pending === 0) return

    for (const layer of layers) {
      const frame = frameById.get(layer.id)
      if (!frame) continue

      const overlay = new Image()
      overlay.onload = () => {
        const rect = overlayRect(width, height, layer)
        ctx.globalAlpha = layer.opacity / 100
        if (layer.lockAspectRatio !== false) {
          const fit = Math.min(rect.width / overlay.width, rect.height / overlay.height)
          const drawW = Math.max(1, Math.round(overlay.width * fit))
          const drawH = Math.max(1, Math.round(overlay.height * fit))
          ctx.drawImage(overlay, rect.x, rect.y, drawW, drawH)
        } else {
          ctx.drawImage(overlay, rect.x, rect.y, rect.width, rect.height)
        }
        ctx.globalAlpha = 1
        pending -= 1
      }
      overlay.src = frame
    }
  }
  primary.src = primaryFrame
}

export function LivePreview({
  preview,
  overlays,
  onOverlaysChange,
  loading,
  error,
  primaryMode
}: LivePreviewProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const editLayerRef = useRef<HTMLDivElement>(null)
  const timelineRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragState | null>(null)
  const overlaysRef = useRef(overlays)

  const [currentTime, setCurrentTime] = useState(0)
  const [primaryFrame, setPrimaryFrame] = useState<string | null>(null)
  const [overlayFrames, setOverlayFrames] = useState<PreviewOverlayFrame[]>([])
  const [segmentName, setSegmentName] = useState('')
  const [frameLoading, setFrameLoading] = useState(false)
  const [frameError, setFrameError] = useState<string | null>(null)
  const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(null)

  const editableOverlays = activeOverlays(overlays)
  const canEditOverlays = Boolean(onOverlaysChange) && editableOverlays.length > 0

  useEffect(() => {
    overlaysRef.current = overlays
  }, [overlays])

  useEffect(() => {
    if (!preview) {
      setCurrentTime(0)
      setPrimaryFrame(null)
      setOverlayFrames([])
      setSegmentName('')
      return
    }

    setCurrentTime(0)
    setPrimaryFrame(preview.primaryFrame)
    setOverlayFrames(preview.overlayFrames)
    setSegmentName(preview.segments[0]?.name ?? '')
    setFrameError(null)
  }, [preview])

  useEffect(() => {
    if (editableOverlays.length === 0) {
      setSelectedOverlayId(null)
      return
    }
    if (!selectedOverlayId || !editableOverlays.some((layer) => layer.id === selectedOverlayId)) {
      setSelectedOverlayId(editableOverlays[editableOverlays.length - 1].id)
    }
  }, [editableOverlays, selectedOverlayId])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !primaryFrame) return
    drawCompositeFrame(canvas, primaryFrame, overlays, overlayFrames)
  }, [primaryFrame, overlays, overlayFrames])

  const seekTo = useCallback(
    async (timestamp: number) => {
      if (!preview) return

      const clamped = Math.max(0, Math.min(timestamp, preview.duration))
      setCurrentTime(clamped)
      setFrameLoading(true)
      setFrameError(null)

      try {
        const frame = await window.api.getPreviewFrame({
          timestamp: clamped,
          segments: preview.segments,
          overlays: activeOverlays(overlays)
        })
        setPrimaryFrame(frame.primaryFrame)
        setOverlayFrames(frame.overlayFrames)
        setSegmentName(frame.segmentName)
      } catch (err) {
        setFrameError(err instanceof Error ? err.message : 'Failed to load frame')
      } finally {
        setFrameLoading(false)
      }
    },
    [preview, overlays]
  )

  const updateOverlayPlacement = useCallback(
    (id: string, patch: Pick<OverlayLayer, 'x' | 'y' | 'width' | 'height'>) => {
      if (!onOverlaysChange) return
      onOverlaysChange(
        overlaysRef.current.map((overlay) => (overlay.id === id ? { ...overlay, ...patch } : overlay))
      )
    },
    [onOverlaysChange]
  )

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent): void => {
      const drag = dragRef.current
      const layer = editLayerRef.current
      if (!drag || !layer) return

      const bounds = layer.getBoundingClientRect()
      if (bounds.width <= 0 || bounds.height <= 0) return

      const dxPercent = ((event.clientX - drag.startX) / bounds.width) * 100
      const dyPercent = ((event.clientY - drag.startY) / bounds.height) * 100
      updateOverlayPlacement(
        drag.overlayId,
        applyOverlayDrag(drag.origin, drag.mode, dxPercent, dyPercent, drag.lockAspectRatio)
      )
    }

    const handlePointerUp = (): void => {
      dragRef.current = null
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerUp)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerUp)
    }
  }, [updateOverlayPlacement])

  const beginDrag = (
    event: React.PointerEvent,
    overlay: OverlayLayer,
    mode: DragState['mode']
  ): void => {
    if (!onOverlaysChange) return
    event.preventDefault()
    event.stopPropagation()
    setSelectedOverlayId(overlay.id)
    dragRef.current = {
      overlayId: overlay.id,
      mode,
      startX: event.clientX,
      startY: event.clientY,
      origin: {
        x: overlay.x,
        y: overlay.y,
        width: overlay.width,
        height: overlay.height
      },
      lockAspectRatio: overlay.lockAspectRatio !== false
    }
  }

  const handleTimelineClick = (event: React.MouseEvent<HTMLDivElement>): void => {
    if (!preview || !timelineRef.current) return

    const rect = timelineRef.current.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
    void seekTo(ratio * preview.duration)
  }

  const handleTimelineKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (!preview) return

    const step = event.shiftKey ? 5 : 1
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      void seekTo(currentTime - step)
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      void seekTo(currentTime + step)
    }
  }

  const hasInputs = Boolean(preview) || loading || error
  const playheadPercent = preview ? (currentTime / preview.duration) * 100 : 0
  const activeOverlayCount = editableOverlays.length

  if (!hasInputs) {
    return (
      <div className="live-preview live-preview-empty">
        <p>Select a WAV file and primary media folder to see a live preview.</p>
      </div>
    )
  }

  return (
    <div className="live-preview">
      <div className="live-preview-header">
        <h2>Live preview</h2>
        {preview && (
          <span className="preview-duration">
            {formatDuration(currentTime)} / {formatDuration(preview.duration)}
          </span>
        )}
      </div>

      <div className="preview-frame-wrap">
        {(loading || frameLoading) && (
          <div className="preview-overlay-status">Updating preview...</div>
        )}
        {(error || frameError) && !loading && !frameLoading && (
          <div className="preview-overlay-status preview-error">{error ?? frameError}</div>
        )}
        <div className="preview-canvas-stack">
          <canvas ref={canvasRef} className="preview-canvas" />
          {canEditOverlays && primaryFrame && (
            <div ref={editLayerRef} className="overlay-edit-layer" aria-hidden={!canEditOverlays}>
              {editableOverlays.map((overlay, index) => {
                const selected = overlay.id === selectedOverlayId
                return (
                  <div
                    key={overlay.id}
                    className={`overlay-box ${selected ? 'selected' : ''}`}
                    style={{
                      left: `${overlay.x}%`,
                      top: `${overlay.y}%`,
                      width: `${overlay.width}%`,
                      height: `${overlay.height}%`
                    }}
                    onPointerDown={(event) => beginDrag(event, overlay, 'move')}
                  >
                    <span className="overlay-box-label">Overlay {index + 1}</span>
                    {selected &&
                      RESIZE_HANDLES.map((handle) => (
                        <div
                          key={handle}
                          className={`overlay-handle overlay-handle-${handle}`}
                          onPointerDown={(event) => beginDrag(event, overlay, handle)}
                        />
                      ))}
                  </div>
                )
              })}
            </div>
          )}
        </div>
        {!primaryFrame && !loading && !error && (
          <div className="preview-placeholder">No frame available</div>
        )}
      </div>

      {segmentName && (
        <p className="preview-segment-name" title={segmentName}>
          {segmentName}
        </p>
      )}

      {preview && (
        <>
          <div className="timeline-labels">
            <span>0:00</span>
            <span>{formatDuration(preview.duration)}</span>
          </div>
          <div
            ref={timelineRef}
            className="timeline-track timeline-track-interactive"
            role="slider"
            tabIndex={0}
            aria-label="Preview timeline"
            aria-valuemin={0}
            aria-valuemax={preview.duration}
            aria-valuenow={currentTime}
            onClick={handleTimelineClick}
            onKeyDown={handleTimelineKeyDown}
          >
            {preview.segments.map((segment, index) => {
              const widthPercent = (segment.duration / preview.duration) * 100
              const color =
                segment.kind === 'intro'
                  ? '#b8860b'
                  : segment.kind === 'outro'
                    ? '#9b3d3d'
                    : SEGMENT_COLORS[index % SEGMENT_COLORS.length]
              const kindLabel =
                segment.kind === 'intro' ? 'Intro' : segment.kind === 'outro' ? 'Outro' : ''
              return (
                <div
                  key={`${segment.path}-${segment.start}-${index}`}
                  className={`timeline-segment ${segment.kind ?? ''}`}
                  style={{ width: `${widthPercent}%`, backgroundColor: color }}
                  title={`${kindLabel ? `${kindLabel}: ` : ''}${segment.name} — ${formatDuration(segment.duration)}`}
                >
                  {widthPercent > 8 && (
                    <span className="timeline-segment-label">{segment.name}</span>
                  )}
                </div>
              )
            })}
            <div className="timeline-playhead" style={{ left: `${playheadPercent}%` }} />
          </div>
          <p className="timeline-hint">
            Click anywhere on the timeline to preview that moment. Use ← → to step by 1s (Shift+arrow for
            5s).
            {primaryMode === 'images'
              ? ' Sample image order (shuffled).'
              : ' Sample clip order (shuffled).'}
            {activeOverlayCount > 0 &&
              ' Drag overlays to move; resize with handles. Use Center buttons or Lock aspect ratio under each overlay.'}
          </p>
        </>
      )}
    </div>
  )
}
