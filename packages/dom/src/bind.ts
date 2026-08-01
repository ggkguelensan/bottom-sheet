import {
  clampSheetHeight,
  resolveSnapPoints,
  selectSnapPoint,
  type BottomSheetController,
  type BottomSheetEvent,
  type ResolvedBottomSheetSnapPoint,
} from "@adaptive-bottom-sheet/core";
import { createNativeAnimationDriver } from "./native-animation.js";
import type {
  BottomSheetAnimationControls,
  BottomSheetDomBinding,
  BottomSheetDomOptions,
  BottomSheetElements,
} from "./types.js";

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

const readOption = (
  value: number | (() => number) | undefined,
  fallback: number,
): number => (typeof value === "function" ? value() : (value ?? fallback));

const isHTMLElement = (value: Element | null): value is HTMLElement =>
  value instanceof HTMLElement;

export function bindBottomSheetToDom(
  controller: BottomSheetController,
  elements: BottomSheetElements,
  options: BottomSheetDomOptions = {},
): BottomSheetDomBinding {
  const animation = options.animation ?? createNativeAnimationDriver();
  const easing = options.easing ?? ([0.32, 0.72, 0, 1] as const);
  const modality = options.modality ?? "modal";
  const isModal = modality === "modal";
  const draggable = options.draggable ?? true;
  const velocityThreshold = options.velocityThreshold ?? 700;
  const closeOnBackdrop = options.closeOnBackdrop ?? isModal;
  const closeOnEscape = options.closeOnEscape ?? true;
  const dismissOnDragDown = options.dismissOnDragDown ?? draggable;
  const dismissDistanceRatio = options.dismissDistanceRatio ?? 0.25;
  const lockScrollEnabled = options.lockScroll ?? isModal;
  const trapFocus = options.trapFocus ?? isModal;
  const restoreFocus = options.restoreFocus ?? isModal;
  const reducedMotionSetting = options.reducedMotion ?? "media";

  let destroyed = false;
  let resolvedSnapPoints: ResolvedBottomSheetSnapPoint[] = [];
  let currentHeight = 0;
  let animationSequence = 0;
  let activeAnimations: BottomSheetAnimationControls[] = [];
  let previouslyFocused: HTMLElement | null = null;
  let scrollLockCleanup: (() => void) | null = null;
  let inertCleanup: (() => void) | null = null;
  let suppressHandleClick = false;
  let pointer:
    | {
        id: number;
        startY: number;
        startHeight: number;
        samples: Array<{ y: number; time: number }>;
      }
    | undefined;

  const prefersReducedMotion = (): boolean =>
    reducedMotionSetting === true ||
    (reducedMotionSetting === "media" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  const duration = (value: number): number =>
    prefersReducedMotion() ? Math.min(1, value) : value;

  const viewportHeight = (): number =>
    Math.round(window.visualViewport?.height ?? window.innerHeight);

  const refreshMeasurements = (): void => {
    const contentHeight =
      elements.content?.scrollHeight ?? elements.main.scrollHeight;
    const topInset = readOption(options.topInset, 0);
    const bottomInset = readOption(options.bottomInset, 0);
    const maxHeight = readOption(
      options.maxHeight,
      Math.max(0, viewportHeight() - topInset - bottomInset),
    );

    resolvedSnapPoints = resolveSnapPoints(controller.getSnapPoints(), {
      viewportHeight: viewportHeight(),
      contentHeight,
      topInset,
      bottomInset,
      handleHeight: elements.handle?.getBoundingClientRect().height ?? 0,
      minHeight: options.minHeight ?? 0,
      maxHeight,
    });

    elements.root.style.setProperty(
      "--bottom-sheet-viewport-height",
      `${viewportHeight()}px`,
    );

    const selected = resolvedSnapPoints.find(
      (point) => point.id === controller.getSnapshot().snapPoint,
    );

    const snapshot = controller.getSnapshot();

    if (
      selected &&
      !snapshot.dragging &&
      snapshot.status !== "snapping"
    ) {
      currentHeight = selected.height;
      elements.main.style.height = `${currentHeight}px`;
      elements.root.style.setProperty(
        "--bottom-sheet-height",
        `${currentHeight}px`,
      );
    }
  };

  const selectedSnapPoint = (): ResolvedBottomSheetSnapPoint => {
    const selected = resolvedSnapPoints.find(
      (point) => point.id === controller.getSnapshot().snapPoint,
    );

    if (!selected) {
      throw new Error(
        `Resolved snap point not found: ${controller.getSnapshot().snapPoint}`,
      );
    }

    return selected;
  };

  const stopAnimations = (): void => {
    animationSequence += 1;
    for (const controls of activeAnimations) controls.stop();
    activeAnimations = [];
  };

  const runAnimations = (
    controls: BottomSheetAnimationControls[],
    onFinish: () => void,
  ): void => {
    stopAnimations();
    const sequence = animationSequence;
    activeAnimations = controls;

    void Promise.all(
      controls.map((item) => item.finished.catch(() => undefined)),
    ).then(() => {
      if (destroyed || sequence !== animationSequence) return;
      activeAnimations = [];
      onFinish();
    });
  };

  const lockPage = (): void => {
    if (!lockScrollEnabled || scrollLockCleanup) return;

    const body = document.body;
    const previousOverflow = body.style.overflow;
    const previousPaddingRight = body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

    body.style.overflow = "hidden";
    if (scrollbarWidth > 0) body.style.paddingRight = `${scrollbarWidth}px`;

    scrollLockCleanup = () => {
      body.style.overflow = previousOverflow;
      body.style.paddingRight = previousPaddingRight;
      scrollLockCleanup = null;
    };
  };

  const makeBackgroundInert = (): void => {
    const target = elements.inertTarget;
    if (!isModal || !target || inertCleanup) return;

    const previousInert = target.inert;
    const previousAriaHidden = target.getAttribute("aria-hidden");
    target.inert = true;
    target.setAttribute("aria-hidden", "true");

    inertCleanup = () => {
      target.inert = previousInert;
      if (previousAriaHidden === null) target.removeAttribute("aria-hidden");
      else target.setAttribute("aria-hidden", previousAriaHidden);
      inertCleanup = null;
    };
  };

  const focusSheet = (): void => {
    const firstFocusable = elements.main.querySelector(focusableSelector);
    (isHTMLElement(firstFocusable) ? firstFocusable : elements.main).focus({
      preventScroll: true,
    });
  };

  const showOverlay = (): void => {
    if (restoreFocus) {
      previouslyFocused = isHTMLElement(document.activeElement)
        ? document.activeElement
        : null;
    }
    elements.root.hidden = false;
    lockPage();
    makeBackgroundInert();
  };

  const hideOverlay = (): void => {
    elements.root.hidden = true;
    scrollLockCleanup?.();
    inertCleanup?.();

    if (restoreFocus && previouslyFocused?.isConnected) {
      previouslyFocused.focus({ preventScroll: true });
    }
    previouslyFocused = null;
  };

  const updateAttributes = (): void => {
    const snapshot = controller.getSnapshot();
    elements.root.dataset.state = snapshot.status;
    elements.main.dataset.state = snapshot.status;
    elements.main.dataset.dragging = String(snapshot.dragging);
    elements.main.dataset.snapPoint = snapshot.snapPoint;

    if (elements.handle) {
      elements.handle.setAttribute(
        "aria-expanded",
        String(
          selectedSnapPoint().id ===
            resolvedSnapPoints[resolvedSnapPoints.length - 1]?.id,
        ),
      );
      elements.handle.setAttribute(
        "aria-label",
        `Current sheet position: ${snapshot.snapPoint}`,
      );
    }
  };

  const animateHeight = (
    targetHeight: number,
    shouldSettle: boolean,
  ): void => {
    const fromHeight = currentHeight;
    currentHeight = targetHeight;
    elements.main.style.height = `${targetHeight}px`;
    elements.root.style.setProperty(
      "--bottom-sheet-height",
      `${targetHeight}px`,
    );

    const controls = animation.animate(
      elements.main,
      { height: [`${fromHeight}px`, `${targetHeight}px`] },
      { duration: duration(options.snapDuration ?? 320), easing },
    );

    runAnimations([controls], () => {
      if (shouldSettle) controller.settle();
    });
  };

  const animateState = (event: BottomSheetEvent): void => {
    const snapshot = controller.getSnapshot();
    updateAttributes();

    if (event.type !== "state-synced") return;

    refreshMeasurements();
    const target = selectedSnapPoint();

    if (snapshot.status === "opening") {
      showOverlay();
      currentHeight = target.height;
      elements.main.style.height = `${target.height}px`;
      elements.main.style.transform = "translateY(0px)";
      elements.backdrop?.style.setProperty("opacity", "1");

      const surface = animation.animate(
        elements.main,
        {
          transform: [
            `translateY(${target.height + readOption(options.bottomInset, 0)}px)`,
            "translateY(0px)",
          ],
        },
        { duration: duration(options.openDuration ?? 320), easing },
      );
      const animations = [surface];

      if (elements.backdrop) {
        animations.push(
          animation.animate(
            elements.backdrop,
            { opacity: [0, 1] },
            { duration: duration(options.openDuration ?? 320), easing },
          ),
        );
      }

      runAnimations(animations, () => {
        if (isModal) focusSheet();
        controller.settle();
      });
    } else if (snapshot.status === "closing") {
      const surface = animation.animate(
        elements.main,
        {
          transform: [
            elements.main.style.transform || "translateY(0px)",
            `translateY(${currentHeight + readOption(options.bottomInset, 0)}px)`,
          ],
        },
        { duration: duration(options.closeDuration ?? 240), easing },
      );
      const animations = [surface];

      elements.main.style.transform = `translateY(${currentHeight}px)`;

      if (elements.backdrop) {
        animations.push(
          animation.animate(
            elements.backdrop,
            { opacity: [1, 0] },
            { duration: duration(options.closeDuration ?? 240), easing },
          ),
        );
      }

      runAnimations(animations, () => controller.settle());
    } else if (snapshot.status === "snapping") {
      animateHeight(target.height, true);
    } else {
      currentHeight = target.height;
      elements.main.style.height = `${target.height}px`;
    }
  };

  const handleControllerEvent = (
    _snapshot: ReturnType<BottomSheetController["getSnapshot"]>,
    event: BottomSheetEvent,
  ): void => {
    if (event.type === "settled" && event.status === "closed") {
      updateAttributes();
      hideOverlay();
      return;
    }

    if (event.type === "drag-started" || event.type === "drag-updated") {
      updateAttributes();
      return;
    }

    animateState(event);
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    const snapshot = controller.getSnapshot();
    if (!snapshot.open) return;

    if (event.key === "Escape" && closeOnEscape) {
      event.preventDefault();
      controller.close("escape");
      return;
    }

    if (event.key !== "Tab" || !trapFocus) return;

    const focusable = [...elements.main.querySelectorAll(focusableSelector)].filter(
      isHTMLElement,
    );

    if (focusable.length === 0) {
      event.preventDefault();
      elements.main.focus({ preventScroll: true });
      return;
    }

    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;

    if (!elements.main.contains(document.activeElement)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
      return;
    }

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const onBackdropClick = (event: MouseEvent): void => {
    if (closeOnBackdrop && event.target === elements.backdrop) {
      controller.close("backdrop");
    }
  };

  const recordPointerSample = (event: PointerEvent): void => {
    if (!pointer) return;
    pointer.samples.push({ y: event.clientY, time: event.timeStamp });
    const cutoff = event.timeStamp - 100;
    pointer.samples = pointer.samples.filter((sample) => sample.time >= cutoff);
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (
      !draggable ||
      event.button !== 0 ||
      controller.getSnapshot().status !== "open"
    ) {
      return;
    }

    event.preventDefault();
    elements.handle?.setPointerCapture(event.pointerId);
    stopAnimations();
    pointer = {
      id: event.pointerId,
      startY: event.clientY,
      startHeight: currentHeight,
      samples: [{ y: event.clientY, time: event.timeStamp }],
    };
    suppressHandleClick = false;
    controller.beginDrag();
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (!pointer || pointer.id !== event.pointerId) return;
    event.preventDefault();
    recordPointerSample(event);

    const offset = event.clientY - pointer.startY;
    if (Math.abs(offset) > 5) suppressHandleClick = true;
    const nextHeight = clampSheetHeight(
      pointer.startHeight - offset,
      resolvedSnapPoints,
      options.rubberBand ?? 0.18,
    );

    currentHeight = nextHeight;
    elements.main.style.height = `${nextHeight}px`;
    elements.root.style.setProperty(
      "--bottom-sheet-height",
      `${nextHeight}px`,
    );
    controller.updateDrag(offset);
  };

  const finishPointer = (event: PointerEvent, cancelled: boolean): void => {
    if (!pointer || pointer.id !== event.pointerId) return;

    recordPointerSample(event);
    const activePointer = pointer;
    pointer = undefined;

    const first = activePointer.samples[0]!;
    const last = activePointer.samples[activePointer.samples.length - 1]!;
    const elapsed = Math.max(1, last.time - first.time);
    const velocityY = ((last.y - first.y) / elapsed) * 1000;
    const dragDistance = last.y - activePointer.startY;

    if (cancelled) {
      controller.cancelDrag();
      animateHeight(selectedSnapPoint().height, false);
      return;
    }

    controller.endDrag(velocityY);

    if (Math.abs(dragDistance) <= 5) {
      return;
    }

    const lowest = resolvedSnapPoints[0]!;
    const atLowest = controller.getSnapshot().snapPoint === lowest.id;
    const shouldDismiss =
      dismissOnDragDown &&
      atLowest &&
      (dragDistance >= lowest.height * dismissDistanceRatio ||
        velocityY >= velocityThreshold);

    if (shouldDismiss) {
      controller.close("gesture");
      return;
    }

    const target = selectSnapPoint({
      currentHeight,
      currentSnapPoint: controller.getSnapshot().snapPoint,
      velocityY,
      snapPoints: resolvedSnapPoints,
      velocityThreshold,
    });
    const previousSnapPoint = controller.getSnapshot().snapPoint;
    controller.snapTo(target.id);

    if (previousSnapPoint === target.id) {
      animateHeight(target.height, false);
    }
  };

  const onPointerUp = (event: PointerEvent): void =>
    finishPointer(event, false);
  const onPointerCancel = (event: PointerEvent): void =>
    finishPointer(event, true);

  const onHandleClick = (): void => {
    if (!draggable) return;

    if (suppressHandleClick) {
      suppressHandleClick = false;
      return;
    }

    const snapshot = controller.getSnapshot();
    if (snapshot.status !== "open") return;

    const currentIndex = resolvedSnapPoints.findIndex(
      (point) => point.id === snapshot.snapPoint,
    );
    const nextIndex =
      currentIndex < 0 || currentIndex === resolvedSnapPoints.length - 1
        ? 0
        : currentIndex + 1;
    const next = resolvedSnapPoints[nextIndex];
    if (next) controller.snapTo(next.id);
  };

  elements.main.setAttribute("role", "dialog");
  elements.root.dataset.modality = modality;
  elements.main.dataset.draggable = String(draggable);
  if (isModal) elements.main.setAttribute("aria-modal", "true");
  else elements.main.removeAttribute("aria-modal");
  if (!elements.main.hasAttribute("tabindex")) elements.main.tabIndex = -1;
  if (draggable) elements.handle?.style.setProperty("touch-action", "none");

  refreshMeasurements();
  const initialSnapshot = controller.getSnapshot();
  elements.root.hidden = !initialSnapshot.open;
  elements.main.style.transform = initialSnapshot.open
    ? "translateY(0px)"
    : `translateY(${currentHeight}px)`;
  updateAttributes();

  if (initialSnapshot.open) {
    lockPage();
    makeBackgroundInert();
  }

  const unsubscribe = controller.subscribe(handleControllerEvent);
  const resizeObserver = new ResizeObserver(refreshMeasurements);
  resizeObserver.observe(elements.content ?? elements.main);
  const viewport = window.visualViewport;

  document.addEventListener("keydown", onKeyDown);
  elements.backdrop?.addEventListener("click", onBackdropClick);
  elements.handle?.addEventListener("pointerdown", onPointerDown);
  elements.handle?.addEventListener("pointermove", onPointerMove);
  elements.handle?.addEventListener("pointerup", onPointerUp);
  elements.handle?.addEventListener("pointercancel", onPointerCancel);
  elements.handle?.addEventListener("click", onHandleClick);
  window.addEventListener("resize", refreshMeasurements);
  window.addEventListener("orientationchange", refreshMeasurements);
  viewport?.addEventListener("resize", refreshMeasurements);
  viewport?.addEventListener("scroll", refreshMeasurements);

  return {
    controller,
    elements,
    refresh: refreshMeasurements,
    getResolvedSnapPoints: () => resolvedSnapPoints,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      stopAnimations();
      unsubscribe();
      resizeObserver.disconnect();
      document.removeEventListener("keydown", onKeyDown);
      elements.backdrop?.removeEventListener("click", onBackdropClick);
      elements.handle?.removeEventListener("pointerdown", onPointerDown);
      elements.handle?.removeEventListener("pointermove", onPointerMove);
      elements.handle?.removeEventListener("pointerup", onPointerUp);
      elements.handle?.removeEventListener("pointercancel", onPointerCancel);
      elements.handle?.removeEventListener("click", onHandleClick);
      window.removeEventListener("resize", refreshMeasurements);
      window.removeEventListener("orientationchange", refreshMeasurements);
      viewport?.removeEventListener("resize", refreshMeasurements);
      viewport?.removeEventListener("scroll", refreshMeasurements);
      scrollLockCleanup?.();
      inertCleanup?.();
    },
  };
}
