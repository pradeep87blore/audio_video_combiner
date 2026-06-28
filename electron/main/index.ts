import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { join } from 'path'
import { buildPreviewData, extractPreviewFrame } from '../ffmpeg/preview'
import { listImagesInFolder, listVideosInFolder } from '../utils/media'
import {
  clearSettings,
  loadTabsState,
  saveTabsState,
  saveSettings
} from '../settings'
import { resolveVideoEncoder } from '../ffmpeg/encoders'
import { jobQueue } from '../job-queue'
import { setMainWindow, updateJobBadge } from '../badge'
import type {
  AppSettings,
  CombineOptions,
  EncoderPreference,
  PreviewFrameRequest,
  PreviewRequest,
  TabsPersistedState
} from '../../src/types'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 900,
    minWidth: 720,
    minHeight: 700,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  setMainWindow(mainWindow)

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  updateJobBadge(0)

  mainWindow.on('closed', () => {
    mainWindow = null
    setMainWindow(null)
  })
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory']
  })
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle(
  'select-file',
  async (_event, filters: { name: string; extensions: string[] }[]) => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters
    })
    return result.canceled ? null : result.filePaths[0]
  }
)

ipcMain.handle('select-save-path', async (_event, defaultName: string) => {
  const result = await dialog.showSaveDialog({
    defaultPath: defaultName,
    filters: [{ name: 'MP4 Video', extensions: ['mp4'] }]
  })
  return result.canceled ? null : result.filePath
})

ipcMain.handle('list-videos-in-folder', async (_event, folder: string) => {
  return listVideosInFolder(folder)
})

ipcMain.handle('list-images-in-folder', async (_event, folder: string) => {
  return listImagesInFolder(folder)
})

ipcMain.handle('get-preview-data', async (_event, request: PreviewRequest) => {
  if (!request.wavPath || request.primaryPaths.length === 0) {
    throw new Error('WAV file and primary media are required for preview')
  }
  return buildPreviewData(request)
})

ipcMain.handle('get-preview-frame', async (_event, request: PreviewFrameRequest) => {
  if (!request.segments.length) {
    throw new Error('Timeline segments are required for preview frame')
  }
  return extractPreviewFrame(request)
})

ipcMain.handle('load-tabs-state', async () => loadTabsState())

ipcMain.handle('save-tabs-state', async (_event, state: TabsPersistedState) => {
  await saveTabsState(state)
})

ipcMain.handle('load-settings', async () => {
  const state = await loadTabsState()
  const active = state.tabs.find((tab) => tab.id === state.activeTabId)
  return active?.settings ?? null
})

ipcMain.handle('save-settings', async (_event, settings: AppSettings) => {
  await saveSettings(settings)
})

ipcMain.handle('clear-settings', async () => {
  await clearSettings()
})

ipcMain.handle('detect-encoder', async (_event, preference: EncoderPreference) => {
  const encoder = await resolveVideoEncoder(preference)
  return { kind: encoder.kind, label: encoder.label, codec: encoder.codec }
})

ipcMain.handle('enqueue-combine', async (_event, tabId: string, options: CombineOptions) => {
  return jobQueue.enqueue(tabId, options)
})

ipcMain.handle('get-queue-state', async () => jobQueue.getSnapshot())
