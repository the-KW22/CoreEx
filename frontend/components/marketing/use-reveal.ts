import { animate, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

// Progress (0 to 1) of a short scene that plays once, when its box scrolls into view. With reduced motion it is
// already finished. A fifth of the box is enough, so a tall box on a short (landscape) phone still starts.
export function useReveal<T extends HTMLElement>(seconds: number) {
  const ref = useRef<T>(null);
  const reduce = useReducedMotion();
  const inView = useInView(ref, { once: true, amount: 0.2 });
  const [p, setP] = useState(0);
  useEffect(() => {
    if (!inView || reduce) return;
    const playing = animate(0, 1, { duration: seconds, ease: "linear", onUpdate: setP });
    return () => playing.stop();
  }, [inView, reduce, seconds]);
  return [ref, reduce ? 1 : p] as const;
}
