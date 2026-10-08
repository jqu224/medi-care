import SymptomField from "./SymptomField";
import SymptomTrend from "./SymptomTrend";
import { isGradedSymptom, readSymptom, symptomValue, symptomChange, symptomDetail } from "./symptoms";
import AlertTicker from "./AlertTicker";
import { careTodos } from "./careTodos";
import { summarizeHistory } from "./historySummary";
import { recordDates } from "./recordDates";
import Learning from "./Learning";
import { DEFAULT_SETTINGS, METRICS, effThreshold } from "../engine/config";
import { flushSync } from "react-dom";
import { revealPatient } from "./motion";
import Calendar from "./Calendar";
import { useState, useRef, useEffect } from "react";
import {
  BookOpen,
  CaretDown,
  SignOut,
  House,
  Notebook,
  Plus,
  ChartLineUp,
  Heart,
  ArrowRight,
  X,
  ArrowUpRight,
  Users,
  Stethoscope,
  Pill,
  Heartbeat as Activity,
  DotsThree,
} from "@phosphor-icons/react";
import {
  LineChart,
  Line,
  ReferenceLine,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { todayISO } from "../lib/date";
import {
  actorFor,
  allowedPatients,
  alertsFor,
  commit,
  eventTypes,
  loadDatabase,
  mutatePatient,
  now,
  periodRange,
  presets,
  seriesFor,
  togglePlan,
  uid,
} from "./model";
import type {
  Actor,
  CareEvent,
  CarePlan,
  Database,
  Metric,
  Monitor,
  Observation,
  Patient,
  Role,
} from "./model";
import "./workspace.css";
import "./trendDensity.css";
type Tab = "首页" | "记录" | "趋势" | "照护" | "学习";
type ModalState = {
  type: "new" | "monitor" | "observation" | "event" | "plan" | "metric";
  monitor?: Monitor;
  observation?: Observation;
  event?: CareEvent;
  plan?: CarePlan;
  metric?: Metric;
};
const roleNames = { patient: "患者", family: "患者家属", doctor: "医生" };
const demoPasswords = { patient: "xiaoyu", family: "lin", doctor: "chen" };
function read<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) || "null") ?? fallback;
  } catch {
    return fallback;
  }
}
function stamp(s: string) {
  return s.replace("T", " · ") + (s.length === 10 ? " · 时间未记录" : "");
}
function latest(p: Patient, id: string) {
  return p.observations
    .filter((o) => o.metric === id)
    .sort((a, b) => b.at.localeCompare(a.at))[0];
}
const icons = {
  首页: House,
  记录: Notebook,
  趋势: ChartLineUp,
  照护: Heart,
  学习: BookOpen,
};
export default function Workspace() {
  const [initial] = useState(() => {
    try {
      return { db: loadDatabase(localStorage), error: "" };
    } catch (e) {
      return { db: null, error: String(e) };
    }
  });
  const [db, setDb] = useState<Database | null>(initial.db);
  const [role, setRole] = useState<Role | null>(() =>
    read("nuanshao:demo-session-v1", null),
  );
  const [patientId, setPatientId] = useState(() =>
    read("nuanshao:patient", "p1"),
  );
  const [showList, setShowList] = useState(
    () => read<Role | null>("nuanshao:demo-session-v1", null) === "doctor",
  );
  const [tab, setTab] = useState<Tab>("首页");
  const [modal, setModal] = useState<ModalState | null>(null);
  const [error, setError] = useState(initial.error);
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [disease, setDisease] = useState("");
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [todoOpen, setTodoOpen] = useState(false);
  const [loginRole, setLoginRole] = useState<Role>("patient");
  const [loginOpen, setLoginOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [logoutTarget, setLogoutTarget] = useState<Role | "choose" | null>(
    null,
  );
  const actor = role ? actorFor(role) : null;
  if (!db)
    return (
      <div className="entry">
        <h1>暂时无法读取本地资料</h1>
        <p>{error}</p>
        <p>原始数据未被覆盖。请备份浏览器存储后重试。</p>
      </div>
    );
  const selectRole = (r: Role) => {
    try {
      localStorage.setItem("nuanshao:demo-session-v1", JSON.stringify(r));
      localStorage.setItem("nuanshao:role", JSON.stringify(r));
      setTodoOpen(false);
      setRole(r);
      setLoginOpen(false);
      setPassword("");
      setPatientId(r === "patient" ? "p1" : read("nuanshao:patient", "p1"));
      setShowList(r !== "patient");
      setModal(null);
      setNotice("");
      setTab("首页");
    } catch {
      setError("身份保存失败，请检查浏览器存储。");
    }
  };
  const logout = () => {
    try {
      localStorage.removeItem("nuanshao:demo-session-v1");
      localStorage.removeItem("nuanshao:role");
      setLoginRole(
        logoutTarget && logoutTarget !== "choose"
          ? logoutTarget
          : role || "patient",
      );
      setRole(null);
      setLoginOpen(logoutTarget !== "choose");
      setPassword("");
      setLoginError("");
      setLogoutTarget(null);
      setModal(null);
      setSearch("");
      setDisease("");
      setAttentionOnly(false);
      setError("");
    } catch {
      setError("退出失败，请检查浏览器存储后重试。");
    }
  };
  if (!actor)
    return (
      <div className="entry">
        <div className="brand">
          <img className="brand-mark" src="/medi-care-mark.svg" alt="" />
          <span className="brand-wordmark">
            迈迪克<small>Medi-care</small>
          </span>
        </div>
        <div className="entry-copy">
          <h1>
            每一次记录，
            <br />
            让照护更有方向。
          </h1>
          <p>
            为自己、为家人，也为更清晰的诊间沟通。
            <br />
            选择演示账号，输入测试密码后查看健康监控。
          </p>
        </div>
        <div className="role-grid">
          {(["patient", "family", "doctor"] as Role[]).map((r, i) => {
            const Icon = [Heart, Users, Stethoscope][i];
            return (
              <button
                className={
                  "role-card " +
                  (loginOpen && loginRole === r ? "selected" : "")
                }
                aria-haspopup="dialog"
                key={r}
                onClick={() => {
                  setLoginOpen(true);
                  setLoginRole(r);
                  setPassword("");
                  setLoginError("");
                }}
              >
                <Icon size={32} />
                <h2>{roleNames[r]}</h2>
                <p>
                  {
                    [
                      "记录自己的变化，管理日常照护",
                      "陪伴多位家人，代录每一次变化",
                      "查看多位患者，连接完整病程",
                    ][i]
                  }
                </p>
                <span>
                  {actorFor(r).name} <ArrowRight />
                </span>
              </button>
            );
          })}
        </div>
        {loginOpen && (
          <Modal
            title="登录演示账号"
            className="login-modal"
            confirmDiscard={false}
            onClose={() => {
              setLoginOpen(false);
              setPassword("");
              setLoginError("");
              setError("");
            }}
          >
            <div className="logout-account">
              <span className="logout-account-avatar" aria-hidden="true">
                {actorFor(loginRole).name[0]}
              </span>
              <div>
                <span className="logout-account-label">即将登录</span>
                <strong>{actorFor(loginRole).name}</strong>
              </div>
              <span className="logout-account-role">
                {roleNames[loginRole]}
              </span>
            </div>
            <form
              className="demo-login"
              onSubmit={(e) => {
                e.preventDefault();
                if (password !== demoPasswords[loginRole]) {
                  setLoginError("密码不正确，请输入下方提示的测试密码。");
                  return;
                }
                setLoginError("");
                selectRole(loginRole);
              }}
            >
              <label htmlFor="demo-password">测试密码</label>
              <div className="login-input-row">
                <input
                  autoFocus
                  id="demo-password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  aria-describedby="password-hint password-error"
                  aria-invalid={!!loginError}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setLoginError("");
                  }}
                />
                <button className="primary" type="submit">
                  登录并查看 <ArrowRight size={18} />
                </button>
              </div>
              <p id="password-hint">
                测试密码：<strong>{demoPasswords[loginRole]}</strong>
                （可直接照此输入）
              </p>
              <p id="password-error" role="alert">
                {loginError}
              </p>
              <small>
                本地演示登录，仅用于体验账号切换与健康监控；密码公开，不代表真实账户安全认证。
              </small>
            </form>
            {error && <p role="alert">{error}</p>}
          </Modal>
        )}
        <p className="footnote">
          演示身份 · 全部为虚拟患者数据 · 不连接真实医疗账户
        </p>
        {error && <p role="alert">{error}</p>}
      </div>
    );
  const patients = allowedPatients(db, actor);
  const patient = patients.find((p) => p.id === patientId) || patients[0];
  const readonly = role === "doctor";
  const todos = careTodos(patient, db.metrics);
  const update = (fn: (p: Patient) => void, extra?: (d: Database) => void) => {
    const next = mutatePatient(db, actor, patient.id, fn);
    extra?.(next);
    commit(localStorage, next);
    setDb(next);
  };
  const perform = (fn: () => void) => {
    try {
      fn();
      setError("");
    } catch {
      setError("未能保存。请检查浏览器存储后重试，当前输入已保留。");
    }
  };
  const switchPatient = (id: string, source: HTMLButtonElement) => {
    const origin = source.getBoundingClientRect();
    flushSync(() => {
      setTodoOpen(false);
      setPatientId(id);
      localStorage.setItem("nuanshao:patient", JSON.stringify(id));
      setModal(null);
      setTab("首页");
      setShowList(false);
      setNotice("");
    });
    revealPatient(origin);
  };
  const patientList = (
    <div className="patient-list">
      <div className="section-head">
        <h2>{readonly ? "患者管理" : "家人档案"}</h2>
        <span>{patients.length} 位</span>
      </div>
      <label className="search">
        <span className="sr-only">搜索患者姓名</span>
        <input
          placeholder="搜索患者姓名"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      <select
        aria-label="筛选病种"
        value={disease}
        onChange={(e) => setDisease(e.target.value)}
      >
        <option value="">全部病种</option>
        {presets.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <button
        className={"attention-filter " + (attentionOnly ? "selected" : "")}
        aria-pressed={attentionOnly}
        onClick={() => setAttentionOnly(!attentionOnly)}
      >
        需要关注{" "}
        <strong>
          {patients.filter((p) => alertsFor(p).length > 0).length}
        </strong>
      </button>
      <div className="patient-table-head">
        <span>姓名 / 监控病种</span>
        <span>当前提醒</span>
        <span>最近记录</span>
        <span>首次记录</span>
        <span title="首次与最近记录之间的日历天数，不代表连续打卡">
          记录跨度
        </span>
      </div>
      <div className="patient-items">
        {patients
          .filter(
            (p) =>
              p.name.includes(search) &&
              (!attentionOnly || alertsFor(p).length > 0) &&
              (!disease || p.monitors.some((m) => m.preset === disease)),
          )
          .sort((a, b) => alertsFor(b).length - alertsFor(a).length)
          .map((p) => {
            const a = alertsFor(p);
            const dates = recordDates(p);
            const hasRules = p.monitors.some(
              (m) => m.active && ["sjia", "mas"].includes(m.preset),
            );
            return (
              <button
                key={p.id}
                className={
                  "patient-item " + (p.id === patient.id ? "selected" : "")
                }
                onClick={(e) => switchPatient(p.id, e.currentTarget)}
              >
                <div className="patient-avatar">{p.name.slice(-1)}</div>
                <div className="patient-row-data">
                  <strong>{p.name}</strong>
                  <p>{p.monitors.map((m) => m.name).join(" · ")}</p>
                  <span className={a.length ? "risk-text" : ""}>
                    {!p.observations.length
                      ? "暂无数据"
                      : !hasRules
                        ? "未启用风险评估"
                        : a.length
                          ? "有提醒待查看"
                          : "未触发提醒"}
                  </span>
                  <small
                    className="patient-last"
                    title={dates.last || undefined}
                  >
                    <em>最近</em>
                    <time dateTime={dates.last || undefined}>
                      {dates.relative}
                    </time>
                  </small>
                  <small className="patient-first">
                    <em>首次</em>
                    <time dateTime={dates.first || undefined}>
                      {dates.first || "—"}
                    </time>
                  </small>
                  <small
                    className="patient-span"
                    title="首次与最近记录之间的日历天数，不代表连续打卡"
                  >
                    <em>跨度</em>
                    {dates.span === null
                      ? "—"
                      : dates.span === 0
                        ? "同一天"
                        : `${dates.span} 天`}
                  </small>
                </div>
                <ArrowRight />
              </button>
            );
          })}
      </div>
    </div>
  );
  return (
    <div
      className={
        "workspace " +
        (readonly ? "doctor" : "") +
        (showList ? " list-mode" : "")
      }
    >
      <header className="topbar app-header">
        <div className="header-brand">
          <img className="brand-mark" src="/medi-care-mark.svg" alt="" />
          <span className="brand-wordmark">
            迈迪克<small>Medi-care</small>
          </span>
        </div>
        <span className="workspace-title">
          {showList ? (readonly ? "患者" : "家人") : "档案"}
          <span>
            {" "}
            / {showList ? "患者管理" : tab === "首页" ? "概览" : tab}
          </span>
        </span>
        <div className="top-actions">
          {role !== "patient" && (
            <button onClick={() => setShowList(!showList)}>
              <Users size={18} />
              {patient.name}
              <span className="desktop-label"> · 切换患者</span>
            </button>
          )}
          <AccountMenu actor={actor} onSwitch={setLogoutTarget} />
        </div>
      </header>
      <aside className="sidebar">
        <nav>
          {(Object.keys(icons) as Tab[]).map((t) => {
            const Icon = icons[t];
            return (
              <button
                key={t}
                className={tab === t ? "active" : ""}
                onClick={() => {
                  setTab(t);
                  setShowList(false);
                }}
              >
                <Icon size={22} />
                {readonly && t === "首页" ? "概览" : t}
              </button>
            );
          })}
          {!readonly && (
            <button
              className="primary"
              onClick={() => setModal({ type: "new" })}
            >
              <Plus size={21} />
              新增记录
            </button>
          )}
        </nav>
        {readonly && patientList}
        <div className="sidebar-bottom">
          <span className="avatar">{actor.name.slice(0, 1)}</span>
          <div>
            <strong>{actor.name}</strong>
            <small>{roleNames[actor.role]} · 演示身份</small>
          </div>
          <button
            aria-label="切换演示身份"
            onClick={() => setLogoutTarget("choose")}
          >
            <DotsThree size={24} />
          </button>
        </div>
      </aside>
      <main className="main">
        {error && (
          <div className="save-error" role="alert">
            {error}
            <button onClick={() => setError("")}>关闭</button>
          </div>
        )}
        {notice && (
          <div role="status" className="notice">
            {notice}
          </div>
        )}
        {showList ? (
          patientList
        ) : (
          <div className="patient-content" key={patient.id + "-" + actor.role}>
            <div className="page-heading">
              <div>
                <h1>
                  {tab === "学习"
                    ? "学习中心"
                    : readonly
                      ? patient.name
                      : tab === "首页"
                        ? patient.name
                        : tab}
                </h1>
                <span>
                  {tab === "学习"
                    ? "知识卡片 · 问答练习 · 术语猜词"
                    : patient.description}{" "}
                  {readonly && tab !== "学习" && (
                    <b className="readonly">只读</b>
                  )}
                </span>
              </div>
              <div className="date-mark">
                <strong>{new Date().getDate()}</strong>
                <span>
                  {new Date().getMonth() + 1}月 ·{" "}
                  {
                    ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][
                      new Date().getDay()
                    ]
                  }
                </span>
              </div>
            </div>
            {tab === "首页" && (
              <>
                <div className="status-strip" aria-label="档案摘要">
                  <span>
                    <strong>
                      {patient.monitors.filter((m) => m.active).length}
                    </strong>{" "}
                    监控中
                  </span>
                  <span>
                    <strong>
                      {
                        new Set(
                          patient.observations
                            .filter((o) => o.at.startsWith(todayISO()))
                            .map((o) => o.group),
                        ).size
                      }
                    </strong>{" "}
                    今日检测
                  </span>
                  <span>
                    <strong>
                      {
                        patient.events.filter((e) =>
                          e.at.startsWith(todayISO()),
                        ).length
                      }
                    </strong>{" "}
                    今日事件
                  </span>
                  <button
                    className="todo-status"
                    aria-expanded={todoOpen}
                    aria-controls="care-todos"
                    onClick={() => setTodoOpen(!todoOpen)}
                  >
                    <strong>{todos.length}</strong>
                    <span>To do</span>
                    <ArrowRight size={17} />
                  </button>
                  <span>
                    更新于{" "}
                    {patient.observations
                      .map((o) => o.at)
                      .sort()
                      .at(-1)
                      ?.replace("T", " ") || "暂无记录"}
                  </span>
                </div>
                {todoOpen && (
                  <section className="care-todos panel" id="care-todos">
                    <div className="section-head">
                      <div>
                        <h2>{readonly ? "患者待办" : "下一步 To do"}</h2>
                        <p>先核对计划，再补充缺失记录 · 本地规则提醒</p>
                      </div>
                      <button onClick={() => setTodoOpen(false)}>收起</button>
                    </div>
                    {!todos.length && (
                      <p>当前没有待办；有新的实际变化时再记录。</p>
                    )}
                    {todos.map((todo, index) => (
                      <div className="care-todo-row" key={todo.id}>
                        <span className="todo-order">{index + 1}</span>
                        <div>
                          <strong>{todo.title}</strong>
                          <p>{todo.reason}</p>
                        </div>
                        <button
                          className={index === 0 ? "primary" : "text-button"}
                          onClick={() => {
                            if (readonly) {
                              setTab(todo.kind === "plan" ? "照护" : "记录");
                              return;
                            }
                            if (todo.kind === "plan") {
                              setTab("照护");
                              return;
                            }
                            const monitor = patient.monitors.find(
                              (m) => m.id === todo.monitorId,
                            );
                            if (monitor && todo.metricId)
                              setModal({
                                type: "observation",
                                monitor: {
                                  ...monitor,
                                  metrics: [todo.metricId],
                                },
                              });
                          }}
                        >
                          {readonly
                            ? "查看"
                            : todo.kind === "plan"
                              ? "核对计划"
                              : "去记录"}
                          <ArrowRight size={16} />
                        </button>
                      </div>
                    ))}
                    <small>
                      未记录不等于未完成；检验提示仅核对已有报告，不建议额外检测或调整用药。
                    </small>
                  </section>
                )}
                <Alerts key={patient.id} patient={patient} />
                <div className="section-head">
                  <div>
                    <h2>病种监控</h2>
                  </div>
                  {!readonly && (
                    <button
                      className="text-button"
                      onClick={() => setModal({ type: "monitor" })}
                    >
                      <Plus />
                      添加监控
                    </button>
                  )}
                </div>
                <div className="monitor-stack compact-monitors">
                  {patient.monitors.map((m, index) => (
                    <MonitorCard
                      key={m.id}
                      monitor={m}
                      patient={patient}
                      metrics={db.metrics}
                      readonly={readonly}
                      onRecord={() =>
                        setModal({ type: "observation", monitor: m })
                      }
                      onEdit={() => setModal({ type: "monitor", monitor: m })}
                      onMetric={(metric) =>
                        setModal({ type: "metric", metric })
                      }
                      onPause={() =>
                        perform(() =>
                          update((p) => {
                            p.monitors.find((x) => x.id === m.id)!.active =
                              !m.active;
                          }),
                        )
                      }
                      onUp={() =>
                        perform(() =>
                          update((p) => {
                            [p.monitors[index - 1], p.monitors[index]] = [
                              p.monitors[index],
                              p.monitors[index - 1],
                            ];
                          }),
                        )
                      }
                      canUp={index > 0}
                    />
                  ))}
                </div>
                <div
                  className={"home-bottom " + (readonly ? "doctor-bottom" : "")}
                >
                  <section className="panel">
                    <div className="section-head">
                      <h2>今日照护</h2>
                      <button onClick={() => setTab("照护")}>
                        查看全部 <ArrowUpRight />
                      </button>
                    </div>
                    <Plans
                      patient={patient}
                      readonly={readonly}
                      onToggle={(plan) =>
                        perform(() =>
                          update((p) => togglePlan(p, plan, actor.name)),
                        )
                      }
                      onEdit={(plan) => setModal({ type: "plan", plan })}
                    />
                  </section>
                  <section className="panel">
                    <div className="section-head">
                      <h2>最近事件</h2>
                      <button onClick={() => setTab("记录")}>
                        时间线 <ArrowUpRight />
                      </button>
                    </div>
                    {patient.events.length ? (
                      patient.events
                        .slice()
                        .sort((a, b) => b.at.localeCompare(a.at))
                        .slice(0, 3)
                        .map((e) => <EventRow key={e.id} event={e} />)
                    ) : (
                      <Empty text="还没有治疗事件，发生时再记一笔。" />
                    )}
                  </section>
                </div>
              </>
            )}
            {(tab === "记录" || tab === "趋势") && (
              <History
                key={patient.id + tab}
                patient={patient}
                metrics={db.metrics}
                trends={tab === "趋势"}
                readonly={readonly}
                actor={actor}
                onEditObservation={(observation) =>
                  setModal({ type: "observation", observation })
                }
                onEditEvent={(event) => setModal({ type: "event", event })}
                onDelete={(kind, id) =>
                  perform(() => {
                    if (confirm("删除这条记录？此操作会同步更新趋势。"))
                      update((p) => {
                        if (kind === "observation")
                          p.observations = p.observations.filter(
                            (o) => o.id !== id,
                          );
                        else p.events = p.events.filter((e) => e.id !== id);
                      });
                  })
                }
              />
            )}
            {tab === "学习" && <Learning key={actor.role} role={actor.role} />}
            {tab === "照护" && (
              <section className="panel">
                <div className="section-head">
                  <div>
                    <h2>照护计划</h2>
                    <p>计划与实际记录分开保存</p>
                  </div>
                  {!readonly && (
                    <button
                      className="primary"
                      onClick={() => setModal({ type: "plan" })}
                    >
                      <Plus />
                      添加计划
                    </button>
                  )}
                </div>
                <Plans
                  patient={patient}
                  readonly={readonly}
                  onToggle={(plan) =>
                    perform(() =>
                      update((p) => togglePlan(p, plan, actor.name)),
                    )
                  }
                  onEdit={(plan) => setModal({ type: "plan", plan })}
                />
              </section>
            )}
          </div>
        )}
        <footer>
          演示版本 · 全部为虚拟患者数据
          <br />
          本平台为辅助记录与预警工具，不替代专业诊疗判断
        </footer>
      </main>
      <nav className="mobile-nav">
        {[
          "首页",
          "记录",
          ...(!readonly ? ["+"] : []),
          "趋势",
          "照护",
          "学习",
        ].map((t) =>
          t === "+" ? (
            <button
              key={t}
              aria-label="新增"
              className="plus-button"
              onClick={() => setModal({ type: "new" })}
            >
              <Plus size={27} />
            </button>
          ) : (
            <button
              key={t}
              className={tab === t ? "active" : ""}
              onClick={() => {
                setTab(t as Tab);
                setShowList(false);
              }}
            >
              {(() => {
                const Icon = icons[t as Tab];
                return <Icon size={23} />;
              })()}
              <span>{readonly && t === "首页" ? "概览" : t}</span>
            </button>
          ),
        )}
      </nav>
      {logoutTarget && (
        <Modal title="是否要退出？" onClose={() => setLogoutTarget(null)}>
          <div
            className="logout-account"
            aria-label={`当前账号：${actor.name}，${roleNames[actor.role]}`}
          >
            <span className="logout-account-avatar" aria-hidden="true">
              {actor.name[0]}
            </span>
            <div>
              <span className="logout-account-label">当前账号</span>
              <strong>{actor.name}</strong>
            </div>
            <span className="logout-account-role">{roleNames[actor.role]}</span>
          </div>
          <p>
            退出后需输入
            {logoutTarget === "choose" ? "所选账号" : roleNames[logoutTarget]}
            的测试密码重新登录。已保存的健康记录会保留。
          </p>
          <div className="logout-actions">
            <button onClick={() => setLogoutTarget(null)}>继续使用</button>
            <button className="primary" onClick={logout}>
              <SignOut size={18} />
              确认退出
            </button>
          </div>
        </Modal>
      )}
      {modal && (
        <Modal
          key={patient.id}
          title={
            {
              new: "你想记录什么？",
              monitor: modal.monitor ? "管理监控" : "开启一份新的关注",
              observation: modal.observation ? "修改检测" : "常规检测",
              event: modal.event ? "修改事件" : "记录一次事件",
              plan: "照护计划",
              metric: modal.metric?.name || "指标详情",
            }[modal.type]
          }
          onClose={() => setModal(null)}
        >
          <Editor
            key={modal.type}
            modal={modal}
            db={db}
            patient={patient}
            actor={actor}
            update={update}
            onOpen={setModal}
            onDone={() => {
              setModal(null);
              setNotice("已保存，记录与趋势已同步更新");
            }}
          />
        </Modal>
      )}
    </div>
  );
}
function Empty({ text }: { text: string }) {
  return <p className="empty">{text}</p>;
}
function Alerts({ patient }: { patient: Patient }) {
  const alerts = alertsFor(patient);
  if (!alerts.length)
    return (
      <div className="quiet-status">
        {patient.monitors.some(
          (m) => m.active && ["sjia", "mas"].includes(m.preset),
        )
          ? "当前未触发提醒，继续留意记录变化。"
          : "当前监控提供记录与趋势，未启用风险评估。"}
      </div>
    );
  const activeKeys = new Set(
    patient.monitors
      .filter((m) => m.active && ["sjia", "mas"].includes(m.preset))
      .flatMap((m) => m.metrics),
  );
  const comparisons = METRICS.filter(
    (m) =>
      m.key !== "temp" && m.threshold !== undefined && activeKeys.has(m.key),
  ).flatMap((m) => {
    const history = patient.observations
      .filter((o) => o.metric === m.key && Number.isFinite(Number(o.value)))
      .sort((a, b) => b.at.localeCompare(a.at));
    if (!history.length) return [];
    const current = history[0];
    const value = Number(current.value);
    const threshold = effThreshold(
      m.threshold!,
      (patient.settings ?? DEFAULT_SETTINGS).sensitivity,
    );
    const difference = value - threshold;
    const exceeded = m.direction === "high" ? difference > 0 : difference < 0;
    const change = history[1] ? value - Number(history[1].value) : null;
    return [{ m, current, value, threshold, difference, exceeded, change }];
  });
  const number = (n: number) => Number(n.toFixed(2)).toLocaleString("zh-CN");
  return (
    <section className="alerts" aria-label="健康提醒">
      <div className="risk-dashboard-heading">
        <div>
          <h2>健康提醒</h2>
          <span>sJIA / MAS · 基于最近记录</span>
        </div>
      </div>
      <AlertTicker alerts={alerts}>
        {alerts.map((a) => (
          <details
            key={a.id}
            className={
              "alert " +
              (a.level === "red"
                ? "urgent"
                : a.level === "yellow"
                  ? "advisory"
                  : "watch")
            }
          >
            <summary>
              <span>
                <b className="risk-marker risk-marker-label">
                  {a.level === "red"
                    ? "重度警报"
                    : a.level === "yellow"
                      ? "轻度预警"
                      : "观察提醒"}
                </b>{" "}
                · sJIA / MAS
              </span>
              <strong>
                <span className="risk-marker">{a.title}</span>
              </strong>
              <small>查看依据</small>
            </summary>
            <div className="evidence">
              {Object.entries(a.evidence).map(([k, v]) => (
                <p key={k}>
                  <b>
                    {
                      {
                        what: "记录",
                        line: "参考",
                        duration: "时间",
                        basis: "依据",
                        action: "建议",
                      }[k]
                    }
                  </b>
                  {v}
                </p>
              ))}
            </div>
          </details>
        ))}
      </AlertTicker>
      <div className="threshold-dashboard">
        {comparisons.map(
          ({ m, current, value, threshold, difference, exceeded, change }) => {
            const scale = Math.max(value, threshold) * 1.2;
            return (
              <article
                className={
                  "threshold-metric " +
                  (exceeded ? "outside-threshold" : "within-threshold")
                }
                key={m.key}
              >
                <header>
                  <strong>{m.short}</strong>
                  <span>{exceeded ? "越过规则阈值" : "阈值内"}</span>
                </header>
                <div className="threshold-value">
                  {number(value)}
                  <small>{m.unit}</small>
                </div>
                <p className="threshold-delta">
                  {difference === 0
                    ? "等于阈值"
                    : `${difference > 0 ? "高于" : "低于"}阈值 ${number(Math.abs(difference))} ${m.unit}`}
                  <span>
                    （{number(Math.abs((difference / threshold) * 100))}%）
                  </span>
                </p>
                <div
                  className="threshold-gauge"
                  role="img"
                  aria-label={`当前 ${number(value)}，规则阈值 ${number(threshold)}`}
                >
                  <span
                    className="gauge-fill"
                    style={{ width: `${(value / scale) * 100}%` }}
                  />
                  <i
                    className="gauge-limit"
                    style={{ left: `${(threshold / scale) * 100}%` }}
                  />
                </div>
                <div className="threshold-reference">
                  <span>规则阈值 {number(threshold)}</span>
                  <span>
                    {m.direction === "high" ? "高于时越线" : "低于时越线"}
                  </span>
                </div>
                <footer>
                  <span>
                    {current.at.slice(5, 10)} · {current.source}
                  </span>
                  <span>
                    {change === null
                      ? "暂无上次记录"
                      : `较上次 ${change > 0 ? "+" : ""}${number(change)} ${m.unit}`}
                  </span>
                </footer>
              </article>
            );
          },
        )}
      </div>
      <p className="risk-dashboard-note">
        色彩表示已有规则的提醒级别；阈值内不等于医学正常。竖线为规则阈值，各指标按自身刻度显示。
      </p>
    </section>
  );
}
function Spark({ values }: { values: number[] }) {
  if (values.length < 2)
    return <div className="spark-placeholder">等待更多记录</div>;
  const min = Math.min(...values),
    range = Math.max(...values) - min || 1;
  return (
    <svg className="spark" viewBox="0 0 160 35" aria-label="近期趋势">
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={values
          .map(
            (v, i) =>
              `${(i / (values.length - 1)) * 156 + 2},${31 - ((v - min) / range) * 26}`,
          )
          .join(" ")}
      />
    </svg>
  );
}
function MonitorCard({
  monitor: m,
  patient,
  metrics,
  readonly,
  onRecord,
  onEdit,
  onPause,
  onUp,
  canUp,
  onMetric,
}: {
  monitor: Monitor;
  patient: Patient;
  metrics: Metric[];
  readonly: boolean;
  onRecord: () => void;
  onEdit: () => void;
  onPause: () => void;
  onUp: () => void;
  canUp: boolean;
  onMetric: (m: Metric) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <section className={"monitor panel " + (!m.active ? "paused" : "")}>
      <div className="section-head">
        <div className="monitor-title">
          <span className="monitor-icon">
            <Activity size={23} />
          </span>
          <div>
            <h2>{m.name}</h2>
            <p>
              {!m.active
                ? "已暂停"
                : ["sjia", "mas"].includes(m.preset)
                  ? "持续监控 · 辅助预警"
                  : "记录与趋势 · 未启用风险评估"}
            </p>
          </div>
        </div>
        {!readonly && (
          <details className="menu">
            <summary aria-label={"管理" + m.name}>
              <DotsThree size={24} />
            </summary>
            <div>
              <button onClick={onEdit}>管理指标</button>
              <button onClick={onPause}>
                {m.active ? "暂停监控" : "恢复监控"}
              </button>
              {canUp && <button onClick={onUp}>向上移动</button>}
            </div>
          </details>
        )}
      </div>
      <div className="metric-grid">
        {(expanded ? m.metrics : m.metrics.slice(0, 4)).map((id) => {
          const def = metrics.find((d) => d.id === id);
          if (!def) return null;
          const o = latest(patient, id);
          const values = patient.observations
            .filter(
              (o) =>
                o.metric === id && (id !== "glucose" || o.context === "空腹"),
            )
            .sort((a, b) => a.at.localeCompare(b.at))
            .slice(-14)
            .map((o) => Number(o.value));
          return (
            <button
              className="metric-tile"
              key={id}
              onClick={() => onMetric(def)}
            >
              <span>
                {def.name}
                <ArrowUpRight size={15} />
              </span>
              <div className="metric-value">
                {o ? symptomValue(o) : "未记录"}
                <small>{o ? def.unit : ""}</small>
              </div>
              {def.type === "number" ? (
                <Spark values={values} />
              ) : (
                <div className="spark-placeholder">
                  {o && isGradedSymptom(id) ? symptomChange(o, patient.observations) : o?.context || "点击查看记录"}
                </div>
              )}
              <small>
                {o ? `${o.at.slice(5, 10)} · ${o.source}` : "添加第一条记录"}
              </small>
            </button>
          );
        })}
      </div>
      <small className="monitor-updated">
        最近记录{" "}
        {patient.observations
          .filter((o) => m.metrics.includes(o.metric))
          .map((o) => o.at)
          .sort()
          .at(-1)
          ?.slice(0, 10) || "暂无"}
      </small>
      <div className="monitor-footer">
        <button onClick={() => setExpanded(!expanded)}>
          {expanded
            ? "收起指标"
            : m.metrics.length > 4
              ? `查看全部 ${m.metrics.length} 项`
              : `共 ${m.metrics.length} 项指标`}
        </button>
        {!readonly && m.active && (
          <button className="text-button" onClick={onRecord}>
            <Plus size={17} />
            记录一次
          </button>
        )}
      </div>
    </section>
  );
}
function EventRow({ event: e }: { event: CareEvent }) {
  return (
    <div className="event-row">
      <span className="event-icon">
        <Pill size={19} />
      </span>
      <div>
        <strong>
          {e.type} {e.drug}
        </strong>
        <p>{[e.dose + e.unit, e.route, e.note].filter(Boolean).join(" · ")}</p>
        <small>
          {stamp(e.at)} · {e.author}
        </small>
        <small>
          {e.hospital}
          {e.institution ? " · " + e.institution : ""}
        </small>
      </div>
    </div>
  );
}
function Plans({
  patient: p,
  readonly,
  onToggle,
  onEdit,
}: {
  patient: Patient;
  readonly: boolean;
  onToggle: (p: CarePlan) => void;
  onEdit: (p: CarePlan) => void;
}) {
  return (
    <>
      {!p.plans.length && <Empty text="暂时没有照护计划。" />}
      {p.plans.map((plan) => {
        const done = p.events.some(
          (e) => e.planId === plan.id && e.at.startsWith(todayISO()),
        );
        return (
          <div className="plan-row" key={plan.id}>
            <span className="event-icon">
              <Pill size={20} />
            </span>
            <div>
              <strong>
                {plan.title} {plan.dose}
                {plan.unit}
              </strong>
              <p>
                {plan.type} · {plan.date} · {plan.active ? "进行中" : "已停用"}
              </p>
            </div>
            {readonly ? (
              <small>{done ? "今日已完成" : "未确认"}</small>
            ) : (
              <>
                <button
                  disabled={!plan.active || plan.date > todayISO()}
                  onClick={() => onToggle(plan)}
                  className={done ? "done" : ""}
                >
                  {done ? "撤销确认" : "确认完成"}
                </button>
                <button
                  aria-label={"编辑" + plan.title}
                  onClick={() => onEdit(plan)}
                >
                  <DotsThree size={22} />
                </button>
              </>
            )}
          </div>
        );
      })}
    </>
  );
}
function History({
  patient: p,
  metrics,
  trends,
  readonly,
  actor,
  onEditObservation,
  onEditEvent,
  onDelete,
}: {
  patient: Patient;
  metrics: Metric[];
  trends: boolean;
  readonly: boolean;
  actor: Actor;
  onEditObservation: (o: Observation) => void;
  onEditEvent: (e: CareEvent) => void;
  onDelete: (kind: string, id: string) => void;
}) {
  const key = `nuanshao:view:${actor.role}:${p.id}:${trends}`;
  const [view, setView] = useState(() =>
    read(key, {
      period: "周",
      date: todayISO(),
      monitor: "",
      kind: "全部",
      context: "空腹",
      graphScale: 0,
    }),
  );
  const change = (v: Partial<typeof view>) => {
    const next = { ...view, ...v };
    setView(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      /* browsing state is optional */
    }
  };
  const graphScale = Math.min(100, Math.max(0, Number(view.graphScale) || 0));
  const [start, end] = periodRange(view.date, view.period);
  const monitor = p.monitors.find((m) => m.id === view.monitor);
  const ids = monitor
    ? monitor.metrics
    : [...new Set(p.monitors.flatMap((m) => m.metrics))];
  const events = p.events
    .filter(
      (e) =>
        e.at.slice(0, 10) >= start &&
        e.at.slice(0, 10) <= end &&
        (!monitor || e.monitors.includes(monitor.id)),
    )
    .sort((a, b) => b.at.localeCompare(a.at));
  const observations = p.observations
    .filter(
      (o) =>
        ids.includes(o.metric) &&
        o.at.slice(0, 10) >= start &&
        o.at.slice(0, 10) <= end,
    )
    .sort((a, b) => b.at.localeCompare(a.at));

  const trendSeries = trends ? ids.map((id) => ({
    id,
    def: metrics.find((m) => m.id === id)!,
    rows: seriesFor(p, id, start, end, view.period, id === "glucose" ? view.context : ""),
  })) : [];
  const emptyTrendSeries = trendSeries.filter(({ rows }) => rows.length === 0);

  const shownObservations = !trends && view.kind === "事件" ? [] : observations;
  const shownEvents = !trends && view.kind === "常规检测" ? [] : events;
  const rows = [
    ...shownObservations.map((o) => ({
      at: o.at,
      id: o.id,
      observation: o,
      event: null,
    })),
    ...shownEvents.map((e) => ({
      at: e.at,
      id: e.id,
      observation: null,
      event: e,
    })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  const summary = summarizeHistory(p, shownObservations, shownEvents, metrics);
  const dates = [...new Set(rows.map((row) => row.at.slice(0, 10)))];
  const renderRow = (row: (typeof rows)[number]) => (
    <div
      className={
        "timeline-item " + (row.event ? "event-record" : "observation-record")
      }
      key={row.id}
    >
      {row.event ? (
        <EventRow event={row.event} />
      ) : (
        <div>
          <strong>
            {metrics.find((m) => m.id === row.observation!.metric)?.name}{" "}
            <b>{symptomValue(row.observation!)}</b>{" "}
            {metrics.find((m) => m.id === row.observation!.metric)?.unit}
          </strong>
          <p>
            {stamp(row.at)} · {row.observation!.context}
          </p>
          {isGradedSymptom(row.observation!.metric) && <p>{symptomChange(row.observation!, p.observations)} · {symptomDetail(row.observation!)}</p>}
          <small>
            {row.observation!.source} · {row.observation!.author}
          </small>
        </div>
      )}
      {!readonly && (
        <div className="row-actions">
          <button
            onClick={() =>
              row.event
                ? onEditEvent(row.event)
                : onEditObservation(row.observation!)
            }
          >
            修改
          </button>
          <button
            onClick={() =>
              onDelete(row.event ? "event" : "observation", row.id)
            }
          >
            删除
          </button>
        </div>
      )}
    </div>
  );
  return (
    <div
      className={
        "history-workbench " + (trends ? "is-trends density-workbench" : "")
      }
      style={
        trends
          ? ({
              "--trend-card-width": `${300 + graphScale * 3.4}px`,
              "--trend-chart-height": `${160 + graphScale * 1.4}px`,
            } as React.CSSProperties)
          : undefined
      }
    >
      <div className="history-controls panel">
        <div className={trends ? "trend-context" : undefined}>
        <Calendar
          patient={p}
          date={view.date}
          period={view.period}
          onChange={change}
        />
        {trends && (
          <section className="trend-period-summary" aria-label="周期聚合分析">
            <div className="section-head">
              <h2>{view.period === "月" ? "本月" : view.period === "周" ? "本周" : "当日"}记录概览</h2>
              <small>{dates.length} 个记录日</small>
            </div>
            <dl className="trend-summary-counts">
              {[
                ["检测", summary.sessions, "次"],
                ["治疗与就诊", summary.events, "条"],
                ["住院", summary.admissions, "次"],
                ["输液", summary.infusions, "次"],
              ].map(([label, value, unit]) => (
                <div key={label}><dt>{label}</dt><dd>{value}<small>{unit}</small></dd></div>
              ))}
            </dl>
            <p className="trend-assessment">
              {summary.assessed
                ? <>已评估 {summary.assessed} 项检测，其中 <strong>{summary.exceededIds.length} 项超阈值</strong></>
                : "此范围暂无可评估阈值的检测"}
            </p>
            <small>按所选日期与病种汇总。超阈值按检测项计数，不等于警报次数。</small>
            <details className="trend-shared-events" key={p.id + start + end + view.monitor}>
              <summary>同期事件 <span>{events.length} 条 · 展开查看</span></summary>
              {events.length ? events.map((e) => <EventRow key={e.id} event={e} />) : <p>这段时间没有治疗或就诊事件</p>}
            </details>
          </section>
        )}
        </div>
        <div className="filter-row">
          <select
            aria-label="病种筛选"
            value={view.monitor}
            onChange={(e) => change({ monitor: e.target.value })}
          >
            <option value="">全部监控</option>
            {p.monitors.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          {trends && (
            <label className="graph-scale-control">
              <span>图表大小</span>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={graphScale}
                aria-label="图表大小"
                aria-valuetext={
                  graphScale < 35 ? "紧凑" : graphScale < 70 ? "标准" : "宽幅"
                }
                onChange={(e) => change({ graphScale: Number(e.target.value) })}
              />
              <output>
                {graphScale < 35 ? "紧凑" : graphScale < 70 ? "标准" : "宽幅"}
              </output>
            </label>
          )}
          {!trends && (
            <select
              aria-label="记录类型"
              value={view.kind}
              onChange={(e) => change({ kind: e.target.value })}
            >
              {["全部", "常规检测", "事件"].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          )}
          <small>
            {start} 至 {end}
          </small>
        </div>
      </div>
      {trends ? (
        <div className="trend-grid">
          {trendSeries.filter(({ rows }) => rows.length > 0).map(({ id, def, rows }) => {
            return (
              <section className="panel" key={id}>
                <div className="section-head">
                  <div>
                    <h2>{def.name}</h2>
                    <p>
                      {def.unit}{" "}
                      {id === "temp" && view.period !== "日" ? "· 日最高" : ""}
                    </p>
                  </div>
                  {id === "glucose" && (
                    <select
                      aria-label="血糖背景"
                      value={view.context}
                      onChange={(e) => change({ context: e.target.value })}
                    >
                      {["空腹", "餐后", "随机"].map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  )}
                </div>
                {rows.length ? (
                  isGradedSymptom(id) ? (
                    <><SymptomTrend id={id} rows={rows} />{rows.map(o => <p key={o.id}>{stamp(o.at)} · {symptomValue(o)} · {symptomChange(o, p.observations)}<br />{symptomDetail(o)}</p>)}</>
                  ) : def.type === "number" || def.type === "bp" ? (
                    <div className="chart">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                          data={rows.map((o) => ({
                            date: o.at.slice(5).replace("T", " "),
                            value: Number(o.value.split("/")[0]),
                            diastolic:
                              def.type === "bp"
                                ? Number(o.value.split("/")[1])
                                : undefined,
                          }))}
                        >
                          <CartesianGrid vertical={false} stroke="#eceae4" />
                          <XAxis
                            dataKey="date"
                            tick={{ fontSize: 10 }}
                            minTickGap={35}
                          />
                          <YAxis
                            domain={["auto", "auto"]}
                            width={42}
                            tick={{ fontSize: 11 }}
                          />
                          <Tooltip />
                          {events
                            .filter((e) =>
                              rows.some(
                                (o) => o.at.slice(0, 10) === e.at.slice(0, 10),
                              ),
                            )
                            .map((e) => (
                              <ReferenceLine
                                key={e.id}
                                x={rows
                                  .find(
                                    (o) =>
                                      o.at.slice(0, 10) === e.at.slice(0, 10),
                                  )!
                                  .at.slice(5)
                                  .replace("T", " ")}
                                stroke="#a4aa94"
                                strokeDasharray="3 3"
                                label={{ value: e.type, fontSize: 10 }}
                              />
                            ))}
                          <Line
                            name={def.type === "bp" ? "收缩压" : def.name}
                            dataKey="value"
                            stroke="#146b60"
                            strokeWidth={2}
                            dot={{ r: 3 }}
                            isAnimationActive={false}
                          />
                          {def.type === "bp" && (
                            <Line
                              name="舒张压"
                              dataKey="diastolic"
                              stroke="#7c858e"
                              dot={{ r: 3 }}
                              isAnimationActive={false}
                            />
                          )}
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    rows.map((o) => (
                      <p key={o.id}>
                        {stamp(o.at)} · {o.value}
                      </p>
                    ))
                  )
                ) : (
                  <Empty text="此时间范围没有记录" />
                )}

              </section>
            );
          })}
          {emptyTrendSeries.length > 0 && (
            <details className="trend-empty-group" key={p.id + start + end + view.monitor + view.context}>
              <summary>暂无记录 <span>{emptyTrendSeries.length} 项指标</span></summary>
              <p>所选时间范围内暂无记录，不代表正常或数值为零。</p>
              <ul>
                {emptyTrendSeries.map(({ id, def }) => (
                  <li key={id}>
                    <span>{def.name}</span>
                    {id === "glucose" && (
                      <select aria-label="血糖背景" value={view.context}
                        onChange={(e) => change({ context: e.target.value })}>
                        {["空腹", "餐后", "随机"].map((c) => <option key={c}>{c}</option>)}
                      </select>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      ) : (
        <section className="panel timeline">
          <div className="record-heading">
            <h2>
              {view.period === "日"
                ? view.date
                : view.period === "周"
                  ? "所选周"
                  : `${view.date.slice(0, 4)}年${Number(view.date.slice(5, 7))}月`}
              记录
            </h2>
            <span>
              <i className="log-dot" /> {shownObservations.length} 项检测{" "}
              <i className="event-dot" /> {shownEvents.length} 条事件
            </span>
          </div>
          {view.period === "月" && (
            <div className="month-overview">
              <div className="month-summary-grid">
                {[
                  ["记录", summary.records, "次"],
                  ["检测记录", summary.sessions, "次"],
                  ["检测指标", summary.items, "项"],
                  ["住院事件", summary.admissions, "次"],
                  ["输液事件", summary.infusions, "次"],
                  [
                    "超阈值",
                    summary.assessed ? summary.exceededIds.length : "—",
                    "项",
                  ],
                ].map(([label, value, unit]) => (
                  <div
                    key={label}
                    className={
                      label === "超阈值" && summary.exceededIds.length
                        ? "has-exceeded"
                        : ""
                    }
                  >
                    <span>{label}</span>
                    <strong>
                      {value}
                      <small>{unit}</small>
                    </strong>
                  </div>
                ))}
              </div>
              <p>
                按当前筛选统计 · 有记录 {dates.length}{" "}
                天。检测按提交分组计次，同次多项不重复计次；住院标签不计作住院次数。
              </p>
              <details className="summary-method">
                <summary>超阈值如何计算？</summary>
                <p>
                  仅对当前已启用 sJIA/MAS
                  监控中、有参考阈值且单位匹配的数值，按当前灵敏度逐项比较；包括高于上限或低于下限。同日多次分别计数，不等于警报次数或诊断。已比较{" "}
                  {summary.assessed} 项，未覆盖{" "}
                  {summary.items - summary.assessed} 项；无可比较项显示“—”。
                </p>
              </details>
              <h3>
                每日记录 <small>点击日期展开明细</small>
              </h3>
            </div>
          )}
          {!rows.length && (
            <Empty text="当前筛选下没有记录，试试其他日期或记录类型。" />
          )}
          {view.period === "月"
            ? dates.map((day) => {
                const dayRows = rows.filter((row) => row.at.startsWith(day));
                const daily = summarizeHistory(
                  p,
                  shownObservations.filter((o) => o.at.startsWith(day)),
                  shownEvents.filter((e) => e.at.startsWith(day)),
                  metrics,
                );
                return (
                  <details
                    className="daily-record-group"
                    key={`${view.monitor}:${view.kind}:${day}`}
                  >
                    <summary>
                      <div>
                        <strong>
                          {Number(day.slice(5, 7))}月{Number(day.slice(8))}日
                        </strong>
                        <span>
                          {daily.sessions} 次检测 · {daily.items} 项指标 ·{" "}
                          {daily.events} 条事件
                        </span>
                      </div>
                      <div className="daily-record-badges">
                        {daily.admissions > 0 && (
                          <span>住院 {daily.admissions}</span>
                        )}
                        {daily.infusions > 0 && (
                          <span>输液 {daily.infusions}</span>
                        )}
                        {daily.exceededIds.length > 0 && (
                          <span className="exceeded-count">
                            超阈值 {daily.exceededIds.length} 项
                          </span>
                        )}
                        <CaretDown size={17} />
                      </div>
                    </summary>
                    <div>{dayRows.map(renderRow)}</div>
                  </details>
                );
              })
            : rows.map(renderRow)}
        </section>
      )}
    </div>
  );
}
function AccountMenu({
  actor,
  onSwitch,
}: {
  actor: Actor;
  onSwitch: (role: Role | "choose") => void;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const outside = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node))
        ref.current?.removeAttribute("open");
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && ref.current?.open) {
        ref.current.open = false;
        ref.current.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, []);
  return (
    <details className="account-menu" ref={ref}>
      <summary aria-label={`账号菜单：${roleNames[actor.role]}`}>
        <span className="avatar small">{actor.name[0]}</span>
        <span>{roleNames[actor.role]}</span>
        <CaretDown size={16} />
      </summary>
      <div className="account-dropdown">
        <strong>{actor.name}</strong>
        <small>演示账号 · 已登录</small>
        {(["patient", "family", "doctor"] as Role[]).map((r) => (
          <button
            key={r}
            disabled={actor.role === r}
            onClick={() => {
              ref.current?.removeAttribute("open");
              onSwitch(r);
            }}
          >
            {roleNames[r]}
            <span>{actor.role === r ? "当前" : "切换"}</span>
          </button>
        ))}
        <button
          onClick={() => {
            ref.current?.removeAttribute("open");
            onSwitch("choose");
          }}
        >
          <SignOut size={17} />
          退出登录
        </button>
      </div>
    </details>
  );
}
function Modal({
  title,
  onClose,
  children,
  className = "",
  confirmDiscard = true,
}: {
  className?: string;
  confirmDiscard?: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const dirty = useRef(false);
  const close = () => {
    if (
      !confirmDiscard ||
      !dirty.current ||
      confirm("有未保存内容。放弃本次填写并关闭？")
    )
      onClose();
  };
  useEffect(() => {
    const before = document.activeElement as HTMLElement;
    ref.current?.showModal();
    return () => before?.focus();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-label={title}
      className={"modal " + className}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onChange={() => {
        dirty.current = true;
      }}
    >
      <div className="modal-heading">
        <h2>{title}</h2>
        <button aria-label="关闭" onClick={close}>
          <X size={23} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
function Editor({
  modal,
  db,
  patient,
  actor,
  update,
  onOpen,
  onDone,
}: {
  modal: ModalState;
  db: Database;
  patient: Patient;
  actor: Actor;
  update: (fn: (p: Patient) => void, extra?: (d: Database) => void) => void;
  onOpen: (m: ModalState) => void;
  onDone: () => void;
}) {
  const [error, setError] = useState("");
  const [observationAt, setObservationAt] = useState(modal.observation?.at || modal.event?.at || now());
  const [preset, setPreset] = useState(modal.monitor?.preset || "sjia");
  const [selected, setSelected] = useState<string[]>(
    modal.observation
      ? [modal.observation.metric]
      : modal.monitor?.metrics || [
          ...new Set(
            patient.monitors.filter((m) => m.active).flatMap((m) => m.metrics),
          ),
        ],
  );
  const [customs, setCustoms] = useState<Metric[]>([]);
  const [customName, setCustomName] = useState("");
  const [customType, setCustomType] = useState<Metric["type"]>("number");
  const [customUnit, setCustomUnit] = useState("");
  const [eventType, setEventType] = useState(modal.event?.type || "服药");
  const [metricSelection, setMetricSelection] = useState(
    modal.monitor?.metrics || presets[0].metrics,
  );
  const [monitorName, setMonitorName] = useState(
    modal.monitor?.name || presets[0].name,
  );
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    const f = new FormData(e.currentTarget);
    const v = (key: string) => String(f.get(key) || "");
    try {
      if (modal.type === "monitor") {
        if (!metricSelection.length) throw Error("请至少选择一个指标");
        update(
          (p) => {
            const item: Monitor = {
              id: modal.monitor?.id || uid(),
              name: monitorName.trim(),
              preset,
              metrics: metricSelection,
              active: modal.monitor?.active ?? true,
            };
            if (!item.name) throw Error("请输入监控名称");
            if (modal.monitor)
              p.monitors = p.monitors.map((m) => (m.id === item.id ? item : m));
            else p.monitors.push(item);
          },
          (d) => {
            d.metrics.push(...customs);
          },
        );
      }
      if (modal.type === "observation") {
        const at = v("at");
        const group = modal.observation?.group || uid();
        const rows = selected.flatMap((id) => {
          const def = db.metrics.find((m) => m.id === id)!;
          const graded = isGradedSymptom(id) ? readSymptom(f, id) : null;
          let value = isGradedSymptom(id) ? graded?.value || "" : v(id).trim();
          if (def.type === "bp")
            value = value && v(id + "-dia") ? value + "/" + v(id + "-dia") : "";
          if (!value) return [];
          if (
            def.type === "number" &&
            (!Number.isFinite(Number(value)) || Number(value) < 0)
          )
            throw Error("数值须为非负数字");
          return [
            {
              id: modal.observation?.id || uid(),
              group,
              metric: id,
              ...(graded ? { symptom: graded.symptom } : {}),
              value,
              at,
              created: modal.observation?.created || now(),
              context: id === "glucose" ? v("glucose-context") : "",
              source: v("source"),
              author: actor.name,
            },
          ];
        });
        if (!rows.length) throw Error("请至少填写一项检测");
        update((p) => {
          if (modal.observation)
            p.observations = p.observations.filter(
              (o) => o.id !== modal.observation!.id,
            );
          p.observations.push(...rows);
        });
      }
      if (modal.type === "event") {
        const item: CareEvent = {
          id: modal.event?.id || uid(),
          type: eventType,
          at: v("at"),
          created: modal.event?.created || now(),
          author: actor.name,
          drug: v("drug"),
          dose: v("dose"),
          unit: v("unit"),
          route: v("route"),
          hospital: v("hospital"),
          institution: v("institution"),
          note: v("note"),
          monitors: f.getAll("monitors").map(String),
          planId: modal.event?.planId,
        };
        update((p) => {
          p.events = p.events.filter((e) => e.id !== item.id);
          p.events.push(item);
        });
      }
      if (modal.type === "plan") {
        const item: CarePlan = {
          id: modal.plan?.id || uid(),
          title: v("title"),
          type: v("type"),
          dose: v("dose"),
          unit: v("unit"),
          date: v("date"),
          active: f.has("active"),
        };
        update((p) => {
          p.plans = p.plans.filter((x) => x.id !== item.id);
          p.plans.push(item);
        });
      }
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败，请重试");
    }
  };
  if (modal.type === "new")
    return (
      <div className="action-list">
        {(
          [
            ["monitor", "新增病种监控", "选择预设，建立专属指标组合", Heart],
            ["observation", "常规检测", "体温、症状和检验，一次记清", Activity],
            ["event", "治疗与就诊事件", "服药、打针、输液及就诊", Pill],
          ] as const
        ).map(([type, title, desc, Icon]) => (
          <button key={type} onClick={() => onOpen({ type })}>
            <span className="monitor-icon">
              <Icon size={26} />
            </span>
            <span>
              <strong>{title}</strong>
              <small>{desc}</small>
            </span>
            <ArrowRight />
          </button>
        ))}
      </div>
    );
  if (modal.type === "metric") {
    const m = modal.metric!;
    return (
      <div className="metric-records">
        <p>{m.unit} · 所有实际测量记录</p>
        {patient.observations
          .filter((o) => o.metric === m.id)
          .sort((a, b) => b.at.localeCompare(a.at))
          .map((o) => (
            <div className="timeline-item" key={o.id}>
              <strong>
                {symptomValue(o)} {m.unit}
              </strong>
              <p>
                {stamp(o.at)} · {o.context}
              </p>
              {isGradedSymptom(o.metric) && <p>{symptomChange(o, patient.observations)} · {symptomDetail(o)}</p>}
              <small>
                {o.source} · {o.author}
              </small>
            </div>
          ))}
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="editor">
      <div className="form-context">
        {patient.name} · {actor.name}录入 · 虚拟数据
      </div>
      {modal.type === "monitor" && (
        <>
          <label>
            病种预设
            <select
              value={preset}
              onChange={(e) => {
                const p = presets.find((p) => p.id === e.target.value);
                setPreset(e.target.value);
                setMetricSelection(p?.metrics || []);
                setMonitorName(p?.name || "");
              }}
            >
              {presets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
              <option value="custom">自定义监控</option>
            </select>
          </label>
          <label>
            监控名称
            <input
              required
              value={monitorName}
              onChange={(e) => setMonitorName(e.target.value)}
            />
          </label>
          <p className="form-help">
            预设为可编辑记录模板，不代表确诊。新指标不会自动获得医学阈值。
          </p>
          <div className="check-grid">
            {[...db.metrics, ...customs].map((m) => (
              <label key={m.id}>
                <input
                  type="checkbox"
                  checked={metricSelection.includes(m.id)}
                  onChange={(e) =>
                    setMetricSelection(
                      e.target.checked
                        ? [...metricSelection, m.id]
                        : metricSelection.filter((id) => id !== m.id),
                    )
                  }
                />
                {m.name}
              </label>
            ))}
          </div>
          <div className="selected-order">
            {metricSelection.map((id, i) => (
              <div key={id}>
                {[...db.metrics, ...customs].find((m) => m.id === id)?.name}
                <button
                  type="button"
                  disabled={!i}
                  onClick={() =>
                    setMetricSelection((prev) => {
                      const next = [...prev];
                      [next[i - 1], next[i]] = [next[i], next[i - 1]];
                      return next;
                    })
                  }
                >
                  上移
                </button>
              </div>
            ))}
          </div>
          <details>
            <summary>创建自定义指标</summary>
            <label>
              指标名称
              <input
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
              />
            </label>
            <div className="form-two">
              <label>
                类型
                <select
                  value={customType}
                  onChange={(e) =>
                    setCustomType(e.target.value as Metric["type"])
                  }
                >
                  <option value="number">数值</option>
                  <option value="boolean">是非</option>
                  <option value="text">文字</option>
                </select>
              </label>
              <label>
                单位
                <input
                  value={customUnit}
                  onChange={(e) => setCustomUnit(e.target.value)}
                  disabled={customType !== "number"}
                />
              </label>
            </div>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                if (!customName.trim()) return;
                const m: Metric = {
                  id: uid(),
                  name: customName.trim(),
                  type: customType,
                  unit: customType === "number" ? customUnit : "",
                  custom: true,
                };
                setCustoms([...customs, m]);
                setMetricSelection([...metricSelection, m.id]);
                setCustomName("");
              }}
            >
              添加到本次监控
            </button>
          </details>
        </>
      )}
      {(modal.type === "observation" || modal.type === "event") && (
        <label>
          发生时间
          <input
            required
            type={
              (modal.observation?.at || modal.event?.at)?.length === 10
                ? "date"
                : "datetime-local"
            }
            name="at"
            value={observationAt}
            onChange={e => setObservationAt(e.target.value)}
          />
        </label>
      )}
      {modal.type === "observation" && (
        <>
          <label>
            数据来源
            <select
              name="source"
              defaultValue={
                modal.observation?.source ||
                (actor.role === "family" ? "家属自录" : "本人自录")
              }
            >
              <option>家属自录</option>
              <option>本人自录</option>
              <option>机构报告</option>
            </select>
          </label>
          {!modal.observation && (
            <details>
              <summary>选择本次检测指标</summary>
              <div className="check-grid">
                {db.metrics.map((m) => (
                  <label key={m.id}>
                    <input
                      type="checkbox"
                      checked={selected.includes(m.id)}
                      onChange={(e) =>
                        setSelected(
                          e.target.checked
                            ? [...selected, m.id]
                            : selected.filter((x) => x !== m.id),
                        )
                      }
                    />
                    {m.name}
                  </label>
                ))}
              </div>
            </details>
          )}
          <p className="form-help">只填写实际检测的项目，留空不会生成记录。</p>
          {selected.map((id) => {
            const m = db.metrics.find((m) => m.id === id)!;
            if (isGradedSymptom(id)) return <SymptomField key={id} id={id} observations={patient.observations} at={observationAt} editing={modal.observation} />;
            return (
              <label key={id}>
                {m.name} {m.unit && `（${m.unit}）`}
                {m.type === "boolean" ? (
                  <select
                    name={id}
                    defaultValue={modal.observation?.value || ""}
                  >
                    <option value="">未填写</option>
                    <option>是</option>
                    <option>否</option>
                  </select>
                ) : m.type === "bp" ? (
                  <div className="form-two">
                    <input
                      name={id}
                      type="number"
                      min="1"
                      placeholder="收缩压"
                      defaultValue={modal.observation?.value.split("/")[0]}
                    />
                    <input
                      aria-label="舒张压"
                      name={id + "-dia"}
                      type="number"
                      min="1"
                      placeholder="舒张压"
                      defaultValue={modal.observation?.value.split("/")[1]}
                    />
                  </div>
                ) : (
                  <input
                    name={id}
                    type={m.type === "number" ? "number" : "text"}
                    step="any"
                    min="0"
                    defaultValue={modal.observation?.value}
                    placeholder="未填写"
                  />
                )}
                {id === "glucose" && (
                  <select
                    aria-label="血糖测量背景"
                    name="glucose-context"
                    defaultValue={modal.observation?.context || "空腹"}
                  >
                    <option>空腹</option>
                    <option>餐后</option>
                    <option>随机</option>
                  </select>
                )}
              </label>
            );
          })}
        </>
      )}
      {modal.type === "event" && (
        <>
          <label>
            事件类型
            <select
              value={eventType}
              onChange={(e) => setEventType(e.target.value)}
            >
              {eventTypes.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          {["服药", "打针", "输液", "调药"].includes(eventType) && (
            <>
              <label>
                药物名称
                <input required name="drug" defaultValue={modal.event?.drug} />
              </label>
              <div className="form-two">
                <label>
                  剂量
                  <input
                    name="dose"
                    type="number"
                    min="0"
                    step="any"
                    defaultValue={modal.event?.dose}
                  />
                </label>
                <label>
                  单位
                  <input
                    name="unit"
                    placeholder="mg / mL / 单位"
                    defaultValue={modal.event?.unit}
                  />
                </label>
              </div>
              <label>
                给药途径
                <input
                  name="route"
                  placeholder="口服、皮下注射、静脉输液…"
                  defaultValue={modal.event?.route}
                />
              </label>
            </>
          )}
          <label>
            本次是否住院
            <select
              name="hospital"
              defaultValue={modal.event?.hospital || "未注明"}
            >
              <option>未注明</option>
              <option>住院</option>
              <option>非住院</option>
            </select>
          </label>
          <label>
            机构
            <input name="institution" defaultValue={modal.event?.institution} />
          </label>
          <label>
            备注
            <textarea name="note" defaultValue={modal.event?.note} />
          </label>
          <fieldset>
            <legend>关联监控（可选）</legend>
            <div className="check-grid">
              {patient.monitors.map((m) => (
                <label key={m.id}>
                  <input
                    type="checkbox"
                    name="monitors"
                    value={m.id}
                    defaultChecked={modal.event?.monitors.includes(m.id)}
                  />
                  {m.name}
                </label>
              ))}
            </div>
          </fieldset>
        </>
      )}
      {modal.type === "plan" && (
        <>
          <label>
            药品或事项名称
            <input name="title" required defaultValue={modal.plan?.title} />
          </label>
          <label>
            类型
            <select name="type" defaultValue={modal.plan?.type || "服药"}>
              <option>服药</option>
              <option>打针</option>
              <option>复诊</option>
            </select>
          </label>
          <div className="form-two">
            <label>
              剂量
              <input
                name="dose"
                type="number"
                min="0"
                step="any"
                defaultValue={modal.plan?.dose}
              />
            </label>
            <label>
              单位
              <input name="unit" defaultValue={modal.plan?.unit} />
            </label>
          </div>
          <label>
            计划日期
            <input
              name="date"
              type="date"
              required
              defaultValue={modal.plan?.date || todayISO()}
            />
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              name="active"
              defaultChecked={modal.plan?.active ?? true}
            />
            启用计划
          </label>
        </>
      )}
      {error && (
        <p className="save-error" role="alert">
          {error}。输入已保留。
        </p>
      )}
      <button className="primary submit" type="submit">
        保存{modal.type === "monitor" ? "监控" : "记录"}{" "}
        <ArrowRight size={18} />
      </button>
    </form>
  );
}
