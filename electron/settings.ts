import { app } from 'electron'
import { readFile, writeFile, unlink } from 'fs/promises'
import { join } from 'path'
import type { AppSettings } from '../../src/types'

const SETTINGS_FILE = 'app-settings.json'

function settingsPath(): string {
  return join(app.getPath('userData'), SETTINGS_FILE)
}

export async function loadSettings(): Promise<AppSettings | null> {
  try {
    const raw = await readFile(settingsPath(), 'utf-8')
    return JSON.parse(raw) as AppSettings
  } catch {
    return null
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await writeFile(settingsPath(), JSON.stringify(settings, null, 2), 'utf-8')
}

export async function clearSettings(): Promise<void> {
  try {
    await unlink(settingsPath())
  } catch {
    // File may not exist yet.
  }
}

export const DEFAULT_SETTINGS: AppSettings = {
  primaryMode: 'videos',
  primaryFolder: '',
  introPath: '',
  outroPath: '',
  overlayPath: '',
  overlayOpacity: 50,
  wavPath: '',
  outputPath: '',
  encoderPreference: 'auto'
}
