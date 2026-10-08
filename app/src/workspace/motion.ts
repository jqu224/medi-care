// One focal transition: the selected patient card becomes the profile header.
const motion = {
  feedback: 140,
  reveal: 440,
  journey: 520,
  stagger: 45,
  ease: "cubic-bezier(.16,1,.3,1)",
};
let active: Animation[] = [];
export function revealPatient(origin: DOMRect) {
  active.forEach((animation) => animation.cancel());
  active = [];
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const heading = document.querySelector<HTMLElement>(
    ".patient-content .page-heading",
  );
  if (!heading) return;
  const destination = heading.getBoundingClientRect();
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
            delay: Math.min(index, 5) * motion.stagger + motion.journey,
            easing: motion.ease,
            fill: "backwards",
          },
        ),
      );
    });
}
