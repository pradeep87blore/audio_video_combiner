import { app, BrowserWindow, nativeImage } from 'electron'

let mainWindow: BrowserWindow | null = null

export function setMainWindow(window: BrowserWindow | null): void {
  mainWindow = window
}

function createBadgeImage(count: number): Electron.NativeImage {
  const text = count > 99 ? '99+' : String(count)
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32">
  <circle cx="16" cy="16" r="15" fill="#e74c3c" stroke="#ffffff" stroke-width="2"/>
  <text x="16" y="21" font-family="Arial, sans-serif" font-size="13" font-weight="bold"
    fill="#ffffff" text-anchor="middle">${text}</text>
</svg>`
  return nativeImage.createFromDataURL(
    `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  )
}

export function updateJobBadge(activeCount: number): void {
  const count = Math.max(0, activeCount)

  try {
    if (process.platform === 'darwin' || process.platform === 'linux') {
      app.setBadgeCount(count)
    }

    if (process.platform === 'win32' && mainWindow && !mainWindow.isDestroyed()) {
      if (count === 0) {
        mainWindow.setOverlayIcon(null, '')
      } else {
        mainWindow.setOverlayIcon(
          createBadgeImage(count),
          `${count} active job${count === 1 ? '' : 's'}`
        )
      }
    }
  } catch {
    // Badge updates are cosmetic; never block app startup or job processing.
  }
}
