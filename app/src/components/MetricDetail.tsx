// 指标 drill-in：全期折线 + 阈值参考线 + 正常区间带 + 事件标记 + 手录入口
// MAS 的故事是「时间轴上的追逐」，事件标记承载这个叙事

import { useMemo, useState } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  ArrowLeft,
  Flask,
  Flame,
  Hospital,
  Pill,
  Plus,
  Stethoscope,
} from '@phosphor-icons/react'
import type { MetricDef } from '../engine/config'
import type { DataPoint, MedEvent } from '../data/seed'
import { diffDays, fmtCN, fmtShort, todayISO } from '../lib/date'
import { fmtVal } from '../lib/format'

const EVENT_STYLE: Record<MedEvent['type'], { color: string; Icon: typeof Flame }> = {
  fever: { color: '#DC2626', Icon: Flame },
  steroid: { color: '#0F766E', Icon: Pill },
  hospital: { color: '#D97706', Icon: Hospital },
  visit: { color: '#57534E', Icon: Stethoscope },
}

interface Row {
  d: string
  full: string
  value: number
  events: MedEvent[]
  source: string
}

export function MetricDetail({
  def,
  series,
  events,
  onClose,
  onAdd,
}: {
  def: MetricDef
  series: DataPoint[]
  events: MedEvent[]
  onClose: () => void
  onAdd: (value: number, date: string) => void
}) {
  const [adding, setAdding] = useState(false)
  const [val, setVal] = useState('')
  const [date, setDate] = useState(todayISO())
  const [saved, setSaved] = useState(false)

  const rows: Row[] = useMemo(() => {
    // 事件吸附到最近的数据点（检验序列稀疏，事件按日期就近落位）
    const snapped = new Map<string, MedEvent[]>()
    for (const e of events) {
      let best: { date: string; dist: number } | null = null
      for (const p of series) {
        const dist = Math.abs(diffDays(p.date, e.date))
        if (!best || dist < best.dist) best = { date: p.date, dist }
      }
      if (best && best.dist <= 4) {
        const arr = snapped.get(best.date) ?? []
        arr.push(e)
        snapped.set(best.date, arr)
      }
    }
    return series.map((p) => ({
      d: fmtShort(p.date),
      full: p.date,
      value: p.value,
      events: snapped.get(p.date) ?? [],
      source: p.source,
    }))
  }, [series, events])

  const last = series.at(-1)
  const over =
    last && def.threshold !== undefined
      ? def.direction === 'high'
        ? last.value > def.threshold
        : last.value < def.threshold
      : false

  const yMin = Math.min(...series.map((p) => p.value), def.threshold ?? Infinity)
  const yMax = Math.max(...series.map((p) => p.value), def.threshold ?? -Infinity)
  const pad = (yMax - yMin) * 0.15 || 1

  const submit = () => {
    const v = Number(val)
    if (!Number.isFinite(v) || v <= 0 || !date) return
    onAdd(v, date)
    setSaved(true)
    setVal('')
    setTimeout(() => {
      setSaved(false)
      setAdding(false)
    }, 1200)
  }

  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-[#FBF8F3]">
      <header className="flex items-center gap-3 border-b border-stone-200/70 px-4 py-3.5">
        <button
          type="button"
          onClick={onClose}
          aria-label="返回趋势"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-600 transition-transform active:scale-95"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="min-w-0">
          <h2 className="text-[17px] font-bold text-stone-900">{def.name}</h2>
          <p className="truncate text-[12px] text-stone-500">{def.refLabel}</p>
        </div>
        {last && (
          <p className={`tnum ml-auto text-right leading-none ${over ? 'text-amber-700' : 'text-stone-900'}`}>
            <span className="text-[26px] font-bold">{fmtVal(last.value, def.decimals)}</span>
            <span className="ml-0.5 text-[12px] font-medium text-stone-500">{def.unit}</span>
          </p>
        )}
      </header>

      <div className="flex-1 overflow-y-auto px-5 pb-8 pt-4">
        {/* 全期图 */}
        <section className="rounded-[20px] border border-stone-200 bg-white p-4 card-shadow">
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
                <CartesianGrid vertical={false} stroke="#F0EBE2" />
                <XAxis
                  dataKey="d"
                  tick={{ fontSize: 11, fill: '#78716C' }}
                  tickLine={false}
                  axisLine={{ stroke: '#E7E0D5' }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#78716C' }}
                  tickLine={false}
                  axisLine={false}
                  domain={niceDomain(yMin - pad, yMax + pad)}
                  tickCount={5}
                  width={52}
                  tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 100) / 10}k` : String(Math.round(v * 10) / 10))}
                />
                <Tooltip content={<ChartTip def={def} />} />
                {def.threshold !== undefined && (
                  <ReferenceArea
                    y1={def.direction === 'high' ? yMin - pad : def.threshold}
                    y2={def.direction === 'high' ? def.threshold : yMax + pad}
                    fill="#16A34A"
                    fillOpacity={0.06}
                  />
                )}
                {def.threshold !== undefined && (
                  <ReferenceLine
                    y={def.threshold}
                    stroke="#D97706"
                    strokeDasharray="5 4"
                    strokeWidth={1.5}
                    label={{
                      value: `${def.threshold} ${def.unit}`,
                      position: def.direction === 'high' ? 'insideTopRight' : 'insideBottomRight',
                      fontSize: 10,
                      fill: '#B45309',
                    }}
                  />
                )}
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#0F766E"
                  strokeWidth={2.5}
                  isAnimationActive={false}
                  dot={<EventDot />}
                  activeDot={{ r: 5, fill: '#0F766E' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* 事件轴 */}
        <section className="mt-4 rounded-[20px] border border-stone-200 bg-white p-4 card-shadow">
          <h3 className="text-[14px] font-bold text-stone-900">事件标记</h3>
          <ul className="mt-3 space-y-2.5">
            {events.map((e, i) => {
              const st = EVENT_STYLE[e.type]
              return (
                <li key={i} className="flex items-center gap-2.5 text-[13px]">
                  <span
                    className="flex h-7 w-7 items-center justify-center rounded-full"
                    style={{ backgroundColor: st.color + '1A', color: st.color }}
                  >
                    <st.Icon size={15} weight="fill" />
                  </span>
                  <span className="text-stone-500">{fmtCN(e.date)}</span>
                  <span className="font-medium text-stone-800">{e.label}</span>
                </li>
              )
            })}
          </ul>
        </section>

        {/* 手录检验值 */}
        <section className="mt-4 rounded-[20px] border border-stone-200 bg-white p-4 card-shadow">
          {!adding ? (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="flex w-full items-center justify-center gap-2 rounded-full border border-dashed border-teal-600/40 py-3 text-[14px] font-semibold text-teal-700 transition-colors active:bg-teal-50"
            >
              <Plus size={16} weight="bold" />
              录入新的{def.name}数值
            </button>
          ) : (
            <div>
              <div className="flex items-center gap-2">
                <Flask size={18} className="text-teal-700" />
                <h3 className="text-[14px] font-bold text-stone-900">录入{def.name}</h3>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="text-[12px] text-stone-500">数值（{def.unit}）</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={val}
                    onChange={(e) => setVal(e.target.value)}
                    placeholder={def.threshold !== undefined ? String(def.threshold) : '0'}
                    className="tnum mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-[16px] outline-none focus:border-teal-600"
                  />
                </label>
                <label className="block">
                  <span className="text-[12px] text-stone-500">检验日期</span>
                  <input
                    type="date"
                    value={date}
                    max={todayISO()}
                    onChange={(e) => setDate(e.target.value)}
                    className="tnum mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-[15px] outline-none focus:border-teal-600"
                  />
                </label>
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setAdding(false)}
                  className="flex-1 rounded-full border border-stone-300 py-2.5 text-[14px] font-semibold text-stone-600 active:bg-stone-50"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={submit}
                  className="flex-1 rounded-full bg-teal-700 py-2.5 text-[14px] font-semibold text-white transition-transform active:scale-[0.98]"
                >
                  {saved ? '已保存' : '保存'}
                </button>
              </div>
              <p className="mt-2 text-[11px] text-stone-400">来源将标记为「手录」，趋势图即时更新</p>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function niceDomain(lo: number, hi: number): [number, number] {
  const span = hi - lo || 1
  const step = span > 500 ? 100 : span > 100 ? 50 : span > 10 ? 5 : span > 2 ? 0.5 : 0.1
  return [Math.floor(lo / step) * step, Math.ceil(hi / step) * step]
}

function EventDot(props: { cx?: number; cy?: number; payload?: { events?: MedEvent[] } }) {
  const { cx, cy, payload } = props
  if (cx === undefined || cy === undefined) return <g />
  const ev: MedEvent | undefined = payload?.events?.[0]
  if (ev) {
    const color = EVENT_STYLE[ev.type].color
    return (
      <g>
        <circle cx={cx} cy={cy} r={7} fill="none" stroke={color} strokeWidth={2} />
        <circle cx={cx} cy={cy} r={3} fill={color} />
      </g>
    )
  }
  return <circle cx={cx} cy={cy} r={2.5} fill="#0F766E" />
}

function ChartTip({ active, payload, def }: { active?: boolean; payload?: { payload?: Row }[]; def: MetricDef }) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload as Row
  return (
    <div className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-[12px] shadow-lg">
      <p className="tnum font-bold text-stone-900">
        {fmtVal(row.value, def.decimals)} {def.unit}
      </p>
      <p className="text-stone-500">
        {fmtCN(row.full)} · {row.source}
      </p>
      {row.events.map((e, i) => (
        <p key={i} className="mt-0.5 font-medium" style={{ color: EVENT_STYLE[e.type].color }}>
          {e.label}
        </p>
      ))}
    </div>
  )
}
