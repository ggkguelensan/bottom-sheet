import type {
  ShellSheetController,
  ShellSheetOpenTarget,
  ShellSheetSnapshot,
} from "@shell-sheet/core";
import {
  findRegionLayer,
  measureTargetGeometry,
  requiredTargetReady,
  visualOpenTarget,
} from "./measurement.js";
import {
  applyStructuralMechanics,
  projectStableState,
} from "./styling-projection.js";
import type {
  ShellAnimationControls,
  ShellAnimationDriver,
  ShellRegionName,
  ShellSheetDomEnvironment,
  ShellSheetInsets,
  ShellSheetMeasuredGeometry,
  ShellSheetRegistrySnapshot,
} from "./types.js";

const DEFAULT_TIMING = Object.freeze({
  open: 280,
  close: 220,
  geometry: 270,
  region: 220,
  easingEnter: "cubic-bezier(0.32, 0.72, 0, 1)",
  easingChange: "cubic-bezier(0.65, 0, 0.35, 1)",
});

type TransitionCoordinatorOptions<
  TSnap extends string,
  TRegionKey extends string,
> = Readonly<{
  controller: ShellSheetController<TSnap, TRegionKey>;
  animation: ShellAnimationDriver;
  getEnvironment(): ShellSheetDomEnvironment | null;
  getRegistry(): ShellSheetRegistrySnapshot<TRegionKey>;
  getInsets(): ShellSheetInsets;
  onGeometry(geometry: ShellSheetMeasuredGeometry<TSnap>): void;
  onBeforeVisible(snapshot: ShellSheetSnapshot<TSnap, TRegionKey>): void;
  onAfterSettled(snapshot: ShellSheetSnapshot<TSnap, TRegionKey>): void;
  onAfterHidden(): void;
}>;

export type ShellSheetTransitionCoordinator = Readonly<{
  schedule(reason: string): void;
  reconcileNow(): void;
  destroy(): void;
}>;

type ActiveAttempt<TSnap extends string, TRegionKey extends string> = {
  readonly transitionId: number;
  readonly targetId: string;
  readonly visualTarget: ShellSheetOpenTarget<TSnap, TRegionKey>;
  readonly targetHeight: number;
  readonly controls: ShellAnimationControls[];
  readonly cleanup: () => void;
};

type LayerVisual = Readonly<{
  opacity: string;
  filter: string;
  transform: string;
}>;

const presentationChanged = <TSnap extends string, TRegionKey extends string>(
  previous: ShellSheetOpenTarget<TSnap, TRegionKey> | null,
  target: ShellSheetOpenTarget<TSnap, TRegionKey>,
): previous is ShellSheetOpenTarget<TSnap, TRegionKey> =>
  previous !== null && previous.presentation !== target.presentation;

const parseDuration = (raw: string): number | null => {
  const value = raw.trim();
  if (value.length === 0) return null;
  const match = /^(-?(?:\d+\.?\d*|\.\d+))(ms|s)$/.exec(value);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return match[2] === "s" ? amount * 1_000 : amount;
};

const easingKeywords = new Set([
  "linear",
  "ease",
  "ease-in",
  "ease-out",
  "ease-in-out",
]);

const validEasing = (raw: string): boolean => {
  if (easingKeywords.has(raw)) return true;
  const match = /^cubic-bezier\(([^)]+)\)$/.exec(raw);
  if (!match) return false;
  const values = match[1]!.split(",").map((value) => Number(value.trim()));
  return values.length === 4 &&
    values.every(Number.isFinite) &&
    values[0]! >= 0 &&
    values[0]! <= 1 &&
    values[2]! >= 0 &&
    values[2]! <= 1;
};

