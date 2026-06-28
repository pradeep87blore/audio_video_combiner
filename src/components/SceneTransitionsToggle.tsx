interface SceneTransitionsToggleProps {
  enabled: boolean
  onChange: (enabled: boolean) => void
  disabled?: boolean
}

export function SceneTransitionsToggle({
  enabled,
  onChange,
  disabled
}: SceneTransitionsToggleProps): JSX.Element {
  return (
    <div className="field">
      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
        />
        <span>Crossfade between scenes (fade to/from black)</span>
      </label>
      <p className="field-hint">
        {enabled
          ? '5-second transitions between clips (2.5s fade out, 2.5s fade in).'
          : 'Clips play back-to-back with hard cuts between segments.'}
      </p>
    </div>
  )
}
