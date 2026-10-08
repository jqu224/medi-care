// 虚拟患儿种子数据：小宇，7 岁，sJIA 确诊，激素减量期
// 30 天轨迹埋 MAS 前兆：铁蛋白缓升→陡升 + 血小板缓降 + 持续发热
// 全部为虚构演示数据，页面需标注"虚拟患儿数据"

import { addDaysISO, diffDays, mulberry32, todayISO } from '../lib/date'
import type { MetricKey, SymptomId } from '../engine/config'

export interface DataPoint {
  date: string
  value: number
  source: '机构报告' | '手录'
}

export interface DailyLog {
  date: string
  temps: number[]
  symptoms: SymptomId[]
  steroidMg: number
  bio: boolean
  medDone: boolean
}

export interface MedEvent {
  date: string
  type: 'fever' | 'steroid' | 'hospital' | 'visit'
  label: string
}

export interface ChildProfile {
  name: string
  age: number
  parentCall: string
  diagnosis: string
  diagnosisDate: string
  currentSteroidMg: number
  bioDrug: string
}

export const CHILD: ChildProfile = {
  name: '小宇',
  age: 7,
  parentCall: '小宇妈妈',
  diagnosis: '全身型幼年特发性关节炎（sJIA）',
  diagnosisDate: '2025-03-18',
  currentSteroidMg: 7.5,
  bioDrug: '托珠单抗',
}

export interface SeedData {
  series: Record<MetricKey, DataPoint[]>
  logs: DailyLog[]
  events: MedEvent[]
}

const rnd = mulberry32(20261007)

function jitter(amp: number): number {
  return (rnd() - 0.5) * 2 * amp
}

function buildSeed(): SeedData {
  const today = todayISO()
  const days = Array.from({ length: 31 }, (_, i) => addDaysISO(today, i - 30))

  // ── 每日记录：体温早晚两次 + 用药 ─────────────────────────
  const logs: DailyLog[] = []
  for (const date of days) {
    const d = diffDays(date, today) // 0 = 今天
    if (d === 0) continue // 今天留给演示现场录入
    let hi: number
    let lo: number
    let symptoms: SymptomId[] = []
    let steroid = 10
    if (d >= 12) steroid = 10
    else steroid = 7.5 // D-12 起减量

    if (d >= 10) {
      // 平稳期
      hi = 36.8 + jitter(0.2)
      lo = 36.5 + jitter(0.15)
    } else if (d >= 7) {
      // 低热爬升
      hi = 37.4 + (10 - d) * 0.25 + jitter(0.1)
      lo = 37.0 + jitter(0.1)
      symptoms = d === 8 ? ['fatigue'] : []
    } else if (d >= 1) {
      // 持续发热（D-6 发热开始事件）
      hi = Math.min(39.1, 38.3 + (6 - d) * 0.15 + jitter(0.25))
      lo = 37.6 + jitter(0.2)
      symptoms = ['rash', 'fatigue']
      if (d <= 3) symptoms = ['rash', 'joint', 'fatigue', 'appetite']
    } else {
      hi = 36.9
      lo = 36.6
    }
    logs.push({
      date,
      temps: [round1(lo), round1(hi)],
      symptoms,
      steroidMg: steroid,
      bio: d % 14 === 0,
      medDone: d !== 0,
    })
  }

  // ── 检验卡（门诊后手录，机构来源徽标）────────────────────
  type LabVals = Omit<Record<MetricKey, number>, 'temp'>

  const labCards: { date: string; vals: LabVals }[] = [
    { date: addDaysISO(today, -28), vals: { ferritin: 320, platelet: 210, fibrinogen: 4.1, ast: 28, tg: 120, ldh: 320 } },
    { date: addDaysISO(today, -14), vals: { ferritin: 430, platelet: 205, fibrinogen: 3.9, ast: 33, tg: 131, ldh: 385 } },
    { date: addDaysISO(today, -4), vals: { ferritin: 980, platelet: 185, fibrinogen: 3.5, ast: 46, tg: 148, ldh: 520 } },
    { date: addDaysISO(today, -1), vals: { ferritin: 1650, platelet: 172, fibrinogen: 3.3, ast: 58, tg: 152, ldh: 640 } },
  ]

  const series: Record<MetricKey, DataPoint[]> = {
    temp: logs.map((l) => ({ date: l.date, value: Math.max(...l.temps), source: '手录' as const })),
    ferritin: [],
    platelet: [],
    fibrinogen: [],
    ast: [],
    tg: [],
    ldh: [],
  }
  for (const card of labCards) {
    ;(Object.keys(card.vals) as MetricKey[]).forEach((k) => {
      series[k].push({ date: card.date, value: card.vals[k as keyof typeof card.vals], source: '机构报告' })
    })
  }

  // ── 事件轴 ────────────────────────────────────────────────
  const events: MedEvent[] = [
    { date: addDaysISO(today, -12), type: 'steroid', label: '激素减量 10 → 7.5mg' },
    { date: addDaysISO(today, -6), type: 'fever', label: '发热开始' },
    { date: addDaysISO(today, -4), type: 'hospital', label: '急诊验血' },
    { date: addDaysISO(today, -1), type: 'visit', label: '风湿科复诊' },
  ]

  return { series, logs, events }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

export const SEED: SeedData = buildSeed()

/** 持续发热天数（截至最新记录，含今天若已录入）：日最高温 ≥38.3 的连续天数 */
export function feverStreak(logs: DailyLog[]): { days: number; lastMax: number } {
  const sorted = [...logs].sort((a, b) => a.date.localeCompare(b.date))
  let days = 0
  let lastMax = 0
  for (let i = sorted.length - 1; i >= 0; i--) {
    const m = Math.max(...sorted[i].temps)
    if (i === sorted.length - 1) lastMax = m
    if (m >= 38.3) days++
    else break
  }
  return { days, lastMax }
}
