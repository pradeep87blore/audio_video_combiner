import './pickers.css'

interface FilePickerProps {
  label: string
  path: string
  onBrowse: () => void
  onClear?: () => void
  disabled?: boolean
  optional?: boolean
}

export function FilePicker({
  label,
  path,
  onBrowse,
  onClear,
  disabled,
  optional
}: FilePickerProps): JSX.Element {
  return (
    <div className="field">
      <label className="field-label">
        {label}
        {optional && <span className="optional-tag">optional</span>}
      </label>
      <div className="picker-row">
        <div className={`picker-path ${path ? 'has-value' : ''}`} title={path}>
          {path || 'No file selected'}
        </div>
        <button type="button" className="browse-btn" onClick={onBrowse} disabled={disabled}>
          Browse
        </button>
        {optional && onClear && (
          <button
            type="button"
            className="browse-btn clear-btn"
            onClick={onClear}
            disabled={disabled || !path}
          >
            Clear
          </button>
        )}
      </div>
    </div>
  )
}
