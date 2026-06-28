import { contextBridge, ipcRenderer } from 'electron'
import type {
  AppSettings,
  CombineOptions,
  EncoderPreference,
  EncoderInfo,
  FileFilter,
  PreviewRequest,
  PreviewFrameRequest,
  ProgressEvent,
  QueueSnapshot,
  TabsPersistedState
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

  getPreviewFrame: (request: PreviewFrameRequest) =>
    ipcRenderer.invoke('get-preview-frame', request),

  loadSettings: (): Promise<AppSettings | null> => ipcRenderer.invoke('load-settings'),

  loadTabsState: (): Promise<TabsPersistedState> => ipcRenderer.invoke('load-tabs-state'),

  saveTabsState: (state: TabsPersistedState): Promise<void> =>
    ipcRenderer.invoke('save-tabs-state', state),

  saveSettings: (settings: AppSettings): Promise<void> =>
    ipcRenderer.invoke('save-settings', settings),

  clearSettings: (): Promise<void> => ipcRenderer.invoke('clear-settings'),

  detectEncoder: (preference: EncoderPreference): Promise<EncoderInfo> =>
    ipcRenderer.invoke('detect-encoder', preference),

  enqueueCombine: (tabId: string, options: CombineOptions): Promise<string> =>
    ipcRenderer.invoke('enqueue-combine', tabId, options),

  getQueueState: (): Promise<QueueSnapshot> => ipcRenderer.invoke('get-queue-state'),

  onQueueUpdated: (callback: (snapshot: QueueSnapshot) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: QueueSnapshot): void => {
      callback(data)
    }
    ipcRenderer.on('queue-updated', listener)
    return () => {
      ipcRenderer.removeListener('queue-updated', listener)
    }
  },

  onQueueProgress: (callback: (event: ProgressEvent) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: ProgressEvent): void => {
      callback(data)
    }
    ipcRenderer.on('queue-progress', listener)
    return () => {
      ipcRenderer.removeListener('queue-progress', listener)
    }
  }
})
