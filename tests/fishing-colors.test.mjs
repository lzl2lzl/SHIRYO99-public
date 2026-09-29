import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { IDOLS } from '../src/games/fishing/content.ts'

const expected = ['#0D326F', '#67AF28', '#F08300', '#5BC2D9', '#856DAF', '#FFEB00', '#E60039', '#4D5C63', '#B94F84', '#00516D', '#E62E8B', '#C4D700', '#8EAA9D', '#832F41', '#C7B6A0', '#8E7375']

test('all sixteen names retain their individual official website colors', () => {
  assert.deepEqual(IDOLS.map((idol) => idol.color), expected)
  assert.equal(new Set(IDOLS.map((idol) => idol.color)).size, 16)
})

test('every name uses the same black outline without changing its caught fill', () => {
  const css = readFileSync(new URL('../src/games/fishing/fishing.css', import.meta.url), 'utf8')
  assert.match(css, /\.fishing-name text\s*\{[^}]*stroke:\s*#000;/)
  assert.doesNotMatch(css, /\.fishing-name\.is-caught\s*\{[^}]*\bcolor:/)
})
