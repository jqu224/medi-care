// 预警引擎外置配置：指标定义、阈值、默认设置
// 临床口径对齐官方 PRD（2016 PRINTO/ACR/EULAR、2004 HLH、2023 EULAR/PReS）

export type MetricKey =
  | 'temp'
  | 'ferritin'
  | 'platelet'
  | 'fibrinogen'
  | 'ast'
  | 'tg'
  | 'ldh'

export interface MetricDef {
  key: MetricKey
  name: string
  short: string
  unit: string
  threshold?: number
  direction: 'high' | 'low'
  decimals: number
  core: boolean
  refLabel: string
}

export const METRICS: MetricDef[] = [
  { key: 'temp', name: '体温', short: '体温', unit: '℃', threshold: 37.3, direction: 'high', decimals: 1, core: true, refLabel: '发热参考线 37.3℃' },
  { key: 'ferritin', name: '铁蛋白', short: '铁蛋白', unit: 'ng/mL', threshold: 684, direction: 'high', decimals: 0, core: true, refLabel: '观察线 684 ng/mL' },
  { key: 'platelet', name: '血小板', short: '血小板', unit: '×10⁹/L', threshold: 181, direction: 'low', decimals: 0, core: true, refLabel: '观察线 181 ×10⁹/L' },
  { key: 'fibrinogen', name: '纤维蛋白原', short: '纤维蛋白原', unit: 'g/L', threshold: 3.6, direction: 'low', decimals: 1, core: false, refLabel: '观察线 3.6 g/L' },
  { key: 'ast', name: '谷草转氨酶', short: 'AST', unit: 'U/L', threshold: 48, direction: 'high', decimals: 0, core: false, refLabel: '观察线 48 U/L' },
  { key: 'tg', name: '甘油三酯', short: '甘油三酯', unit: 'mg/dL', threshold: 156, direction: 'high', decimals: 0, core: false, refLabel: '观察线 156 mg/dL' },
  { key: 'ldh', name: '乳酸脱氢酶', short: 'LDH', unit: 'U/L', direction: 'high', decimals: 0, core: false, refLabel: '监测项，无固定阈值' },
]

export const METRIC_MAP: Record<MetricKey, MetricDef> = Object.fromEntries(
  METRICS.map((m) => [m.key, m]),
) as Record<MetricKey, MetricDef>

export type Weight = 1 | 2 | 3

export interface AlertSettings {
  /** 灵敏度 0.5（迟钝）到 1.5（灵敏），默认 1.0 */
  sensitivity: number
  /** 指标权重：1 低 / 2 中 / 3 高 */
  weights: Record<MetricKey, Weight>
  /** 核心指标分级：核心=true，一般=false */
  coreFlags: Record<MetricKey, boolean>
}

export const DEFAULT_SETTINGS: AlertSettings = {
  sensitivity: 1.0,
  weights: { temp: 3, ferritin: 3, platelet: 2, fibrinogen: 2, ast: 1, tg: 1, ldh: 1 },
  coreFlags: { temp: true, ferritin: true, platelet: true, fibrinogen: false, ast: false, tg: false, ldh: false },
}

/** 灵敏度作用于阈值与天数：更灵敏 = 阈值更容易越过、所需天数更少 */
export function effThreshold(base: number, s: number): number {
  return base * (1 - 0.3 * (s - 1))
}
export function effDays(baseDays: number, s: number): number {
  return Math.max(1, Math.round(baseDays / s))
}

/** PRINTO 2016 伴随项（铁蛋白 + 任意 2 条即满足簇规则） */
export const PRINTO_CLUSTER_KEYS: MetricKey[] = ['platelet', 'ast', 'tg', 'fibrinogen']

export const SYMPTOMS = [
  { id: 'rash', label: '皮疹' },
  { id: 'joint', label: '关节肿痛' },
  { id: 'throat', label: '咽痛' },
  { id: 'fatigue', label: '精神差' },
  { id: 'appetite', label: '食欲差' },
  { id: 'bleeding', label: '出血点瘀斑', redFlag: true },
  { id: 'cns', label: '抽搐意识改变', redFlag: true },
] as const

export type SymptomId = (typeof SYMPTOMS)[number]['id']

export const RED_FLAG_SYMPTOMS: SymptomId[] = ['bleeding', 'cns']

/** 指南依据文案（警报卡第五段用） */
export const BASIS = {
  fever: '连续发热是需要最早留意的变化；满 7 天要特别注意',
  ferritin: '铁蛋白高于 684 ng/mL 时需要留意',
  cluster: '铁蛋白高于 684，并且血小板、谷草转氨酶、甘油三酯、纤维蛋白原里至少还有两项过线',
  trend: '和上次相比明显变差时，要比只看一次结果更早留意',
  taper: '激素减量后的两周需要更密地记录',
  redFlag: '出血或意识改变需要马上就医评估',
}

export const DISCLAIMER = '本平台为辅助预警工具，不替代专业诊疗判断'
