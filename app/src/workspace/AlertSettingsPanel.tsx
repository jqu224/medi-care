// 预警档位设置面板：现行工作台的 PRD §4.3 / §5「可配置」入口。
//
// 与历史组件 AlertSettingsSheet 的区别：
//   - 三档定性（保守／平衡／谨慎），不是连续滑杆
//   - 只说明「什么样的变化会提醒」，不提供任何提醒次数预估
//     （MVP 设计定稿砍掉滑杆的理由是「未经验证的预计警报频率」——
//       砍掉频率预测是对的，档位本身不该一起砍掉）
//   - 面向家属提问，不暴露阈值数字

import { TIERS, type AlertSettings, type MetricKey, type SensitivityTier, type Weight } from "../engine/config";

const WEIGHT_LABELS: Record<Weight, string> = { 1: "不太关注", 2: "关注", 3: "重点关注" };

function MetricRow({
  name,
  hint,
  weight,
  core,
  onWeight,
  onCore,
  disabled,
}: {
  name: string;
  hint: string;
  weight: Weight;
  core: boolean;
  onWeight: (w: Weight) => void;
  onCore: (v: boolean) => void;
  disabled: boolean;
}) {
  return (
    <div className="tier-metric">
      <div className="tier-metric-head">
        <strong>{name}</strong>
        <span>{hint}</span>
      </div>
      <div className="tier-controls">
        <div className="tier-choices" role="group" aria-label={`${name}的重要程度`}>
          {([1, 2, 3] as Weight[]).map((w) => (
            <button
              key={w}
              type="button"
              className={weight === w ? "is-on" : ""}
              aria-pressed={weight === w}
              disabled={disabled}
              onClick={() => onWeight(w)}
            >
              {WEIGHT_LABELS[w]}
            </button>
          ))}
        </div>
        <label className="tier-core">
          <input
            type="checkbox"
            checked={core}
            disabled={disabled}
            onChange={(e) => onCore(e.target.checked)}
          />
          <span>设为核心指标</span>
        </label>
      </div>
    </div>
  );
}

export function AlertSettingsPanel({
  settings,
  metrics,
  onTier,
  onWeights,
  onCoreFlags,
  readOnly = false,
}: {
  settings: AlertSettings;
  /** 只列出当前监控实际启用的指标，避免让家属为一堆无关指标做决定 */
  metrics: { key: MetricKey; name: string; hint: string }[];
  onTier: (t: SensitivityTier) => void;
  onWeights: (w: Record<MetricKey, Weight>) => void;
  onCoreFlags: (c: Record<MetricKey, boolean>) => void;
  readOnly?: boolean;
}) {
  return (
    <section className="tier-panel" aria-label="预警设置">
      <div className="tier-block">
        <h3>提醒有多敏感</h3>
        <p>这一档只决定「什么样的变化会提醒你」，不告诉你会提醒几次</p>
        <div className="tier-choices tier-choices-wide" role="group" aria-label="预警档位">
          {TIERS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={settings.tier === t.id ? "is-on" : ""}
              aria-pressed={settings.tier === t.id}
              disabled={readOnly}
              onClick={() => onTier(t.id)}
            >
              <strong>{t.name}</strong>
              <span>{t.hint}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="tier-block">
        <h3>哪些指标对你更重要</h3>
        <p>标为「重点关注」的指标越线时会排在前面；核心指标决定提醒的强弱</p>
        {metrics.map((m) => (
          <MetricRow
            key={m.key}
            name={m.name}
            hint={m.hint}
            weight={settings.weights[m.key]}
            core={settings.coreFlags[m.key]}
            disabled={readOnly}
            onWeight={(w) => onWeights({ ...settings.weights, [m.key]: w })}
            onCore={(v) => onCoreFlags({ ...settings.coreFlags, [m.key]: v })}
          />
        ))}
      </div>
    </section>
  );
}

export default AlertSettingsPanel;