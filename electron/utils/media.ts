import { readdir } from 'fs/promises'
import { join, extname } from 'path'
import { IMAGE_EXTENSIONS, VIDEO_EXTENSIONS } from '../../src/types'

async function listFilesByExtension(folder: string, extensions: string[]): Promise<string[]> {
  const entries = await readdir(folder, { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries) {
    if (!entry.isFile()) continue
    const ext = extname(entry.name).toLowerCase()
    if (extensions.includes(ext)) {
      files.push(join(folder, entry.name))
    }
  }

  return files.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
}

export async function listVideosInFolder(folder: string): Promise<string[]> {
  return listFilesByExtension(folder, VIDEO_EXTENSIONS)
}

export async function listImagesInFolder(folder: string): Promise<string[]> {
  return listFilesByExtension(folder, IMAGE_EXTENSIONS)
}
