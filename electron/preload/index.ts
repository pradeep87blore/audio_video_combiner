import { contextBridge, ipcRenderer } from 'electron'
import type {
  AppSettings,
  CombineOptions,
  EncoderPreference,
  EncoderInfo,
  FileFilter,
  PreviewRequest,
  ProgressEvent
} from '../../src/types'

contextBridge.exposeInMainWorld('api', {
  selectFolder: (): Promise<string | null> => ipcRenderer.invoke('select-folder'),

  selectFile: (filters: FileFilter[]): Promise<string | null> =>
    ipcRenderer.invoke('select-file', filters),

  selectSavePath: (defaultName: string): Promise<string | null> =>
    ipcRenderer.invoke('select-save-path', defaultName),

  listVideosInFolder: (folder: string): Promise<string[]> =>
    ipcRenderer.invoke('list-videos-in-folder', folder),

  listImagesInFolder: (folder: string): Promise<string[]> =>
    ipcRenderer.invoke('list-images-in-folder', folder),

  getPreviewData: (request: PreviewRequest) => ipcRenderer.invoke('get-preview-data', request),

  loadSettings: (): Promise<AppSettings | null> => ipcRenderer.invoke('load-settings'),

  saveSettings: (settings: AppSettings): Promise<void> =>
    ipcRenderer.invoke('save-settings', settings),

  clearSettings: (): Promise<void> => ipcRenderer.invoke('clear-settings'),

  detectEncoder: (preference: EncoderPreference): Promise<EncoderInfo> =>
    ipcRenderer.invoke('detect-encoder', preference),

  combine: (options: CombineOptions): Promise<void> => ipcRenderer.invoke('combine', options),

  onProgress: (callback: (event: ProgressEvent) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: ProgressEvent): void => {
      callback(data)
    }
    ipcRenderer.on('progress', listener)
    return () => {
      ipcRenderer.removeListener('progress', listener)
    }
  }
})
