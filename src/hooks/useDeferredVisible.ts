// useDeferredVisible — defer expensive below-the-fold analytics fetches until
// the panel actually scrolls into view. Once visible it latches to `true` so
// data never disappears again.
//
// This removes mobile fetch waterfalls without changing any metric: the same
// query runs with the same parameters, just later (and only when needed).
import { useCallback, useEffect, useRef, useState } from "react";

export function useDeferredVisible<T extends HTMLElement = HTMLDivElement>(
  rootMargin = "300px",
) {
  const [visible, setVisible] = useState(false);
  const nodeRef = useRef<T | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const ref = useCallback(
    (node: T | null) => {
      nodeRef.current = node;
      observerRef.current?.disconnect();
      if (!node || visible) return;
      if (typeof IntersectionObserver === "undefined") {
        setVisible(true);
        return;
      }
      observerRef.current = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            setVisible(true);
            observerRef.current?.disconnect();
          }
        },
        { rootMargin },
      );
      observerRef.current.observe(node);
    },
    [rootMargin, visible],
  );

  useEffect(() => () => observerRef.current?.disconnect(), []);

  return { ref, visible };
}
