import assert from 'node:assert/strict'
import test from 'node:test'
import {
  FISH_BOUNDS, FISH_SPEED, HOOK_ORIGIN, createFish, firstCollision,
  hookPoint, idleAngle, maxHookLength, stepFish,
} from '../src/games/fishing/model.ts'

const roster = Array.from({ length: 16 }, (_, index) => ({ id: `fish-${index}`, swimStyle: `style-${index % 4}` }))
const fishAt = (id, x, y, style = 'calm') => ({ id, x, y, style, phase: 0, heading: 0 })
const close = (actual, expected, tolerance = 1e-8) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`)
const inBounds = (fish) => {
  assert.ok(fish.x >= FISH_BOUNDS.left && fish.x <= FISH_BOUNDS.right, `x outside: ${fish.x}`)
  assert.ok(fish.y >= FISH_BOUNDS.top && fish.y <= FISH_BOUNDS.bottom, `y outside: ${fish.y}`)
}

test('all sixteen begin separated, with a reproducible seed and randomized layer assignment', () => {
  const fishes = createFish(roster, 1847)
  assert.equal(fishes.length, 16)
  assert.equal(new Set(fishes.map(fish => fish.id)).size, 16)
  assert.deepEqual(fishes, createFish(roster, 1847))
  assert.notDeepEqual(fishes, createFish(roster, 1848))
  assert.notDeepEqual(fishes.map(({ y }) => y), createFish(roster, 1848).map(({ y }) => y))
  for (let index = 0; index < fishes.length; index += 1) {
    inBounds(fishes[index])
    for (const other of fishes.slice(index + 1)) {
      assert.ok(Math.abs(other.x - fishes[index].x) > 76 || Math.abs(other.y - fishes[index].y) > 32)
    }
  }
})

test('all fish stay inside bounds across normal and slow frames, without edge pinning', () => {
  for (const dt of [1 / 120, 1 / 30, 0.25]) {
    const fishes = createFish(roster, 912)
    for (let frame = 1; frame <= Math.round(40 / dt); frame += 1) {
      const previous = fishes.map(({ x, y }) => ({ x, y }))
      stepFish(fishes, dt, frame * dt)
      fishes.forEach((fish, index) => {
        inBounds(fish)
        assert.ok(Math.hypot(fish.x - previous[index].x, fish.y - previous[index].y) > dt * 15)
      })
    }
  }
})

test('frame subdivision has the same result at 60 and 30 fps', () => {
  const fine = createFish(roster, 883)
  const coarse = createFish(roster, 883)
  for (let frame = 1; frame <= 600; frame += 1) stepFish(fine, 1 / 60, frame / 60)
  for (let frame = 1; frame <= 300; frame += 1) stepFish(coarse, 1 / 30, frame / 30)
  fine.forEach((fish, index) => {
    close(fish.x, coarse[index].x, 1e-6)
    close(fish.y, coarse[index].y, 1e-6)
  })
})

test('styles share exactly the same speed and caught fish are excluded', () => {
  for (const style of ['calm', 'eager', 'sleepy', 'bold']) {
    const fishes = [fishAt(style, 195, 405, style)]
    stepFish(fishes, 1 / 60, 1)
    close(Math.hypot(fishes[0].x - 195, fishes[0].y - 405), FISH_SPEED / 60)
  }
  const fishes = createFish(roster)
  const caught = structuredClone(fishes[4])
  stepFish(fishes, 0.25, 1, caught.id)
  assert.deepEqual(fishes[4], caught)
  const reduced = [fishAt('reduced', 195, 405)]
  stepFish(reduced, 1 / 60, 1, undefined, true)
  close(Math.hypot(reduced[0].x - 195, reduced[0].y - 405), FISH_SPEED / 60)
})

test('every name visits both upper and lower water within a 120-second swimming window', () => {
  for (const sessionSeed of [1, 42, 20260929, 4294967295]) {
    const fishes = createFish(roster, sessionSeed)
    const upper = new Set()
    const lower = new Set()
    for (let frame = 1; frame <= 3600; frame += 1) {
      stepFish(fishes, 1 / 30, frame / 30)
      for (const fish of fishes) {
        if (fish.y <= 330) upper.add(fish.id)
        if (fish.y >= 480) lower.add(fish.id)
      }
    }
    assert.equal(upper.size, 16, `seed ${sessionSeed}: everyone reaches the upper water`)
    assert.equal(lower.size, 16, `seed ${sessionSeed}: everyone reaches the lower water`)
  }
})

test('anticipatory passing keeps sustained severe name overlaps uncommon', (context) => {
  // A severe overlap means most of two 14px labels occupy the same line.
  // Short crossings are allowed; the measure guards against travelling clumps.
  for (const sessionSeed of [1, 42, 20260929, 4294967295]) {
    const fishes = createFish(roster, sessionSeed)
    const streaks = new Map()
    let crowdedFishFrames = 0
    let longestStreak = 0
    for (let frame = 1; frame <= 3600; frame += 1) {
      stepFish(fishes, 1 / 30, frame / 30)
      const crowded = new Set()
      for (let index = 0; index < fishes.length; index += 1) {
        for (let other = index + 1; other < fishes.length; other += 1) {
          const key = `${index}-${other}`
          const overlap = Math.abs(fishes[index].x - fishes[other].x) < 55
            && Math.abs(fishes[index].y - fishes[other].y) < 14
          const streak = overlap ? (streaks.get(key) ?? 0) + 1 : 0
          streaks.set(key, streak)
          longestStreak = Math.max(longestStreak, streak)
          if (overlap) { crowded.add(index); crowded.add(other) }
        }
      }
      crowdedFishFrames += crowded.size
    }
    const fraction = crowdedFishFrames / (3600 * fishes.length)
    assert.ok(fraction < 0.07, `seed ${sessionSeed}: ${(fraction * 100).toFixed(1)}% severe overlap time`)
    assert.ok(longestStreak / 30 < 6, `seed ${sessionSeed}: a pair stays overlapped for ${longestStreak / 30}s`)
    context.diagnostic(`seed ${sessionSeed}: ${(fraction * 100).toFixed(1)}% severe overlap time, longest ${(longestStreak / 30).toFixed(2)}s`)
  }
})

test('affinity styles cannot select routes or reserve the easiest upper layer', () => {
  const warm = createFish(roster.map((fish) => ({ ...fish, swimStyle: 'warm' })), 123)
  const hostile = createFish(roster.map((fish) => ({ ...fish, swimStyle: 'hostile' })), 123)
  for (let frame = 1; frame <= 900; frame += 1) {
    stepFish(warm, 1 / 30, frame / 30)
    stepFish(hostile, 1 / 30, frame / 30)
  }
  warm.forEach((fish, index) => {
    assert.equal(fish.x, hostile[index].x)
    assert.equal(fish.y, hostile[index].y)
    assert.equal(fish.heading, hostile[index].heading)
  })
})

test('real-speed casts have first-hit opportunities for all sixteen, including every initial bottom fish', (context) => {
  // Each trial is an independent opportunity at the actual pendulum angle. The
  // names keep swimming throughout the hook descent; no fish are removed and
  // no catch is forced by moving a target to the hook or skipping a blocker.
  for (const sessionSeed of [1, 42, 20260929, 4294967295]) {
    const fishes = createFish(roster, sessionSeed)
    const initialBottom = fishes.filter((fish) => fish.y >= 480).map((fish) => fish.id)
    const hittable = new Set()
    let lastNewOpportunity = 0
    for (let frame = 0; frame <= 1200; frame += 1) {
      const time = frame / 10
      if (frame) stepFish(fishes, 0.1, time)
      if (frame % 6 !== 0) continue
      const trial = structuredClone(fishes)
      const angle = idleAngle(time)
      const limit = maxHookLength(angle)
      let length = 26
      let previous = hookPoint(angle, length)
      for (let tick = 1; tick <= 120; tick += 1) {
        stepFish(trial, 1 / 30, time + tick / 30)
        length = Math.min(limit, length + 190 / 30)
        const next = hookPoint(angle, length)
        const hit = firstCollision(previous, next, trial)
        if (hit) {
          if (!hittable.has(hit.id)) lastNewOpportunity = time
          hittable.add(hit.id)
          break
        }
        if (length >= limit) break
        previous = next
      }
    }
    assert.equal(initialBottom.length, 4)
    for (const id of initialBottom) assert.ok(hittable.has(id), `seed ${sessionSeed}: bottom fish ${id} is not permanently blocked`)
    assert.equal(hittable.size, 16, `seed ${sessionSeed}: every name can be the first actual collision`)
    context.diagnostic(`seed ${sessionSeed}: all 16 have a dynamic first-hit opportunity by ${lastNewOpportunity.toFixed(1)}s`)
  }
})

test('name length and personality cannot change the common collision box', () => {
  for (const id of ['A', '名字非常非常非常长的一条鱼']) {
    const fish = fishAt(id, 195, 405, id)
    assert.equal(firstCollision({ x: 233, y: 300 }, { x: 233, y: 450 }, [fish])?.id, id)
    assert.equal(firstCollision({ x: 233.01, y: 300 }, { x: 233.01, y: 450 }, [fish]), null)
    assert.equal(firstCollision({ x: 100, y: 421 }, { x: 260, y: 421 }, [fish])?.id, id)
    assert.equal(firstCollision({ x: 100, y: 421.01 }, { x: 260, y: 421.01 }, [fish]), null)
  }
})

test('a fast swept hook hits the nearest fish even when the array is reversed', () => {
  const fishes = [fishAt('deep', 195, 510), fishAt('near', 195, 300)]
  const hit = firstCollision({ x: 195, y: 147 }, { x: 195, y: 585 }, fishes)
  assert.deepEqual(hit, { id: 'near', point: { x: 195, y: 284 } })
  assert.deepEqual(firstCollision({ x: 195, y: 147 }, { x: 195, y: 585 }, fishes.toReversed()), hit)
  assert.equal(firstCollision({ x: 100, y: 300 }, { x: 290, y: 300 }, fishes)?.id, 'near')
  assert.equal(firstCollision({ x: 195, y: 300 }, { x: 195, y: 300 }, fishes)?.id, 'near')
})

test('collision is restricted to the part of the fish box below the sea surface', () => {
  assert.equal(firstCollision({ x: 0, y: 180 }, { x: 300, y: 180 }, [fishAt('above', 150, 180)]), null)
  assert.deepEqual(firstCollision({ x: 150, y: 147 }, { x: 150, y: 200 }, [fishAt('surface', 150, 180)]), {
    id: 'surface', point: { x: 150, y: 184 },
  })
})

test('pendulum stays in range and hooks terminate at the first world boundary', () => {
  close(idleAngle(0.9), 17 * Math.PI / 180)
  close(idleAngle(2.7), -64 * Math.PI / 180)
  for (let index = 0; index <= 360; index += 1) {
    const angle = idleAngle(index / 100)
    assert.ok(angle >= -64 * Math.PI / 180 - 1e-10 && angle <= 17 * Math.PI / 180 + 1e-10)
    const point = hookPoint(angle, maxHookLength(angle))
    assert.ok(point.x >= 18 - 1e-8 && point.x <= 372 + 1e-8 && point.y <= 585 + 1e-8)
    assert.ok(Math.abs(point.x - 18) < 1e-8 || Math.abs(point.x - 372) < 1e-8 || Math.abs(point.y - 585) < 1e-8)
  }
  assert.equal(maxHookLength(Math.PI), 0)
  assert.equal(maxHookLength(Math.PI / 3), 0, 'a ray passing through the right shore must be rejected')
})

test('reeling retains the casting ray and returns exactly to the rod origin', () => {
  const angle = -0.65
  const length = maxHookLength(angle)
  const far = hookPoint(angle, length)
  for (const fraction of [0.75, 0.5, 0.25, 0]) {
    const point = hookPoint(angle, length * fraction)
    close(point.x - HOOK_ORIGIN.x, (far.x - HOOK_ORIGIN.x) * fraction)
    close(point.y - HOOK_ORIGIN.y, (far.y - HOOK_ORIGIN.y) * fraction)
    close(Math.hypot(point.x - HOOK_ORIGIN.x, point.y - HOOK_ORIGIN.y), length * fraction)
  }
  assert.deepEqual(hookPoint(angle, 0), HOOK_ORIGIN)
  assert.deepEqual(hookPoint(angle, -10), HOOK_ORIGIN)
})
