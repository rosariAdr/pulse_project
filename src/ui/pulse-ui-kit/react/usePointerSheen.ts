import { useCallback, type PointerEvent } from "react";

/**
 * Feeds --mx / --my to a `.pl-card--link` so its sheen follows the pointer.
 * CSS does the rest (the ::after gradient fades in on hover). Touch devices
 * never fire a hover, so nothing happens there — by design.
 */
export function usePointerSheen<T extends HTMLElement = HTMLElement>() {
  return useCallback((e: PointerEvent<T>) => {
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${(((e.clientX - r.left) / r.width) * 100).toFixed(1)}%`);
    el.style.setProperty("--my", `${(((e.clientY - r.top) / r.height) * 100).toFixed(1)}%`);
  }, []);
}
