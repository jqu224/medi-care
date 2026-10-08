// 预警设置 sheet：官方 PRD 三可配置硬要求的 UI 落点
// 灵敏度滑杆（实时频率预估）+ 指标权重 + 核心/一般分级

import { ArrowCounterClockwise, Sliders } from '@phosphor-icons/react'
import { Drawer, DrawerContent, DrawerTitle } from './ui/drawer'
import { Slider } from './ui/slider'
import { Switch } from './ui/switch'
import { METRICS, type AlertSettings, type MetricKey, type Weight } from '../engine/config'
import { estimateMonthlyAlerts } from '../engine/alerts'
import type { SeedData } from '../data/seed'

const WEIGHT_LABEL: Record<Weight, string> = { 1: '低', 2: '中', 3: '高' }

export function AlertSettingsSheet({
  open,
  onClose,
  settings,
  onChange,
  data,
  onResetDemo,
}: {
  open: boolean
  onClose: () => void
  settings: AlertSettings
  onChange: (s: AlertSettings) => void
  data: SeedData
  onResetDemo: () => void
}) {
  const monthly = estimateMonthlyAlerts(data, settings)
  const setWeight = (k: MetricKey, w: Weight) =>
    onChange({ ...settings, weights: { ...settings.weights, [k]: w } })
  const setCore = (k: MetricKey, core: boolean) =>
    onChange({ ...settings, coreFlags: { ...settings.coreFlags, [k]: core } })

  return (
    <Drawer open={open} onOpenChange={(v) => !v && onClose()}>
      <DrawerContent className="mx-auto max-w-[430px] rounded-t-[24px] border-stone-200 bg-[#FBF8F3] px-5 pb-6">
        <DrawerTitle className="sr-only">预警设置</DrawerTitle>
        <div className="max-h-[82dvh] overflow-y-auto no-scrollbar">
          <div className="flex items-center gap-2 pt-2">
            <Sliders size={20} weight="duotone" className="text-teal-700" />
            <h3 className="text-[17px] font-bold text-stone-900">预警设置</h3>
          </div>

          {/* 灵敏度 */}
          <section className="mt-4 rounded-[20px] border border-stone-200 bg-white p-4">
            <div className="flex items-baseline justify-between">
              <h4 className="text-[14px] font-bold text-stone-900">预警灵敏度</h4>
              <span className="text-[12px] font-medium text-teal-700">
                {sensLabel(settings.sensitivity)}
              </span>
            </div>
            <div className="mt-3 px-1">
              <Slider
                value={[settings.sensitivity]}
                onValueChange={([v]) => onChange({ ...settings, sensitivity: Math.round(v * 10) / 10 })}
                min={0.5}
                max={1.5}
                step={0.1}
                aria-label="预警灵敏度"
              />
              <div className="mt-1 flex justify-between text-[11px] text-stone-400">
                <span>保守</span>
                <span>标准</span>
                <span>灵敏</span>
              </div>
            </div>
            <p className="tnum mt-3 rounded-xl bg-teal-50 px-3 py-2 text-[13px] text-teal-900">
              按当前孩子的历史数据回放，预计警报频率：约 <b>{monthly}</b> 次/月
            </p>
            <p className="mt-2 text-[11px] leading-relaxed text-stone-400">
              更灵敏 = 更早提示，误报也更多；更保守 = 只在强信号时提示
            </p>
          </section>

          {/* 指标权重与分级 */}
          <section className="mt-3 rounded-[20px] border border-stone-200 bg-white p-4">
            <h4 className="text-[14px] font-bold text-stone-900">指标权重与分级</h4>
            <ul className="mt-2 divide-y divide-stone-100">
              {METRICS.map((m) => (
                <li key={m.key} className="py-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[14px] font-semibold text-stone-900">{m.name}</p>
                      <p className="text-[11px] text-stone-400">{m.refLabel}</p>
                    </div>
                    <label className="flex items-center gap-1.5 text-[12px] text-stone-500">
                      核心
                      <Switch
                        checked={settings.coreFlags[m.key]}
                        onCheckedChange={(v) => setCore(m.key, v)}
                        aria-label={`${m.name}核心指标`}
                      />
                    </label>
                  </div>
                  <div className="mt-2 flex gap-1.5">
                    {([1, 2, 3] as Weight[]).map((w) => (
                      <button
                        key={w}
                        type="button"
                        onClick={() => setWeight(m.key, w)}
                        className={`rounded-full px-3 py-1 text-[12px] font-medium transition-colors ${
                          settings.weights[m.key] === w
                            ? 'bg-teal-700 text-white'
                            : 'bg-stone-100 text-stone-500 active:bg-stone-200'
                        }`}
                      >
                        {WEIGHT_LABEL[w]}
                      </button>
                    ))}
                    <span className="ml-auto self-center text-[11px] text-stone-400">预警权重</span>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <p className="mt-3 px-1 text-[11px] leading-relaxed text-stone-400">
            设置只影响预警提示的触发与排序，不构成任何诊疗判断；阈值口径来自 2016 PRINTO/ACR/EULAR 与 2023 EULAR/PReS。
          </p>

          <button
            type="button"
            onClick={onResetDemo}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-full border border-stone-300 py-2.5 text-[13px] font-medium text-stone-500 active:bg-stone-100"
          >
            <ArrowCounterClockwise size={15} />
            重置演示数据（彩排用）
          </button>
        </div>
      </DrawerContent>
    </Drawer>
  )
}

function sensLabel(s: number): string {
  if (s <= 0.7) return '保守'
  if (s <= 0.9) return '偏保守'
  if (s <= 1.1) return '标准'
  if (s <= 1.3) return '偏灵敏'
  return '灵敏'
}
