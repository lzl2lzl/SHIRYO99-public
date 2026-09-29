import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { IDOLS } from '../src/games/fishing/content.ts'

const expected = ['#0D326F', '#67AF28', '#F08300', '#5BC2D9', '#856DAF', '#FFEB00', '#E60039', '#D5D5D5', '#B94F84', '#00516D', '#E62E8B', '#C4D700', '#8EAA9D', '#832F41', '#C7B6A0', '#8E7375']

test('member colors retain the official palette with Gaku in the user-requested light silver', () => {
  assert.deepEqual(IDOLS.map((idol) => idol.color), expected)
  assert.equal(new Set(IDOLS.map((idol) => idol.color)).size, 16)
})

test('names keep their member fill without any text outline or caught color override', () => {
  const css = readFileSync(new URL('../src/games/fishing/fishing.css', import.meta.url), 'utf8')
  assert.doesNotMatch(css, /\.fishing-name[^{}]*(?:text|tspan)[^{}]*\{[^}]*(?:stroke|text-shadow|filter):/)
  assert.doesNotMatch(css, /\.fishing-name\.is-caught\s*\{[^}]*\bcolor:/)
})
