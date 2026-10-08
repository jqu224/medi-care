// 可解释预警规则引擎：纯前端、规则外置、证据链五段式输出
// 每条警报必须能展开「什么值→越过什么线→持续多久→指南依据→建议动作」

import {
  BASIS,
  METRIC_MAP,
  PRINTO_CLUSTER_KEYS,
  RED_FLAG_SYMPTOMS,
  SYMPTOMS,
  effDays,
  effThreshold,
  type AlertSettings,
  type MetricKey,
} from './config'
import { feverStreak, type SeedData } from '../data/seed'
import { fmtCN } from '../lib/date'

export type AlertLevel = 'red' | 'yellow' | 'watch'

export interface Evidence {
  what: string
  line: string
  duration: string
  basis: string
  action: string
}

export interface Alert {
  id: string
  level: AlertLevel
  title: string
  summary: string
  evidence: Evidence
  metricKeys: MetricKey[]
  weight: number
}

export interface EngineInput {
  data: SeedData
  settings: AlertSettings
}

function latest(data: SeedData, key: MetricKey) {
  const arr = data.series[key]
  return arr.length ? arr[arr.length - 1] : undefined
}

function overLine(key: MetricKey, value: number, s: number): boolean {
  const def = METRIC_MAP[key]
  if (def.threshold === undefined) return false
  const eff = effThreshold(def.threshold, s)
  return def.direction === 'high' ? value > eff : value < eff
}

