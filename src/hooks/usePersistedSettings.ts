import { useEffect, useState } from 'react'
import type { AppSettings } from '../types'

export const DEFAULT_SETTINGS: AppSettings = {
  primaryMode: 'videos',
  primaryFolder: '',
  introPath: '',
  outroPath: '',
  overlayPath: '',
  overlayOpacity: 50,
  wavPath: '',
  outputPath: '',
  encoderPreference: 'auto',
  sceneTransitions: true
}

export function useSettingsHydration(onHydrate: (settings: AppSettings) => void): boolean {
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    let cancelled = false

    window.api.loadSettings().then((saved) => {
      if (cancelled) return
      if (saved) {
        onHydrate(saved)
      }
      setHydrated(true)
    })

    return () => {
      cancelled = true
    }
  }, [onHydrate])

  return hydrated
}

export function useAutoSaveSettings(settings: AppSettings, enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return
    void window.api.saveSettings(settings)
  }, [enabled, settings])
}

export function buildAppSettings(state: {
  primaryMode: AppSettings['primaryMode']
  primaryFolder: string
  introPath: string
  outroPath: string
  overlayPath: string
  overlayOpacity: number
  wavPath: string
  outputPath: string
  encoderPreference: AppSettings['encoderPreference']
  sceneTransitions: boolean
}): AppSettings {
  return { ...state }
}
