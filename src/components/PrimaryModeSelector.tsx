import type { PrimaryMode } from '../types'

interface PrimaryModeSelectorProps {
  value: PrimaryMode
  onChange: (mode: PrimaryMode) => void
  disabled?: boolean
}

export function PrimaryModeSelector({
  value,
  onChange,
  disabled
}: PrimaryModeSelectorProps): JSX.Element {
  return (
    <div className="field">
      <label className="field-label">Primary background</label>
      <div className="mode-selector">
        <label className={`mode-option ${value === 'videos' ? 'active' : ''}`}>
          <input
            type="radio"
            name="primaryMode"
            value="videos"
            checked={value === 'videos'}
            onChange={() => onChange('videos')}
            disabled={disabled}
          />
          Video clips
        </label>
        <label className={`mode-option ${value === 'images' ? 'active' : ''}`}>
          <input
            type="radio"
            name="primaryMode"
            value="images"
            checked={value === 'images'}
            onChange={() => onChange('images')}
            disabled={disabled}
          />
          Static images
        </label>
      </div>
      <p className="field-hint">
        {value === 'videos'
          ? 'Clips play back-to-back in random order, looping until the music ends.'
          : 'Images are shown in random order, each for an equal share of the music duration.'}
      </p>
    </div>
  )
}
