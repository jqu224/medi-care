import { useRef } from 'react'
import { GearSix, ShieldCheck } from '@phosphor-icons/react'
import { GreetingHeader } from '../components/GreetingHeader'
import { RiskHeroCard } from '../components/RiskHeroCard'
import { AlertCard } from '../components/AlertCard'
import { MedicationTodo } from '../components/MedicationTodo'
import { DISCLAIMER } from '../engine/config'
import type { Store } from '../engine/store'
import { todayISO } from '../lib/date'

export function Today({
  store,
  onOpenTrends,
  onOpenSettings,
}: {
  store: Store
  onOpenTrends: () => void
  onOpenSettings: () => void
}) {
  const { alerts, data, viewed, markViewed, unreadCount } = store
  const alertsRef = useRef<HTMLDivElement>(null)
  const todayLog = data.logs.find((l) => l.date === todayISO())

  return (
    <div className="pb-28">
      <GreetingHeader
        alerts={alerts}
        logs={data.logs}
        unread={unreadCount}
        onBell={() => alertsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
      />

      <RiskHeroCard alerts={alerts} tempSeries={data.series.temp} onOpenTrends={onOpenTrends} />

      {/* 预警区：S4 折叠进今日首屏 */}
      <div ref={alertsRef} className="mx-5 mt-6 scroll-mt-4">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-[17px] font-bold text-stone-900">
            预警
            {unreadCount > 0 && (
              <span className="rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-semibold text-white">
                {unreadCount} 条未读
              </span>
            )}
          </h2>
          <button
            type="button"
            onClick={onOpenSettings}
            aria-label="预警设置"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-500 transition-transform active:scale-95"
          >
            <GearSix size={18} />
          </button>
        </div>

        <div className="mt-3 space-y-3">
          {alerts.length === 0 ? (
            <div className="flex items-center gap-3 rounded-[20px] border border-stone-200 bg-white p-4 card-shadow">
              <ShieldCheck size={28} weight="duotone" className="text-emerald-600" />
              <div>
                <p className="text-[14px] font-semibold text-stone-900">目前没有触发的预警</p>
                <p className="text-[12px] text-stone-500">继续保持每日记录，趋势比单次值更重要</p>
              </div>
            </div>
          ) : (
            alerts.map((a) => (
              <AlertCard key={a.id} alert={a} isNew={!viewed.includes(a.id) && a.level !== 'watch'} onOpen={(id) => markViewed([id])} />
            ))
          )}
        </div>
      </div>

      <MedicationTodo
        todayLog={todayLog}
        onToggle={(done) => {
          store.addLog({
            date: todayISO(),
            temps: todayLog?.temps ?? [],
            symptoms: todayLog?.symptoms ?? [],
            steroidMg: todayLog?.steroidMg ?? 7.5,
            bio: todayLog?.bio ?? false,
            medDone: done,
          })
        }}
      />

      <footer className="mx-5 mt-6 space-y-1 text-center">
        <p className="text-[11px] leading-relaxed text-stone-400">{DISCLAIMER}</p>
        <p className="text-[10px] text-stone-300">演示版本 · 虚拟患儿数据</p>
      </footer>
    </div>
  )
}
