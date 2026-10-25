import type { CoupleBoat } from './couples.ts'
export const COUPLE_LINES = {
  leaving: [['你看那艘船真奇怪~'], ['好危险，宝贝我们离他们远点']],
  night: [['今晚月色真美。', '你刚才已经说过啦。'], ['❤'], ['亲爱的~'], ['再坐近一点也没关系吧~']],
  resting: [['你先别动，我想给你拍张照。'], ['怎么不划了？', '嘘，让我再靠一会儿嘛~'], ['再坐近一点嘛~', '再近就要翻啦，亲爱的。'], ['怎么越来越慢了？', '电量不足，需要亲亲充电~']],
  wobbly: [['你笑什么？我划得有那么差吗？'], ['宝贝，累不累呀？', '你亲我一下就不累了~', '那你先靠过来嘛。']],
  steady: [['宝贝~累了就换我划，你坐着看风景就好~']],
  distracted: [['别一直看我嘛，看前面~哎呀，要撞上了啦！']],
  fast: [['亲爱的~慢一点嘛！', '不是你说想一起去吃晚饭吗？']],
  sunset: [['你看，太阳快落下去了。', '嗯。', '你根本没看嘛。', '我在看你呀~']],
}
export interface CoupleChat { boatId: number; kind: keyof typeof COUPLE_LINES; lines: string[]; line: number; age: number }
export const coupleLineSeconds = (text: string) => Math.max(3.2, Array.from(text).length * .15 + 1.5)
export function pickCoupleChat(boat: CoupleBoat, minutes: number, random: () => number): CoupleChat {
  const hour = minutes / 60 % 24
  const kind = boat.departing ? 'leaving' : hour >= 17 && hour < 19 && random() < .65 ? 'sunset'
    : boat.stopped ? 'resting' : hour >= 19 && random() < .35 ? 'night'
    : boat.motion?.style === 'wobbly' ? 'wobbly' : boat.motion?.style === 'fast' ? 'fast' : 'steady'
  const choices = COUPLE_LINES[kind], lines = choices[Math.min(choices.length - 1, Math.floor(random() * choices.length))]
  return { boatId: boat.id, kind, lines, line: 0, age: 0 }
}
