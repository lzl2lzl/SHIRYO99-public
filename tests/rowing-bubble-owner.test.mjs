import test from 'node:test'
import assert from 'node:assert/strict'
import { placeResponse, coupleLeader, rowingBounds, overlaps } from '../src/games/rowing/bubble-layout.ts'

test('a couple below the player keeps its bubble below the player rather than borrowing their speech position', () => {
  const view = { width: 320, height: 844 }, scale = 180 / 220
  const player = rowingBounds({ x: 160, y: 469 }, Math.PI, scale, [{ x: 130, y: 453 }, { x: 190, y: 453 }])
  for (const anchor of [{ x: 234, y: 742 }, { x: 90, y: 650 }]) {
    const source = rowingBounds(anchor, Math.PI, scale, [])
    const bubble = placeResponse(view, anchor, player, 156, 84, source)
    const rect = { ...bubble, right: bubble.left + 156, bottom: bubble.top + 84 }
    assert.equal(overlaps(rect, player), false)
    assert.ok(bubble.top >= player.bottom)
    assert.ok(bubble.top + 84 <= view.height - 12)
    const { target } = coupleLeader(bubble, 156, 84, anchor, Math.PI, scale)
    assert.ok(Math.hypot(target.x - anchor.x, target.y - anchor.y) <= 102 * scale)
    assert.equal(target.x >= rect.left && target.x <= rect.right && target.y >= rect.top && target.y <= rect.bottom, false)
  }
})

test('speaker boat movement determines the bubble and connector without changing the player bounds', () => {
  const view = { width: 560, height: 844 }, player = { left: 175, right: 385, top: 310, bottom: 560 }
  for (const anchor of [{ x: 90, y: 180 }, { x: 470, y: 180 }, { x: 440, y: 700 }]) {
    const source = rowingBounds(anchor, .7, 1, [])
    const bubble = placeResponse(view, anchor, player, 180, 84, source)
    const rect = { ...bubble, right: bubble.left + 180, bottom: bubble.top + 84 }
    assert.equal(overlaps(rect, player), false)
    const line = coupleLeader(bubble, 180, 84, anchor, .7, 1)
    assert.ok(Math.hypot(line.target.x - anchor.x, line.target.y - anchor.y) <= 102)
  }
})
