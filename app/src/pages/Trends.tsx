import { MetricCard } from '../components/MetricCard'
import { METRICS, type MetricKey } from '../engine/config'
import type { Store } from '../engine/store'

export function Trends({
  store,
  onOpenMetric,
}: {
  store: Store
  onOpenMetric: (k: MetricKey) => void
}) {
  return (
    <div className="pb-28">
      <header className="px-5 pt-6">
        <h1 className="text-[26px] font-bold tracking-tight text-stone-900">趋势</h1>
        <p className="mt-1 text-[13px] text-stone-500">
          7 项监测指标 · 动态趋势比单次值更早揭示风险
        </p>
      </header>

      <div className="mx-5 mt-4 space-y-3">
        {METRICS.map((def) => (
          <MetricCard
            key={def.key}
            def={def}
            series={store.data.series[def.key]}
            onOpen={() => onOpenMetric(def.key)}
          />
        ))}
      </div>

      <p className="mx-5 mt-5 text-center text-[10px] text-stone-300">演示版本 · 虚拟患儿数据</p>
    </div>
  )
}
