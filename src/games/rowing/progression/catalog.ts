export type SkillOwner = 'shiro' | 'ryo' | 'pair' | 'boat'
export type TravelRealm = 'river' | 'clouds' | 'galaxy'
export interface SkillDefinition {
  week: number
  name: string | null
  owner: SkillOwner
  realm: TravelRealm
  milestone: boolean
  ability?: { summary: string; usage: string }
}

/** Planned content is not announced until its mechanics and visuals are implemented. */
export const IMPLEMENTED_WEEK = 26
export const WEEK_MINUTES = 7 * 1440
export const UPGRADE_CLOCK = 8 * 60 + 31
export const upgradeAt = (week: number) => week * WEEK_MINUTES + UPGRADE_CLOCK

const PLANNED_SKILLS: readonly SkillDefinition[] = [
  { week: 1, name: '大概是一个可靠的人', owner: 'shiro', realm: 'river', milestone: false,
    ability: { summary: '士郎每桨更有力、转向更稳，停手后更容易止转。', usage: '点击士郎正常划桨时生效；两人停手后，船的旋转也会更快平缓下来。' } },
  { week: 2, name: '勉强划一下', owner: 'ryo', realm: 'river', milestone: false,
    ability: { summary: '月云了正常划动时，推进更有力、方向更准确。', usage: '月云了愿意正常划桨时自动生效，合作的概率保持原样；反划不获得这项加成。' } },
  { week: 3, name: '谁要和你配合啊？', owner: 'pair', realm: 'river', milestone: false,
    ability: { summary: '两人同时正常划动，能稳住转动并短暂冲刺。', usage: '同时点击两个人，两边都正常划动才算合拍。冲刺沿当前船头前进，并留下两道水痕。' } },
  { week: 4, name: '好想回家！', owner: 'boat', realm: 'river', milestone: true,
    ability: { summary: '连续合拍会叠加速度，船头也会轻轻抬起。', usage: '接连保持双人合拍，最多积攒四层加速。失去配合或停顿过久会中断连击，随后可以重新积攒。' } },
  { week: 5, name: '好想上班！', owner: 'shiro', realm: 'river', milestone: false },
  { week: 6, name: '尾巴很可爱哦', owner: 'ryo', realm: 'river', milestone: false },
  { week: 7, name: '文明驾驶', owner: 'pair', realm: 'river', milestone: false },
  { week: 8, name: '輪舞', owner: 'boat', realm: 'river', milestone: true },
  { week: 9, name: '讨厌情侣', owner: 'shiro', realm: 'river', milestone: false },
  { week: 10, name: '尾巴并不可爱', owner: 'ryo', realm: 'river', milestone: false },
  { week: 11, name: 'Drift driving', owner: 'pair', realm: 'river', milestone: false },
  { week: 12, name: 'Fly Away!', owner: 'boat', realm: 'river', milestone: true },
  { week: 13, name: '击溃吧！', owner: 'shiro', realm: 'river', milestone: false },
  { week: 14, name: '不知道是什么东西！', owner: 'ryo', realm: 'river', milestone: false },
  { week: 15, name: '比翼双飞', owner: 'pair', realm: 'river', milestone: false },
  { week: 16, name: '月云', owner: 'boat', realm: 'clouds', milestone: true },
  { week: 17, name: '星屑マジック', owner: 'shiro', realm: 'clouds', milestone: false },
  { week: 18, name: '月云，了', owner: 'ryo', realm: 'clouds', milestone: false },
  { week: 19, name: 'RIDING', owner: 'pair', realm: 'clouds', milestone: false },
  { week: 20, name: '星巡りの観測者', owner: 'boat', realm: 'galaxy', milestone: true },
  { week: 21, name: '士郎、行きまーす！', owner: 'shiro', realm: 'galaxy', milestone: false },
  { week: 22, name: '了、行きまーす！', owner: 'ryo', realm: 'galaxy', milestone: false },
  { week: 23, name: 'Binary Idiot', owner: 'pair', realm: 'galaxy', milestone: false },
  // Week 24 has a supplied transformation but no supplied skill title yet.
  { week: 24, name: null, owner: 'boat', realm: 'galaxy', milestone: false },
  { week: 25, name: '変身！', owner: 'boat', realm: 'galaxy', milestone: false },
  { week: 26, name: 'BREAK THE LIMITATION', owner: 'boat', realm: 'galaxy', milestone: true },
]

