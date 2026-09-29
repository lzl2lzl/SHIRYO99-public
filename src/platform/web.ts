import type { PlatformAdapter } from './types'

export const webAdapter: PlatformAdapter = {
  name: 'web',
  vibrate: (pattern = 20) => navigator.vibrate?.(pattern),
  async share(payload) {
    if (navigator.share) await navigator.share(payload)
  },
  save: (key, value) => localStorage.setItem(`shiryo99:${key}`, value),
  load: (key) => localStorage.getItem(`shiryo99:${key}`),
}
