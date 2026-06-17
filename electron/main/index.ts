import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { join } from 'path'
import { runCombineJob } from '../ffmpeg/processor'
import { buildPreviewData } from '../ffmpeg/preview'
import { listImagesInFolder, listVideosInFolder } from '../utils/media'
import { clearSettings, loadSettings, saveSettings } from '../settings'
import { resolveVideoEncoder } from '../ffmpeg/encoders'
import type { AppSettings, CombineOptions, EncoderPreference, PreviewRequest } from '../../src/types'

function createWindow(): void {
  const mainWindow = new BrowserWindow({
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

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
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

ipcMain.handle('load-settings', async () => loadSettings())

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

ipcMain.handle('combine', async (event, options: CombineOptions) => {
  const primaryPaths =
    options.primaryMode === 'images'
      ? await listImagesInFolder(options.primaryFolder)
      : await listVideosInFolder(options.primaryFolder)

  if (primaryPaths.length === 0) {
    throw new Error(
      options.primaryMode === 'images'
        ? 'No image files found in the selected folder'
        : 'No video files found in the selected folder'
    )
  }

  const sendProgress = (percent: number, message: string): void => {
    event.sender.send('progress', { percent, message })
  }

  await runCombineJob(
    {
      primaryFolder: options.primaryFolder,
      primaryMode: options.primaryMode,
      primaryPaths,
      introPath: options.introPath,
      outroPath: options.outroPath,
      overlayPath: options.overlayPath,
      overlayOpacity: options.overlayOpacity,
      wavPath: options.wavPath,
      outputPath: options.outputPath,
      encoderPreference: options.encoderPreference
    },
    sendProgress
  )
})
