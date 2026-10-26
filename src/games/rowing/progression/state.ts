import { IMPLEMENTED_WEEK, SKILLS, UPGRADE_CLOCK, UPGRADE_DIALOGUE, WEEK_MINUTES, type UpgradeLine } from './catalog.ts'

import { LEVEL_UP_SECONDS } from './presentation.ts'
export { LEVEL_UP_SECONDS } from './presentation.ts'
export interface UpgradePresentation { week: number; phase: 'dialogue' | 'reveal'; line: number; age: number }
export interface ProgressionState {
  level: number
  pending: number[]
  presentation: UpgradePresentation | null
}
export function createProgression(completedWeek = 0): ProgressionState {
  return { level: Math.min(IMPLEMENTED_WEEK, Math.max(0, Math.floor(completedWeek))), pending: [], presentation: null }
}

/** Award once at the exact simulated minute; the ten-minute display clock is irrelevant. */
export function unlockDueSkills(state: ProgressionState, minutes: number) {
  if (!Number.isFinite(minutes)) return
  const due = Math.min(IMPLEMENTED_WEEK, Math.max(0, Math.floor((minutes - UPGRADE_CLOCK + 1e-7) / WEEK_MINUTES)))
  while (state.level < due) state.pending.push(++state.level)
}

export function upgradeDialogue(state: ProgressionState, lines = UPGRADE_DIALOGUE): UpgradeLine | undefined {
  const current = state.presentation
  return current?.phase === 'dialogue' ? lines[current.week]?.[current.line] : undefined
}

/** Foreground time only. Existing speech and birthdays finish before this non-modal presentation. */
export function tickProgression(state: ProgressionState, dt: number, blocked: boolean, lines = UPGRADE_DIALOGUE) {
  if (!Number.isFinite(dt) || dt <= 0 || blocked) return
  const current = state.presentation
  if (current) {
    current.age += Math.min(dt, .1)
    const dialogue = upgradeDialogue(state, lines)
    const duration = current.phase === 'dialogue' ? Math.max(3.2, Array.from(dialogue?.text ?? '').length * .15 + 1.2) : LEVEL_UP_SECONDS
    if (current.age >= duration) {
      current.age = 0
      if (current.phase === 'dialogue') {
        current.line++
        if (current.line >= (lines[current.week]?.length ?? 0)) current.phase = 'reveal'
      } else state.presentation = null
    }
    return
  }
  const week = state.pending.shift()
  if (week && SKILLS[week - 1]?.ability) {
    state.presentation = { week, phase: lines[week]?.length ? 'dialogue' : 'reveal', line: 0, age: 0 }
  }
}
