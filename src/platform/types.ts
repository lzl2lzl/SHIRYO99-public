export interface PlatformAdapter {
  name: 'web' | 'xiaohongshu'
  vibrate: (pattern?: number | number[]) => void
  share: (payload: { title: string; text: string }) => Promise<void>
  save: (key: string, value: string) => void
  load: (key: string) => string | null
}
