export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  if (mins >= 60) {
    const hours = Math.floor(mins / 60)
    const remainMins = mins % 60
    return `${hours}:${String(remainMins).padStart(2, '0')}:${secs.toFixed(1).padStart(4, '0')}`
  }
  return `${mins}:${secs.toFixed(1).padStart(4, '0')}`
}
