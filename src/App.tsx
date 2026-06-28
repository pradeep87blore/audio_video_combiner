import { useCallback, useEffect, useMemo, useState } from 'react'
import { FilePicker } from './components/FilePicker'
import { FolderPicker } from './components/FolderPicker'
import { OpacitySlider } from './components/OpacitySlider'
import { PrimaryModeSelector } from './components/PrimaryModeSelector'
import { SceneTransitionsToggle } from './components/SceneTransitionsToggle'
import { EncoderSelector } from './components/EncoderSelector'
import { LivePreview } from './components/LivePreview'
import { ProgressPanel } from './components/ProgressPanel'
import { JobTabs } from './components/JobTabs'
import { usePreview } from './hooks/usePreview'
import { DEFAULT_SETTINGS } from './hooks/usePersistedSettings'
import {
  syncTabFromQueue,
  useAutoSaveTabsState,
  useJobQueue,
  useTabsHydration
} from './hooks/useJobQueue'
import type { AppSettings, EncoderInfo, JobTabState, PrimaryMode, QueueSnapshot, TabsPersistedState } from './types'
import {
  createEmptyTab,
  labelFromOutputPath,
  settingsToCombineOptions,
  tabHasActiveJob
} from './utils/jobTab'
import './App.css'

function basename(filePath: string): string {
  return filePath.split(/[/\\]/).pop() ?? filePath
}

function createInitialTabsState(): TabsPersistedState {
  const tab = createEmptyTab(1)
  return { activeTabId: tab.id, tabs: [tab] }
}

