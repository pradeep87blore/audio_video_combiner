import type { AppSettings, JobStatus, JobTabState } from '../types'
import { DEFAULT_SETTINGS } from '../hooks/usePersistedSettings'

export const DEFAULT_TAB_JOB_STATE = {
  jobStatus: 'idle' as JobStatus,
  progress: 0,
  statusMessage: '',
  log: [] as string[],
  error: null as string | null
}

export function labelFromOutputPath(outputPath: string, fallback: string): string {
  if (!outputPath) return fallback
  const name = outputPath.split(/[/\\]/).pop()
  return name && name.length > 0 ? name.replace(/\.mp4$/i, '') : fallback
}

export function createEmptyTab(index: number): JobTabState {
  return {
    id: crypto.randomUUID(),
    label: `Job ${index}`,
    settings: { ...DEFAULT_SETTINGS },
    ...DEFAULT_TAB_JOB_STATE
  }
}

export function settingsToCombineOptions(settings: AppSettings) {
  return {
    primaryFolder: settings.primaryFolder,
    primaryMode: settings.primaryMode,
    introPath: settings.introPath || undefined,
    outroPath: settings.outroPath || undefined,
    overlays: settings.overlays.filter((overlay) => overlay.path),
    wavPath: settings.wavPath,
    outputPath: settings.outputPath,
    encoderPreference: settings.encoderPreference,
    sceneTransitions: settings.sceneTransitions
  }
}

export function tabHasActiveJob(tab: JobTabState): boolean {
  return tab.jobStatus === 'queued' || tab.jobStatus === 'running'
}
