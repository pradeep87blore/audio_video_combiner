import { useCallback, useEffect, useRef, useState } from 'react'
import type { OverlayLayer, PreviewData, PreviewOverlayFrame } from '../types'
import { activeOverlays, overlayRect } from '../utils/overlay'
import { formatDuration } from '../utils/formatDuration'
import './LivePreview.css'

interface LivePreviewProps {
  preview: PreviewData | null
  overlays: OverlayLayer[]
  loading: boolean
  error: string | null
  primaryMode: 'videos' | 'images'
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
        ctx.drawImage(overlay, rect.x, rect.y, rect.width, rect.height)
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
  loading,
  error,
  primaryMode
}: LivePreviewProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const timelineRef = useRef<HTMLDivElement>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [primaryFrame, setPrimaryFrame] = useState<string | null>(null)
  const [overlayFrames, setOverlayFrames] = useState<PreviewOverlayFrame[]>([])
  const [segmentName, setSegmentName] = useState('')
  const [frameLoading, setFrameLoading] = useState(false)
  const [frameError, setFrameError] = useState<string | null>(null)

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
  const activeOverlayCount = activeOverlays(overlays).length

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
        <canvas ref={canvasRef} className="preview-canvas" />
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
            Click anywhere on the timeline to preview that moment. Use ← → to step by 1s (Shift+arrow for 5s).
            {primaryMode === 'images'
              ? ' Sample image order (shuffled).'
              : ' Sample clip order (shuffled).'}
            {activeOverlayCount > 0 &&
              ` ${activeOverlayCount} overlay${activeOverlayCount === 1 ? '' : 's'} active.`}
          </p>
        </>
      )}
    </div>
  )
}
