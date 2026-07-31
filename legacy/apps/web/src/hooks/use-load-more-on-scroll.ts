import type { PaginationStatus } from "convex/react";
import type { RefObject } from "react";
import { useEffect } from "react";

/**
 * Fires `loadMore` whenever the user scrolls within `threshold` pixels of the
 * specified edge of the container. A single scroll listener measures
 * scrollTop/scrollHeight/clientHeight directly — no per-item
 * IntersectionObserver sentinel, no layout overhead.
 *
 * The effect also runs once on mount (and whenever status flips back to
 * `CanLoadMore`) so that if the current page already fits within the
 * threshold, the next page is fetched without requiring a scroll event.
 */
export function useLoadMoreOnScroll({
  scrollRef,
  edge,
  threshold = 700,
  status,
  loadMore,
  enabled = true,
}: {
  scrollRef: RefObject<HTMLElement | null>;
  edge: "top" | "bottom";
  threshold?: number;
  status: PaginationStatus;
  loadMore: () => void;
  enabled?: boolean;
}) {
  // eslint-disable-next-line no-restricted-syntax -- Subscribes to the container's native scroll event to measure edge distance and trigger pagination
  useEffect(() => {
    if (!enabled) return;
    if (status !== "CanLoadMore") return;
    const element = scrollRef.current;
    if (!element) return;

    function checkShouldLoadMore() {
      if (!element) return;
      const distance =
        edge === "top"
          ? element.scrollTop
          : element.scrollHeight - element.scrollTop - element.clientHeight;
      if (distance < threshold) {
        loadMore();
      }
    }

    element.addEventListener("scroll", checkShouldLoadMore, { passive: true });
    checkShouldLoadMore();
    return () => {
      element.removeEventListener("scroll", checkShouldLoadMore);
    };
  }, [scrollRef, edge, threshold, status, loadMore, enabled]);
}
