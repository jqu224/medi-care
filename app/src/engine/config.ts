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

/**
 * 预警档位：定性三档，不承诺触发次数。
 *
 * 需求方小 Q 反复纠结的是「度」——预警太早可能干扰诊断，等 8 条满足 5 条又太晚
 * （会议纪要 28:47）。档位是回答这个问题的最直接载体。
 *
 * MVP 设计定稿砍掉灵敏度滑杆，理由是「未经验证的预计警报频率」——
 * 砍掉频率预测是对的，但档位本身不该一起砍掉。因此这里只说明
 * 「什么样的变化会提醒」，绝不给出任何次数预估。
 */
export type SensitivityTier = 'conservative' | 'balanced' | 'cautious'

export const TIERS: { id: SensitivityTier; name: string; hint: string }[] = [
  { id: 'conservative', name: '保守', hint: '只有明显偏离标准范围才提醒' },
  { id: 'balanced', name: '平衡', hint: '按标准范围提醒，并额外关注明显变化' },
  { id: 'cautious', name: '谨慎', hint: '标准范围内明显向坏变化也会提醒' },
]

/** 档位因子。保守 = 阈值更高更难触发；谨慎 = 阈值更低更易触发。 */
export const TIER_FACTOR: Record<SensitivityTier, number> = {
  conservative: 0.85,
  balanced: 1,
  cautious: 1.15,
}

export const DEFAULT_TIER: SensitivityTier = 'balanced'

/**
 * 旧版连续 sensitivity（0.5–1.5）→ 档位的读兼容映射。
 * 只在读取历史数据时用，新写入一律记 tier。
 */
export function tierFromLegacySensitivity(s: number): SensitivityTier {
  if (s >= 1.08) return 'cautious'
  if (s <= 0.92) return 'conservative'
  return 'balanced'
}

export interface AlertSettings {
  /** 预警档位。新数据只写这个字段。 */
  tier: SensitivityTier
  /** 指标权重：1 低 / 2 中 / 3 高 */
  weights: Record<MetricKey, Weight>
  /** 核心指标分级：核心=true，一般=false */
  coreFlags: Record<MetricKey, boolean>
  /** 旧版连续灵敏度，仅为读历史数据保留；读入时会被折算成 tier */
  sensitivity?: number
}

export const DEFAULT_SETTINGS: AlertSettings = {
  tier: DEFAULT_TIER,
  weights: { temp: 3, ferritin: 3, platelet: 2, fibrinogen: 2, ast: 1, tg: 1, ldh: 1 },
  coreFlags: { temp: true, ferritin: true, platelet: true, fibrinogen: false, ast: false, tg: false, ldh: false },
}

/** 档位对应的缩放因子，供 effThreshold / effDays 使用 */
export function tierFactor(tier: SensitivityTier | undefined): number {
  return TIER_FACTOR[tier ?? DEFAULT_TIER]
}

/**
 * 把任意历史设置补全成当前结构：缺 tier 的用旧 sensitivity 折算。
 * 幂等——重复调用结果一致。
 */
export function normalizeSettings(raw: unknown): AlertSettings {
  const r = (raw ?? {}) as Partial<AlertSettings>
  const tier: SensitivityTier =
    r.tier && r.tier in TIER_FACTOR
      ? r.tier
      : typeof r.sensitivity === 'number' && Number.isFinite(r.sensitivity)
        ? tierFromLegacySensitivity(r.sensitivity)
        : DEFAULT_TIER
  return {
    tier,
    weights: { ...DEFAULT_SETTINGS.weights, ...(r.weights ?? {}) },
    coreFlags: { ...DEFAULT_SETTINGS.coreFlags, ...(r.coreFlags ?? {}) },
  }
}

/** 档位作用于阈值与天数：更灵敏 = 阈值更容易越过、所需天数更少 */
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
  reassure:
    '持续发热时炎症指标回落不等于好转，可能是病情变化的前兆，需要继续观察三系和铁蛋白',
  redFlag: '出血或意识改变需要马上就医评估',
}

export const DISCLAIMER = '本平台为辅助预警工具，不替代专业诊疗判断'

/** 问助手回答区的常驻免责。与 DISCLAIMER 并存：前者管 AI 回答，后者管整个平台。 */
export const AI_DISCLAIMER = 'AI 生成仅供参考，请谨遵医嘱'