export default function App(): JSX.Element {
  const [tabsState, setTabsState] = useState<TabsPersistedState>(createInitialTabsState)
  const [queueSnapshot, setQueueSnapshot] = useState<QueueSnapshot>({ jobs: [], activeCount: 0 })
  const [primaryFiles, setPrimaryFiles] = useState<string[]>([])
  const [detectedEncoder, setDetectedEncoder] = useState<EncoderInfo | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [hydrated, setHydrated] = useState(false)

  const activeTab = useMemo(
    () => tabsState.tabs.find((tab) => tab.id === tabsState.activeTabId) ?? tabsState.tabs[0],
    [tabsState]
  )

  const settings = activeTab?.settings ?? DEFAULT_SETTINGS

  const handleHydrate = useCallback((state: TabsPersistedState) => {
    setTabsState(state)
    setHydrated(true)
  }, [])

  useTabsHydration(handleHydrate)

  const handleQueueChange = useCallback((snapshot: QueueSnapshot) => {
    setQueueSnapshot(snapshot)
    setTabsState((prev) => ({
      ...prev,
      tabs: syncTabFromQueue(prev.tabs, snapshot)
    }))
  }, [])

  useJobQueue(handleQueueChange)

  useAutoSaveTabsState(tabsState, hydrated)

  const updateActiveTab = useCallback(
    (update: (tab: JobTabState) => JobTabState) => {
      setTabsState((prev) => ({
        ...prev,
        tabs: prev.tabs.map((tab) => (tab.id === prev.activeTabId ? update(tab) : tab))
      }))
    },
    []
  )

  const updateSettings = useCallback(
    (patch: Partial<AppSettings>) => {
      updateActiveTab((tab) => {
        const nextSettings = { ...tab.settings, ...patch }
        const label =
          patch.outputPath !== undefined
            ? labelFromOutputPath(patch.outputPath, tab.label)
            : tab.label
        return { ...tab, settings: nextSettings, label }
      })
    },
    [updateActiveTab]
  )

  useEffect(() => {
    if (!hydrated) return
    void window.api.detectEncoder(settings.encoderPreference).then(setDetectedEncoder)
  }, [hydrated, settings.encoderPreference])

  const refreshPrimaryList = useCallback(async (folder: string, mode: PrimaryMode) => {
    const files =
      mode === 'images'
        ? await window.api.listImagesInFolder(folder)
        : await window.api.listVideosInFolder(folder)
    setPrimaryFiles(files)
    return files
  }, [])

  useEffect(() => {
    if (!hydrated || !activeTab) return
    if (activeTab.settings.primaryFolder) {
      void refreshPrimaryList(activeTab.settings.primaryFolder, activeTab.settings.primaryMode)
    } else {
      setPrimaryFiles([])
    }
  }, [
    hydrated,
    activeTab?.id,
    activeTab?.settings.primaryFolder,
    activeTab?.settings.primaryMode,
    refreshPrimaryList
  ])

  const handleSelectTab = (tabId: string): void => {
    setTabsState((prev) => ({ ...prev, activeTabId: tabId }))
    setValidationError(null)
  }

  const handleAddTab = (): void => {
    const newTab = createEmptyTab(tabsState.tabs.length + 1)
    setTabsState((prev) => ({
      activeTabId: newTab.id,
      tabs: [...prev.tabs, newTab]
    }))
    setValidationError(null)
  }

  const handleCloseTab = (tabId: string): void => {
    const tab = tabsState.tabs.find((entry) => entry.id === tabId)
    if (!tab || tabHasActiveJob(tab) || tabsState.tabs.length <= 1) return

    setTabsState((prev) => {
      const tabs = prev.tabs.filter((entry) => entry.id !== tabId)
      const activeTabId = prev.activeTabId === tabId ? tabs[0].id : prev.activeTabId
      return { activeTabId, tabs }
    })
    setValidationError(null)
  }

  const handleBrowsePrimaryFolder = async (): Promise<void> => {
    const folder = await window.api.selectFolder()
    if (folder) {
      updateSettings({ primaryFolder: folder })
      await refreshPrimaryList(folder, settings.primaryMode)
      setValidationError(null)
    }
  }

  const handlePrimaryModeChange = (mode: PrimaryMode): void => {
    updateSettings({ primaryMode: mode })
    setValidationError(null)
  }

  const handleBrowseIntro = async (): Promise<void> => {
    const file = await window.api.selectFile([
      { name: 'Video', extensions: ['mp4', 'mov', 'mkv', 'avi', 'webm'] }
    ])
    if (file) {
      updateSettings({ introPath: file })
      setValidationError(null)
    }
  }

  const handleBrowseOutro = async (): Promise<void> => {
    const file = await window.api.selectFile([
      { name: 'Video', extensions: ['mp4', 'mov', 'mkv', 'avi', 'webm'] }
    ])
    if (file) {
      updateSettings({ outroPath: file })
      setValidationError(null)
    }
  }

  const handleBrowseOverlay = async (): Promise<void> => {
    const file = await window.api.selectFile([
      { name: 'Video', extensions: ['mp4', 'mov', 'mkv', 'avi', 'webm'] }
    ])
    if (file) {
      updateSettings({ overlayPath: file })
      setValidationError(null)
    }
  }

  const handleBrowseWav = async (): Promise<void> => {
    const file = await window.api.selectFile([{ name: 'WAV Audio', extensions: ['wav'] }])
    if (file) {
      updateSettings({ wavPath: file })
      setValidationError(null)
    }
  }

  const handleBrowseOutput = async (): Promise<void> => {
    const file = await window.api.selectSavePath('output.mp4')
    if (file) {
      updateSettings({ outputPath: file.endsWith('.mp4') ? file : `${file}.mp4` })
      setValidationError(null)
    }
  }

  const handleReset = async (): Promise<void> => {
    await window.api.clearSettings()
    setTabsState(createInitialTabsState())
    setPrimaryFiles([])
    setValidationError(null)
  }

  const validate = (): string | null => {
    if (!settings.primaryFolder) {
      return settings.primaryMode === 'images'
        ? 'Select a folder containing primary background images.'
        : 'Select a folder containing primary video clips.'
    }
    if (primaryFiles.length === 0) {
      return settings.primaryMode === 'images'
        ? 'The selected folder contains no supported image files (.jpg, .jpeg, .png, .webp, .bmp, .gif).'
        : 'The selected folder contains no supported video files (.mp4, .mov, .mkv, .avi, .webm).'
    }
    if (!settings.wavPath) return 'Select a WAV music file.'
    if (!settings.outputPath) return 'Choose an output file path.'
    return null
  }

  const handleGenerate = async (): Promise<void> => {
    const validation = validate()
    if (validation) {
      setValidationError(validation)
      return
    }

    if (!activeTab) return

    setValidationError(null)
    await window.api.enqueueCombine(activeTab.id, settingsToCombineOptions(settings))
  }

  const tabIsBusy = activeTab ? tabHasActiveJob(activeTab) : false

  const { preview, loading: previewLoading, error: previewError } = usePreview({
    primaryMode: settings.primaryMode,
    primaryFiles,
    introPath: settings.introPath,
    outroPath: settings.outroPath,
    overlayPath: settings.overlayPath,
    wavPath: settings.wavPath,
    enabled: hydrated && !!activeTab && !tabIsBusy
  })

  const showSuccess =
    activeTab?.jobStatus === 'completed' && activeTab.progress === 100 && !activeTab.error
  const fileLabel = settings.primaryMode === 'images' ? 'image' : 'video clip'
  const fileLabelPlural = settings.primaryMode === 'images' ? 'images' : 'video clips'

  if (!activeTab) {
    return <div className="app">Loading...</div>
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header-row">
          <div>
            <h1>Audio Video Combiner</h1>
            <p>
              Combine primary video clips or static images with an optional semi-transparent overlay
              and a WAV soundtrack. Output length matches the music.
            </p>
          </div>
          <button type="button" className="reset-btn" onClick={handleReset}>
            Reset / Clear
          </button>
        </div>
      </header>

      <JobTabs
        tabs={tabsState.tabs}
        activeTabId={tabsState.activeTabId}
        onSelect={handleSelectTab}
        onAdd={handleAddTab}
        onClose={handleCloseTab}
      />

      {queueSnapshot.activeCount > 0 && (
        <div className="queue-summary">
          <strong>{queueSnapshot.activeCount}</strong> active job
          {queueSnapshot.activeCount === 1 ? '' : 's'} in queue (processing sequentially)
        </div>
      )}

      <LivePreview
        preview={preview}
        overlayPath={settings.overlayPath}
        overlayOpacity={settings.overlayOpacity}
        loading={previewLoading}
        error={previewError}
        primaryMode={settings.primaryMode}
      />

      <div className="form">
        <PrimaryModeSelector
          value={settings.primaryMode}
          onChange={handlePrimaryModeChange}
        />

        <SceneTransitionsToggle
          enabled={settings.sceneTransitions}
          onChange={(enabled) => updateSettings({ sceneTransitions: enabled })}
        />

        <FolderPicker
          label={settings.primaryMode === 'images' ? 'Primary images' : 'Primary videos'}
          path={settings.primaryFolder}
          onBrowse={handleBrowsePrimaryFolder}
          hint={
            primaryFiles.length > 0
              ? `${primaryFiles.length} ${primaryFiles.length === 1 ? fileLabel : fileLabelPlural} found`
              : undefined
          }
        />

        {primaryFiles.length > 0 && (
          <ul className="video-list">
            {primaryFiles.map((file) => (
              <li key={file}>{basename(file)}</li>
            ))}
          </ul>
        )}

        <FilePicker
          label="Intro clip"
          path={settings.introPath}
          onBrowse={handleBrowseIntro}
          onClear={() => updateSettings({ introPath: '' })}
          optional
        />

        <FilePicker
          label="Outro clip"
          path={settings.outroPath}
          onBrowse={handleBrowseOutro}
          onClear={() => updateSettings({ outroPath: '' })}
          optional
        />

        <FilePicker
          label="Overlay video"
          path={settings.overlayPath}
          onBrowse={handleBrowseOverlay}
          onClear={() => updateSettings({ overlayPath: '' })}
          optional
        />

        <OpacitySlider
          value={settings.overlayOpacity}
          onChange={(value) => updateSettings({ overlayOpacity: value })}
          disabled={!settings.overlayPath}
        />

        <FilePicker
          label="Music (WAV)"
          path={settings.wavPath}
          onBrowse={handleBrowseWav}
        />

        <FilePicker
          label="Output file"
          path={settings.outputPath}
          onBrowse={handleBrowseOutput}
        />

        <EncoderSelector
          value={settings.encoderPreference}
          onChange={(value) => updateSettings({ encoderPreference: value })}
          detectedEncoder={detectedEncoder}
        />

        {(validationError || activeTab.error) && (
          <div className="error-banner">{validationError ?? activeTab.error}</div>
        )}

        {showSuccess && (
          <div className="success-banner">Video saved to {settings.outputPath}</div>
        )}

        <button type="button" className="generate-btn" onClick={handleGenerate}>
          Add to Queue
        </button>

        <ProgressPanel
          percent={activeTab.progress}
          message={activeTab.statusMessage}
          log={activeTab.log}
          visible={
            activeTab.jobStatus !== 'idle' ||
            activeTab.progress > 0 ||
            activeTab.log.length > 0
          }
        />
      </div>
    </div>
  )
}
