// 单行滚动条：让「AI 生成仅供参考」这类必须常驻的声明走一遍视野。
//
// 跟警报滚动条（AlertTicker）不同，那条是多条轮播 + 上下条 + 暂停控制，
// 这里只有一句话，不需要任何控件，所以单独做一个轻量版本。
//
// 三件必须做到的事（和警报条同一条底线）：
//   1. 系统开了「减少动态效果」就退回静态文本，不强行动
//   2. 悬停、聚焦时暂停，让人能读完
//   3. 滚出视口或切到别的标签页时暂停，别在看不见的地方空转

import { useEffect, useRef, useState } from "react";

export default function ScrollTicker({
  text,
  /** 每秒移动的像素，和警报条保持一致 */
  speed = 52,
  className = "",
}: {
  text: string;
  speed?: number;
  className?: string;
}) {
  const track = useRef<HTMLSpanElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const [reduced, setReduced] = useState(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [held, setHeld] = useState(false);
  const [onScreen, setOnScreen] = useState(true);
  const [tabActive, setTabActive] = useState(() => !document.hidden);
  const [duration, setDuration] = useState(20);

  useEffect(() => {
    const query = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  /* 跑一圈的时长 = 两份文字的宽度 ÷ 速度，文字越长滚得越久 */
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const resize = new ResizeObserver(() => setDuration(el.scrollWidth / 2 / speed));
    resize.observe(el);
    return () => resize.disconnect();
  }, [text, speed]);

  useEffect(() => {
    const observer = new IntersectionObserver(([e]) => setOnScreen(e.isIntersecting));
    if (root.current) observer.observe(root.current);
    const onVisibility = () => setTabActive(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const stopped = held || !onScreen || !tabActive;

  return (
    <div
      className={`scroll-ticker ${className}`}
      ref={root}
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocusCapture={() => setHeld(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setHeld(false);
      }}
    >
      {reduced ? (
        <span className="scroll-ticker-static">{text}</span>
      ) : (
        <span
          className="scroll-ticker-track"
          ref={track}
          style={{
            animationDuration: `${duration}s`,
            animationPlayState: stopped ? "paused" : "running",
          }}
        >
          {/* 两份接龙：滚掉一半时第二份正好顶上，看不出接缝 */}
          {[0, 1].map((i) => (
            <span className="scroll-ticker-run" key={i} aria-hidden={i === 1}>
              {text}
            </span>
          ))}
        </span>
      )}
    </div>
  );
}
