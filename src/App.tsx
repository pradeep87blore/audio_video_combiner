import { useCallback, useEffect, useMemo, useState } from 'react'
import { FilePicker } from './components/FilePicker'
import { FolderPicker } from './components/FolderPicker'
import { OpacitySlider } from './components/OpacitySlider'
import { PrimaryModeSelector } from './components/PrimaryModeSelector'
import { EncoderSelector } from './components/EncoderSelector'
import { LivePreview } from './components/LivePreview'
import { ProgressPanel } from './components/ProgressPanel'
import { useCombiner } from './hooks/useCombiner'
import { usePreview } from './hooks/usePreview'
import {
  buildAppSettings,
  DEFAULT_SETTINGS,
  useAutoSaveSettings,
  useSettingsHydration
} from './hooks/usePersistedSettings'
import type { AppSettings, EncoderInfo, PrimaryMode } from './types'
import './App.css'

function basename(filePath: string): string {
  return filePath.split(/[/\\]/).pop() ?? filePath
}

export default function App(): JSX.Element {
  const [primaryMode, setPrimaryMode] = useState<PrimaryMode>(DEFAULT_SETTINGS.primaryMode)
  const [primaryFolder, setPrimaryFolder] = useState(DEFAULT_SETTINGS.primaryFolder)
  const [primaryFiles, setPrimaryFiles] = useState<string[]>([])
  const [introPath, setIntroPath] = useState(DEFAULT_SETTINGS.introPath)
  const [outroPath, setOutroPath] = useState(DEFAULT_SETTINGS.outroPath)
  const [overlayPath, setOverlayPath] = useState(DEFAULT_SETTINGS.overlayPath)
  const [overlayOpacity, setOverlayOpacity] = useState(DEFAULT_SETTINGS.overlayOpacity)
  const [wavPath, setWavPath] = useState(DEFAULT_SETTINGS.wavPath)
  const [outputPath, setOutputPath] = useState(DEFAULT_SETTINGS.outputPath)
  const [encoderPreference, setEncoderPreference] = useState(DEFAULT_SETTINGS.encoderPreference)
  const [detectedEncoder, setDetectedEncoder] = useState<EncoderInfo | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)

  const { isProcessing, progress, statusMessage, log, error, combine } = useCombiner()

  const applySavedSettings = useCallback((saved: AppSettings) => {
    setPrimaryMode(saved.primaryMode)
    setPrimaryFolder(saved.primaryFolder)
    setIntroPath(saved.introPath ?? '')
    setOutroPath(saved.outroPath ?? '')
    setOverlayPath(saved.overlayPath)
    setOverlayOpacity(saved.overlayOpacity)
    setWavPath(saved.wavPath)
    setOutputPath(saved.outputPath)
    setEncoderPreference(saved.encoderPreference ?? 'auto')
  }, [])

  const settingsHydrated = useSettingsHydration(applySavedSettings)

  const persistedSettings = useMemo(
    () =>
      buildAppSettings({
        primaryMode,
        primaryFolder,
        introPath,
        outroPath,
        overlayPath,
        overlayOpacity,
        wavPath,
        outputPath,
        encoderPreference
      }),
    [
      primaryMode,
      primaryFolder,
      introPath,
      outroPath,
      overlayPath,
      overlayOpacity,
      wavPath,
      outputPath,
      encoderPreference
    ]
  )

  useEffect(() => {
    if (!settingsHydrated) return
    void window.api.detectEncoder(encoderPreference).then(setDetectedEncoder)
  }, [settingsHydrated, encoderPreference])

  useAutoSaveSettings(persistedSettings, settingsHydrated)

  const { preview, loading: previewLoading, error: previewError } = usePreview({
    primaryMode,
    primaryFiles,
    introPath,
    outroPath,
    overlayPath,
    wavPath,
    enabled: !isProcessing && settingsHydrated
  })

  const refreshPrimaryList = useCallback(
    async (folder: string, mode: PrimaryMode) => {
      const files =
        mode === 'images'
          ? await window.api.listImagesInFolder(folder)
          : await window.api.listVideosInFolder(folder)
      setPrimaryFiles(files)
      return files
    },
    []
  )

  useEffect(() => {
    if (primaryFolder) {
      refreshPrimaryList(primaryFolder, primaryMode)
    } else {
      setPrimaryFiles([])
    }
  }, [primaryFolder, primaryMode, refreshPrimaryList])

  const handleBrowsePrimaryFolder = async (): Promise<void> => {
    const folder = await window.api.selectFolder()
    if (folder) {
      setPrimaryFolder(folder)
      await refreshPrimaryList(folder, primaryMode)
      setValidationError(null)
    }
  }

  const handlePrimaryModeChange = (mode: PrimaryMode): void => {
    setPrimaryMode(mode)
    setValidationError(null)
  }

  const handleBrowseIntro = async (): Promise<void> => {
    const file = await window.api.selectFile([
      { name: 'Video', extensions: ['mp4', 'mov', 'mkv', 'avi', 'webm'] }
    ])
    if (file) {
      setIntroPath(file)
      setValidationError(null)
    }
  }

  const handleBrowseOutro = async (): Promise<void> => {
    const file = await window.api.selectFile([
      { name: 'Video', extensions: ['mp4', 'mov', 'mkv', 'avi', 'webm'] }
    ])
    if (file) {
      setOutroPath(file)
      setValidationError(null)
    }
  }

  const handleBrowseOverlay = async (): Promise<void> => {
    const file = await window.api.selectFile([
      { name: 'Video', extensions: ['mp4', 'mov', 'mkv', 'avi', 'webm'] }
    ])
    if (file) {
      setOverlayPath(file)
      setValidationError(null)
    }
  }

  const handleBrowseWav = async (): Promise<void> => {
    const file = await window.api.selectFile([{ name: 'WAV Audio', extensions: ['wav'] }])
    if (file) {
      setWavPath(file)
      setValidationError(null)
    }
  }

  const handleBrowseOutput = async (): Promise<void> => {
    const file = await window.api.selectSavePath('output.mp4')
    if (file) {
      setOutputPath(file.endsWith('.mp4') ? file : `${file}.mp4`)
      setValidationError(null)
    }
  }

  const handleReset = async (): Promise<void> => {
    await window.api.clearSettings()
    setPrimaryMode(DEFAULT_SETTINGS.primaryMode)
    setPrimaryFolder(DEFAULT_SETTINGS.primaryFolder)
    setPrimaryFiles([])
    setIntroPath(DEFAULT_SETTINGS.introPath)
    setOutroPath(DEFAULT_SETTINGS.outroPath)
    setOverlayPath(DEFAULT_SETTINGS.overlayPath)
    setOverlayOpacity(DEFAULT_SETTINGS.overlayOpacity)
    setWavPath(DEFAULT_SETTINGS.wavPath)
    setOutputPath(DEFAULT_SETTINGS.outputPath)
    setEncoderPreference(DEFAULT_SETTINGS.encoderPreference)
    setValidationError(null)
  }

  const validate = (): string | null => {
    if (!primaryFolder) {
      return primaryMode === 'images'
        ? 'Select a folder containing primary background images.'
        : 'Select a folder containing primary video clips.'
    }
    if (primaryFiles.length === 0) {
      return primaryMode === 'images'
        ? 'The selected folder contains no supported image files (.jpg, .jpeg, .png, .webp, .bmp, .gif).'
        : 'The selected folder contains no supported video files (.mp4, .mov, .mkv, .avi, .webm).'
    }
    if (!wavPath) return 'Select a WAV music file.'
    if (!outputPath) return 'Choose an output file path.'
    return null
  }

  const handleGenerate = async (): Promise<void> => {
    const validation = validate()
    if (validation) {
      setValidationError(validation)
      return
    }

    setValidationError(null)
    await combine({
      primaryFolder,
      primaryMode,
      introPath: introPath || undefined,
      outroPath: outroPath || undefined,
      overlayPath: overlayPath || undefined,
      overlayOpacity,
      wavPath,
      outputPath,
      encoderPreference
    })
  }

  const showSuccess = !isProcessing && progress === 100 && !error
  const fileLabel = primaryMode === 'images' ? 'image' : 'video clip'
  const fileLabelPlural = primaryMode === 'images' ? 'images' : 'video clips'

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
          <button
            type="button"
            className="reset-btn"
            onClick={handleReset}
            disabled={isProcessing}
          >
            Reset / Clear
          </button>
        </div>
      </header>

      <LivePreview
        preview={preview}
        overlayOpacity={overlayOpacity}
        loading={previewLoading}
        error={previewError}
        primaryMode={primaryMode}
      />

      <div className="form">
        <PrimaryModeSelector
          value={primaryMode}
          onChange={handlePrimaryModeChange}
          disabled={isProcessing}
        />

        <FolderPicker
          label={primaryMode === 'images' ? 'Primary images' : 'Primary videos'}
          path={primaryFolder}
          onBrowse={handleBrowsePrimaryFolder}
          disabled={isProcessing}
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
          path={introPath}
          onBrowse={handleBrowseIntro}
          onClear={() => setIntroPath('')}
          disabled={isProcessing}
          optional
        />

        <FilePicker
          label="Outro clip"
          path={outroPath}
          onBrowse={handleBrowseOutro}
          onClear={() => setOutroPath('')}
          disabled={isProcessing}
          optional
        />

        <FilePicker
          label="Overlay video"
          path={overlayPath}
          onBrowse={handleBrowseOverlay}
          onClear={() => setOverlayPath('')}
          disabled={isProcessing}
          optional
        />

        <OpacitySlider
          value={overlayOpacity}
          onChange={setOverlayOpacity}
          disabled={isProcessing || !overlayPath}
        />

        <FilePicker
          label="Music (WAV)"
          path={wavPath}
          onBrowse={handleBrowseWav}
          disabled={isProcessing}
        />

        <FilePicker
          label="Output file"
          path={outputPath}
          onBrowse={handleBrowseOutput}
          disabled={isProcessing}
        />

        <EncoderSelector
          value={encoderPreference}
          onChange={setEncoderPreference}
          detectedEncoder={detectedEncoder}
          disabled={isProcessing}
        />

        {(validationError || error) && (
          <div className="error-banner">{validationError ?? error}</div>
        )}

        {showSuccess && (
          <div className="success-banner">Video saved to {outputPath}</div>
        )}

        <button
          type="button"
          className="generate-btn"
          onClick={handleGenerate}
          disabled={isProcessing}
        >
          {isProcessing ? 'Generating...' : 'Generate Video'}
        </button>

        <ProgressPanel
          percent={progress}
          message={statusMessage}
          log={log}
          visible={isProcessing || progress > 0}
        />
      </div>
    </div>
  )
}
