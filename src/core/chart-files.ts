// 一张图的三个数据文件：名字与固定顺序。单独成叶子模块，供 chart / save / fingerprint 共用，
// 避免为了共用一份常量而互相 import 成环（阅读页与保存侧对"三个文件是哪三个、什么顺序"
// 必须是同一份说法——内容摘要就是按这个顺序算的）。
export const CHART_FILE_NAMES = ['workflow.json', 'details.md', 'evidence.json'] as const

/** 数据文件名 → 装配结构字段名。 */
export const FILE_KEY = {
  'workflow.json': 'workflow',
  'details.md': 'details',
  'evidence.json': 'evidence',
} as const

export const LIFECYCLE_FILE_NAMES = ['chart.json', 'lifecycle.json', 'details.md', 'evidence.json'] as const
export const LIFECYCLE_FINGERPRINT_SCHEME = 'specdev/lifecycle-fingerprint/1' as const
export const TYPED_FILE_KEY = { ...FILE_KEY, 'chart.json': 'descriptor', 'lifecycle.json': 'lifecycle' } as const