const LATER_ABILITIES: Record<number, { summary: string; usage: string }> = {
  5: { summary: '士郎划桨时，能更快压住正在发生的旋转。', usage: '船已经转起来时点击士郎，正常划动会额外纠正转速，仍需配合另一侧调整方向。' },
  6: { summary: '月云了正常划动时，尾巴也会帮忙稳住转向。', usage: '正常划桨附带尾巴辅助，减少偏转；拒绝和反划不会获得辅助。' },
  7: { summary: '高速失稳时合拍，可以减速并稳住船身。', usage: '速度较高且正在偏转或靠近其他船时，双人合拍优先刹车；这次不会同时加速。' },
  8: { summary: '转圈积攒动力，下一次合拍可以弹射出去。', usage: '实际旋转才会蓄能，最多积攒一份。合拍冲刺会释放全部动力，沿当时船头前进；避险刹车会保留蓄能。' },
  9: { summary: '士郎正常划动时，会更早避让前方的情侣船。', usage: '前方有近船时，一次划桨会轻微转向空处，太近时也会减速；不会自动替你持续划船。' },
  10: { summary: '月云了偶尔会用尾巴拍水，突然向前推进。', usage: '只在正常划动中随机触发，尾巴拍水后至少间隔三秒才能再触发，不提高合作概率。' },
  11: { summary: '连续合拍后，小船能沿浪尖轻快地滑行。', usage: '连续两次合拍进入短暂冲浪，阻力与转圈损耗降低；停顿过久仍会失去连击。' },
  12: { summary: '船底展开水翼，提速后会轻轻离开水面。', usage: '水翼降低阻力、提高速度上限；速度足够时抬升，减速后重新落下，转弯半径也随之变化。' },
  13: { summary: '士郎能够稳定离水后的小船姿态。', usage: '水翼或飞行抬升期间，点击士郎正常划动会额外减弱旋转，让落下前更容易稳住船身。' },
  14: { summary: '月云了正常划动时，可以延长滞空。', usage: '已经离水时，正常划桨会补充一小段滞空时间；补充有上限，停止合作后仍会落下。' },
  15: { summary: '连续几次合拍，两人就能连船一起飞起来。', usage: '连续三次合拍触发飞行，空中阻力更小，也能越过低处的船；落下后恢复同高度碰撞。' },
  16: { summary: '小船进入云海，船桨从此可以划开云朵。', usage: '云海航行降低巡航阻力，提高速度上限。附近的情侣也来到云上，时间和相遇规则继续保留。' },
  17: { summary: '士郎划出的星点，能帮小船稳住前进路线。', usage: '正常划桨与成功合拍会留下星光路线，短时间内更快消退旋转；路线沿当前船头，不指向终点。' },
  18: { summary: '月云了的尾巴留下紫色星屑，推动小船前进。', usage: '每次正常划动附带少量推进，星屑沿真实航迹留下，反划与误划不产生这份助力。' },
  19: { summary: '一次成功合拍，就能沿流星轨迹高速滑行。', usage: '合拍触发短暂流星加速，速度更高、阻力更低；需要避险时仍先执行刹车。' },
  20: { summary: '从云海划入银河，以星光涟漪继续航行。', usage: '银河巡航再次降低阻力、提高速度上限。情侣船的爱心仍在，左右划动与碰撞规则继续生效。' },
  21: { summary: '士郎能在银河的高速航行中更稳地转向。', usage: '正常划动的偏转更小，高速时还能额外纠正转速；单侧连续用力仍会绕圈。' },
  22: { summary: '月云了拉住星流，帮助小船完成更大的转弯。', usage: '速度足够时，正常划动会沿正在转弯的方向拉动船头，再减弱剩余旋转；仍由玩家掌握朝向。' },
  23: { summary: '灰紫双光交汇，合拍带来更强的共同推进。', usage: '成功合拍附带额外推进与短暂的双侧光流，转动进一步稳定；避险刹车时不会同时爆发。' },
  24: { summary: '机械双臂展开，两支船桨变得更加有力。', usage: '船体展开机械臂与机械桨，正常划桨的推动增加；船体占用空间也随形态一起增长。' },
  25: { summary: '推进器、护甲与驾驶舱展开，木船开始变形。', usage: '变形后每次正常划动获得更强推力，速度上限提高。人物和操控位置保留，不需要切换驾驶方式。' },
  26: { summary: '巨大机器人以光桨划动银河，突破航行极限。', usage: '两人各控制一侧光桨，合拍可高速推进，转圈损耗进一步降低；配合不好仍会在银河里划出大圆。' },
}
export const SKILLS: readonly SkillDefinition[] = PLANNED_SKILLS.map(skill => ({ ...skill, ability: skill.ability ?? LATER_ABILITIES[skill.week] }))
// Week 24 has no supplied title: use a neutral interface label, not an invented skill name.
export const skillTitle = (skill: SkillDefinition) => skill.name ?? '船体进化'

export const SKILL_OWNERS: Record<SkillOwner, string> = { shiro: '宇都木士郎', ryo: '月云了', pair: '共同能力', boat: '船体进化' }
export const skillTone = (owner: SkillOwner) => owner === 'shiro' ? 'silver' : owner === 'ryo' ? 'violet' : 'woven'
/** Derive from the awarded level; never maintain a second unlock list in UI or storage. */
export const acquiredSkills = (level: number) => SKILLS.filter(skill => skill.week <= level && skill.week <= IMPLEMENTED_WEEK && skill.ability)

export interface UpgradeLine { who: 'shiro' | 'ryo'; text: string }
/** Only user-approved lines go here. Empty entries skip directly to the reveal. */
export const UPGRADE_DIALOGUE: Readonly<Partial<Record<number, readonly UpgradeLine[]>>> = {}

/** Space required by successive manoeuvres; interpolation is continuous, not a level-up jump. */
export const SPACE_MILESTONES = [
  { week: 0, scale: 1 }, { week: 1, scale: 1.8 }, { week: 4, scale: 3 },
  { week: 8, scale: 4.5 }, { week: 12, scale: 6 }, { week: 16, scale: 8 },
  { week: 20, scale: 11 }, { week: 26, scale: 15 },
] as const
