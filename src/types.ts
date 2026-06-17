export interface FileFilter {
  name: string
  extensions: string[]
}

export type PrimaryMode = 'videos' | 'images'
export type EncoderPreference = 'auto' | 'gpu' | 'cpu'

export interface CombineOptions {
  primaryFolder: string
  primaryMode: PrimaryMode
  introPath?: string
  outroPath?: string
  overlayPath?: string
  overlayOpacity: number
  wavPath: string
  outputPath: string
  encoderPreference: EncoderPreference
}

export interface ProgressEvent {
  percent: number
  message: string
}

export interface PreviewSegment {
  path: string
  name: string
  duration: number
  start: number
  kind?: 'intro' | 'primary' | 'outro'
}

export interface PreviewData {
  duration: number
  primaryFrame: string
  overlayFrame?: string
  segments: PreviewSegment[]
}

export interface PreviewRequest {
  primaryMode: PrimaryMode
  primaryPaths: string[]
  introPath?: string
  outroPath?: string
  overlayPath?: string
  wavPath: string
}

export interface AppSettings {
  primaryMode: PrimaryMode
  primaryFolder: string
  introPath: string
  outroPath: string
  overlayPath: string
  overlayOpacity: number
  wavPath: string
  outputPath: string
  encoderPreference: EncoderPreference
}

export interface EncoderInfo {
  kind: string
  label: string
  codec: string
}

export interface CombinerAPI {
  selectFolder: () => Promise<string | null>
  selectFile: (filters: FileFilter[]) => Promise<string | null>
  selectSavePath: (defaultName: string) => Promise<string | null>
  listVideosInFolder: (folder: string) => Promise<string[]>
  listImagesInFolder: (folder: string) => Promise<string[]>
  getPreviewData: (request: PreviewRequest) => Promise<PreviewData>
  loadSettings: () => Promise<AppSettings | null>
  saveSettings: (settings: AppSettings) => Promise<void>
  clearSettings: () => Promise<void>
  detectEncoder: (preference: EncoderPreference) => Promise<EncoderInfo>
  combine: (options: CombineOptions) => Promise<void>
  onProgress: (callback: (event: ProgressEvent) => void) => () => void
}

declare global {
  interface Window {
    api: CombinerAPI
  }
}

export const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.mkv', '.avi', '.webm']
export const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif']
