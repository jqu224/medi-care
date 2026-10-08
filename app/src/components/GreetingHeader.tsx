// Greeting 头：借参考图 07（Alex Johnson）唯一可取元素
// 结构 = 时段问候 + 称呼（小字）+ 一行状态副行（大字，产品语言）

import { BellRinging } from '@phosphor-icons/react'
import { CHILD } from '../data/seed'
import type { Alert } from '../engine/alerts'
import { feverStreak, type DailyLog } from '../data/seed'

function daypart(): string {
  const h = new Date().getHours()
  if (h < 5) return '夜深了'
  if (h < 11) return '早上好'
  if (h < 14) return '中午好'
  if (h < 18) return '下午好'
  return '晚上好'
}

function statusLine(alerts: Alert[], logs: DailyLog[]): string {
  const { days } = feverStreak(logs)
  const red = alerts.find((a) => a.level === 'red')
  if (red) return `${CHILD.name}需要尽快就医`
  if (days >= 3) return `${CHILD.name}已持续发热第 ${days} 天`
  const yellow = alerts.find((a) => a.level === 'yellow')
  if (yellow) return `${CHILD.name}有指标在变化`
  return `${CHILD.name}今天状态平稳`
}

export function GreetingHeader({
  alerts,
  logs,
  unread,
  onBell,
}: {
  alerts: Alert[]
  logs: DailyLog[]
  unread: number
  onBell: () => void
}) {
  return (
    <header className="flex items-start justify-between px-5 pt-6">
      <div>
        <p className="text-[14px] text-stone-500">
          {daypart()}，{CHILD.parentCall}
        </p>
        <h1 className="mt-1 text-[26px] font-bold leading-snug tracking-tight text-stone-900">
          {statusLine(alerts, logs)}
        </h1>
      </div>
      <button
        type="button"
        onClick={onBell}
        aria-label="查看预警"
        className="relative mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-600 transition-transform active:scale-95"
      >
        <BellRinging size={22} weight="duotone" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-semibold text-white">
            {unread}
          </span>
        )}
      </button>
    </header>
  )
}
