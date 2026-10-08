// 演示版数据仓库：种子数据 + localStorage 用户增量（日志/检验值/设置/已读）

import { useCallback, useMemo, useState } from 'react'
import { SEED, type DailyLog, type DataPoint, type SeedData } from '../data/seed'
import { DEFAULT_SETTINGS, normalizeSettings, type AlertSettings, type MetricKey } from '../engine/config'
import { runEngine, type Alert } from '../engine/alerts'

const K_LOGS = 'sjia:user-logs:v1'
const K_LABS = 'sjia:user-labs:v1'
const K_SETTINGS = 'sjia:settings:v1'
const K_VIEWED = 'sjia:viewed:v1'

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* 演示环境忽略写入失败 */
  }
}

export interface UserLab {
  key: MetricKey
  point: DataPoint
}

/**
 * 从存储里读回预警设置，永远返回当前结构的完整对象。
 *
 * 这是档位迁移真正落地的地方：旧版写进去的是连续 `sensitivity`，
 * 也可能是被截断的残缺对象。runEngine 用 `settings.weights[k] > 0` 判断
 * 指标是否启用，遇到 undefined 会判 false——等于把这个指标的预警静默关掉，
 * 家属只会看到「怎么不提醒了」而查不出原因。
 *
 * 抽成导出的纯函数，是为了能脱离 React 与 localStorage 单测这条读档路径。
 */
export function readPersistedSettings(raw: string | null): AlertSettings {
  let parsed: unknown = DEFAULT_SETTINGS
  if (raw) {
    try {
      parsed = JSON.parse(raw)
    } catch {
      parsed = DEFAULT_SETTINGS
    }
  }
  return normalizeSettings(parsed)
}

export function useStore() {
  const [userLogs, setUserLogs] = useState<DailyLog[]>(() => load(K_LOGS, []))
  const [userLabs, setUserLabs] = useState<UserLab[]>(() => load(K_LABS, []))
  const [settings, setSettingsState] = useState<AlertSettings>(() =>
    readPersistedSettings(load(K_SETTINGS, null)),
  )
  const [viewed, setViewed] = useState<string[]>(() => load(K_VIEWED, []))

  const data: SeedData = useMemo(() => {
    // 合并：种子 + 用户新增日志（同日覆盖种子），检验值按日期排序
    const logMap = new Map<string, DailyLog>()
    for (const l of SEED.logs) logMap.set(l.date, l)
    for (const l of userLogs) logMap.set(l.date, l)
    const logs = [...logMap.values()].sort((a, b) => a.date.localeCompare(b.date))

    const series = { ...SEED.series }
    for (const k of Object.keys(series) as MetricKey[]) {
      const extra = userLabs.filter((u) => u.key === k).map((u) => u.point)
      series[k] = [...SEED.series[k], ...extra].sort((a, b) => a.date.localeCompare(b.date))
    }
    // 体温序列跟随日志（日最高温；跳过无测温的用药确认日志）
    series.temp = logs
      .filter((l) => l.temps.length > 0)
      .map((l) => ({ date: l.date, value: Math.max(...l.temps), source: '手录' as const }))
    return { series, logs, events: SEED.events }
  }, [userLogs, userLabs])

  const alerts: Alert[] = useMemo(() => runEngine({ data, settings }), [data, settings])

  const addLog = useCallback((log: DailyLog) => {
    setUserLogs((prev) => {
      const next = [...prev.filter((l) => l.date !== log.date), log]
      save(K_LOGS, next)
      return next
    })
  }, [])

  const addLab = useCallback((key: MetricKey, point: DataPoint) => {
    setUserLabs((prev) => {
      const next = [...prev, { key, point }]
      save(K_LABS, next)
      return next
    })
  }, [])

  const setSettings = useCallback((next: AlertSettings) => {
    setSettingsState(next)
    save(K_SETTINGS, next)
  }, [])

  const markViewed = useCallback((ids: string[]) => {
    setViewed((prev) => {
      const next = [...new Set([...prev, ...ids])]
      save(K_VIEWED, next)
      return next
    })
  }, [])

  const resetDemo = useCallback(() => {
    ;[K_LOGS, K_LABS, K_SETTINGS, K_VIEWED].forEach((k) => localStorage.removeItem(k))
    setUserLogs([])
    setUserLabs([])
    setSettingsState(DEFAULT_SETTINGS)
    setViewed([])
  }, [])

  const unreadCount = alerts.filter((a) => a.level !== 'watch' && !viewed.includes(a.id)).length

  return { data, alerts, settings, setSettings, addLog, addLab, viewed, markViewed, unreadCount, resetDemo }
}

export type Store = ReturnType<typeof useStore>
