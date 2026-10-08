// 风险 hero 卡：全局风险态 + 核心原因一句话 + 最近体温 mini 曲线
// 红色只在此卡与行动卡出现（红色配给制）

import { Line, LineChart, ResponsiveContainer, YAxis } from 'recharts'
import { CaretRight, ShieldCheck, Warning, WarningOctagon, Eye } from '@phosphor-icons/react'
import type { Alert } from '../engine/alerts'
import { overallRisk } from '../engine/alerts'
import type { DataPoint } from '../data/seed'
import { fmtShort } from '../lib/date'

const TONE = {
  calm: {
    bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-800',
    chip: 'bg-emerald-600', Icon: ShieldCheck, chipLabel: '平稳',
  },
  watch: {
    bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-900',
    chip: 'bg-amber-500', Icon: Eye, chipLabel: '观察',
  },
  yellow: {
    bg: 'bg-amber-50', border: 'border-amber-300', text: 'text-amber-900',
    chip: 'bg-amber-500', Icon: Warning, chipLabel: '预警',
  },
  red: {
    bg: 'bg-red-50', border: 'border-red-300', text: 'text-red-900',
    chip: 'bg-red-600', Icon: WarningOctagon, chipLabel: '警报',
  },
} as const

export function RiskHeroCard({
  alerts,
  tempSeries,
  onOpenTrends,
}: {
  alerts: Alert[]
  tempSeries: DataPoint[]
  onOpenTrends: () => void
}) {
  const risk = overallRisk(alerts)
  const t = TONE[risk.level]
  const top = alerts[0]
  const recent = tempSeries.slice(-14).map((p) => ({ d: fmtShort(p.date), v: p.value }))
  const lastTemp = tempSeries.at(-1)?.value

  return (
    <button
      type="button"
      onClick={onOpenTrends}
      className={`mx-5 mt-5 block w-[calc(100%-2.5rem)] rounded-[20px] border p-5 text-left card-shadow transition-transform active:scale-[0.99] ${t.bg} ${t.border}`}
    >
      <div className="flex items-center justify-between">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-semibold text-white ${t.chip}`}>
          <t.Icon size={14} weight="fill" />
          {t.chipLabel}
        </span>
        <span className="inline-flex items-center gap-0.5 text-[13px] font-medium text-stone-500">
          查看趋势
          <CaretRight size={14} />
        </span>
      </div>

      <p className={`mt-3 text-[22px] font-bold leading-snug ${t.text}`}>{risk.label}</p>
      <p className="mt-1 text-[14px] leading-relaxed text-stone-600">
        {top ? top.summary : '最近 14 天体温与指标均在参考区间内'}
      </p>

      <div className="mt-4 flex items-end justify-between gap-3">
        <div>
          <p className="text-[12px] text-stone-500">最近体温</p>
          <p className="tnum text-[32px] font-bold leading-none text-stone-900">
            {lastTemp !== undefined ? lastTemp.toFixed(1) : '--'}
            <span className="ml-0.5 text-[15px] font-medium text-stone-500">℃</span>
          </p>
        </div>
        <div className="h-14 w-40">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={recent} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
              <YAxis hide domain={[36, 'dataMax + 0.3']} />
              <Line
                type="monotone"
                dataKey="v"
                stroke="#0F766E"
                strokeWidth={2.5}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </button>
  )
}
