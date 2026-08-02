import {
  applyRubberBand,
  selectReleaseDestination,
  type ResolvedShellSheetSnapPoint,
  type ShellInteractionCancelReason,
  type ShellSheetController,
} from "@shell-sheet/core";
import type {
  ShellSheetDomEnvironment,
  ShellSheetGestureOptions,
  ShellSheetMeasuredGeometry,
  ShellSheetRegistrySnapshot,
} from "./types.js";

type GestureSessionOptions<
  TSnap extends string,
  TRegionKey extends string,
> = Readonly<{
  controller: ShellSheetController<TSnap, TRegionKey>;
  getEnvironment(): ShellSheetDomEnvironment | null;
  getRegistry(): ShellSheetRegistrySnapshot<TRegionKey>;
  getGeometry(): ShellSheetMeasuredGeometry<TSnap> | null;
  tuning?: ShellSheetGestureOptions;
  reconcile(): void;
}>;

export type ShellSheetGestureSession = Readonly<{
  refreshRegistrations(): void;
  targetChanged(): void;
  destroy(): void;
}>;

type PointerSession = {
  readonly pointerId: number;
  readonly origin: "handle" | "drag-area";
  readonly area: HTMLElement;
  readonly startX: number;
  readonly startY: number;
  readonly startHeight: number;
  accepted: boolean;
  interactionId: number | null;
  currentHeight: number;
  frame: number | null;
  samples: Array<Readonly<{ y: number; time: number }>>;
};

const interactiveSelector = [
  "a[href]",
  "button",
  "input",
  "select",
  "textarea",
  "[contenteditable='true']",
].join(",");

const ignoreSelector =
  "[data-base-ui-swipe-ignore], [data-shell-sheet-drag-ignore]";

const distinctPhysicalPoints = <TSnap extends string>(
  points: readonly ResolvedShellSheetSnapPoint<TSnap>[],
): readonly ResolvedShellSheetSnapPoint<TSnap>[] => {
  const result: ResolvedShellSheetSnapPoint<TSnap>[] = [];
  for (const point of points) {
    if (result.at(-1)?.height !== point.height) result.push(point);
  }
  return result;
};

export function createGestureSession<
  TSnap extends string,
  TRegionKey extends string,
