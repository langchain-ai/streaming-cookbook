import { useEffect, useRef } from "react";

/**
 * Renders an anchor at the bottom of the subtree and scrolls it into view when
 * `deps` change. Omit `deps` (or pass `[]`) to scroll only after mount.
 * Place after the content you want to keep in view (transcript, composer, etc.).
 */
export function PageBottomAutoScroll() {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, []);

  return <div aria-hidden="true" ref={bottomRef} />;
}
