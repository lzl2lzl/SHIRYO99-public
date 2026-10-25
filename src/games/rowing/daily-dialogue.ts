export interface DailyLine { who: 'shiro' | 'ryo'; text: string }
export const DAILY_LINES = {
  tired: [{ who: 'ryo', text: '我累了。' }, { who: 'shiro', text: '我也是。' }],
  school: [
    { who: 'shiro', text: '……' },
    { who: 'shiro', text: '了くん你给学校请假了吗？' },
    { who: 'ryo', text: '答案不是很显然吗？！' },
    { who: 'shiro', text: '究竟为什么会这样……我的工资……' },
    { who: 'ryo', text: '我也想知道？？？' },
    { who: 'shiro', text: '……' },
    { who: 'ryo', text: '。。。。。。' },
    { who: 'shiro', text: '……' },
    { who: 'ryo', text: '。。。。。。' },
    { who: 'shiro', text: '好了，我给上司发完消息了，接下来帮你给学校打电话吧。' },
    { who: 'ryo', text: '哦，你快点。' },
  ],
  hungry: [{ who: 'ryo', text: '我饿了' }, { who: 'shiro', text: '我也是' }],
} satisfies Record<string, DailyLine[]>
export const SMALL_TALK: DailyLine[][] = [
  [{ who: 'ryo', text: '你快点划。' }, { who: 'shiro', text: '知道了知道了。' }],
  [{ who: 'ryo', text: '你好慢' }, { who: 'shiro', text: '知道了知道了。' }],
  [{ who: 'ryo', text: '哈哈~' }, { who: 'ryo', text: '对面那个人好好笑' }],
]
export interface DailyChat { kind: 'tired' | 'school' | 'hungry' | 'random'; day: number; lines: DailyLine[]; line: number; age: number }
export interface DailyDialogue { chat: DailyChat | null; pending: DailyChat[]; lastFinished: number }
export const createDailyDialogue = (): DailyDialogue => ({ chat: null, pending: [], lastFinished: -Infinity })
export function dailyLineSeconds(line: DailyLine) { return Math.max(3.2, Array.from(line.text).length * .18 + 1.4) }

/** Queue only crossed clock events; background time is never replayed. */
export function tickDailyDialogue(state: DailyDialogue, previous: number, minutes: number, dt: number, blocked: boolean, random: () => number) {
  for (let day = Math.floor(previous / 1440); day <= Math.floor(minutes / 1440); day++) {
    if (day < 1) continue
    for (const [hour, kind] of [[4, 'tired'], [7, 'school'], [12, 'hungry'], [18, 'hungry']] as const) {
      const at = day * 1440 + hour * 60
      if (previous < at && minutes >= at) state.pending.push({ kind, day, lines: DAILY_LINES[kind], line: 0, age: 0 })
    }
  }
  if (state.chat?.kind === 'random' && (blocked || state.pending.length || minutes % 1440 >= 18 * 60)) {
    state.chat = null; state.lastFinished = minutes
  }
  if (blocked) return
  if (state.chat) {
    state.chat.age += dt
    if (state.chat.age >= dailyLineSeconds(state.chat.lines[state.chat.line])) {
      state.chat.age = 0; state.chat.line++
      if (state.chat.line >= state.chat.lines.length) { state.chat = null; state.lastFinished = minutes }
    }
  }
  if (!state.chat && state.pending.length) state.chat = state.pending.shift()!
  // Once per half-hour, only in the afternoon from day two, never on every frame.
  const minute = minutes % 1440
  if (!state.chat && !state.pending.length && minutes >= 1440 && minute >= 12 * 60 && minute < 18 * 60
    && Math.floor(minutes / 30) > Math.floor(previous / 30) && minutes - state.lastFinished >= 45 && random() < .12) {
    const lines = SMALL_TALK[Math.min(SMALL_TALK.length - 1, Math.max(0, Math.floor(random() * SMALL_TALK.length)))]
    state.chat = { kind: 'random', day: Math.floor(minutes / 1440), lines, line: 0, age: 0 }
  }
}
