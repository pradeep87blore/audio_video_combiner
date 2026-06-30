import { app } from 'electron'
import { readFile, writeFile, unlink } from 'fs/promises'
import { join } from 'path'
import { randomUUID } from 'crypto'
import type { AppSettings, JobTabState, TabsPersistedState } from '../src/types'
import { migrateAppSettings } from '../src/utils/overlay'

const SETTINGS_FILE = 'app-settings.json'
const TABS_FILE = 'job-tabs.json'

function userDataPath(fileName: string): string {
  return join(app.getPath('userData'), fileName)
}

export const DEFAULT_SETTINGS: AppSettings = {
  primaryMode: 'videos',
  primaryFolder: '',
  introPath: '',
  outroPath: '',
  overlays: [],
  wavPath: '',
  outputPath: '',
  encoderPreference: 'auto',
  sceneTransitions: true
}

function labelFromOutput(outputPath: string, fallback: string): string {
  if (!outputPath) return fallback
  const name = outputPath.split(/[/\\]/).pop()
  return name && name.length > 0 ? name.replace(/\.mp4$/i, '') : fallback
}

function createTab(overrides?: Partial<JobTabState>): JobTabState {
  const id = overrides?.id ?? randomUUID()
  const settings = overrides?.settings ?? { ...DEFAULT_SETTINGS }
  return {
    id,
    label: overrides?.label ?? labelFromOutput(settings.outputPath, 'New job'),
    settings,
    jobStatus: overrides?.jobStatus ?? 'idle',
    progress: overrides?.progress ?? 0,
    statusMessage: overrides?.statusMessage ?? '',
    log: overrides?.log ?? [],
    error: overrides?.error ?? null
  }
}

export function createDefaultTabsState(): TabsPersistedState {
  const tab = createTab({ id: randomUUID(), label: 'Job 1' })
  return {
    activeTabId: tab.id,
    tabs: [tab]
  }
}

export async function loadSettings(): Promise<AppSettings | null> {
  try {
    const raw = await readFile(userDataPath(SETTINGS_FILE), 'utf-8')
    return JSON.parse(raw) as AppSettings
  } catch {
    return null
  }
}

export async function loadTabsState(): Promise<TabsPersistedState> {
  try {
    const raw = await readFile(userDataPath(TABS_FILE), 'utf-8')
    const parsed = JSON.parse(raw) as TabsPersistedState
    if (!parsed.tabs?.length) {
      return createDefaultTabsState()
    }
    if (!parsed.activeTabId || !parsed.tabs.some((tab) => tab.id === parsed.activeTabId)) {
      parsed.activeTabId = parsed.tabs[0].id
    }
    return {
      activeTabId: parsed.activeTabId,
      tabs: parsed.tabs.map((tab) => ({
        ...tab,
        settings: migrateAppSettings(tab.settings as Partial<AppSettings> & Record<string, unknown>),
        jobStatus: 'idle' as const,
        progress: 0,
        statusMessage: '',
        log: [],
        error: null
      }))
    }
  } catch {
    const legacy = await loadSettings()
    if (legacy) {
      const tab = createTab({
        label: labelFromOutput(legacy.outputPath, 'Job 1'),
        settings: migrateAppSettings(legacy as Partial<AppSettings> & Record<string, unknown>)
      })
      return { activeTabId: tab.id, tabs: [tab] }
    }
    return createDefaultTabsState()
  }
}

export async function saveTabsState(state: TabsPersistedState): Promise<void> {
  await writeFile(userDataPath(TABS_FILE), JSON.stringify(state, null, 2), 'utf-8')
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await writeFile(userDataPath(SETTINGS_FILE), JSON.stringify(settings, null, 2), 'utf-8')
}

export async function clearSettings(): Promise<void> {
  try {
    await unlink(userDataPath(SETTINGS_FILE))
  } catch {
    // File may not exist yet.
  }
  try {
    await unlink(userDataPath(TABS_FILE))
  } catch {
    // File may not exist yet.
  }
}

export { createTab, labelFromOutput }
