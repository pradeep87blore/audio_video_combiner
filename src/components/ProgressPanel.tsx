interface ProgressPanelProps {
  percent: number
  message: string
  log: string[]
  visible: boolean
}

export function ProgressPanel({
  percent,
  message,
  log,
  visible
}: ProgressPanelProps): JSX.Element | null {
  if (!visible) return null

  return (
    <div className="progress-panel">
      <div className="progress-header">
        <span>{message}</span>
        <span>{Math.round(percent)}%</span>
      </div>
      <div className="progress-bar-track">
        <div className="progress-bar-fill" style={{ width: `${percent}%` }} />
      </div>
      {log.length > 0 && (
        <div className="progress-log">
          {log.map((line, i) => (
            <div key={i} className="log-line">
              {line}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
