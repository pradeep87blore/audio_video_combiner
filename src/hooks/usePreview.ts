import { useEffect, useState } from 'react'
import type { PreviewData, PrimaryMode } from '../types'

interface UsePreviewOptions {
  primaryMode: PrimaryMode
  primaryFiles: string[]
  introPath: string
  outroPath: string
  overlayPath: string
  wavPath: string
  enabled: boolean
}

export function usePreview({
  primaryMode,
  primaryFiles,
  introPath,
  outroPath,
  overlayPath,
  wavPath,
  enabled
}: UsePreviewOptions) {
  const [preview, setPreview] = useState<PreviewData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled || !wavPath || primaryFiles.length === 0) {
      setPreview(null)
      setError(null)
      return
    }

    let cancelled = false
    const timer = setTimeout(async () => {
      setLoading(true)
      setError(null)

      try {
        const data = await window.api.getPreviewData({
          primaryMode,
          primaryPaths: primaryFiles,
          introPath: introPath || undefined,
          outroPath: outroPath || undefined,
          overlayPath: overlayPath || undefined,
          wavPath
        })
        if (!cancelled) {
          setPreview(data)
        }
      } catch (err) {
        if (!cancelled) {
          setPreview(null)
          setError(err instanceof Error ? err.message : 'Failed to load preview')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }, 300)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [enabled, primaryMode, primaryFiles, introPath, outroPath, overlayPath, wavPath])

  return { preview, loading, error }
}
