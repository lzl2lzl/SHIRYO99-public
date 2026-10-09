import assert from 'node:assert/strict'
import test from 'node:test'
import { nameFontSize, nameWaveAmplitude } from '../src/games/fishing/name-style.ts'
import { readFileSync } from 'node:fs'
import { idolBubbleAnchor } from '../src/games/fishing/presentation.ts'

test('names stay 16–17 actual pixels on narrow phones and desktop without changing world hitboxes', () => {
  for (const width of [280, 320, 360, 390, 440, 720]) {
    const font = nameFontSize(width)
    const actual = font * width / 390
    assert.ok(actual >= 16 - 1e-8 && actual <= 17 + 1e-8)
    const halfWidth = Math.max(38, font * 2.5 + 7)
    const anchor = idolBubbleAnchor({x:219,y:217}, 150, halfWidth)
    assert.ok(anchor.left + anchor.width <= 219 - halfWidth - 12 + 1e-8)
    assert.ok(anchor.left >= 12 - 1e-8)
  }
  for (const value of [0, NaN, Infinity, -1]) assert.ok(Number.isFinite(nameFontSize(value)))
})

test('letter ripples remain subpixel and stop for attached names or reduced motion', () => {
  for (const style of ['distant','hostile','hesitant','warm','quiet']) {
    assert.ok(nameWaveAmplitude(style, false) <= .45)
    assert.equal(nameWaveAmplitude(style, true), 0)
  }
})

test('names remain unbacked; irregular water veils and two light shafts replace repeated line decoration', () => {
  const source = readFileSync(new URL('../src/games/fishing/index.tsx', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /fishing-name-water|name-water-|backingElements|NAME_WATER_BACKINGS/)
  assert.doesNotMatch(source, /fishing-water-currents|fishing-current-color|waterMotion/)
  assert.match(source, /className="fishing-light" fill="#b7e5dc" opacity="\.035" pointerEvents="none"/)
  assert.match(source, /M80 193l40 330h52L120 193z/)
  assert.match(source, /M175 193l15 290h30L204 193z/)
  assert.doesNotMatch(source, /fishing-water-lines|<pattern/)
  assert.match(source, /className="fishing-water-veils" fill="url\(#fishing-soft-water\)" pointerEvents="none"/)
})
