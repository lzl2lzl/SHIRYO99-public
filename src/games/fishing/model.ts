export type Point = { x: number; y: number }

export type FishState = Point & {
  id: string
  phase: number
  /** Movement heading in radians, measured clockwise from the right. */
  heading: number
  style: string
  /** Optional so a plain fish object remains valid in collision and story tests. */
  wander?: { randomState: number; target: Point; nextDepth?: number; roamNext?: boolean }
}

export const WORLD_WIDTH = 390
export const WORLD_HEIGHT = 600
export const HOOK_ORIGIN: Readonly<Point> = Object.freeze({ x: 236, y: 147 })
export const SEA_LEVEL = 184
export const FISH_SPEED = 18
export const FISH_BOUNDS = Object.freeze({ left: 50, right: 340, top: 258, bottom: 552 })
export const FISH_HITBOX = Object.freeze({ halfWidth: 38, halfHeight: 16 })

const TAU = Math.PI * 2
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

function hash(text: string): number {
  let value = 2166136261
  for (let index = 0; index < text.length; index += 1) {
    value = Math.imul(value ^ text.charCodeAt(index), 16777619)
  }
  return value >>> 0
}

function random(state: { randomState: number }): number {
  state.randomState = (state.randomState + 0x6d2b79f5) >>> 0
  let value = state.randomState
  value = Math.imul(value ^ (value >>> 15), value | 1)
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296
}

function nextDestination(state: { randomState: number }, goUp?: boolean, fishes: FishState[] = []): Point {
  let best = { x: 195, y: 405 }
  let bestSpace = -Infinity
  // Choose a roomy destination, considering both neighbours and their intended
  // destinations. Random interior stops break up synchronized upper/lower turns.
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = {
      x: FISH_BOUNDS.left + 22 + random(state) * (FISH_BOUNDS.right - FISH_BOUNDS.left - 44),
      y: goUp === undefined
        ? FISH_BOUNDS.top + 30 + random(state) * (FISH_BOUNDS.bottom - FISH_BOUNDS.top - 60)
        : goUp ? FISH_BOUNDS.top + 24 + random(state) * 32 : FISH_BOUNDS.bottom - 24 - random(state) * 32,
    }
    let space = 4
    for (const fish of fishes) {
      for (const point of [fish, fish.wander?.target]) {
        if (point) space = Math.min(space, Math.hypot((candidate.x - point.x) / 90, (candidate.y - point.y) / 44))
      }
    }
    if (space > bestSpace) {
      best = candidate
      bestSpace = space
    }
  }
  return best
}

/** Randomize layer assignment and independent routes; a supplied seed reproduces a session. */
export function createFish(ids: readonly { id: string; swimStyle: string }[], randomSeed = Math.floor(Math.random() * 4294967296)): FishState[] {
  const columns = Math.max(1, Math.ceil(Math.sqrt(ids.length)))
  const rows = Math.max(1, Math.ceil(ids.length / columns))
  const session = { randomState: randomSeed >>> 0 }
  const slots = ids.map((_, index) => index)
  for (let index = slots.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random(session) * (index + 1))
    const slot = slots[index]
    slots[index] = slots[other]
    slots[other] = slot
  }
  return ids.map(({ id, swimStyle }, index) => {
    const row = Math.floor(slots[index] / columns)
    const column = slots[index] % columns
    const phase = random(session) * TAU
    const x = columns === 1 ? 195 : 70 + (column / (columns - 1)) * 250
    const y = rows === 1 ? 405 : 278 + (row / (rows - 1)) * 254
    const route = { randomState: Math.floor(random(session) * 4294967296) }
    const target = nextDestination(route, y >= 405)
    return {
      id,
      x,
      y,
      phase,
      heading: Math.atan2(target.y - y, target.x - x),
      style: swimStyle,
      wander: { ...route, target, nextDepth: y >= 405 ? 1 : -1, roamNext: false },
    }
  })
}

function turnToward(current: number, target: number, limit: number): number {
  const difference = Math.atan2(Math.sin(target - current), Math.cos(target - current))
  return current + clamp(difference, -limit, limit)
}

/**
 * Mutates free-swimming fish. dt and time are seconds; time is the end of the frame.
 * Every fish travels at 18 px/s toward independently randomized destinations.
 * Upper/lower visits alternate with random stops throughout the water, so no
 * name owns a lane or stays permanently underneath the same neighbours.
 * Styles/affinity never influence routes, speed or hitboxes.
 * Small integration steps avoid edge trapping after a slow frame; time beyond one
 * second is treated as a paused tab. Reduced motion retains essential swimming.
 */
