export const RYO_MOOD_LINES = { tired: '我累了', protest: '你让我划我就划吗？？' } as const
type MoodLine = keyof typeof RYO_MOOD_LINES
export interface RyoMood {
  strokes: number
  phase: 'cooperating' | 'strike' | 'mischief'
  nagCount: number
  lastNag: number
  lastReverse: number
  revenge: boolean
  pending: MoodLine[]
  speech: MoodLine | null
  age: number
}
export const createRyoMood = (): RyoMood => ({ strokes: 0, phase: 'cooperating', nagCount: 0, lastNag: -Infinity,
  lastReverse: -Infinity, revenge: false, pending: [], speech: null, age: 0 })

/** Opening behaviour is deliberate; only sustained requests after the strike provoke mischief. */
export function openingRyoAction(mood: RyoMood, elapsed: number, random: () => number): 'stroke' | 'refuse' | 'reverse' {
  if (mood.phase === 'cooperating') {
    if (++mood.strokes === 3) { mood.phase = 'strike'; mood.pending.push('tired') }
    return 'stroke'
  }
  if (mood.speech || mood.pending.length) return 'refuse'
  if (mood.phase === 'strike') {
    mood.nagCount = elapsed - mood.lastNag <= 2 ? mood.nagCount + 1 : 1
    mood.lastNag = elapsed
    if (mood.nagCount >= 4) {
      mood.phase = 'mischief'; mood.pending.push('protest'); mood.revenge = true
    }
    return 'refuse'
  }
  if (elapsed - mood.lastReverse >= 8 && (mood.revenge || random() < .1)) {
    mood.revenge = false; mood.lastReverse = elapsed
    return 'reverse'
  }
  return 'refuse'
}

export function tickRyoMood(mood: RyoMood, dt: number, elapsed: number, strokeUntil: number, blocked: boolean, finished: boolean) {
  if (finished) { mood.speech = null; mood.pending = []; return }
  if (blocked) return
  if (mood.speech) {
    mood.age += dt
    const duration = mood.speech === 'tired' ? 2.4 : 3.8
    if (mood.age >= duration) { mood.speech = null; mood.age = 0 }
  }
  if (!mood.speech && mood.pending.length && elapsed >= strokeUntil) {
    mood.speech = mood.pending.shift()!; mood.age = 0
  }
}
