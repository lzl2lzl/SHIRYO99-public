import assert from 'node:assert/strict'
import test from 'node:test'
import { CAST_LINES, ENCOUNTERS, INTRO_LINES, needsConfirmation } from '../src/games/fishing/content.ts'
import { dialoguePages, idolBubbleAnchor, SHIRO_DINNER, skyResponse } from '../src/games/fishing/presentation.ts'
import { FISH_BOUNDS, FISH_HITBOX, WORLD_WIDTH, WORLD_HEIGHT } from '../src/games/fishing/model.ts'

const splitGraphemes = (text) => Array.from(new Intl.Segmenter('zh', {granularity: 'grapheme'}).segment(text), part => part.segment)
const unitMeasure = (text) => splitGraphemes(text).reduce((width, character) => width + (/^[\x00-\x7F]+$/.test(character) ? 0.55 : 1), 0)
const pixelMeasure = (text) => unitMeasure(text) * 15

test('sunset Shiro dinner response is an independent automatic line', () => {
  assert.equal(SHIRO_DINNER.text, '什么时候吃饭？')
  assert.equal(SHIRO_DINNER.speaker, 'shiro')
  assert.equal(SHIRO_DINNER.durationMs, 1800)
  assert.equal(needsConfirmation(SHIRO_DINNER), false)
})

// Independent character-level wrapping gives a lower-bound layout check, including explicit newlines.
function wrappedLines(text, maxWidth, measure) {
  let lines = 1
  let line = ''
  for (const character of splitGraphemes(text)) {
    if (/^[\r\n]+$/.test(character)) { lines++; line = ''; continue }
    if (line && measure(line + character) > maxWidth) { lines++; line = '' }
    line += character
  }
  return lines
}

test('width-based dialogue pages preserve every original character and fit their line budget', () => {
  for (const text of [...INTRO_LINES, ...Object.values(ENCOUNTERS).flat().map(beat => beat.text), '🎵'.repeat(70)]) {
    const pages = dialoguePages(text)
    assert.equal(pages.join(''), text)
    assert.ok(pages.every(page => wrappedLines(page, 13, unitMeasure) <= 3))
    assert.ok(text === '' || pages.every(page => page.length > 0))
    if (/[^\p{P}\p{Sc}~\s]/u.test(text)) assert.ok(pages.every(page => /[^\p{P}\p{Sc}~\s]/u.test(page)))
  }
})

test('Gaku fits in one realistic shore bubble instead of being cut at an arbitrary character count', () => {
  const text = ENCOUNTERS.gaku.find(beat => beat.text).text
  for (const fontSize of [14, 15, 16]) {
    const measure = value => unitMeasure(value) * fontSize
    const pages = dialoguePages(text, {maxWidth: 174, maxLines: 2, measure})
    assert.deepEqual(pages, [text])
    assert.ok(wrappedLines(text, 174, measure) <= 2)
  }
})

test('long Momo and Riku replies use measured multi-line pages and preserve natural punctuation', () => {
  for (const id of ['momo', 'riku']) {
    const text = ENCOUNTERS[id].reduce((longest, beat) => beat.text.length > longest.length ? beat.text : longest, '')
    const pages = dialoguePages(text, {maxWidth: 112, maxLines: 3, measure: pixelMeasure})
    assert.ok(pages.length > 1)
    assert.equal(pages.join(''), text)
    assert.ok(pages.every(page => wrappedLines(page, 112, pixelMeasure) <= 3))
    assert.ok(pages.every(page => /[^\p{P}\p{Sc}~\s]/u.test(page)))
    assert.ok(pages.slice(1).every(page => !/^[，。！？；：、…]/u.test(page)))
  }
  const text = '甲乙丙丁戊。己庚辛壬癸甲乙丙丁。'
  const pages = dialoguePages(text, {maxWidth: 6, maxLines: 2, measure: value => Array.from(value).length})
  assert.equal(pages[0], '甲乙丙丁戊。', 'a nearby sentence boundary is preferred to a mid-clause break')
})

test('English names, the money amount, ellipses and repeated exclamations stay together', () => {
  const text = '请告诉momo和riku不要拆开1000000$，真的！！！然后慢慢说……好。'
  const pages = dialoguePages(text, {maxWidth: 8, maxLines: 2, measure: unitMeasure})
  assert.equal(pages.join(''), text)
  for (const intact of ['momo', 'riku', '1000000$', '！！！', '……']) {
    assert.ok(pages.some(page => page.includes(intact)), `${intact} does not cross a page boundary`)
  }
  assert.ok(pages.every(page => wrappedLines(page, 8, unitMeasure) <= 2))
})