>(options: GestureSessionOptions<TSnap, TRegionKey>): ShellSheetGestureSession {
  const activationDistance = options.tuning?.activationDistance ?? 9;
  const projectionTime = options.tuning?.projectionTime ?? 180;
  const rubberBandConstant = options.tuning?.rubberBandConstant ?? 0.55;
  let destroyed = false;
  let pointer: PointerSession | null = null;
  let suppressHandleClick = false;
  let visibilityCleanup: (() => void) | null = null;
  const listenerCleanups: Array<() => void> = [];

  const clearListeners = (): void => {
    while (listenerCleanups.length > 0) listenerCleanups.pop()?.();
  };

  const cancelPointer = (
    reason: ShellInteractionCancelReason,
    notifyCore: boolean,
  ): void => {
    const session = pointer;
    if (!session) return;
    const environment = options.getEnvironment();
    if (session.frame !== null && environment) {
      environment.cancelAnimationFrame(session.frame);
    }
    if (
      notifyCore &&
      session.accepted &&
      session.interactionId !== null
    ) {
      options.controller.cancelInteraction(session.interactionId, reason);
    }
    options.getRegistry().elements.popup?.removeAttribute("data-swiping");
    pointer = null;
    options.reconcile();
  };

  const writeFrame = (session: PointerSession): void => {
    session.frame = null;
    if (pointer !== session) return;
    const { popup, backdrop } = options.getRegistry().elements;
    const geometry = options.getGeometry();
    if (!popup || !geometry) return;
    popup.style.height = `${session.currentHeight}px`;
    popup.style.setProperty(
      "--drawer-swipe-movement-y",
      `${session.startHeight - session.currentHeight}px`,
    );
    const lowest = geometry.resolvedSnapPoints[0]?.height ?? session.startHeight;
    const denominator = Math.max(1, session.startHeight - lowest);
    const progress = Math.max(
      0,
      Math.min(1, (session.startHeight - session.currentHeight) / denominator),
    );
    backdrop?.style.setProperty("--drawer-swipe-progress", String(progress));
    popup.toggleAttribute(
      "data-swipe-dismiss",
      session.currentHeight < lowest,
    );
  };

  const scheduleWrite = (session: PointerSession): void => {
    const environment = options.getEnvironment();
    if (!environment || session.frame !== null) return;
    session.frame = environment.requestAnimationFrame(() => writeFrame(session));
  };

  const addSamples = (session: PointerSession, event: PointerEvent): void => {
    const coalesced = event.getCoalescedEvents?.() ?? [event];
    for (const sample of coalesced) {
      session.samples.push({ y: sample.clientY, time: sample.timeStamp });
    }
    const cutoff = event.timeStamp - 100;
    session.samples = session.samples.filter((sample) => sample.time >= cutoff);
  };

  const onPointerDown = (
    event: PointerEvent,
    area: HTMLElement,
    origin: "handle" | "drag-area",
  ): void => {
    const target = options.controller.getSnapshot().authoritativeTarget;
    if (
      destroyed ||
      pointer ||
      target?.open !== true ||
      !target.draggable ||
      event.button !== 0 ||
      !event.isPrimary
    ) {
      return;
    }
    const eventTarget = event.target;
    const ElementConstructor = area.ownerDocument.defaultView?.Element;
    if (ElementConstructor && eventTarget instanceof ElementConstructor) {
      if (eventTarget.closest(ignoreSelector)) return;
      const interactive = eventTarget.closest(interactiveSelector);
      if (interactive && interactive !== area) return;
    }
    const geometry = options.getGeometry();
    if (!geometry) return;
    const liveHeight =
      options.getRegistry().elements.popup?.getBoundingClientRect().height ??
      geometry.targetHeight;
    const startHeight = liveHeight > 0 ? liveHeight : geometry.targetHeight;
    pointer = {
      pointerId: event.pointerId,
      origin,
      area,
      startX: event.clientX,
      startY: event.clientY,
      startHeight,
      currentHeight: startHeight,
      accepted: false,
      interactionId: null,
      frame: null,
      samples: [{ y: event.clientY, time: event.timeStamp }],
    };
    suppressHandleClick = false;
  };

  const onPointerMove = (event: PointerEvent): void => {
    const session = pointer;
    if (!session || event.pointerId !== session.pointerId) return;
    const deltaX = event.clientX - session.startX;
    const deltaY = event.clientY - session.startY;

    if (!session.accepted) {
      if (
        Math.abs(deltaX) < activationDistance &&
        Math.abs(deltaY) < activationDistance
      ) {
        return;
      }
      if (Math.abs(deltaX) >= Math.abs(deltaY)) {
        pointer = null;
        return;
      }
      session.accepted = true;
      session.interactionId = options.controller.beginInteraction(session.origin);
      options.getRegistry().elements.popup?.setAttribute("data-swiping", "");
      suppressHandleClick = true;
      try {
        session.area.setPointerCapture(event.pointerId);
      } catch {
        // The pointer may disappear between threshold acceptance and capture
        // (for example during an OS gesture or synthetic cancellation).
        cancelPointer("capture-lost", true);
        return;
      }
    }

    event.preventDefault();
    addSamples(session, event);
    const geometry = options.getGeometry();
    if (!geometry) return;
    const points = geometry.resolvedSnapPoints;
    const minimum = points[0]?.height ?? session.startHeight;
    const maximum = points.at(-1)?.height ?? session.startHeight;
    session.currentHeight = applyRubberBand({
      value: session.startHeight - deltaY,
      min: minimum,
      max: maximum,
      dimension: geometry.viewport.height,
      constant: rubberBandConstant,
    });
    scheduleWrite(session);
  };

  const releasePointer = (event: PointerEvent): void => {
    const session = pointer;
    if (!session || event.pointerId !== session.pointerId) return;
    if (!session.accepted || session.interactionId === null) {
      pointer = null;
      return;
    }
    addSamples(session, event);
    if (session.frame !== null) {
      options.getEnvironment()?.cancelAnimationFrame(session.frame);
      writeFrame(session);
    }
    const first = session.samples[0]!;
    const last = session.samples.at(-1)!;
    const elapsed = Math.max(1, last.time - first.time);
    const velocity = (last.y - first.y) / elapsed;
    const geometry = options.getGeometry();
    const target = options.controller.getSnapshot().authoritativeTarget;
    if (!geometry || target?.open !== true) {
      cancelPointer("target-changed", true);
      return;
    }
    const dragDistance = session.startHeight - session.currentHeight;
    const destination = selectReleaseDestination({
      currentHeight: session.currentHeight,
      activeSnapPoint: target.snapPoint,
      velocity,
      dragDistance,
      snapPoints: geometry.resolvedSnapPoints,
      allowClose: true,
      projectionTime,
      ...(target.snapToSequentialPoints === undefined
        ? {}
        : { snapToSequentialPoints: target.snapToSequentialPoints }),
      ...(options.tuning?.closeVelocityThreshold === undefined
        ? {}
        : {
            closeVelocityThreshold: options.tuning.closeVelocityThreshold,
          }),
      ...(options.tuning?.closeDistanceThreshold === undefined
        ? {}
        : {
            closeDistanceThreshold: options.tuning.closeDistanceThreshold,
          }),
    });
    const release = {
      interactionId: session.interactionId,
      distance: dragDistance,
      velocity,
      projectedHeight: session.currentHeight - velocity * projectionTime,
    };
    options.controller.endInteraction(session.interactionId);
    options.getRegistry().elements.popup?.removeAttribute("data-swiping");
    pointer = null;
    if (destination.type === "close") {
      options.controller.requestClose("gesture", {
        origin: "gesture",
        release,
      });
    } else {
      options.controller.requestSnap(destination.snapPoint, {
        origin: "gesture",
        release,
      });
    }
    options.reconcile();
  };

  const onPointerCancel = (event: PointerEvent): void => {
    if (pointer?.pointerId !== event.pointerId) return;
    cancelPointer("pointer-cancelled", true);
  };

  const onLostPointerCapture = (event: PointerEvent): void => {
    if (pointer?.pointerId !== event.pointerId) return;
    cancelPointer("capture-lost", true);
  };

  const onHandleClick = (event: MouseEvent): void => {
    if (suppressHandleClick) {
      suppressHandleClick = false;
      return;
    }
    void Promise.resolve().then(() => {
      if (destroyed || event.defaultPrevented) return;
      const target = options.controller.getSnapshot().authoritativeTarget;
      const geometry = options.getGeometry();
      if (target?.open !== true || !target.draggable || !geometry) return;
      const points = distinctPhysicalPoints(geometry.resolvedSnapPoints);
      const currentIndex = points.findIndex(
        (point) => point.id === target.snapPoint,
      );
      const next = points[
        currentIndex === points.length - 1 ? 0 : currentIndex + 1
      ];
      if (next) {
        options.controller.requestSnap(next.id, { origin: "trigger" });
      }
    });
  };

  const attachArea = (
    element: HTMLElement,
    origin: "handle" | "drag-area",
  ): void => {
    const previousTouchAction = element.style.touchAction;
    const target = options.controller.getSnapshot().authoritativeTarget;
    const ownedTouchAction = target?.open === true && target.draggable
      ? "pan-x"
      : "";
    element.style.touchAction = ownedTouchAction;
    const pointerDown = (event: PointerEvent) =>
      onPointerDown(event, element, origin);
    element.addEventListener("pointerdown", pointerDown);
    element.addEventListener("pointermove", onPointerMove);
    element.addEventListener("pointerup", releasePointer);
    element.addEventListener("pointercancel", onPointerCancel);
    element.addEventListener("lostpointercapture", onLostPointerCapture);
    if (origin === "handle") element.addEventListener("click", onHandleClick);
    listenerCleanups.push(() => {
      if (element.style.touchAction === ownedTouchAction) {
        element.style.touchAction = previousTouchAction;
      }
      element.removeEventListener("pointerdown", pointerDown);
      element.removeEventListener("pointermove", onPointerMove);
      element.removeEventListener("pointerup", releasePointer);
      element.removeEventListener("pointercancel", onPointerCancel);
      element.removeEventListener("lostpointercapture", onLostPointerCapture);
      if (origin === "handle") element.removeEventListener("click", onHandleClick);
    });
  };

  const refreshRegistrations = (): void => {
    if (destroyed) return;
    clearListeners();
    const registry = options.getRegistry();
    if (registry.elements.handle) attachArea(registry.elements.handle, "handle");
    for (const area of registry.dragAreas) attachArea(area.element, "drag-area");
    visibilityCleanup?.();
    const portal = registry.elements.portal;
    const environment = options.getEnvironment();
    if (portal && environment) {
      visibilityCleanup = environment.observeDocumentVisibility(
        portal.ownerDocument,
        () => {
          if (
            environment.getDocumentVisibility(portal.ownerDocument) !== "visible"
          ) {
            cancelPointer("visibility-lost", true);
          }
        },
      );
    }
  };

  return {
    refreshRegistrations,
    targetChanged() {
      cancelPointer("target-changed", false);
      refreshRegistrations();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      cancelPointer("destroyed", true);
      clearListeners();
      visibilityCleanup?.();
      visibilityCleanup = null;
    },
  };
}
