import { fmtVal } from '../lib/format'
// 指标大卡：指标名 + 大数字最新值 + 阈值徽标 + 迷你曲线（参考图 03 语言）
// 越线用琥珀色表达，红色配给给预警卡（红色配给制）

import { Line, LineChart, ResponsiveContainer, YAxis } from 'recharts'
import { CaretRight } from '@phosphor-icons/react'
import type { MetricDef } from '../engine/config'
import type { DataPoint } from '../data/seed'
import { fmtShort } from '../lib/date'

export function MetricCard({
  def,
  series,
  onOpen,
}: {
  def: MetricDef
  series: DataPoint[]
  onOpen: () => void
}) {
  const last = series.at(-1)
  const over =
    last !== undefined && def.threshold !== undefined
      ? def.direction === 'high'
        ? last.value > def.threshold
        : last.value < def.threshold
      : false
  const data = series.slice(-14).map((p) => ({ d: fmtShort(p.date), v: p.value }))

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-4 rounded-[20px] border border-stone-200 bg-white p-4 text-left card-shadow transition-transform active:scale-[0.99]"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-[14px] font-semibold text-stone-700">{def.name}</p>
          {over && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
              越过观察线
            </span>
          )}
        </div>
        <p className="tnum mt-1.5 leading-none">
          <span className={`text-[30px] font-bold ${over ? 'text-amber-700' : 'text-stone-900'}`}>
            {last ? fmtVal(last.value, def.decimals) : '--'}
          </span>
          <span className="ml-1 text-[13px] font-medium text-stone-500">{def.unit}</span>
        </p>
        <p className="mt-1.5 truncate text-[11px] text-stone-400">
          {def.refLabel}
          {last ? ` · ${last.source}` : ''}
        </p>
      </div>
      <div className="h-12 w-24 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
            <YAxis hide domain={['dataMin', 'dataMax']} />
            <Line
              type="monotone"
              dataKey="v"
              stroke={over ? '#D97706' : '#0F766E'}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <CaretRight size={16} className="shrink-0 text-stone-300" />
    </button>
  )
}

