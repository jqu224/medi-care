// Patient switch keeps the card-to-header flight. Tab changes fade rows upward.
const motion = {
  feedback: 140,
  reveal: 440,
  journey: 520,
  stagger: 45,
  fade: 1100,
  row: 120,
  ease: "cubic-bezier(.16,1,.3,1)",
};
export const SKELETON_MS = 1000;
let active: Animation[] = [];
function revealContent(delay: number) {
  document
    .querySelectorAll<HTMLElement>(".patient-content > :not(.page-heading)")
    .forEach((element, index) => {
      active.push(
        element.animate(
          [
            { transform: "translateY(18px)", opacity: 0, filter: "blur(2px)" },
            { transform: "translateY(0)", opacity: 1, filter: "blur(0)" },
          ],
          {
            duration: motion.reveal,
            delay: Math.min(index, 5) * motion.stagger + delay,
            easing: motion.ease,
            fill: "backwards",
          },
        ),
      );
    });
}
/** Page reveal. Patient cards pass `fly` so the heading travels from the card. */
export function revealView(origin?: DOMRect, fly = false) {
  active.forEach((animation) => animation.cancel());
  active = [];
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const heading = document.querySelector<HTMLElement>(
    ".patient-content .page-heading",
  );
  if (!heading) return;
  const destination = heading.getBoundingClientRect();
  const spatial = Boolean(fly && origin && origin.width > 0);
  if (origin && spatial) {
    const x = origin.left - destination.left;
    const y = origin.top - destination.top;
    const scale = Math.min(
      1.15,
      Math.max(0.75, origin.width / destination.width),
    );
    active.push(
      heading.animate(
        [
          {
            transform: `translate(${x}px, ${y}px) perspective(1000px) rotateY(-12deg) scale(${scale})`,
            opacity: 0.55,
            borderRadius: "16px",
            background: "#eaf4f1",
          },
          {
            transform: "translate(0,0) perspective(1000px) rotateY(0) scale(1)",
            opacity: 1,
            borderRadius: "0px",
            background: "#fff",
          },
        ],
        { duration: motion.journey, easing: motion.ease },
      ),
    );
  } else {
    active.push(
      heading.animate(
        [
          { transform: "translateY(18px)", opacity: 0, filter: "blur(2px)" },
          { transform: "translateY(0)", opacity: 1, filter: "blur(0)" },
        ],
        { duration: motion.reveal, easing: motion.ease, fill: "backwards" },
      ),
    );
  }
  revealContent(spatial ? motion.journey : motion.stagger);
}
export function revealPatient(origin: DOMRect) {
  revealView(origin, true);
}
/** Tab pages: each row fades up. Bottom-origin motion, top row first. */
export function revealRows() {
  active.forEach((animation) => animation.cancel());
  active = [];
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  document
    .querySelectorAll<HTMLElement>(".patient-content > :not(.page-skeleton)")
    .forEach((element, index) => {
      active.push(
        element.animate(
          [
            { opacity: 0, transform: "translateY(22px)" },
            { opacity: 1, transform: "none" },
          ],
          {
            duration: motion.fade,
            delay: index * motion.row,
            easing: motion.ease,
            fill: "backwards",
          },
        ),
      );
    });
}
