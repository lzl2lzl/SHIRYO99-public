import type { GameDefinition } from '../engine/types'
import { fishingGame } from './fishing'
import { rowingGame } from './rowing'

export const games: GameDefinition[] = [fishingGame, rowingGame]
export const lobbyGames = games
