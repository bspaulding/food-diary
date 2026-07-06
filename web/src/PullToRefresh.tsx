import type { Component, ParentProps } from "solid-js";
import { Show, createSignal, onCleanup, onMount } from "solid-js";

// Distance (in px, after resistance) the user must pull before releasing
// triggers a refresh.
export const PULL_THRESHOLD = 60;
// Cap on how far the indicator can be pulled down.
const MAX_PULL = 100;
// Finger movement is damped by this factor so the pull feels elastic.
const RESISTANCE = 0.5;

type PullToRefreshProps = ParentProps<{
  onRefresh: () => Promise<unknown>;
}>;

const PullToRefresh: Component<PullToRefreshProps> = (
  props: PullToRefreshProps,
) => {
  const [pullDistance, setPullDistance] = createSignal(0);
  const [pulling, setPulling] = createSignal(false);
  const [refreshing, setRefreshing] = createSignal(false);
  let startY: number | null = null;
  let container: HTMLDivElement | undefined;

  const atTop = () => (document.scrollingElement?.scrollTop ?? 0) <= 0;

  const onTouchStart = (event: TouchEvent) => {
    if (refreshing() || !atTop()) return;
    startY = event.touches[0].clientY;
    setPulling(true);
  };

  const onTouchMove = (event: TouchEvent) => {
    if (startY === null || refreshing()) return;
    const delta = event.touches[0].clientY - startY;
    if (delta <= 0 || !atTop()) {
      setPullDistance(0);
      return;
    }
    // Take over from native scrolling while the user is pulling down
    // from the top of the page.
    if (event.cancelable) event.preventDefault();
    setPullDistance(Math.min(delta * RESISTANCE, MAX_PULL));
  };

  const onTouchEnd = () => {
    if (startY === null) return;
    startY = null;
    setPulling(false);
    if (pullDistance() < PULL_THRESHOLD) {
      setPullDistance(0);
      return;
    }
    setRefreshing(true);
    setPullDistance(PULL_THRESHOLD);
    void (async () => {
      try {
        await props.onRefresh();
      } finally {
        setRefreshing(false);
        setPullDistance(0);
      }
    })();
  };

  onMount(() => {
    const el = container;
    if (!el) return;
    // touchmove must be registered non-passive so preventDefault can stop
    // the browser's native scroll/overscroll while pulling.
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", onTouchEnd);
    onCleanup(() => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    });
  });

  return (
    <div ref={container} data-testid="pull-to-refresh">
      <div
        class="flex items-end justify-center overflow-hidden"
        aria-hidden={pullDistance() === 0}
        style={{
          height: `${pullDistance()}px`,
          transition: pulling() ? "none" : "height 0.2s ease-out",
        }}
      >
        <Show
          when={refreshing()}
          fallback={
            <span
              class="mb-2 text-slate-400 transition-transform"
              style={{
                transform: `rotate(${
                  pullDistance() >= PULL_THRESHOLD ? 180 : 0
                }deg)`,
              }}
            >
              ↓
            </span>
          }
        >
          <span
            role="status"
            aria-label="Refreshing"
            class="mb-2 h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600"
          />
        </Show>
      </div>
      {props.children}
    </div>
  );
};

export default PullToRefresh;