function lineText(key: MetricKey, s: number): string {
  const def = METRIC_MAP[key]
  if (def.threshold === undefined) return def.refLabel
  const eff = effThreshold(def.threshold, s)
  const base = `${def.refLabel}`
  return s === 1 ? base : `${base}，灵敏度调整后 ${round1(eff)} ${def.unit}`
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

export function runEngine({ data, settings }: EngineInput): Alert[] {
  const s = settings.sensitivity
  const alerts: Alert[] = []
  const { days: feverDays, lastMax } = feverStreak(data.logs)

  const enabled = (k: MetricKey) => settings.weights[k] > 0
  const w = (k: MetricKey) => settings.weights[k]

  // R5/R6 红旗症状与高热：即时红色行动（不受分级开关影响）
  const todayLog = [...data.logs].sort((a, b) => a.date.localeCompare(b.date)).at(-1)
  if (todayLog) {
    const flags = todayLog.symptoms.filter((x) => (RED_FLAG_SYMPTOMS as string[]).includes(x))
    const maxT = Math.max(...todayLog.temps)
    if (maxT >= 40) {
      alerts.push({
        id: 'spike',
        level: 'red',
        title: '高热 ≥40℃，建议 24 小时内就医',
        summary: `${fmtCN(todayLog.date)}最高体温 ${maxT.toFixed(1)}℃`,
        evidence: {
          what: `${fmtCN(todayLog.date)}最高体温 ${maxT.toFixed(1)}℃`,
          line: '高热警戒线 40℃',
          duration: '本次记录',
          basis: BASIS.redFlag,
          action: '尽快前往最近的儿童医院或联系主治医生；带上近 14 天体温与用药记录',
        },
        metricKeys: ['temp'],
        weight: 99,
      })
    }
    if (flags.length > 0) {
      const names = flags.map((f) => SYMPTOMS.find((x) => x.id === f)?.label).join('、')
      alerts.push({
        id: 'redflag',
        level: 'red',
        title: `出现「${names}」，建议 24 小时内就医`,
        summary: `${fmtCN(todayLog.date)}记录症状：${names}`,
        evidence: {
          what: `症状：${names}`,
          line: '红旗症状，无需等待越线',
          duration: '本次记录',
          basis: BASIS.redFlag,
          action: '这些症状需要尽快就医（24 小时内），本平台不能替代医生判断',
        },
        metricKeys: [],
        weight: 99,
      })
    }
  }

  // R1 持续发热
  const feverYellowDays = effDays(3, s)
  const feverRedDays = effDays(7, s)
  if (enabled('temp') && feverDays >= feverYellowDays) {
    const red = feverDays >= feverRedDays
    alerts.push({
      id: 'fever',
      level: red ? 'red' : 'yellow',
      title: `持续发热第 ${feverDays} 天${red ? '，已达 HLH 发热时长' : ''}`,
      summary: `日最高温连续 ${feverDays} 天 ≥38.3℃，最近 ${lastMax.toFixed(1)}℃`,
      evidence: {
        what: `日最高体温连续 ≥38.3℃，最近一日 ${lastMax.toFixed(1)}℃`,
        line: `发热标准 38.3℃（s 调整后 ${round1(effThreshold(38.3, s))}℃）；${feverRedDays} 天为 HLH 时长线`,
        duration: `已连续 ${feverDays} 天`,
        basis: BASIS.fever,
        action: red
          ? '尽快联系主治医生，复查血象、铁蛋白与凝血功能'
          : '继续每日 2 次测温；若满 7 天或精神变差，提前复诊',
      },
      metricKeys: ['temp'],
      weight: w('temp') * 10 + feverDays,
    })
  }

  // R2 铁蛋白越线
  const fer = latest(data, 'ferritin')
  if (enabled('ferritin') && fer && overLine('ferritin', fer.value, s)) {
    const eff = effThreshold(684, s)
    const red = fer.value > eff * 2
    alerts.push({
      id: 'ferritin',
      level: red ? 'red' : 'yellow',
      title: `铁蛋白 ${fer.value.toFixed(0)} ng/mL，${red ? '已超过阈值 2 倍' : '越过 PRINTO 线'}`,
      summary: `${fmtCN(fer.date)}铁蛋白 ${fer.value.toFixed(0)}，线值 ${round1(eff)}`,
      evidence: {
        what: `铁蛋白 ${fer.value.toFixed(0)} ng/mL（${fmtCN(fer.date)}，${fer.source}）`,
        line: lineText('ferritin', s),
        duration: durationSince(data, 'ferritin', s),
        basis: BASIS.ferritin,
        action: '尽快复查铁蛋白与血象，把趋势图出示给主治医生',
      },
      metricKeys: ['ferritin'],
      weight: w('ferritin') * 10 + (red ? 5 : 0),
    })
  }

  // R3 PRINTO 簇：铁蛋白越线 + 伴随项 ≥2
  if (enabled('ferritin') && fer && overLine('ferritin', fer.value, s)) {
    const hit = PRINTO_CLUSTER_KEYS.filter((k) => {
      if (!enabled(k)) return false
      const p = latest(data, k)
      return p && overLine(k, p.value, s)
    })
    if (hit.length >= 2) {
      const names = hit.map((k) => METRIC_MAP[k].name).join('、')
      alerts.push({
        id: 'cluster',
        level: 'red',
        title: `PRINTO 组合条件触达：铁蛋白 + ${hit.length} 项异常`,
        summary: `铁蛋白越线，且${names}同时越线`,
        evidence: {
          what: `铁蛋白 ${fer.value.toFixed(0)} ng/mL；伴随异常：${names}`,
          line: hit.map((k) => lineText(k, s)).join('；'),
          duration: '以最近一次检验为准',
          basis: BASIS.cluster,
          action: '建议 24 到 48 小时内复诊，携带完整检验卡与趋势图',
        },
        metricKeys: ['ferritin', ...hit],
        weight: 90 + hit.length,
      })
    }
  }

  // R4 铁蛋白趋势陡升（动态预警的灵魂：单点评分看不到的）
  if (enabled('ferritin')) {
    const arr = data.series.ferritin
    if (arr.length >= 2) {
      const prev = arr[arr.length - 2]
      const last = arr[arr.length - 1]
      const spanDays = Math.max(1, daysBetween(prev.date, last.date))
      const weeklyGrowth = ((last.value - prev.value) / prev.value) * (7 / spanDays)
      const slopeLine = 0.5 / s // 灵敏度越高，触发斜率越低
      if (weeklyGrowth > slopeLine) {
        alerts.push({
          id: 'trend',
          level: 'yellow',
          title: '铁蛋白上升斜率陡增',
          summary: `${fmtCN(prev.date)}到${fmtCN(last.date)}：${prev.value.toFixed(0)} → ${last.value.toFixed(0)} ng/mL`,
          evidence: {
            what: `铁蛋白 ${prev.value.toFixed(0)} → ${last.value.toFixed(0)} ng/mL，折算周增幅 ${(weeklyGrowth * 100).toFixed(0)}%`,
            line: `趋势预警线：周增幅 ${(slopeLine * 100).toFixed(0)}%（单点静态评分无此项）`,
            duration: `跨 ${spanDays} 天`,
            basis: BASIS.trend,
            action: '加密复查频率至每周；下次门诊主动询问是否调整用药',
          },
          metricKeys: ['ferritin'],
          weight: w('ferritin') * 10 + 3,
        })
      }
    }
  }

  // R7 激素减量窗口观察
  const taperEvent = data.events.filter((e) => e.type === 'steroid').at(-1)
  if (taperEvent && todayLog) {
    const since = daysBetween(taperEvent.date, todayLog.date)
    const maxT = Math.max(...todayLog.temps)
    if (since >= 0 && since <= 14 && maxT >= 37.8) {
      alerts.push({
        id: 'taper',
        level: 'watch',
        title: '激素减量窗口期内出现发热',
        summary: `${taperEvent.label}后第 ${since} 天，体温 ${maxT.toFixed(1)}℃`,
        evidence: {
          what: `减量后第 ${since} 天，最高体温 ${maxT.toFixed(1)}℃`,
          line: '减量后 14 天为观察窗口',
          duration: `窗口第 ${since} 天，剩余 ${14 - since} 天`,
          basis: BASIS.taper,
          action: '维持每日 2 次记录；若发热持续 3 天以上，提前联系主治',
        },
        metricKeys: ['temp'],
        weight: 5,
      })
    }
  }

  // 分级与排序：一般指标的警报降级为 watch（可配置性的 UI 体现）
  const graded = alerts.map((a) => {
    const allCore = a.metricKeys.length === 0 || a.metricKeys.some((k) => settings.coreFlags[k])
    if (!allCore && a.level === 'yellow') return { ...a, level: 'watch' as AlertLevel }
    return a
  })
  return graded.sort((a, b) => levelRank(b.level) - levelRank(a.level) || b.weight - a.weight)
}

function levelRank(l: AlertLevel): number {
  return l === 'red' ? 3 : l === 'yellow' ? 2 : 1
}

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / 86400000)
}

