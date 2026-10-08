// 底部导航：今日 / 中央记录大按钮 / 趋势（参考图 05/07 的中心按钮骨架）

import { ChartLineUp, House, Plus } from '@phosphor-icons/react'

export type TabKey = 'today' | 'trends'

export function BottomNav({
  tab,
  onTab,
  onRecord,
}: {
  tab: TabKey
  onTab: (t: TabKey) => void
  onRecord: () => void
}) {
  return (
    <nav className="fixed bottom-0 left-1/2 z-40 w-full max-w-[430px] -translate-x-1/2 border-t border-stone-200/80 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <div className="relative grid grid-cols-2">
        <NavItem
          active={tab === 'today'}
          label="今日"
          onClick={() => onTab('today')}
        >
          <House size={24} weight={tab === 'today' ? 'fill' : 'regular'} />
        </NavItem>
        <NavItem
          active={tab === 'trends'}
          label="趋势"
          onClick={() => onTab('trends')}
        >
          <ChartLineUp size={24} weight={tab === 'trends' ? 'fill' : 'regular'} />
        </NavItem>

        <button
          type="button"
          onClick={onRecord}
          aria-label="快速记录"
          className="absolute left-1/2 top-0 flex h-14 w-14 -translate-x-1/2 -translate-y-1/3 items-center justify-center rounded-full bg-teal-700 text-white shadow-lg shadow-teal-700/30 transition-transform active:scale-90"
        >
          <Plus size={28} weight="bold" />
        </button>
      </div>
    </nav>
  )
}

function NavItem({
  active,
  label,
  onClick,
  children,
}: {
  active: boolean
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition-colors ${
        active ? 'text-teal-700' : 'text-stone-400'
      }`}
    >
      {children}
      {label}
    </button>
  )
}
