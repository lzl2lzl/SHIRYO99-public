export type SwimStyle = 'distant' | 'hostile' | 'hesitant' | 'warm' | 'quiet'

export interface Idol {
  id: string
  name: string
  color: string
  group: 'IDOLiSH7' | 'TRIGGER' | 'Re:vale' | 'ŹOOĻ'
  affinity: number
  swimStyle: SwimStyle
}

// LIVE 4bit profile colors, except Gaku's light silver chosen from the user's reference.
export const IDOLS: readonly Idol[] = [
  { id: 'iori', color: '#0D326F', name: '和泉一织', group: 'IDOLiSH7', affinity: -50, swimStyle: 'distant' },
  { id: 'yamato', color: '#67AF28', name: '二阶堂大和', group: 'IDOLiSH7', affinity: -30, swimStyle: 'distant' },
  { id: 'mitsuki', color: '#F08300', name: '和泉三月', group: 'IDOLiSH7', affinity: -60, swimStyle: 'distant' },
  { id: 'tamaki', color: '#5BC2D9', name: '四叶环', group: 'IDOLiSH7', affinity: -70, swimStyle: 'distant' },
  { id: 'sogo', color: '#856DAF', name: '逢坂壮五', group: 'IDOLiSH7', affinity: -50, swimStyle: 'distant' },
  { id: 'nagi', color: '#FFEB00', name: '六弥凪', group: 'IDOLiSH7', affinity: -40, swimStyle: 'distant' },
  { id: 'riku', color: '#E60039', name: '七濑陆', group: 'IDOLiSH7', affinity: -30, swimStyle: 'hesitant' },
  { id: 'gaku', color: '#D5D5D5', name: '八乙女乐', group: 'TRIGGER', affinity: -100, swimStyle: 'hostile' },
  { id: 'ten', color: '#B94F84', name: '九条天', group: 'TRIGGER', affinity: -100, swimStyle: 'hostile' },
  { id: 'ryunosuke', color: '#00516D', name: '十龙之介', group: 'TRIGGER', affinity: -100, swimStyle: 'hostile' },
  { id: 'momo', color: '#E62E8B', name: '百', group: 'Re:vale', affinity: 0, swimStyle: 'warm' },
  { id: 'yuki', color: '#C4D700', name: '千', group: 'Re:vale', affinity: -100, swimStyle: 'hostile' },
  { id: 'haruka', color: '#8EAA9D', name: '亥清悠', group: 'ŹOOĻ', affinity: 70, swimStyle: 'warm' },
  { id: 'toma', color: '#832F41', name: '狗丸透真', group: 'ŹOOĻ', affinity: 70, swimStyle: 'warm' },
  { id: 'minami', color: '#C7B6A0', name: '枣巳波', group: 'ŹOOĻ', affinity: 50, swimStyle: 'quiet' },
  { id: 'tora', color: '#8E7375', name: '御堂虎于', group: 'ŹOOĻ', affinity: 50, swimStyle: 'quiet' },
]

export interface DialogueBeat {
  speaker?: 'ryo' | 'shiro' | 'idol' | 'crowd'
  text: string
  /** 台词 expire automatically; 对话 wait for confirmation within an encounter. */
  mode?: 'line' | 'dialogue'
  location?: 'shore' | 'water' | 'narration' | 'offscreen'
  /** Empty beats normally animate automatically; silent encounters still need acknowledgement. */
  waitForTap?: boolean
  /** Duration applies only to automatic beats, never to visible encounter dialogue. */
  durationMs?: number
  event?: 'punch-shiro' | 'idol-leaves' | 'shiro-returns' | 'wake-shiro' | 'shiro-exits' | 'ryo-exits'
  mood?: 'happy' | 'angry' | 'shy' | 'stunned' | 'nervous'
}

export function needsConfirmation(beat: DialogueBeat, fallback: 'line' | 'dialogue' = 'dialogue'): boolean {
  return (beat.mode ?? fallback) === 'dialogue' && (beat.waitForTap === true || beat.text.length > 0)
}

