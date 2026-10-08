// 今日待办：服药确认（激素剂量 + 减量窗口提示 + 生物制剂）

import { CheckCircle, Pill, Syringe } from '@phosphor-icons/react'
import { CHILD, type DailyLog } from '../data/seed'
import { todayISO } from '../lib/date'

export function MedicationTodo({
  todayLog,
  onToggle,
}: {
  todayLog: DailyLog | undefined
  onToggle: (done: boolean) => void
}) {
  const done = todayLog?.medDone ?? false
  const mg = todayLog?.steroidMg ?? CHILD.currentSteroidMg
  const today = todayISO()

  return (
    <section className="mx-5 mt-4 rounded-[20px] border border-stone-200 bg-white p-4 card-shadow">
      <div className="flex items-center justify-between">
        <h2 className="text-[15px] font-bold text-stone-900">今日待办</h2>
        <span className="text-[12px] text-stone-400">减量期 · 高危窗口</span>
      </div>

      <button
        type="button"
        onClick={() => onToggle(!done)}
        className="mt-3 flex w-full items-center gap-3 rounded-2xl bg-stone-50 p-3 text-left transition-colors active:bg-stone-100"
        aria-pressed={done}
      >
        <span
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${
            done ? 'bg-emerald-100 text-emerald-700' : 'bg-teal-50 text-teal-700'
          }`}
        >
          {done ? <CheckCircle size={24} weight="fill" /> : <Pill size={22} weight="duotone" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block text-[14px] font-semibold ${done ? 'text-stone-400 line-through' : 'text-stone-900'}`}>
            泼尼松 {mg} mg
          </span>
          <span className="block text-[12px] text-stone-500">
            {done ? '今日已确认服药' : '点击确认今日已服药'}
          </span>
        </span>
        <span
          className={`h-6 w-6 shrink-0 rounded-full border-2 transition-colors ${
            done ? 'border-emerald-600 bg-emerald-600' : 'border-stone-300 bg-white'
          }`}
        />
      </button>

      <div className="mt-2 flex items-center gap-3 rounded-2xl bg-stone-50 p-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-teal-50 text-teal-700">
          <Syringe size={22} weight="duotone" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-semibold text-stone-900">{CHILD.bioDrug}</span>
          <span className="block text-[12px] text-stone-500">每 2 周一针，下次 {nextBioDate(today)}</span>
        </span>
      </div>
    </section>
  )
}

function nextBioDate(today: string): string {
  const d = new Date(today + 'T12:00:00')
  d.setDate(d.getDate() + 6)
  return `${d.getMonth() + 1}月${d.getDate()}日`
}
