interface OpacitySliderProps {
  value: number
  onChange: (value: number) => void
  disabled?: boolean
}

export function OpacitySlider({ value, onChange, disabled }: OpacitySliderProps): JSX.Element {
  return (
    <div className="field">
      <label className="field-label">
        Overlay transparency
        <span className="opacity-value">{value}%</span>
      </label>
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={disabled}
        className="opacity-slider"
      />
      <div className="slider-labels">
        <span>Transparent</span>
        <span>Opaque</span>
      </div>
    </div>
  )
}
