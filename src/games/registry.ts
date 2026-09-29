import type { GameDefinition } from '../engine/types'
import { fishingGame } from './fishing'

export const games: GameDefinition[] = [fishingGame]
export const lobbyGames = games
