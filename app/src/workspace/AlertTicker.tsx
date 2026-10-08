import { useEffect, useId, useRef, useState } from "react";
import {
  CaretDown,
  CaretLeft,
  CaretRight,
  Pause,
  Play,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";
import type { Alert } from "../engine/alerts";

export default function AlertTicker({
  alerts,
  children,
}: {
  alerts: Alert[];
  children: ReactNode;
}) {
  const [index, setIndex] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [reduced, setReduced] = useState(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const id = useId();
  useEffect(() => {
    const query = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  const track = useRef<HTMLSpanElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const [duration, setDuration] = useState(20);
  const [visible, setVisible] = useState(true);
  const [hidden, setHidden] = useState(document.hidden);
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const resize = new ResizeObserver(() => setDuration(el.scrollWidth / 2 / 52));
    resize.observe(el);
    return () => resize.disconnect();
  }, [alerts, reduced]);
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    if (root.current) observer.observe(root.current);
    const update = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", update);
    return () => { observer.disconnect(); document.removeEventListener("visibilitychange", update); };
  }, []);
  if (!alerts.length) return null;
  const ordered = [...alerts.slice(index % alerts.length), ...alerts.slice(0, index % alerts.length)];
  const stopped = expanded || paused || hovered || focused || hidden || !visible;
  return (
    <div
      className="alert-ticker"
      ref={root}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false);
      }}
    >
      <div className="ticker-bar">
        <button
          className="ticker-open"
          aria-expanded={expanded}
          aria-controls={id}
          onClick={() => setExpanded(!expanded)}
          aria-label={`${alerts.filter((a) => a.level === "red").length} 条重度警报，${alerts.filter((a) => a.level === "yellow").length} 条轻度预警。${expanded ? "收起" : "展开"} ${alerts.length} 条提醒`}
        >
          <span className="ticker-levels">
            <b className="ticker-red">
              重度警报 <strong>{alerts.filter((a) => a.level === "red").length}</strong>
            </b>
            <b className="ticker-orange">
              轻度预警 <strong>{alerts.filter((a) => a.level === "yellow").length}</strong>
            </b>
            {alerts.some((a) => a.level === "watch") && (
              <b>观察 {alerts.filter((a) => a.level === "watch").length}</b>
            )}
          </span>
          <span className="ticker-window" aria-hidden="true">
            {reduced ? <span className="ticker-static">{ordered[0].title}</span> :
              <span className="ticker-track" key={index} ref={track} style={{ animationDuration: `${duration}s`, animationPlayState: stopped ? "paused" : "running" }}>
                {[0, 1].map(copy => <span className="ticker-run" key={copy}>
                  {ordered.map(alert => <span className="ticker-message" key={alert.id}>
                    <span className={alert.level === "red" ? "ticker-red" : "ticker-orange"}>{alert.level === "red" ? "警报" : alert.level === "yellow" ? "预警" : "观察"}</span>
                    {alert.title}
                  </span>)}
                </span>)}
              </span>}
          </span>
          <span className="ticker-expand">
            {expanded ? "收起" : `查看 ${alerts.length} 项`}
            <CaretDown size={15} />
          </span>
        </button>
        <div className="ticker-controls" aria-label="提醒滚动控制">
          <button
            aria-label="上一条提醒"
            onClick={() => {
              setIndex((i) => (i + alerts.length - 1) % alerts.length);
              setPaused(true);
            }}
          >
            <CaretLeft size={15} />
          </button>
          <span aria-hidden="true">
            {(index % alerts.length) + 1}/{alerts.length}
          </span>
          <button
            aria-label="下一条提醒"
            onClick={() => {
              setIndex((i) => (i + 1) % alerts.length);
              setPaused(true);
            }}
          >
            <CaretRight size={15} />
          </button>
          {!reduced && (
            <button
              aria-label={paused ? "继续滚动提醒" : "暂停滚动提醒"}
              onClick={() => setPaused(!paused)}
            >
              {paused ? <Play size={15} /> : <Pause size={15} />}
            </button>
          )}
        </div>
      </div>
      {expanded && (
        <div id={id} className="ticker-details">
          {children}
        </div>
      )}
    </div>
  );
}
