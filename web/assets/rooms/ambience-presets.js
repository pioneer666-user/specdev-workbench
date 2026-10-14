// 只有固定随包资源；房型决定初值，不限制用户选项。
export const AMBIENCE_BASE = '/specdev-workbench/assets/audio/ambience/'
export const AMBIENCE_PRESETS = Object.freeze({
  none: Object.freeze({ label: '无背景声', description: '保留安静，不播放环境声。' }),
  nature: Object.freeze({ label: '自然之音', description: '白天鸟鸣，夜晚虫鸣，伴随轻柔合成风叶底色。', day: 'forest-day', night: 'forest-night' }),
  drone: Object.freeze({ label: '氛围长音', description: '柔和的合成长音与远城底色，适合喜欢持续氛围的时刻。', day: 'ceramic-day', night: 'ceramic-night' }),
})
export const AMBIENCE_TRACKS = Object.freeze(['forest-day', 'forest-night', 'ceramic-day', 'ceramic-night'])
// 循环版两端各有一秒周期保护区；不循环编码起止位置。
export const AMBIENCE_LOOP = Object.freeze({ start: 1, end: 26.5, duration: 27.5 })
export const defaultAmbience = style => style === 'fairy' ? 'nature' : 'none'
