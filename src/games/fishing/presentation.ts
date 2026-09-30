import type { DialogueBeat } from './content.ts'
import { FISH_HITBOX, WORLD_HEIGHT, WORLD_WIDTH, type Point } from './model.ts'

export type TimeOfDay = 'day' | 'night'

/** Presentation-only hint; the encounter roster remains the sole source of progress. */
export function shouldHighlightIdol(id: string, metIds: readonly string[], enabled: boolean): boolean {
  return enabled && !metIds.includes(id)
}

/** Keep the bubble beside the speaking name, outside its highlighted catch box. */
export function idolBubbleAnchor(point: Point, preferredWidth = WORLD_WIDTH * 0.39) {
  const margin = 12
  const gap = 12
  const side = point.x >= WORLD_WIDTH / 2 ? 'right' : 'left'
  const room = (side === 'right' ? point.x : WORLD_WIDTH - point.x) - FISH_HITBOX.halfWidth - gap - margin
  const width = Math.min(preferredWidth, room)
  const left = side === 'right'
    ? point.x - FISH_HITBOX.halfWidth - gap - width
    : point.x + FISH_HITBOX.halfWidth + gap
  const top = Math.max(86, Math.min(WORLD_HEIGHT - 86, point.y))
  return { left, top, width, side, tailOffset: point.y - top }
}

/** The same nearby speech geometry, with space for Shiro's existing 61 px portrait. */
export function shiroBubbleAnchor(point: Point, preferredWidth = WORLD_WIDTH * 0.45) {
  const margin = 12
  const gap = 12
  const halfWidth = 30.5
  const side = point.x >= WORLD_WIDTH / 2 ? 'right' : 'left'
  const room = (side === 'right' ? point.x : WORLD_WIDTH - point.x) - halfWidth - gap - margin
  const width = Math.min(preferredWidth, room)
  const left = side === 'right' ? point.x - halfWidth - gap - width : point.x + halfWidth + gap
  const top = Math.max(86, Math.min(WORLD_HEIGHT - 86, point.y))
  return { left, top, width, side, tailOffset: point.y - top }
}

