import type { ComponentType } from 'react'

export type GameKind = 'mechanic' | 'story'

export interface GameDefinition {
  id: string
  title: string
  kicker: string
  description: string
  kind: GameKind
  accent: string
  estimatedTime: string
  /** Hide a development template from the lobby without removing its direct route. */
  hideFromLobby?: boolean
  component: ComponentType<GameScreenProps>
}

export interface GameScreenProps {
  onExit: () => void
}

export interface StoryChoice {
  label: string
  next: string
}

export interface StoryNode {
  id: string
  speaker?: string
  text: string
  stage?: string
  choices?: StoryChoice[]
  next?: string
  ending?: string
}

export interface StoryData {
  start: string
  nodes: StoryNode[]
}
