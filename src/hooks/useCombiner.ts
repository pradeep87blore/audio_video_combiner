import { useCallback, useEffect, useState } from 'react'
import type { CombineOptions, ProgressEvent } from '../types'

export function useCombiner() {
  const [isProcessing, setIsProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [statusMessage, setStatusMessage] = useState('')
  const [log, setLog] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const unsubscribe = window.api.onProgress((event: ProgressEvent) => {
      setProgress(event.percent)
      setStatusMessage(event.message)
      if (event.message) {
        setLog((prev) => {
          const last = prev[prev.length - 1]
          if (last === event.message) return prev
          return [...prev.slice(-49), event.message]
        })
      }
    })
    return unsubscribe
  }, [])

  const combine = useCallback(async (options: CombineOptions) => {
    setIsProcessing(true)
    setProgress(0)
    setStatusMessage('Starting...')
    setLog(['Starting...'])
    setError(null)

    try {
      await window.api.combine(options)
      setLog((prev) => [...prev, 'Video created successfully!'])
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An unknown error occurred'
      setError(message)
      setLog((prev) => [...prev, `Error: ${message}`])
    } finally {
      setIsProcessing(false)
    }
  }, [])

  return {
    isProcessing,
    progress,
    statusMessage,
    log,
    error,
    combine
  }
}
