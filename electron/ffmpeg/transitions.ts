/** Total cross-scene transition: fade to black + fade from black (2.5s each). */
export const SCENE_TRANSITION_SECONDS = 5
export const SCENE_FADE_HALF_SECONDS = SCENE_TRANSITION_SECONDS / 2

export function getSceneFadeDurations(
  segmentDuration: number,
  index: number,
  segmentCount: number
): { fadeIn: number; fadeOut: number } {
  if (segmentCount <= 1 || segmentDuration <= 0) {
    return { fadeIn: 0, fadeOut: 0 }
  }

  const half = Math.min(SCENE_FADE_HALF_SECONDS, segmentDuration / 2)
  return {
    fadeIn: index > 0 ? half : 0,
    fadeOut: index < segmentCount - 1 ? half : 0
  }
}

export function appendSceneFades(
  filterChain: string,
  segmentDuration: number,
  index: number,
  segmentCount: number
): string {
  const { fadeIn, fadeOut } = getSceneFadeDurations(segmentDuration, index, segmentCount)
  let chain = filterChain

  if (fadeIn > 0) {
    chain += `,fade=t=in:st=0:d=${fadeIn.toFixed(3)}`
  }
  if (fadeOut > 0) {
    const fadeOutStart = Math.max(0, segmentDuration - fadeOut)
    chain += `,fade=t=out:st=${fadeOutStart.toFixed(3)}:d=${fadeOut.toFixed(3)}`
  }

  return chain
}
