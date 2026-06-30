import { randomUUID } from 'crypto'
import { BrowserWindow } from 'electron'
import { runCombineJob } from './ffmpeg/processor'
import { listImagesInFolder, listVideosInFolder } from './utils/media'
import { updateJobBadge } from './badge'
import type { CombineOptions, QueueJobSnapshot, QueueSnapshot } from '../src/types'

export type QueueJobStatus = 'queued' | 'running' | 'completed' | 'failed'

export interface QueueJob {
  id: string
  tabId: string
  options: CombineOptions
  status: QueueJobStatus
  progress: number
  message: string
  error: string | null
}

function getWindow(): BrowserWindow | null {
  const windows = BrowserWindow.getAllWindows()
  return windows[0] ?? null
}

function broadcast(channel: string, payload: unknown): void {
  const window = getWindow()
  if (window && !window.isDestroyed()) {
    window.webContents.send(channel, payload)
  }
}

function toSnapshotJob(job: QueueJob): QueueJobSnapshot {
  return {
    id: job.id,
    tabId: job.tabId,
    status: job.status,
    progress: job.progress,
    message: job.message,
    error: job.error
  }
}

function snapshot(jobs: QueueJob[]): QueueSnapshot {
  const activeCount = jobs.filter((job) => job.status === 'queued' || job.status === 'running').length
  return { jobs: jobs.map(toSnapshotJob), activeCount }
}

function updateBadge(jobs: QueueJob[]): void {
  const activeCount = jobs.filter((job) => job.status === 'queued' || job.status === 'running').length
  updateJobBadge(activeCount)
}

export class JobQueue {
  private jobs: QueueJob[] = []
  private processing = false

  getSnapshot(): QueueSnapshot {
    return snapshot(this.jobs)
  }

  enqueue(tabId: string, options: CombineOptions): string {
    const id = randomUUID()
    const job: QueueJob = {
      id,
      tabId,
      options,
      status: 'queued',
      progress: 0,
      message: 'Queued...',
      error: null
    }

    this.jobs.push(job)
    updateBadge(this.jobs)
    broadcast('queue-updated', snapshot(this.jobs))
    void this.processNext()

    return id
  }

  private updateJob(jobId: string, patch: Partial<QueueJob>): void {
    const job = this.jobs.find((entry) => entry.id === jobId)
    if (!job) return
    Object.assign(job, patch)
    broadcast('queue-updated', snapshot(this.jobs))
  }

  private async processNext(): Promise<void> {
    if (this.processing) return

    const next = this.jobs.find((job) => job.status === 'queued')
    if (!next) return

    this.processing = true
    this.updateJob(next.id, { status: 'running', progress: 0, message: 'Starting...', error: null })
    updateBadge(this.jobs)

    const primaryPaths =
      next.options.primaryMode === 'images'
        ? await listImagesInFolder(next.options.primaryFolder)
        : await listVideosInFolder(next.options.primaryFolder)

    if (primaryPaths.length === 0) {
      this.updateJob(next.id, {
        status: 'failed',
        error:
          next.options.primaryMode === 'images'
            ? 'No image files found in the selected folder'
            : 'No video files found in the selected folder',
        message: 'Failed'
      })
      this.processing = false
      updateBadge(this.jobs)
      void this.processNext()
      return
    }

    try {
      await runCombineJob(
        {
          primaryFolder: next.options.primaryFolder,
          primaryMode: next.options.primaryMode,
          primaryPaths,
          introPath: next.options.introPath,
          outroPath: next.options.outroPath,
          overlays: next.options.overlays,
          wavPath: next.options.wavPath,
          outputPath: next.options.outputPath,
          encoderPreference: next.options.encoderPreference,
          sceneTransitions: next.options.sceneTransitions
        },
        (percent, message) => {
          this.updateJob(next.id, { progress: percent, message })
          broadcast('queue-progress', {
            jobId: next.id,
            tabId: next.tabId,
            percent,
            message
          })
        }
      )

      this.updateJob(next.id, {
        status: 'completed',
        progress: 100,
        message: 'Done!',
        error: null
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An unknown error occurred'
      this.updateJob(next.id, {
        status: 'failed',
        progress: 0,
        message: 'Failed',
        error: message
      })
    }

    this.processing = false
    updateBadge(this.jobs)
    void this.processNext()
  }
}

export const jobQueue = new JobQueue()
