// 历史组件：预警设置抽屉（保留作历史参考，未在运行入口引用）。
//
// 2026-10-09 决定：本组件的连续灵敏度滑杆与「预计警报频率 N 次/月」已按
// reference/mvp设计定稿-20261007.md 移除——频率预测没有可验证依据，数字本身
// 就是对家属的误导。现行工作台的档位入口是 workspace/AlertSettingsPanel.tsx
// （三档定性，不承诺任何次数）。此文件不删除，仅供对照。

import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  METRICS,
  type AlertSettings,
  type MetricKey,
  type Weight,
} from "../engine/config";

export function AlertSettingsSheet({
  open,
  onClose,
  settings,
  onChange,
  monthly,
}: {
  open: boolean;
  onClose: () => void;
  settings: AlertSettings;
  onChange: (s: AlertSettings) => void;
  monthly: number;
}) {
  return (
    <Sheet open={open} onOpenChange={(v: boolean) => !v && onClose()}>
      <SheetContent className="mx-auto max-w-[430px] rounded-t-[24px] border-stone-200 bg-[#FBF8F3] px-5 pb-6">
        <SheetTitle className="sr-only">预警设置</SheetTitle>
        <div className="max-h-[82dvh] overflow-y-auto no-scrollbar">
          <div className="flex items-center gap-2 pt-2">
            <h3 className="text-[17px] font-bold text-stone-900">预警设置</h3>
          </div>

          <section className="mt-4 rounded-[20px] border border-stone-200 bg-white p-4">
            <div className="flex items-baseline justify-between">
              <h4 className="text-[14px] font-bold text-stone-900">预警档位</h4>
              <span className="text-[12px] font-medium text-teal-700">
                {settings.tier === "cautious"
                  ? "谨慎"
                  : settings.tier === "conservative"
                    ? "保守"
                    : "平衡"}
              </span>
            </div>
            <p className="mt-2 text-[12px] leading-relaxed text-stone-500">
              只说明什么样的变化会提醒，不提供任何提醒次数的预估
            </p>
            <div className="mt-3 flex gap-2">
              {(
                [
                  ["conservative", "保守"],
                  ["balanced", "平衡"],
                  ["cautious", "谨慎"],
                ] as const
              ).map(([id, name]) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={settings.tier === id}
                  onClick={() => onChange({ ...settings, tier: id })}
                >
                  {name}
                </button>
              ))}
            </div>
          </section>

          <section className="mt-3 rounded-[20px] border border-stone-200 bg-white p-4">
            <h4 className="text-[14px] font-bold text-stone-900">指标权重与分级</h4>
            {METRICS.map((m) => (
              <div key={m.key} className="mt-3">
                <span className="text-[13px] text-stone-700">{m.name}</span>
                <div className="mt-1 flex gap-2">
                  {([1, 2, 3] as Weight[]).map((w) => (
                    <button
                      key={w}
                      type="button"
                      aria-pressed={settings.weights[m.key as MetricKey] === w}
                      onClick={() =>
                        onChange({
                          ...settings,
                          weights: { ...settings.weights, [m.key]: w },
                        })
                      }
                    >
                      {w}
                    </button>
                  ))}
                  <button
                    type="button"
                    aria-pressed={settings.coreFlags[m.key as MetricKey]}
                    onClick={() =>
                      onChange({
                        ...settings,
                        coreFlags: {
                          ...settings.coreFlags,
                          [m.key]: !settings.coreFlags[m.key as MetricKey],
                        },
                      })
                    }
                  >
                    核心
                  </button>
                </div>
              </div>
            ))}
          </section>

          <p className="mt-3 text-[11px] leading-relaxed text-stone-400">
            历史记录：预计警报频率 {monthly} 次/月的说法已移除，数字无法验证。
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default AlertSettingsSheet;