export const INTRO_LINES: readonly string[] = [
  '月云了获得了一个可以捕捉偶像的鱼竿',
  '钓到的偶像会被捉进鱼篮里',
  '遇见……可怕的事……',
  '等鱼钩摆向想钓的偶像，轻点海面下钩，命中后会自动收线。',
  '对话读完后点一下，聊完就能再甩一竿。',
]

export const CAST_LINES: readonly DialogueBeat[] = [
  { speaker: 'shiro', text: '加油，了くん！', mode: 'line', location: 'shore', durationMs: 1800 },
  { speaker: 'ryo', text: '闭嘴！', mode: 'line', location: 'shore', durationMs: 1800, mood: 'angry' },
]

export const ENDING_LINES: readonly DialogueBeat[] = [
  { text: '一天过去了', mode: 'dialogue', location: 'narration' },
  { text: '月云了什么也没钓起来', mode: 'dialogue', location: 'narration' },
  { text: '……', mode: 'dialogue', location: 'narration' },
  { speaker: 'ryo', text: '到底什么意思？？！？', mode: 'dialogue', location: 'shore', mood: 'angry' },
  { speaker: 'ryo', text: '这个游戏是在耍我吗？？！', mode: 'dialogue', location: 'shore' },
  { speaker: 'ryo', text: '无聊！神经！好烦啊！！！', mode: 'dialogue', location: 'shore' },
  { speaker: 'ryo', text: '游戏作者简直就是丧心病狂没有公德心。', mode: 'dialogue', location: 'shore' },
  { speaker: 'ryo', text: '啊！！！！？！你说句话啊？？', mode: 'dialogue', location: 'shore' },
  { text: '', event: 'wake-shiro', durationMs: 700 },
  { speaker: 'shiro', text: '啊……？哦！结束了啊。', mode: 'dialogue', location: 'shore' },
  { speaker: 'shiro', text: '果然是这样呢。', mode: 'dialogue', location: 'shore' },
  { speaker: 'ryo', text: '？', mode: 'dialogue', location: 'shore' },
  { speaker: 'shiro', text: '回去了吗？', mode: 'dialogue', location: 'shore' },
  { speaker: 'ryo', text: '……😡', mode: 'dialogue', location: 'shore', mood: 'angry' },
  { speaker: 'ryo', text: '好吧。', mode: 'dialogue', location: 'shore' },
  { text: '', event: 'shiro-exits', durationMs: 1100 },
  { speaker: 'ryo', text: '竟敢耍我，我会让你付出代价！！！', mode: 'dialogue', location: 'shore' },
  { speaker: 'shiro', text: '了くん？你好慢啊- -', mode: 'dialogue', location: 'offscreen' },
  { speaker: 'ryo', text: '你烦不烦？！', mode: 'dialogue', location: 'shore' },
  { text: '', event: 'ryo-exits', durationMs: 1100 },
]