const readTiming = (
  popup: HTMLElement,
  environment: ShellSheetDomEnvironment,
  warn: (property: string, value: string) => void,
) => {
  const style = environment.getComputedStyle(popup);
  const easingEnter = style
    .getPropertyValue("--shell-sheet-easing-enter")
    .trim();
  const easingChange = style
    .getPropertyValue("--shell-sheet-easing-change")
    .trim();
  const duration = (property: string, fallback: number): number => {
    const raw = style.getPropertyValue(property).trim();
    const parsed = parseDuration(raw);
    if (parsed !== null) return parsed;
    if (raw.length > 0) warn(property, raw);
    return fallback;
  };
  const easing = (property: string, raw: string, fallback: string): string => {
    if (raw.length === 0) return fallback;
    if (validEasing(raw)) return raw;
    warn(property, raw);
    return fallback;
  };
  return {
    open: duration("--shell-sheet-open-duration", DEFAULT_TIMING.open),
    close: duration("--shell-sheet-close-duration", DEFAULT_TIMING.close),
    geometry: duration(
      "--shell-sheet-geometry-duration",
      DEFAULT_TIMING.geometry,
    ),
    region: duration("--shell-sheet-region-duration", DEFAULT_TIMING.region),
    easingEnter: easing(
      "--shell-sheet-easing-enter",
      easingEnter,
      DEFAULT_TIMING.easingEnter,
    ),
    easingChange: easing(
      "--shell-sheet-easing-change",
      easingChange,
      DEFAULT_TIMING.easingChange,
    ),
  };
};

const directionOffset = (
  target: ShellSheetOpenTarget<string, string>,
): number => {
  if (target.transition.direction === "forward") return 8;
  if (target.transition.direction === "backward") return -8;
  return 0;
};

const clearLayerMechanics = (element: HTMLElement): void => {
  element.style.removeProperty("opacity");
  element.style.removeProperty("filter");
  element.style.removeProperty("transform");
};

const GEOMETRY_EPSILON = 0.5;

export function createTransitionCoordinator<
  TSnap extends string,
  TRegionKey extends string,
