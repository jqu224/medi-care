// 警报卡：证据链五段式（什么值→越过什么线→持续多久→指南依据→建议动作）
// 不用彩色左边条（craft floor 拒绝项），用浅底+图标+级别 chip 表达分级

import { useState } from 'react'
import {
  BookOpen,
  CaretDown,
  ChartLine,
  Clock,
  Eye,
  FirstAidKit,
  Gauge,
  Warning,
  WarningOctagon,
} from '@phosphor-icons/react'
import type { Alert } from '../engine/alerts'

const TONE = {
  red: {
    bg: 'bg-red-50', border: 'border-red-200', title: 'text-red-900',
    chip: 'bg-red-600 text-white', Icon: WarningOctagon, chipLabel: '红色警报',
  },
  yellow: {
    bg: 'bg-amber-50', border: 'border-amber-200', title: 'text-amber-900',
    chip: 'bg-amber-500 text-white', Icon: Warning, chipLabel: '黄色预警',
  },
  watch: {
    bg: 'bg-white', border: 'border-stone-200', title: 'text-stone-800',
    chip: 'bg-stone-200 text-stone-600', Icon: Eye, chipLabel: '观察',
  },
} as const

const EVIDENCE_ROWS = [
  { key: 'what', label: '数值', Icon: Gauge },
  { key: 'line', label: '越线', Icon: ChartLine },
  { key: 'duration', label: '持续', Icon: Clock },
  { key: 'basis', label: '依据', Icon: BookOpen },
  { key: 'action', label: '建议', Icon: FirstAidKit },
] as const

export function AlertCard({
  alert,
  isNew,
  onOpen,
}: {
  alert: Alert
  isNew: boolean
  onOpen: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const t = TONE[alert.level]

  return (
    <article className={`rounded-[20px] border card-shadow ${t.bg} ${t.border}`}>
      <button
        type="button"
        className="block w-full p-4 text-left"
        onClick={() => {
          setOpen((v) => !v)
          onOpen(alert.id)
        }}
        aria-expanded={open}
      >
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${t.chip}`}>
            <t.Icon size={12} weight="fill" />
            {t.chipLabel}
          </span>
          {isNew && (
            <span className="rounded-full bg-stone-900 px-2 py-0.5 text-[10px] font-semibold text-white">
              新
            </span>
          )}
          <CaretDown
            size={16}
            className={`ml-auto text-stone-400 transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </div>
        <h3 className={`mt-2 text-[16px] font-bold leading-snug ${t.title}`}>{alert.title}</h3>
        <p className="mt-1 text-[13px] leading-relaxed text-stone-600">{alert.summary}</p>
      </button>

      {open && (
        <div className="border-t border-black/5 px-4 pb-4 pt-3">
          <dl className="space-y-3">
            {EVIDENCE_ROWS.map(({ key, label, Icon }) => (
              <div key={key} className="flex gap-2.5">
                <dt className="flex w-14 shrink-0 items-start gap-1 pt-px text-[12px] font-medium text-stone-500">
                  <Icon size={14} className="mt-px shrink-0" />
                  {label}
                </dt>
                <dd
                  className={`text-[13px] leading-relaxed ${
                    key === 'action' ? 'font-semibold text-stone-900' : 'text-stone-700'
                  }`}
                >
                  {alert.evidence[key]}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </article>
  )
}
