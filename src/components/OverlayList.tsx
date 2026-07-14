import type { OverlayLayer } from '../types'
import {
  applyLockedSizeChange,
  centerOverlayBoth,
  centerOverlayHorizontally,
  centerOverlayVertically,
  createOverlayLayer
} from '../utils/overlay'
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
    overlay: OverlayLayer,
    field: 'x' | 'y' | 'width' | 'height',
    rawValue: string
  ): void => {
    const value = Number(rawValue)

    if (field === 'x' || field === 'y') {
      onChange(updateOverlay(overlays, overlay.id, { [field]: clampPercent(value) }))
      return
    }

    const next = Math.max(1, clampPercent(value))
    if (overlay.lockAspectRatio) {
      onChange(updateOverlay(overlays, overlay.id, applyLockedSizeChange(overlay, field, next)))
      return
    }

    onChange(updateOverlay(overlays, overlay.id, { [field]: next }))
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

          <label className="checkbox-field overlay-remove-black">
            <input
              type="checkbox"
              checked={overlay.removeBlack}
              onChange={(e) =>
                onChange(updateOverlay(overlays, overlay.id, { removeBlack: e.target.checked }))
              }
              disabled={disabled || !overlay.path}
            />
            Remove black background
          </label>
          <p className="overlay-placement-hint overlay-remove-black-hint">
            Turns black or near-black pixels transparent so logos and text sit cleanly on the video.
          </p>

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
                  onChange={(e) => handlePlacementChange(overlay, 'x', e.target.value)}
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
                  onChange={(e) => handlePlacementChange(overlay, 'y', e.target.value)}
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
                  onChange={(e) => handlePlacementChange(overlay, 'width', e.target.value)}
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
                  onChange={(e) => handlePlacementChange(overlay, 'height', e.target.value)}
                  disabled={disabled || !overlay.path}
                />
              </label>
            </div>

            <div className="overlay-center-row">
              <button
                type="button"
                className="browse-btn overlay-center-btn"
                onClick={() =>
                  onChange(updateOverlay(overlays, overlay.id, centerOverlayHorizontally(overlay)))
                }
                disabled={disabled || !overlay.path}
              >
                Center horizontally
              </button>
              <button
                type="button"
                className="browse-btn overlay-center-btn"
                onClick={() =>
                  onChange(updateOverlay(overlays, overlay.id, centerOverlayVertically(overlay)))
                }
                disabled={disabled || !overlay.path}
              >
                Center vertically
              </button>
              <button
                type="button"
                className="browse-btn overlay-center-btn"
                onClick={() => onChange(updateOverlay(overlays, overlay.id, centerOverlayBoth(overlay)))}
                disabled={disabled || !overlay.path}
              >
                Center both
              </button>
            </div>

            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={overlay.lockAspectRatio}
                onChange={(e) =>
                  onChange(
                    updateOverlay(overlays, overlay.id, { lockAspectRatio: e.target.checked })
                  )
                }
                disabled={disabled || !overlay.path}
              />
              Lock aspect ratio
            </label>
            <p className="overlay-placement-hint">
              Drag the overlay box in the live preview to move it, or use the handles to resize. With
              aspect ratio locked, proportions stay the same and the video will not skew.
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}
