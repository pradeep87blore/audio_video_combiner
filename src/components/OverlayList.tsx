import type { OverlayLayer } from '../types'
import { createOverlayLayer } from '../utils/overlay'
import { OpacitySlider } from './OpacitySlider'
import './OverlayList.css'

interface OverlayListProps {
  overlays: OverlayLayer[]
  onChange: (overlays: OverlayLayer[]) => void
  disabled?: boolean
}

function basename(filePath: string): string {
  return filePath.split(/[/\\]/).pop() ?? filePath
}

function updateOverlay(
  overlays: OverlayLayer[],
  id: string,
  patch: Partial<OverlayLayer>
): OverlayLayer[] {
  return overlays.map((overlay) => (overlay.id === id ? { ...overlay, ...patch } : overlay))
}

function clampPercent(value: number): number {
  if (Number.isNaN(value)) return 0
  return Math.max(0, Math.min(100, value))
}

export function OverlayList({ overlays, onChange, disabled }: OverlayListProps): JSX.Element {
  const handleAdd = (): void => {
    onChange([...overlays, createOverlayLayer()])
  }

  const handleBrowse = async (id: string): Promise<void> => {
    const file = await window.api.selectFile([
      { name: 'Video', extensions: ['mp4', 'mov', 'mkv', 'avi', 'webm'] }
    ])
    if (file) {
      onChange(updateOverlay(overlays, id, { path: file }))
    }
  }

  const handleRemove = (id: string): void => {
    onChange(overlays.filter((overlay) => overlay.id !== id))
  }

  const handlePlacementChange = (
    id: string,
    field: 'x' | 'y' | 'width' | 'height',
    rawValue: string
  ): void => {
    const value = Number(rawValue)
    const clamped =
      field === 'width' || field === 'height'
        ? Math.max(1, clampPercent(value))
        : clampPercent(value)
    onChange(updateOverlay(overlays, id, { [field]: clamped }))
  }

  return (
    <div className="overlay-list">
      <div className="overlay-list-header">
        <label className="field-label">
          Overlay videos
          <span className="optional-tag">optional</span>
        </label>
        <button type="button" className="browse-btn overlay-add-btn" onClick={handleAdd} disabled={disabled}>
          Add overlay
        </button>
      </div>

      {overlays.length === 0 && (
        <p className="overlay-list-empty">No overlays added. Click &quot;Add overlay&quot; to layer videos on top.</p>
      )}

      {overlays.map((overlay, index) => (
        <div key={overlay.id} className="overlay-item">
          <div className="overlay-item-header">
            <span className="overlay-item-title">Overlay {index + 1}</span>
            <button
              type="button"
              className="browse-btn clear-btn overlay-remove-btn"
              onClick={() => handleRemove(overlay.id)}
              disabled={disabled}
            >
              Remove
            </button>
          </div>

          <div className="picker-row">
            <div className={`picker-path ${overlay.path ? 'has-value' : ''}`} title={overlay.path}>
              {overlay.path ? basename(overlay.path) : 'No file selected'}
            </div>
            <button
              type="button"
              className="browse-btn"
              onClick={() => void handleBrowse(overlay.id)}
              disabled={disabled}
            >
              Browse
            </button>
            {overlay.path && (
              <button
                type="button"
                className="browse-btn clear-btn"
                onClick={() => onChange(updateOverlay(overlays, overlay.id, { path: '' }))}
                disabled={disabled}
              >
                Clear
              </button>
            )}
          </div>

          <OpacitySlider
            value={overlay.opacity}
            onChange={(value) => onChange(updateOverlay(overlays, overlay.id, { opacity: value }))}
            disabled={disabled || !overlay.path}
          />

          <div className="overlay-placement">
            <span className="overlay-placement-label">Position &amp; size (% of screen)</span>
            <div className="overlay-placement-grid">
              <label className="overlay-placement-field">
                <span>X</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={overlay.x}
                  onChange={(e) => handlePlacementChange(overlay.id, 'x', e.target.value)}
                  disabled={disabled || !overlay.path}
                />
              </label>
              <label className="overlay-placement-field">
                <span>Y</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={overlay.y}
                  onChange={(e) => handlePlacementChange(overlay.id, 'y', e.target.value)}
                  disabled={disabled || !overlay.path}
                />
              </label>
              <label className="overlay-placement-field">
                <span>Width</span>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={overlay.width}
                  onChange={(e) => handlePlacementChange(overlay.id, 'width', e.target.value)}
                  disabled={disabled || !overlay.path}
                />
              </label>
              <label className="overlay-placement-field">
                <span>Height</span>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={overlay.height}
                  onChange={(e) => handlePlacementChange(overlay.id, 'height', e.target.value)}
                  disabled={disabled || !overlay.path}
                />
              </label>
            </div>
            <p className="overlay-placement-hint">
              0, 0 with 100% width and height covers the full screen. Use smaller values to place an overlay in a corner or region.
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}
