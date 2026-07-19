import type { EncoderInfo, EncoderPreference } from '../types'

interface EncoderSelectorProps {
  value: EncoderPreference
  onChange: (value: EncoderPreference) => void
  detectedEncoder: EncoderInfo | null
  disabled?: boolean
}

const OPTIONS: { value: EncoderPreference; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'gpu', label: 'GPU' },
  { value: 'cpu', label: 'CPU' }
]

export function EncoderSelector({
  value,
  onChange,
  detectedEncoder,
  disabled
}: EncoderSelectorProps): JSX.Element {
  return (
    <div className="field">
      <label className="field-label">Video encoding</label>
      <div className="mode-selector">
        {OPTIONS.map((option) => (
          <label
            key={option.value}
            className={`mode-option ${value === option.value ? 'active' : ''}`}
          >
            <input
              type="radio"
              name="encoderPreference"
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              disabled={disabled}
            />
            {option.label}
          </label>
        ))}
      </div>
      <p className="field-hint">
        {value === 'auto' && detectedEncoder
          ? `Auto will use ${detectedEncoder.label} when available, otherwise CPU.`
          : value === 'gpu'
            ? 'Forces hardware encoding (NVIDIA / Intel / AMD).'
            : 'Uses CPU libx264 — slower but works everywhere.'}
        {' '}
        {value === 'cpu'
          ? 'Decode and filters also stay on the CPU.'
          : 'When NVIDIA CUDA is available, Auto/GPU also accelerate decode and scaling. Fades, colorkey, and overlay compositing still use the CPU.'}
      </p>
    </div>
  )
}
