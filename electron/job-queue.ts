import { randomUUID } from 'crypto'
import { BrowserWindow } from 'electron'
import { runCombineJob } from './ffmpeg/processor'
import { listImagesInFolder, listVideosInFolder } from './utils/media'
import { updateJobBadge } from './badge'
import type { CombineOptions, QueueJobSnapshot, QueueSnapshot } from '../src/types'

export type QueueJobStatus = 'queued' | 'running' | 'completed' | 'failed'

/** Max jobs encoding at the same time. Additional jobs stay queued. */
export const MAX_PARALLEL_JOBS = 3

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
  const runningCount = jobs.filter((job) => job.status === 'running').length
  const queuedCount = jobs.filter((job) => job.status === 'queued').length
  return {
    jobs: jobs.map(toSnapshotJob),
    activeCount,
    runningCount,
    queuedCount,
    maxParallel: MAX_PARALLEL_JOBS
  }
}

function updateBadge(jobs: QueueJob[]): void {
  const activeCount = jobs.filter((job) => job.status === 'queued' || job.status === 'running').length
  updateJobBadge(activeCount)
}

export class JobQueue {
  private jobs: QueueJob[] = []
  /** Number of jobs currently executing (not merely queued). */
  private runningCount = 0

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
    this.fillSlots()

    return id
  }

  private updateJob(jobId: string, patch: Partial<QueueJob>): void {
    const job = this.jobs.find((entry) => entry.id === jobId)
    if (!job) return
    Object.assign(job, patch)
    broadcast('queue-updated', snapshot(this.jobs))
  }

  /** Start queued jobs until the parallel limit is reached. */
  private fillSlots(): void {
    while (this.runningCount < MAX_PARALLEL_JOBS) {
      const next = this.jobs.find((job) => job.status === 'queued')
      if (!next) break
      this.runningCount += 1
      void this.runJob(next)
    }
  }

  private async runJob(job: QueueJob): Promise<void> {
    this.updateJob(job.id, { status: 'running', progress: 0, message: 'Starting...', error: null })
    updateBadge(this.jobs)

    try {
      const primaryPaths =
        job.options.primaryMode === 'images'
          ? await listImagesInFolder(job.options.primaryFolder)
          : await listVideosInFolder(job.options.primaryFolder)

      if (primaryPaths.length === 0) {
        this.updateJob(job.id, {
          status: 'failed',
          error:
            job.options.primaryMode === 'images'
              ? 'No image files found in the selected folder'
              : 'No video files found in the selected folder',
          message: 'Failed'
        })
        return
      }

      // Each job gets its own temp dir inside runCombineJob (UUID), own output path,
      // and progress events keyed by jobId — safe to run in parallel.
      await runCombineJob(
        {
          primaryFolder: job.options.primaryFolder,
          primaryMode: job.options.primaryMode,
          primaryPaths,
          introPath: job.options.introPath,
          outroPath: job.options.outroPath,
          overlays: job.options.overlays,
          wavPath: job.options.wavPath,
          outputPath: job.options.outputPath,
          encoderPreference: job.options.encoderPreference,
          sceneTransitions: job.options.sceneTransitions
        },
        (percent, message) => {
          this.updateJob(job.id, { progress: percent, message })
          broadcast('queue-progress', {
            jobId: job.id,
            tabId: job.tabId,
            percent,
            message
          })
        }
      )

      this.updateJob(job.id, {
        status: 'completed',
        progress: 100,
        message: 'Done!',
        error: null
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An unknown error occurred'
      this.updateJob(job.id, {
        status: 'failed',
        progress: 0,
        message: 'Failed',
        error: message
      })
    } finally {
      this.runningCount = Math.max(0, this.runningCount - 1)
      updateBadge(this.jobs)
      this.fillSlots()
    }
  }
}

export const jobQueue = new JobQueue()