function durationSince(data: SeedData, key: MetricKey, s: number): string {
  const arr = data.series[key]
  const over = arr.filter((p) => overLine(key, p.value, s))
  if (over.length === 0) return '本次首次越线'
  const first = over[0]
  const d = daysBetween(first.date, over[over.length - 1].date)
  return d === 0 ? '本次首次越线' : `自 ${fmtCN(first.date)} 起，约 ${d + 1} 天`
}

/** 灵敏度滑杆的实时频率预估：种子数据覆盖 30 天，当前活动警报数即本月触发次数 */
export function estimateMonthlyAlerts(data: SeedData, settings: AlertSettings): number {
  return runEngine({ data, settings }).filter((a) => a.level !== 'watch').length
}

/** 全局风险态：红 > 黄 > 观察 > 平稳 */
export function overallRisk(alerts: Alert[]): { level: 'red' | 'yellow' | 'watch' | 'calm'; label: string } {
  if (alerts.some((a) => a.level === 'red')) return { level: 'red', label: '需要尽快就医' }
  if (alerts.some((a) => a.level === 'yellow')) return { level: 'yellow', label: '需要密切观察' }
  if (alerts.some((a) => a.level === 'watch')) return { level: 'watch', label: '留意观察' }
  return { level: 'calm', label: '目前平稳' }
}
