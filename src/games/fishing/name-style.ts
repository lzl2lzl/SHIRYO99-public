import { WORLD_WIDTH } from './model.ts'

/** Sea colors are independent of the unchanged member palette. */
export const FISHING_WATER_COLORS = {
  day: ['#387f87', '#235569', '#142f46'],
  night: ['#304c70', '#213550', '#111e35'],
  sunset: ['#896d7d', '#615167', '#303b51'],
} as const

/** SVG units compensate for scene scaling: 16–17 CSS pixels, including narrow phones. */
export function nameFontSize(stageWidth: number): number {
  const width = Number.isFinite(stageWidth) && stageWidth > 0 ? stageWidth : WORLD_WIDTH
  return Math.max(16, Math.min(17, width / WORLD_WIDTH * 17)) * WORLD_WIDTH / width
}

export function nameWaveAmplitude(style: string, still: boolean): number {
  return still ? 0 : style === 'warm' ? 0.45 : style === 'quiet' ? 0.2 : 0.35
}
