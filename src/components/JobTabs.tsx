import type { JobStatus, JobTabState } from '../types'
import './JobTabs.css'

interface JobTabsProps {
  tabs: JobTabState[]
  activeTabId: string
  onSelect: (tabId: string) => void
  onAdd: () => void
  onClose: (tabId: string) => void
  disabled?: boolean
}

function statusSymbol(status: JobStatus): string {
  switch (status) {
    case 'queued':
      return '◷'
    case 'running':
      return '●'
    case 'completed':
      return '✓'
    case 'failed':
      return '!'
    default:
      return ''
  }
}

export function JobTabs({
  tabs,
  activeTabId,
  onSelect,
  onAdd,
  onClose,
  disabled
}: JobTabsProps): JSX.Element {
  return (
    <div className="job-tabs-bar">
      <div className="job-tabs-list" role="tablist" aria-label="Video jobs">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId
          const status = statusSymbol(tab.jobStatus)
          const isBusy = tab.jobStatus === 'queued' || tab.jobStatus === 'running'

          return (
            <div
              key={tab.id}
              className={`job-tab ${isActive ? 'active' : ''} ${isBusy ? 'busy' : ''}`}
              role="tab"
              aria-selected={isActive}
            >
              <button
                type="button"
                className="job-tab-select"
                onClick={() => onSelect(tab.id)}
                disabled={disabled}
                title={tab.label}
              >
                {status && <span className={`job-tab-status status-${tab.jobStatus}`}>{status}</span>}
                <span className="job-tab-label">{tab.label}</span>
              </button>
              {tabs.length > 1 && (
                <button
                  type="button"
                  className="job-tab-close"
                  onClick={() => onClose(tab.id)}
                  disabled={disabled || isBusy}
                  aria-label={`Close ${tab.label}`}
                  title={isBusy ? 'Cannot close while job is active' : `Close ${tab.label}`}
                >
                  ×
                </button>
              )}
            </div>
          )
        })}
      </div>
      <button
        type="button"
        className="job-tab-add"
        onClick={onAdd}
        disabled={disabled}
        aria-label="Add new job tab"
        title="Add new job tab"
      >
        +
      </button>
    </div>
  )
}