export const ENCOUNTERS: Record<string, readonly DialogueBeat[]> = {
  iori: [
    { text: '', waitForTap: true },
    { text: '', event: 'idol-leaves', durationMs: 900 },
  ],
  yamato: [
    { text: '', waitForTap: true },
    { text: '', event: 'idol-leaves', durationMs: 900 },
  ],
  mitsuki: [
    { text: '', waitForTap: true },
    { text: '', event: 'idol-leaves', durationMs: 900 },
  ],
  tamaki: [
    { text: '', waitForTap: true },
    { text: '', event: 'idol-leaves', durationMs: 900 },
  ],
  sogo: [
    { text: '', waitForTap: true },
    { text: '', event: 'idol-leaves', durationMs: 900 },
  ],
  nagi: [
    { text: '', waitForTap: true },
    { text: '', event: 'idol-leaves', durationMs: 900 },
  ],
  riku: [
    { text: '', mood: 'happy', durationMs: 700 },
    { speaker: 'idol', text: '啊，你是……月云了？', location: 'shore' },
    { speaker: 'crowd', text: 'riku！快回来！！！', location: 'water' },
    { speaker: 'ryo', text: '……', location: 'shore', durationMs: 1200 },
    { speaker: 'idol', text: '呃，你好？总之，谢谢你下单了这么多周边支持我们……', location: 'shore' },
    { speaker: 'idol', text: '……', location: 'shore' },
    { speaker: 'idol', text: '我先回去了！！！', location: 'shore' },
    { text: '', event: 'idol-leaves', durationMs: 900 },
    { speaker: 'ryo', text: '……', location: 'shore', durationMs: 1200 },
    { speaker: 'ryo', text: '🎵', location: 'shore', durationMs: 1500, mood: 'happy' },
  ],
  gaku: [
    { speaker: 'ryo', text: '哈哈，好想打个电话提醒你父亲注意心脏~', location: 'shore' },
    { text: '', event: 'idol-leaves', durationMs: 900 },
  ],
  ten: [
    { speaker: 'ryo', text: '哈哈，虚伪的家伙你也有今天！', location: 'shore' },
    { text: '', event: 'idol-leaves', durationMs: 900 },
  ],
  ryunosuke: [
    { speaker: 'ryo', text: '……', location: 'shore', durationMs: 1200, mood: 'nervous' },
    { speaker: 'ryo', text: '所以我说过偶像也不过如此，，，！哼！', location: 'shore', mood: 'nervous' },
    { text: '', event: 'idol-leaves', durationMs: 900 },
  ],
  momo: [
    { speaker: 'ryo', text: '……', location: 'shore', durationMs: 1300, mood: 'stunned' },
    { speaker: 'ryo', text: '哟，momo，好久不见。', location: 'shore' },
    { speaker: 'idol', text: '我听宇都木桑说，你过得还不错？', location: 'shore' },
    { speaker: 'ryo', text: '……', location: 'shore', durationMs: 1300, mood: 'stunned' },
    { speaker: 'ryo', text: '哈？？？？？', location: 'shore', mood: 'angry' },
    { text: '', event: 'punch-shiro', durationMs: 1100 },
    { speaker: 'ryo', text: '你听错了。', location: 'shore' },
    { speaker: 'idol', text: '噗……！果然是这样！太好啦，我也很开心哦☆', location: 'shore' },
    {
      speaker: 'ryo',
      text: '哈？你好吵，有谁需要你开心吗？小心我把你绑架进鱼篮勒索你达令1000000$。',
      location: 'shore',
      mood: 'angry',
    },
    { text: '', event: 'idol-leaves', durationMs: 900 },
    { text: '', event: 'shiro-returns', durationMs: 1100 },
  ],
  yuki: [
    { speaker: 'ryo', text: '哈哈，想不到你有一天也会落到我手里。哈哈！真没用~', location: 'shore' },
    { text: '', event: 'idol-leaves', durationMs: 900 },
  ],
  haruka: [
    { text: '', durationMs: 700 },
    { speaker: 'idol', text: '啊，了桑！今天开心吗！', location: 'shore' },
    { speaker: 'ryo', text: '怎么可能！', location: 'shore', mood: 'shy' },
    { text: '', event: 'idol-leaves', durationMs: 900 },
  ],
  toma: [
    { text: '', durationMs: 700 },
    { speaker: 'idol', text: '了桑！今天天气真好啊！', location: 'shore' },
    { speaker: 'ryo', text: '哦。', location: 'shore' },
    { text: '', durationMs: 900 },
    { text: '', event: 'idol-leaves', durationMs: 900 },
    { speaker: 'ryo', text: '我看起来像瞎子吗？？？', location: 'shore' },
  ],
  minami: [
    { text: '', durationMs: 700 },
    { speaker: 'idol', text: '^^', location: 'shore', durationMs: 1300 },
    { speaker: 'ryo', text: '？', location: 'shore', durationMs: 1400 },
    { text: '', event: 'idol-leaves', durationMs: 900 },
  ],
  tora: [
    { text: '', durationMs: 700 },
    { speaker: 'idol', text: '……嗨。', location: 'shore' },
    { speaker: 'ryo', text: '……', location: 'shore', durationMs: 1300 },
    { text: '', durationMs: 900 },
    { text: '', event: 'idol-leaves', durationMs: 900 },
    { speaker: 'ryo', text: '我才没有想跟你打招呼呢？？', location: 'shore' },
  ],
}
