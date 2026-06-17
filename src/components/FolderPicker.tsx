import './pickers.css'

interface FolderPickerProps {
  label: string
  path: string
  onBrowse: () => void
  disabled?: boolean
  hint?: string
}

export function FolderPicker({
  label,
  path,
  onBrowse,
  disabled,
  hint
}: FolderPickerProps): JSX.Element {
  return (
    <div className="field">
      <label className="field-label">{label}</label>
      <div className="picker-row">
        <div className={`picker-path ${path ? 'has-value' : ''}`} title={path}>
          {path || 'No folder selected'}
        </div>
        <button type="button" className="browse-btn" onClick={onBrowse} disabled={disabled}>
          Browse
        </button>
      </div>
      {hint && <p className="field-hint">{hint}</p>}
    </div>
  )
}
