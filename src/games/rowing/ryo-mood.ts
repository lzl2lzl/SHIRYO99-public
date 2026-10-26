export const RYO_MOOD_LINES = { tired: '我累了', protest: '你让我划我就划吗？？', huff: '哼！' } as const
type MoodLine = keyof typeof RYO_MOOD_LINES
export interface RyoMood {
  strokes: number
  phase: 'cooperating' | 'strike' | 'mischief'
  nagCount: number
  lastNag: number
  lastReverse: number
  revenge: boolean
  reverseSpoken: boolean
  pending: MoodLine[]
  speech: MoodLine | null
  age: number
}
export const createRyoMood = (): RyoMood => ({ strokes: 0, phase: 'cooperating', nagCount: 0, lastNag: -Infinity,
  lastReverse: -Infinity, revenge: false, reverseSpoken: false, pending: [], speech: null, age: 0 })

/** Opening behaviour is deliberate; only sustained requests after the strike provoke mischief. */
export function openingRyoAction(mood: RyoMood, elapsed: number, random: () => number, forwardChance = .25): 'stroke' | 'refuse' | 'reverse' {
  if (mood.phase === 'cooperating') {
    if (++mood.strokes === 3) { mood.phase = 'strike'; mood.pending.push('tired') }
    return 'stroke'
  }
  if ((mood.speech && mood.speech !== 'huff') || mood.pending.some(line => line !== 'huff')) return 'refuse'
  if (mood.revenge && elapsed - mood.lastReverse >= 8) {
    mood.revenge = false; mood.lastReverse = elapsed
    return 'reverse'
  }
  const draw = random(), forward = Math.max(0, Math.min(.5, forwardChance))
  if (draw < forward) { mood.nagCount = 0; return 'stroke' }
  if (mood.phase === 'strike') {
    mood.nagCount = elapsed - mood.lastNag <= 2 ? mood.nagCount + 1 : 1
    mood.lastNag = elapsed
    if (mood.nagCount >= 4) {
      mood.phase = 'mischief'; mood.pending.push('protest'); mood.revenge = true
    }
    return 'refuse'
  }
  if (elapsed - mood.lastReverse >= 8 && draw < forward + .1) {
    mood.lastReverse = elapsed
    return 'reverse'
  }
  return 'refuse'
}

export function tickRyoMood(mood: RyoMood, dt: number, elapsed: number, strokeUntil: number, blocked: boolean, finished: boolean) {
  if (finished) {
    if (mood.speech !== 'huff') mood.speech = null
    mood.pending = mood.pending.filter(line => line === 'huff')
  }
  if (blocked) return
  if (mood.speech) {
    mood.age += dt
    const duration = mood.speech === 'huff' ? 1.8 : mood.speech === 'tired' ? 2.4 : 3.8
    if (mood.age >= duration) { mood.speech = null; mood.age = 0 }
  }
  if (!mood.speech && mood.pending.length && (mood.pending[0] === 'huff' || elapsed >= strokeUntil)) {
    mood.speech = mood.pending.shift()!; mood.age = 0
  }
}