/** Measure wrapped lines, then page at a natural boundary without changing the source text. */
export function dialoguePages(text: string, options?: {
  maxWidth: number
  maxLines: number
  measure: (text: string) => number
}): string[] {
  if (!text) return ['']
  const segmenter = typeof Intl.Segmenter === 'function' ? Intl.Segmenter : null
  const characterSegments = segmenter ? new segmenter('zh', { granularity: 'grapheme' }) : null
  const wordSegments = segmenter ? new segmenter('zh', { granularity: 'word' }) : null
  const graphemes = (value: string) => {
    if (characterSegments) return Array.from(characterSegments.segment(value), (part) => part.segment)
    // Old engines still keep combining marks, variation selectors and ZWJ emoji together.
    const result: string[] = []
    for (const character of Array.from(value)) {
      if (result.length && (/^[\p{M}\uFE0E\uFE0F\u200D]$/u.test(character) || result.at(-1)!.endsWith('\u200D'))) result[result.length - 1] += character
      else result.push(character)
    }
    return result
  }
  const fallbackMeasure = (value: string) => graphemes(value).reduce((width, character) => width + (/^[\x00-\x7F]+$/.test(character) ? 0.55 : 1), 0)
  const measure = options?.measure ?? fallbackMeasure
  const maxWidth = options && Number.isFinite(options.maxWidth) && options.maxWidth > 0 ? options.maxWidth : 13
  const maxLines = options && Number.isFinite(options.maxLines) ? Math.max(1, Math.floor(options.maxLines)) : 3
  const opening = /^[（(［\[｛{「『“‘]+$/u
  const closing = /^[\p{P}\p{Sc}~\s]+$/u
  const source = wordSegments
    ? Array.from(wordSegments.segment(text), (part) => part.segment)
    : text.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*|[^A-Za-z0-9]+/gu)!.flatMap((part) => /^[A-Za-z0-9]/.test(part) ? [part] : graphemes(part))
  const tokens: string[] = []
  let prefix = ''
  for (const part of source) {
    if (opening.test(part)) prefix += part
    else if (closing.test(part)) {
      if (prefix || !tokens.length) prefix += part
      else tokens[tokens.length - 1] += part
    }
    else {
      tokens.push(prefix + part)
      prefix = ''
    }
  }
  if (prefix) {
    if (tokens.length) tokens[tokens.length - 1] += prefix
    else tokens.push(prefix)
  }

  const lineCount = (parts: readonly string[]) => {
    let lines = 1
    let line = ''
    for (const token of parts) {
      for (const part of token.split(/(\r\n|\r|\n)/)) {
        if (!part) continue
        if (/^[\r\n]+$/.test(part)) { lines++; line = ''; continue }
        if (measure(line + part) <= maxWidth) line += part
        else if (measure(part) <= maxWidth) { lines++; line = part }
        else {
          // CSS overflow-wrap can wrap a word wider than a whole line; page breaks still avoid it.
          for (const character of graphemes(part)) {
            if (line && measure(line + character) > maxWidth) { lines++; line = '' }
            line += character
          }
        }
        if (lines > maxLines) return lines
      }
    }
    return lines
  }
  const pages: string[] = []
  let start = 0
  while (start < tokens.length) {
    let end = start
    while (end < tokens.length && lineCount(tokens.slice(start, end + 1)) <= maxLines) end++
    if (end === start) {
      // An exceptional word longer than an entire page must split, but never inside a grapheme.
      const pieces: string[] = []
      for (const character of graphemes(tokens[start])) {
        if (closing.test(character) && pieces.length) pieces[pieces.length - 1] += character
        else pieces.push(character)
      }
      if (pieces.length > 1) { tokens.splice(start, 1, ...pieces); continue }
      end = start + 1 // A single over-wide glyph or punctuation cluster cannot be subdivided safely.
    } else if (end < tokens.length) {
      const fullWidth = measure(tokens.slice(start, end).join(''))
      let best = end
      let bestScore = 0
      for (let candidate = start + 1; candidate <= end; candidate++) {
        const page = tokens.slice(start, candidate).join('')
        if (measure(page) < fullWidth * 0.5) continue
        const tail = page.trimEnd()
        const score = /[。！？!?][”’」』）)\]]*$/.test(tail) ? 3
          : /[，,；;：:、…][”’」』）)\]]*$/.test(tail) ? 2
          : /\s$/.test(page) ? 1 : 0
        if (score > bestScore || (score === bestScore && candidate > best)) { best = candidate; bestScore = score }
      }
      end = best
    }
    pages.push(tokens.slice(start, end).join(''))
    start = end
  }
  return pages
}

export function skyResponse(timeOfDay: TimeOfDay): DialogueBeat {
  return {
    speaker: 'ryo', location: 'shore',
    mode: 'line', durationMs: 1800,
    text: timeOfDay === 'night' ? '🎵' : '哼。',
    mood: timeOfDay === 'night' ? 'happy' : 'angry',
  }
}

export const SHIRO_GREETING: DialogueBeat = {
  speaker: 'shiro', location: 'shore', text: 'hi😊', mode: 'line', durationMs: 1800,
}

export const SHIRO_DINNER: DialogueBeat = {
  speaker: 'shiro', location: 'shore', text: '什么时候吃饭？', mode: 'line', durationMs: 1800,
}

export const RYO_GREETING: DialogueBeat = {
  speaker: 'ryo', location: 'shore', text: '啦啦啦~', mode: 'line', durationMs: 1800,
}

export const RYO_ENDING_REPLY: DialogueBeat = {
  speaker: 'ryo', location: 'shore', text: '看什么看！', mode: 'line', durationMs: 1800,
}
