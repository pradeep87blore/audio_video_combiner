export interface FileFilter {
  name: string
  extensions: string[]
}

export type PrimaryMode = 'videos' | 'images'
export type EncoderPreference = 'auto' | 'gpu' | 'cpu'

export interface OverlayLayer {
  id: string
  path: string
  opacity: number
  /** Horizontal position as percentage of canvas width (0 = left edge). */
  x: number
  /** Vertical position as percentage of canvas height (0 = top edge). */
  y: number
  /** Width as percentage of canvas width. */
  width: number
  /** Height as percentage of canvas height. */
  height: number
  /**
   * Key out black / near-black pixels so they become transparent.
   * Useful for overlays that use black instead of (or in addition to) a real alpha channel.
   */
  removeBlack: boolean
  /**
   * When true, resizing keeps the overlay's proportions and the video is fit (not stretched).
   * When false, the overlay can be freely skewed to fill its box.
   */
  lockAspectRatio: boolean
}

export interface PreviewOverlayFrame {
  id: string
  frame: string
}

export interface CombineOptions {
  primaryFolder: string
  primaryMode: PrimaryMode
  introPath?: string
  outroPath?: string
  overlays: OverlayLayer[]
  wavPath: string
  outputPath: string
  encoderPreference: EncoderPreference
  sceneTransitions: boolean
}

export interface ProgressEvent {
  percent: number
  message: string
  jobId?: string
  tabId?: string
}

export type JobStatus = 'idle' | 'queued' | 'running' | 'completed' | 'failed'

export interface JobTabState {
  id: string
  label: string
  settings: AppSettings
  jobStatus: JobStatus
  progress: number
  statusMessage: string
  log: string[]
  error: string | null
}

export interface TabsPersistedState {
  activeTabId: string
  tabs: JobTabState[]
}

export interface QueueJobSnapshot {
  id: string
  tabId: string
  status: 'queued' | 'running' | 'completed' | 'failed'
  progress: number
  message: string
  error: string | null
}

export interface QueueSnapshot {
  jobs: QueueJobSnapshot[]
  /** Queued + running jobs (badge count). */
  activeCount: number
  /** Jobs currently encoding. */
  runningCount: number
  /** Jobs waiting for a free slot. */
  queuedCount: number
  /** Max concurrent running jobs. */
  maxParallel: number
}

export interface PreviewSegment {
  path: string
  name: string
  duration: number
  start: number
  kind?: 'intro' | 'primary' | 'outro'
  isImage?: boolean
}

export interface PreviewData {
  duration: number
  primaryFrame: string
  overlayFrames: PreviewOverlayFrame[]
  segments: PreviewSegment[]
}

export interface PreviewRequest {
  primaryMode: PrimaryMode
  primaryPaths: string[]
  introPath?: string
  outroPath?: string
  overlays: OverlayLayer[]
  wavPath: string
}

export interface PreviewFrameRequest {
  timestamp: number
  segments: PreviewSegment[]
  overlays: OverlayLayer[]
}

export interface PreviewFrameData {
  timestamp: number
  primaryFrame: string
  overlayFrames: PreviewOverlayFrame[]
  segmentName: string
}

export interface AppSettings {
  primaryMode: PrimaryMode
  primaryFolder: string
  introPath: string
  outroPath: string
  overlays: OverlayLayer[]
  wavPath: string
  outputPath: string
  encoderPreference: EncoderPreference
  sceneTransitions: boolean
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
  getPreviewFrame: (request: PreviewFrameRequest) => Promise<PreviewFrameData>
  loadSettings: () => Promise<AppSettings | null>
  loadTabsState: () => Promise<TabsPersistedState>
  saveTabsState: (state: TabsPersistedState) => Promise<void>
  saveSettings: (settings: AppSettings) => Promise<void>
  clearSettings: () => Promise<void>
  detectEncoder: (preference: EncoderPreference) => Promise<EncoderInfo>
  enqueueCombine: (tabId: string, options: CombineOptions) => Promise<string>
  getQueueState: () => Promise<QueueSnapshot>
  onQueueUpdated: (callback: (snapshot: QueueSnapshot) => void) => () => void
  onQueueProgress: (callback: (event: ProgressEvent) => void) => () => void
}

declare global {
  interface Window {
    api: CombinerAPI
  }
}

export const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.mkv', '.avi', '.webm']
export const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif']
