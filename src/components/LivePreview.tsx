import { useEffect, useRef } from 'react'
import type { PreviewData } from '../types'
import { formatDuration } from '../utils/formatDuration'
import './LivePreview.css'

interface LivePreviewProps {
  preview: PreviewData | null
  overlayOpacity: number
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

export function LivePreview({
  preview,
  overlayOpacity,
  loading,
  error,
  primaryMode
}: LivePreviewProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !preview?.primaryFrame) return

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

      if (preview.overlayFrame) {
        const overlay = new Image()
        overlay.onload = () => {
          ctx.globalAlpha = overlayOpacity / 100
          ctx.drawImage(overlay, 0, 0, width, height)
          ctx.globalAlpha = 1
        }
        overlay.src = preview.overlayFrame
      }
    }
    primary.src = preview.primaryFrame
  }, [preview?.primaryFrame, preview?.overlayFrame, overlayOpacity])

  const hasInputs = Boolean(preview) || loading || error

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
          <span className="preview-duration">Total: {formatDuration(preview.duration)}</span>
        )}
      </div>

      <div className="preview-frame-wrap">
        {loading && <div className="preview-overlay-status">Updating preview...</div>}
        {error && !loading && <div className="preview-overlay-status preview-error">{error}</div>}
        <canvas ref={canvasRef} className="preview-canvas" />
        {!preview?.primaryFrame && !loading && !error && (
          <div className="preview-placeholder">No frame available</div>
        )}
      </div>

      {preview && (
        <>
          <div className="timeline-labels">
            <span>0:00</span>
            <span>{formatDuration(preview.duration)}</span>
          </div>
          <div className="timeline-track" title="Sample timeline — actual clip order is random">
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
          </div>
          <p className="timeline-hint">
            {primaryMode === 'images'
              ? 'Sample image order (shuffled). Each image gets equal time.'
              : 'Sample clip order (shuffled). Clips loop until the music ends.'}
            {' Intro/outro clips bookend the timeline when selected.'}
            {preview.overlayFrame && ` Overlay opacity: ${overlayOpacity}%.`}
          </p>
        </>
      )}
    </div>
  )
}