export function stepFish(
  fishes: FishState[],
  dt: number,
  time: number,
  excludeId?: string,
  reducedMotion = false,
): void {
  if (!Number.isFinite(dt) || !Number.isFinite(time) || dt <= 0) return
  const elapsed = Math.min(dt, 1)
  const steps = Math.ceil(elapsed / (1 / 60))
  const step = elapsed / steps

  for (let iteration = 0; iteration < steps; iteration += 1) {
    const positions = fishes.map(({ id, x, y, heading }) => ({ id, x, y, heading }))
    for (let index = 0; index < fishes.length; index += 1) {
      const fish = fishes[index]
      if (fish.id === excludeId) continue
      if (!fish.wander) {
        const route = { randomState: hash(fish.id) }
        const target = nextDestination(route, fish.y >= 405)
        fish.wander = { ...route, target, nextDepth: fish.y >= 405 ? 1 : -1, roamNext: false }
      }
      const reachedDepth = fish.wander.target.y < 330
        ? fish.y <= fish.wander.target.y + 10
        : fish.wander.target.y > 480 && fish.y >= fish.wander.target.y - 10
      if (reachedDepth || Math.hypot(fish.wander.target.x - fish.x, fish.wander.target.y - fish.y) < 13) {
        const neighbours = fishes.filter((other) => other.id !== fish.id && other.id !== excludeId)
        if (fish.wander.roamNext) {
          fish.wander.target = nextDestination(fish.wander, undefined, neighbours)
          fish.wander.roamNext = false
        } else {
          const depth = fish.wander.nextDepth ?? (fish.y > 405 ? -1 : 1)
          fish.wander.target = nextDestination(fish.wander, depth < 0, neighbours)
          fish.wander.nextDepth = -depth
          fish.wander.roamNext = true
        }
      }
      const drift = reducedMotion ? 0 : Math.sin(fish.phase) * 0.025
      const targetHeading = Math.atan2(fish.wander.target.y - fish.y, fish.wander.target.x - fish.x) + drift
      let desiredX = Math.cos(targetHeading) * 1.8
      let desiredY = Math.sin(targetHeading) * 1.8

      // Anticipate the wall early enough to turn at a constant swimming speed.
      const margin = 40
      desiredX += clamp((FISH_BOUNDS.left + margin - fish.x) / margin, 0, 1) * 8
      desiredX -= clamp((fish.x - FISH_BOUNDS.right + margin) / margin, 0, 1) * 8
      desiredY += clamp((FISH_BOUNDS.top + margin - fish.y) / margin, 0, 1) * 8
      desiredY -= clamp((fish.y - FISH_BOUNDS.bottom + margin) / margin, 0, 1) * 8

      // Gentle shared separation prevents two labels travelling on top of each other.
      let separationX = 0
      let separationY = 0
      for (let otherIndex = 0; otherIndex < positions.length; otherIndex += 1) {
        const other = positions[otherIndex]
        if (otherIndex === index || other.id === excludeId) continue
        let dx = positions[index].x - other.x
        let dy = positions[index].y - other.y
        let distance = Math.hypot(dx / 98, dy / 52)
        const velocityX = (Math.cos(fish.heading) - Math.cos(other.heading)) * FISH_SPEED
        const velocityY = (Math.sin(fish.heading) - Math.sin(other.heading)) * FISH_SPEED
        const closing = (velocityX / 98) ** 2 + (velocityY / 52) ** 2
        const closestTime = closing > 0.00001
          ? clamp(-(dx * velocityX / (98 * 98) + dy * velocityY / (52 * 52)) / closing, 0, 1.3)
          : 0
        const futureX = dx + velocityX * closestTime
        const futureY = dy + velocityY * closestTime
        const futureDistance = Math.hypot(futureX / 98, futureY / 52)
        if (futureDistance < distance) {
          dx = futureX
          dy = futureY
          distance = futureDistance
        }
        if (distance >= 1) continue
        if (distance < 0.15) {
          // Head-on swimmers both turn to their own right. Predicting a point
          // after they crossed would instead steer them straight into each other.
          const sameDirection = Math.cos(fish.heading - other.heading) > 0
          const side = sameDirection && index > otherIndex ? -1 : 1
          separationX -= Math.sin(fish.heading) * side * 6
          separationY += Math.cos(fish.heading) * side * 6
        } else {
          const strength = (1 - distance) * 8
          separationX += (dx / 98 / distance) * strength
          separationY += (dy / 52 / distance) * strength
        }
      }
      // Separation may temporarily outrank the goal, rather than letting names
      // travel through each other. Every fish still uses the same speed/rules.
      const separationScale = Math.min(1, 5 / Math.max(0.0001, Math.hypot(separationX, separationY)))
      desiredX += separationX * separationScale
      desiredY += separationY * separationScale

      fish.heading = turnToward(fish.heading, Math.atan2(desiredY, desiredX), step * 2.4)
      fish.x += Math.cos(fish.heading) * FISH_SPEED * step
      fish.y += Math.sin(fish.heading) * FISH_SPEED * step
      // Reflection is only a fallback, and preserves travel instead of pinning a fish.
      if (fish.x < FISH_BOUNDS.left || fish.x > FISH_BOUNDS.right) {
        const edge = fish.x < FISH_BOUNDS.left ? FISH_BOUNDS.left : FISH_BOUNDS.right
        fish.x = edge * 2 - fish.x
        fish.heading = Math.PI - fish.heading
      }
      if (fish.y < FISH_BOUNDS.top || fish.y > FISH_BOUNDS.bottom) {
        const edge = fish.y < FISH_BOUNDS.top ? FISH_BOUNDS.top : FISH_BOUNDS.bottom
        fish.y = edge * 2 - fish.y
        fish.heading = -fish.heading
      }
      fish.heading = Math.atan2(Math.sin(fish.heading), Math.cos(fish.heading))
    }
  }
}

