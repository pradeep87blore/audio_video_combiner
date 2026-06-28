import { useEffect, useState } from 'react'
import type { JobTabState, QueueSnapshot, TabsPersistedState } from '../types'

export function useTabsHydration(
  onHydrate: (state: TabsPersistedState) => void
): boolean {
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    let cancelled = false

    window.api.loadTabsState().then((state) => {
      if (cancelled) return
      onHydrate(state)
      setHydrated(true)
    })

    return () => {
      cancelled = true
    }
  }, [onHydrate])

  return hydrated
}

export function useAutoSaveTabsState(state: TabsPersistedState, enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return
    void window.api.saveTabsState(state)
  }, [enabled, state])
}

export function useJobQueue(onQueueChange: (snapshot: QueueSnapshot) => void): void {
  useEffect(() => {
    void window.api.getQueueState().then(onQueueChange)
    const unsubscribeUpdated = window.api.onQueueUpdated(onQueueChange)
    return unsubscribeUpdated
  }, [onQueueChange])
}

export function syncTabFromQueue(tabs: JobTabState[], snapshot: QueueSnapshot): JobTabState[] {
  return tabs.map((tab) => {
    const jobs = snapshot.jobs.filter((job) => job.tabId === tab.id)
    if (jobs.length === 0) {
      if (tab.jobStatus === 'idle') return tab
      return { ...tab, jobStatus: 'idle', progress: 0, statusMessage: '', error: null }
    }

    const latest = jobs[jobs.length - 1]
    const log = [...tab.log]
    if (latest.message && log[log.length - 1] !== latest.message) {
      log.push(latest.message)
    }

    return {
      ...tab,
      jobStatus: latest.status,
      progress: latest.progress,
      statusMessage: latest.message,
      error: latest.error,
      log: log.slice(-50)
    }
  })
}