>(
  options: TransitionCoordinatorOptions<TSnap, TRegionKey>,
): ShellSheetTransitionCoordinator {
  let destroyed = false;
  let scheduledFrame: number | null = null;
  let animateFrame: number | null = null;
  let active: ActiveAttempt<TSnap, TRegionKey> | null = null;
  let pendingTransitionId: number | null = null;
  let currentHeight: number | null = null;
  let openingPrepared = false;
  const warnedTiming = new Set<string>();
  const warnInvalidTiming = (property: string, value: string): void => {
    const signature = `${property}:${value}`;
    if (warnedTiming.has(signature)) return;
    warnedTiming.add(signature);
    globalThis.console?.warn(
      `ShellSheet ignored invalid ${property} value "${value}" and used its default.`,
    );
  };

  const stopActive = (): void => {
    const attempt = active;
    if (!attempt) return;
    active = null;
    pendingTransitionId = null;
    for (const controls of attempt.controls) controls.stop();
    attempt.cleanup();
  };

  const settleAttempt = (
    attempt: ActiveAttempt<TSnap, TRegionKey>,
    snapshotBeforeSettle: ShellSheetSnapshot<TSnap, TRegionKey>,
    geometry: ShellSheetMeasuredGeometry<TSnap>,
  ): void => {
    if (destroyed || active !== attempt) return;
    active = null;
    attempt.cleanup();
    currentHeight = geometry.targetHeight;
    options.controller.settleTransition(attempt.transitionId);
    const snapshot = options.controller.getSnapshot();
    const registry = options.getRegistry();
    projectStableState(snapshot, registry, geometry);
    options.onAfterSettled(snapshot);
    const popup = registry.elements.popup;
    if (popup) {
      popup.style.height = `${geometry.targetHeight}px`;
      popup.style.removeProperty("transform");
      popup.style.removeProperty("opacity");
    }
    if (snapshotBeforeSettle.authoritativeTarget?.open === false) {
      registry.elements.portal?.setAttribute("hidden", "");
      options.onAfterHidden();
      openingPrepared = false;
    } else if (registry.elements.portal) {
      registry.elements.portal.style.removeProperty("visibility");
      registry.elements.portal.style.removeProperty("pointer-events");
    }
  };

  const animateRegions = (
    target: ShellSheetOpenTarget<TSnap, TRegionKey>,
    previous: ShellSheetOpenTarget<TSnap, TRegionKey> | null,
    registry: ShellSheetRegistrySnapshot<TRegionKey>,
    durationMs: number,
    easing: string,
    reduceMotion: boolean,
    controls: ShellAnimationControls[],
    cleanups: Array<() => void>,
    currentVisuals: ReadonlyMap<HTMLElement, LayerVisual>,
  ): void => {
    if (!previous) return;
    const offset = directionOffset(
      target as ShellSheetOpenTarget<string, string>,
    );

    for (const region of ["header", "body", "footer"] as const) {
      const targetRegion = target.regions[region];
      const previousRegion = previous.regions[region];
      if (
        targetRegion.key === previousRegion.key ||
        targetRegion.transition !== "crossfade"
      ) {
        continue;
      }

      const incoming = findRegionLayer(registry, region, targetRegion.key);
      const outgoing = findRegionLayer(registry, region, previousRegion.key);
      if (!incoming || !outgoing) continue;
      const actualDuration = target.transition.motion === "instant" ? 0 : durationMs;
      const incomingOffset = reduceMotion ? 0 : offset;
      const outgoingOffset = reduceMotion ? 0 : -offset;
      const incomingCurrent = currentVisuals.get(incoming);
      const outgoingCurrent = currentVisuals.get(outgoing);
      const incomingOpacity = incomingCurrent?.opacity || "0";
      const incomingFilter = incomingCurrent?.filter ||
        (reduceMotion ? "none" : "blur(2px)");
      const incomingTransform = incomingCurrent?.transform === "none"
        ? "translateY(0px)"
        : incomingCurrent?.transform || `translateY(${incomingOffset}px)`;
      const outgoingOpacity = outgoingCurrent?.opacity || "1";
      const outgoingFilter = outgoingCurrent?.filter || "blur(0px)";
      const outgoingTransform = outgoingCurrent?.transform === "none"
        ? "translateY(0px)"
        : outgoingCurrent?.transform || "translateY(0px)";
      incoming.style.opacity = incomingOpacity;
      incoming.style.filter = incomingFilter;
      incoming.style.transform = incomingTransform;
      outgoing.style.opacity = outgoingOpacity;
      outgoing.style.filter = outgoingFilter;
      outgoing.style.transform = outgoingTransform;

      controls.push(
        options.animation.animate(
          incoming,
          {
            opacity: [Number(incomingOpacity), 1],
            filter: reduceMotion
              ? ["none", "none"]
              : [incomingFilter, "blur(0px)"],
            transform: [
              incomingTransform,
              "translateY(0px)",
            ],
          },
          { durationMs: actualDuration, easing },
        ),
      );
      controls.push(
        options.animation.animate(
          outgoing,
          {
            opacity: [Number(outgoingOpacity), 0],
            filter: reduceMotion
              ? ["none", "none"]
              : [outgoingFilter, "blur(2px)"],
            transform: [
              outgoingTransform,
              `translateY(${outgoingOffset}px)`,
            ],
          },
          { durationMs: actualDuration, easing },
        ),
      );
      cleanups.push(() => {
        clearLayerMechanics(incoming);
        clearLayerMechanics(outgoing);
      });
    }
  };

  const run = (): void => {
    scheduledFrame = null;
    if (destroyed) return;
    const environment = options.getEnvironment();
    if (!environment) return;
    const registry = options.getRegistry();
    const snapshot = options.controller.getSnapshot();
    const authoritative = snapshot.authoritativeTarget;
    const visualTarget = visualOpenTarget(snapshot);
    const { portal, popup, backdrop } = registry.elements;
    if (!portal || !popup || !authoritative) return;

    applyStructuralMechanics(registry);

    if (!authoritative.open && !snapshot.settledTarget) {
      projectStableState(snapshot, registry, null);
      portal.hidden = true;
      options.onAfterHidden();
      return;
    }
    if (!visualTarget || !requiredTargetReady(visualTarget, registry)) return;
    const previousVisualTarget = active?.visualTarget ?? snapshot.settledTarget;

    if (portal.hidden && authoritative.open && !openingPrepared) {
      portal.hidden = false;
      portal.style.visibility = "hidden";
      portal.style.pointerEvents = "none";
      openingPrepared = true;
      scheduledFrame = environment.requestAnimationFrame(run);
      return;
    }

    // Measure phase: every layout/computed-style read precedes mechanic writes.
    const measuredGeometry = measureTargetGeometry(
      visualTarget,
      registry,
      environment,
      options.getInsets(),
    );
    const keepCurrentSnapHeight =
      authoritative.open &&
      previousVisualTarget !== null &&
      authoritative.contentResizeBehavior === "keep-snap-and-scroll" &&
      authoritative.snapPoint === previousVisualTarget.snapPoint;
    const keptHeight =
      measuredGeometry.currentRect.height > 0
        ? measuredGeometry.currentRect.height
        : (currentHeight ?? measuredGeometry.targetHeight);
    const geometry: ShellSheetMeasuredGeometry<TSnap> = keepCurrentSnapHeight
      ? Object.freeze({
          ...measuredGeometry,
          targetHeight: keptHeight,
          resolvedSnapPoints: Object.freeze(
            measuredGeometry.resolvedSnapPoints
              .map((point) =>
                point.id === authoritative.snapPoint
                  ? Object.freeze({ ...point, height: keptHeight })
                  : point,
              )
              .sort(
                (left, right) =>
                  left.height - right.height ||
                  left.declarationIndex - right.declarationIndex,
              ),
          ),
        })
      : measuredGeometry;
    if (
      active?.targetId === authoritative.targetId &&
      Math.abs(active.targetHeight - geometry.targetHeight) < GEOMETRY_EPSILON
    ) {
      return;
    }
    if (
      active === null &&
      snapshot.phase === "open" &&
      snapshot.settledTarget?.targetId === authoritative.targetId &&
      currentHeight !== null &&
      Math.abs(currentHeight - geometry.targetHeight) < GEOMETRY_EPSILON
    ) {
      projectStableState(snapshot, registry, geometry);
      popup.style.height = `${geometry.targetHeight}px`;
      popup.style.removeProperty("transform");
      popup.style.removeProperty("opacity");
      return;
    }
    const timing = readTiming(popup, environment, warnInvalidTiming);
    const computedPopup = environment.getComputedStyle(popup);
    const fromHeight =
      geometry.currentRect.height > 0
        ? geometry.currentRect.height
        : (currentHeight ?? geometry.targetHeight);
    const currentTransform = computedPopup.transform === "none"
      ? "translateY(0px)"
      : computedPopup.transform;
    const currentOpacity = computedPopup.opacity || "1";
    const targetBackdropOpacity = backdrop
      ? Number(environment.getComputedStyle(backdrop).opacity || 1)
      : 1;
    const currentLayerVisuals = new Map<HTMLElement, LayerVisual>();
    for (const layers of registry.regionLayers.values()) {
      for (const layer of layers.values()) {
        const style = environment.getComputedStyle(layer.element);
        currentLayerVisuals.set(layer.element, {
          opacity: style.opacity,
          filter: style.filter,
          transform: style.transform,
        });
      }
    }
    const openingFromClosed =
      authoritative.open && snapshot.settledTarget === null && active === null;
    stopActive();
    if (animateFrame !== null) {
      environment.cancelAnimationFrame(animateFrame);
      animateFrame = null;
    }

    options.onGeometry(geometry);
    const transition = options.controller.beginTransition(authoritative.targetId);
    pendingTransitionId = transition;
    const transitionSnapshot = options.controller.getSnapshot();
    options.onBeforeVisible(transitionSnapshot);
    projectStableState(transitionSnapshot, registry, geometry);
    popup.style.height = `${
      openingFromClosed ? geometry.targetHeight : fromHeight
    }px`;
    portal.style.removeProperty("visibility");
    portal.style.removeProperty("pointer-events");

    const reduceMotion = environment.prefersReducedMotion();
    const instant = authoritative.transition.motion === "instant";
    const controls: ShellAnimationControls[] = [];
    const cleanups: Array<() => void> = [];

    const startAttempt = (): void => {
      if (destroyed) return;
      if (controls.length === 0) {
        controls.push(
          options.animation.animate(
            popup,
            { opacity: [1, 1] },
            { durationMs: 0, easing: timing.easingChange },
          ),
        );
      }

      const attempt: ActiveAttempt<TSnap, TRegionKey> = {
        transitionId: transition,
        targetId: authoritative.targetId,
        visualTarget,
        targetHeight: geometry.targetHeight,
        controls,
        cleanup: () => {
          for (const cleanup of cleanups) cleanup();
        },
      };
      pendingTransitionId = null;
      active = attempt;
      void Promise.all(controls.map((control) => control.finished)).then(
        (results) => {
          if (destroyed || active !== attempt) return;
          if (results.some((result) => result.status === "cancelled")) {
            active = null;
            attempt.cleanup();
            options.controller.cancelTransition(
              attempt.transitionId,
              "driver-cancelled",
            );
            return;
          }
          settleAttempt(attempt, transitionSnapshot, geometry);
        },
      );
    };

    animateFrame = environment.requestAnimationFrame(() => {
      animateFrame = null;
      if (destroyed) return;

      if (!authoritative.open) {
        const presentation = visualTarget.presentation;
        const keyframes: PropertyIndexedKeyframes = reduceMotion
          ? { opacity: [Number(currentOpacity), 0] }
          : presentation === "sheet"
            ? {
                transform: [currentTransform, "translateY(100%)"],
                opacity: [Number(currentOpacity), 1],
              }
            : {
                transform: [currentTransform, "translateY(12px)"],
                opacity: [Number(currentOpacity), 0],
              };
        controls.push(
          options.animation.animate(popup, keyframes, {
            durationMs: instant ? 0 : reduceMotion ? 120 : timing.close,
            easing: timing.easingEnter,
          }),
        );
        if (backdrop) {
          controls.push(
            options.animation.animate(
              backdrop,
              { opacity: [targetBackdropOpacity, 0] },
              {
                durationMs: instant ? 0 : reduceMotion ? 120 : timing.close,
                easing: timing.easingEnter,
              },
            ),
          );
        }
      } else if (openingFromClosed) {
        const presentation = authoritative.presentation;
        const startTransform =
          reduceMotion || presentation === "dialog"
            ? "translateY(12px)"
            : "translateY(100%)";
        controls.push(
          options.animation.animate(
            popup,
            reduceMotion
              ? { opacity: [0, 1] }
              : {
                  transform: [startTransform, "translateY(0px)"],
                  opacity: presentation === "dialog" ? [0, 1] : [1, 1],
                },
            {
              durationMs: instant ? 0 : reduceMotion ? 120 : timing.open,
              easing: timing.easingEnter,
            },
          ),
        );
        if (backdrop) {
          controls.push(
            options.animation.animate(
              backdrop,
              { opacity: [0, targetBackdropOpacity] },
              {
                durationMs: instant ? 0 : reduceMotion ? 120 : timing.open,
                easing: timing.easingEnter,
              },
            ),
          );
        }
      } else if (
        presentationChanged(previousVisualTarget, authoritative)
      ) {
        // Target presentation attributes/layout were applied in the previous
        // frame. Read its final rect before writing the FLIP inverse.
        const targetRect = popup.getBoundingClientRect();
        const targetStyle = environment.getComputedStyle(popup);
        const targetRadius = targetStyle.borderRadius || "0px";
        const targetBackdrop = backdrop
          ? Number(environment.getComputedStyle(backdrop).opacity || 1)
          : 1;
        const deltaX = geometry.currentRect.left - targetRect.left;
        const deltaY = geometry.currentRect.top - targetRect.top;
        const fromRadius = computedPopup.borderRadius || "0px";

        popup.style.width = `${geometry.currentRect.width}px`;
        popup.style.height = `${geometry.currentRect.height}px`;
        popup.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
        popup.style.borderRadius = fromRadius;
        cleanups.push(() => {
          popup.style.removeProperty("width");
          popup.style.removeProperty("border-radius");
        });

        animateFrame = environment.requestAnimationFrame(() => {
          animateFrame = null;
          if (destroyed) return;
          controls.push(
            options.animation.animate(
              popup,
              {
                width: [
                  `${geometry.currentRect.width}px`,
                  `${targetRect.width}px`,
                ],
                height: [
                  `${geometry.currentRect.height}px`,
                  `${geometry.targetHeight}px`,
                ],
                transform: [
                  `translate(${deltaX}px, ${deltaY}px)`,
                  "translate(0px, 0px)",
                ],
                borderRadius: [fromRadius, targetRadius],
              },
              {
                durationMs:
                  instant ||
                  reduceMotion ||
                  authoritative.contentResizeBehavior === "immediate"
                    ? 0
                    : timing.geometry,
                easing: timing.easingChange,
              },
            ),
          );
          if (backdrop) {
            controls.push(
              options.animation.animate(
                backdrop,
                { opacity: [targetBackdropOpacity, targetBackdrop] },
                {
                  durationMs:
                    instant ||
                    reduceMotion ||
                    authoritative.contentResizeBehavior === "immediate"
                      ? 0
                      : timing.geometry,
                  easing: timing.easingChange,
                },
              ),
            );
          }
          animateRegions(
            authoritative,
            previousVisualTarget,
            registry,
            timing.region,
            timing.easingChange,
            reduceMotion,
            controls,
            cleanups,
            currentLayerVisuals,
          );
          startAttempt();
        });
        return;
      } else {
        const continuingInitialOpen = snapshot.settledTarget === null;
        controls.push(
          options.animation.animate(
            popup,
            continuingInitialOpen
              ? {
                  height: [`${fromHeight}px`, `${geometry.targetHeight}px`],
                  transform: [currentTransform, "translateY(0px)"],
                  opacity: [Number(currentOpacity), 1],
                }
              : { height: [`${fromHeight}px`, `${geometry.targetHeight}px`] },
            {
              durationMs:
                instant ||
                reduceMotion ||
                authoritative.contentResizeBehavior === "immediate"
                  ? 0
                  : timing.geometry,
              easing: timing.easingChange,
            },
          ),
        );
        animateRegions(
          authoritative,
          previousVisualTarget,
          registry,
          timing.region,
          timing.easingChange,
          reduceMotion,
          controls,
          cleanups,
          currentLayerVisuals,
        );
      }

      startAttempt();
    });
  };

  return {
    schedule() {
      if (destroyed || scheduledFrame !== null) return;
      const environment = options.getEnvironment();
      if (!environment) return;
      scheduledFrame = environment.requestAnimationFrame(run);
    },
    reconcileNow: run,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      const environment = options.getEnvironment();
      if (scheduledFrame !== null && environment) {
        environment.cancelAnimationFrame(scheduledFrame);
      }
      if (animateFrame !== null && environment) {
        environment.cancelAnimationFrame(animateFrame);
      }
      scheduledFrame = null;
      animateFrame = null;
      const attempt = active;
      const pending = pendingTransitionId;
      stopActive();
      if (attempt) {
        options.controller.cancelTransition(attempt.transitionId, "destroyed");
      } else if (pending !== null) {
        options.controller.cancelTransition(pending, "destroyed");
      }
    },
  };
}
