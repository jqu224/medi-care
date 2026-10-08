// 「本次检验评估」卡片：三套国际标准的判分结果。
//
// 需求方小 Q 的原话是「2004 年那一版的诊断标准，也就是 8 条指标，满足 5 条就可以做诊断」，
// 以及「绝大部分孩子他可能不见得能完全够得上，他可能符合其中的三条、符合其中的四条标准」。
// 也就是说，多数孩子卡在达标线以下——所以这张卡的价值不在于给结论，
// 而在于让人看见自己现在在哪个位置，好拿去和医生讨论。
//
// 布局：先每套标准给一个一行式总结（位置），再把具体判分项按状态分组成胶囊
// （已达标 / 未达标 / 未采集），避免把 21 项明细一口气堆成流水账。
// 详细数字与阈值藏在折叠区里——想看再展开。

import { useMemo, useState } from "react";
import {
  STANDARD_SHORT_NAMES,
  groupCriteriaByState,
  scoreStatic,
  type GroupedCriteria,
  type StandardId,
  type StaticVerdict,
  type VerdictStatus,
} from "../engine/staticScoring";

const VERDICT_STATUS_LABEL: Record<VerdictStatus, string> = {
  meet: "达到标准",
  "not-meet": "尚未达到",
  insufficient: "数据不足",
};

const VERDICT_STATUS_CLASS: Record<VerdictStatus, string> = {
  meet: "is-meet",
  "not-meet": "is-low",
  insufficient: "is-unknown",
};

type GroupKey = keyof GroupedCriteria;

const STATE_LABELS: Record<GroupKey, string> = {
  met: "已达标",
  notMet: "未达标",
  notMeasured: "未采集",
};

const STATE_ORDER: GroupKey[] = ["notMeasured", "notMet", "met"];

/** TS 里用 camelCase；CSS 里沿用 kebab-case。状态名只在拼 className 时转换 */
function stateClass(state: GroupKey): string {
  return state === "notMet" ? "not-met" : state === "notMeasured" ? "not-measured" : "met";
}

function StandardSummary({ v }: { v: StaticVerdict }) {
  return (
    <li className={`scoring-summary ${VERDICT_STATUS_CLASS[v.status]}`}>
      <span className="scoring-summary-name">{STANDARD_SHORT_NAMES[v.standard]}</span>
      <span className="scoring-summary-headline">{v.headline}</span>
      <span className="scoring-summary-status">{VERDICT_STATUS_LABEL[v.status]}</span>
    </li>
  );
}

function Pill({
  state,
  label,
  open,
  onToggle,
}: {
  state: GroupKey;
  label: string;
  open: boolean;
  onToggle: () => void;
}) {
  const mark = state === "met" ? "✓" : state === "notMet" ? "×" : "?";
  return (
    <li className={`scoring-pill is-${stateClass(state)}${open ? " is-open" : ""}`}>
      <button type="button" onClick={onToggle} aria-expanded={open}>
        <span className="scoring-pill-mark" aria-hidden="true">
          {mark}
        </span>
        <span className="scoring-pill-label">{label}</span>
      </button>
    </li>
  );
}

function StateGroup({
  state,
  entries,
  openKey,
  toggle,
}: {
  state: GroupKey;
  entries: GroupedCriteria[GroupKey];
  openKey: string | null;
  toggle: (key: string) => () => void;
}) {
  if (entries.length === 0) return null;
  return (
    <section className={`scoring-group is-${stateClass(state)}`} aria-label={STATE_LABELS[state]}>
      <h4>
        <span className="scoring-group-mark" aria-hidden="true">
          {state === "met" ? "✓" : state === "notMet" ? "×" : "?"}
        </span>
        {STATE_LABELS[state]}
        <span className="scoring-group-count">（{entries.length}）</span>
      </h4>
      <ul className="scoring-pills">
        {entries.map(({ criterion, standard }) => {
          const key = `${standard}-${criterion.key}`;
          return (
            <Pill
              key={key}
              state={state}
              label={criterion.label}
              open={openKey === key}
              onToggle={toggle(key)}
            />
          );
        })}
      </ul>
    </section>
  );
}

export function ScoringCard({
  snapshot,
  basis,
}: {
  snapshot: Parameters<typeof scoreStatic>[0];
  basis: string;
}) {
  const verdicts = useMemo(() => scoreStatic(snapshot), [snapshot]);
  const groups = useMemo(() => groupCriteriaByState(verdicts), [verdicts]);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const toggle = (key: string) => () =>
    setOpenKey((prev) => (prev === key ? null : key));

  /* 一次列出全部明细，但默认折叠——
     「未采集 ≠ 未达标」这个底线要继续守住，所以专门给一句提示 */
  const allDetails = verdicts.flatMap((v) =>
    v.criteria.map((c) => ({ standard: v.standard as StandardId, c })),
  );
  const uncollectableNote =
    "有几项本应用没有采集通道，需要专门的检查，这不等于「没事」，请把这些项交给医生判断";

  return (
    <section className="scoring-card" aria-label="本次检验评估">
      <header>
        <h3>本次检验评估</h3>
        <p>{basis}</p>
      </header>

      <ul className="scoring-summaries" aria-label="三套标准的整体位置">
        {verdicts.map((v) => (
          <StandardSummary key={v.standard} v={v} />
        ))}
      </ul>

      <div className="scoring-groups">
        {STATE_ORDER.map((state) => (
          <StateGroup
            key={state}
            state={state}
            entries={groups[state]}
            openKey={openKey}
            toggle={toggle}
          />
        ))}
      </div>

      {groups.notMeasured.length > 0 && (
        <p className="scoring-gaps">{uncollectableNote}</p>
      )}

      <details className="scoring-detail-toggle">
        <summary>展开每项的具体数值与判断口径</summary>
        <ul className="scoring-details">
          {allDetails.map(({ standard, c }) => (
            <li key={`${standard}-${c.key}`} className={`scoring-detail ${c.state}`}>
              <strong>{c.label}</strong>
              <span className="scoring-detail-std">{STANDARD_SHORT_NAMES[standard]}</span>
              <span className="scoring-detail-state">{STATE_LABELS[c.state as GroupKey] ?? c.state}</span>
              <p>{c.detail}</p>
            </li>
          ))}
        </ul>
      </details>

      <footer className="scoring-foot">
        这些标准只反映指标与特征的吻合程度，不等于诊断。是否需要处理、怎么处理，请由医生判断。
      </footer>
    </section>
  );
}

export default ScoringCard;
