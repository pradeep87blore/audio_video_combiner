import { useEffect, useState } from 'react'
import type { OverlayLayer, PreviewData, PrimaryMode } from '../types'
import { activeOverlays } from '../utils/overlay'

interface UsePreviewOptions {
  primaryMode: PrimaryMode
  primaryFiles: string[]
  introPath: string
  outroPath: string
  overlays: OverlayLayer[]
  wavPath: string
  enabled: boolean
}

export function usePreview({
  primaryMode,
  primaryFiles,
  introPath,
  outroPath,
  overlays,
  wavPath,
  enabled
}: UsePreviewOptions) {
  const [preview, setPreview] = useState<PreviewData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const overlayKey = activeOverlays(overlays)
    .map((overlay) =>
      `${overlay.id}:${overlay.path}:${overlay.opacity}:${overlay.x}:${overlay.y}:${overlay.width}:${overlay.height}`
    )
    .join('|')

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
          overlays: activeOverlays(overlays),
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
  }, [enabled, primaryMode, primaryFiles, introPath, outroPath, overlayKey, wavPath])

  return { preview, loading, error }
}
