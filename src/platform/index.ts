import type { PlatformAdapter } from './types'
import { webAdapter } from './web'

export const platform: PlatformAdapter = webAdapter
export type { PlatformAdapter }