/** A 3.6-second pendulum, radians relative to downward vertical; positive is right. */
export function idleAngle(time: number): number {
  return ((-23.5 + Math.sin((time * TAU) / 3.6) * 40.5) * Math.PI) / 180
}

export function hookPoint(angle: number, length: number): Point {
  const distance = Math.max(0, length)
  return {
    x: HOOK_ORIGIN.x + Math.sin(angle) * distance,
    y: HOOK_ORIGIN.y + Math.cos(angle) * distance,
  }
}

/** Stop at the first side/bottom boundary; reject rays passing through the upper shore. */
export function maxHookLength(angle: number): number {
  if (!Number.isFinite(angle)) return 0
  const dx = Math.sin(angle)
  const dy = Math.cos(angle)
  if (dy <= 0.000001) return 0
  const surfaceLength = (SEA_LEVEL - HOOK_ORIGIN.y) / dy
  const surfaceX = HOOK_ORIGIN.x + dx * surfaceLength
  if (surfaceX < 18 || surfaceX >= 280) return 0
  const sideLength = Math.abs(dx) < 0.000001
    ? Infinity
    : ((dx > 0 ? 372 : 18) - HOOK_ORIGIN.x) / dx
  return Math.max(0, Math.min((585 - HOOK_ORIGIN.y) / dy, sideLength))
}

function entryFraction(from: Point, to: Point, left: number, top: number, right: number, bottom: number): number | null {
  let enter = 0
  let leave = 1
  for (const [origin, delta, low, high] of [
    [from.x, to.x - from.x, left, right],
    [from.y, to.y - from.y, top, bottom],
  ]) {
    if (Math.abs(delta) < 0.000001) {
      if (origin < low || origin > high) return null
      continue
    }
    const first = (low - origin) / delta
    const second = (high - origin) / delta
    enter = Math.max(enter, Math.min(first, second))
    leave = Math.min(leave, Math.max(first, second))
    if (enter > leave) return null
  }
  return enter
}

/** Sweeps the entire hook segment, returning the first underwater box entry. */
export function firstCollision(from: Point, to: Point, fishes: FishState[]): { id: string; point: Point } | null {
  let nearest = Infinity
  let id: string | null = null
  for (const fish of fishes) {
    const top = Math.max(SEA_LEVEL, fish.y - FISH_HITBOX.halfHeight)
    const bottom = fish.y + FISH_HITBOX.halfHeight
    if (bottom < top) continue
    const entry = entryFraction(from, to, fish.x - FISH_HITBOX.halfWidth, top, fish.x + FISH_HITBOX.halfWidth, bottom)
    if (entry !== null && entry < nearest) {
      nearest = entry
      id = fish.id
    }
  }
  return id === null ? null : {
    id,
    point: { x: from.x + (to.x - from.x) * nearest, y: from.y + (to.y - from.y) * nearest },
  }
}