test('pagination never splits combining marks, surrogate pairs, flags or ZWJ emoji', () => {
  const text = '你好🙂e\u0301👨‍👩‍👧‍👦🇨🇳𠮷。'.repeat(6)
  const pages = dialoguePages(text, {maxWidth: 5, maxLines: 2, measure: unitMeasure})
  assert.equal(pages.join(''), text)
  const boundaries = new Set([0])
  let offset = 0
  for (const character of splitGraphemes(text)) { offset += character.length; boundaries.add(offset) }
  offset = 0
  for (const page of pages) {
    offset += page.length
    assert.ok(boundaries.has(offset), 'every UTF-16 offset is a complete grapheme boundary')
    assert.ok(wrappedLines(page, 5, unitMeasure) <= 2)
  }
})

test('exact capacity, narrow bubbles and exceptionally long words always make bounded progress', () => {
  const measure = value => Array.from(value).length
  const options = {maxWidth: 6, maxLines: 2, measure}
  assert.deepEqual(dialoguePages('字'.repeat(12), options), ['字'.repeat(12)])
  assert.equal(dialoguePages('字'.repeat(13), options).length, 2)
  assert.deepEqual(dialoguePages('', options), [''])
  for (const text of ['a'.repeat(75), '没有空格也没有标点的长句'.repeat(12), '你好\n再见\n朋友']) {
    const pages = dialoguePages(text, options)
    assert.equal(pages.join(''), text)
    assert.ok(pages.every(page => page.length > 0))
    assert.ok(pages.every(page => wrappedLines(page, 6, measure) <= 2))
  }
  assert.equal(dialoguePages('👨‍👩‍👧‍👦', {maxWidth: 0.1, maxLines: 1, measure: unitMeasure}).join(''), '👨‍👩‍👧‍👦')
  assert.equal(dialoguePages('保留原文', {maxWidth: 0, maxLines: 0, measure}).join(''), '保留原文')
})

test('ZERO and the purple fox moon use only the requested reactions', () => {
  assert.deepEqual(skyResponse('day'), {speaker:'ryo', location:'shore', mode:'line', durationMs:1800, text:'哼。', mood:'angry'})
  assert.deepEqual(skyResponse('night'), {speaker:'ryo', location:'shore', mode:'line', durationMs:1800, text:'🎵', mood:'happy'})
})

test('ambient lines expire automatically while every spoken turn in an encounter needs confirmation', () => {
  for (const line of [...CAST_LINES, skyResponse('day'), skyResponse('night')]) {
    assert.equal(line.mode, 'line')
    assert.equal(line.durationMs, 1800)
    assert.equal(needsConfirmation(line), false)
  }
  for (const beat of Object.values(ENCOUNTERS).flat()) {
    assert.equal(needsConfirmation(beat), Boolean(beat.text) || beat.waitForTap === true)
  }
  assert.equal(needsConfirmation({text:'🎵', mode:'dialogue'}), true, 'the same words can be a manual encounter reply')
  assert.ok(INTRO_LINES.every(text => needsConfirmation({text})), 'introduction timing is unchanged')
})

test('a slightly long line does not leave a single punctuation mark on its last page', () => {
  const text = '字'.repeat(24) + '！'
  const pages = dialoguePages(text, {maxWidth: 12, maxLines: 2, measure: value => Array.from(value).length})
  assert.equal(pages.length, 2)
  assert.equal(pages.join(''), text)
  assert.ok(pages.every(page => page.includes('字')))
  assert.ok(pages.every(page => wrappedLines(page, 12, value => Array.from(value).length) <= 2))
})

test('an idol bubble points to the name at its landing position, not the shore portraits', () => {
  const anchor = idolBubbleAnchor({x:219, y:217})
  assert.equal(anchor.side, 'right')
  assert.equal(anchor.top, 217)
  assert.equal(anchor.tailOffset, 0)
  assert.equal(anchor.left + anchor.width, 219 - FISH_HITBOX.halfWidth - 12)
})

test('name-anchored dialogue follows coordinates and keeps its box clear of names and screen edges', () => {
  for (const x of [FISH_BOUNDS.left, 190, 195, 219, FISH_BOUNDS.right]) {
    for (const y of [FISH_BOUNDS.top, 405, FISH_BOUNDS.bottom]) {
      const anchor = idolBubbleAnchor({x, y})
      assert.ok(anchor.width > 0 && anchor.left >= 12)
      assert.ok(anchor.left + anchor.width <= WORLD_WIDTH - 12)
      assert.ok(anchor.top >= 86 && anchor.top <= WORLD_HEIGHT - 86)
      assert.equal(anchor.top + anchor.tailOffset, y)
      if (anchor.side === 'right') assert.ok(anchor.left + anchor.width <= x - FISH_HITBOX.halfWidth - 12)
      else assert.ok(anchor.left >= x + FISH_HITBOX.halfWidth + 12)
    }
  }
})
