import type {
  ShellSheetController,
  ShellSheetEvent,
} from "@shell-sheet/core";
import { createTransitionCoordinator } from "./coordinator.js";
import {
  assertShellSheetDomEnvironment,
  createShellSheetDomEnvironment,
} from "./environment.js";
import { createGestureSession } from "./gesture-session.js";
import {
  createModalityLease,
  defaultBackgroundIsolationDriver,
  defaultScrollLockDriver,
} from "./modality-manager.js";
import { createNativeAnimationDriver } from "./native-animation.js";
import { createMechanicLedger } from "./mechanic-ledger.js";
import { createShellSheetRegistry } from "./registry.js";
import { applyStructuralMechanics } from "./styling-projection.js";
import type {
  ShellAnimationDriver,
  ShellSheetDomBinding,
  ShellSheetDomEnvironment,
  ShellSheetDomOptions,
  ShellSheetElements,
  ShellSheetInsets,
  ShellSheetMeasuredGeometry,
  ShellSheetPart,
} from "./types.js";

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

const allNullElements: ShellSheetElements = Object.freeze({
  portal: null,
  backdrop: null,
  viewport: null,
  popup: null,
  content: null,
  header: null,
  body: null,
  footer: null,
  handle: null,
  inertTarget: null,
});

const assertInsets = (insets: ShellSheetInsets): void => {
  if (
    !Number.isFinite(insets.top) ||
    !Number.isFinite(insets.bottom) ||
    insets.top < 0 ||
    insets.bottom < 0
  ) {
    throw new Error("ShellSheet insets must be finite and non-negative.");
  }
};

export function bindShellSheetToDom<
  TSnap extends string,
  TRegionKey extends string,
>(
  controller: ShellSheetController<TSnap, TRegionKey>,
  options: ShellSheetDomOptions = {},
): ShellSheetDomBinding<TSnap, TRegionKey> {
  let destroyed = false;
  let environment: ShellSheetDomEnvironment | null = options.environment ?? null;
  if (environment) assertShellSheetDomEnvironment(environment);
  const animation: ShellAnimationDriver =
    options.animation ?? createNativeAnimationDriver();
  let insets: ShellSheetInsets = Object.freeze({ top: 0, bottom: 0 });
  let geometry: ShellSheetMeasuredGeometry<TSnap> | null = null;
  let resizeObserver: ReturnType<
    ShellSheetDomEnvironment["createResizeObserver"]
  > | null = null;
  let viewportCleanup: (() => void) | null = null;
  let documentCleanup: (() => void) | null = null;
  let backdropCleanup: (() => void) | null = null;
  let openFocusOrigin: HTMLElement | null = null;
  const mechanicLedger = createMechanicLedger();

  const ensureActive = (): void => {
    if (destroyed) throw new Error("ShellSheet DOM binding has been destroyed.");
  };

  const maybeCreateEnvironment = (part: ShellSheetPart, element: HTMLElement) => {
    if (environment || part !== "portal") return;
    environment = createShellSheetDomEnvironment(element);
    assertShellSheetDomEnvironment(environment);
  };

  let registryChanged = (): void => undefined;
  const registry = createShellSheetRegistry<TRegionKey>(() => registryChanged());
  const backgroundIsolation = options.backgroundIsolation ?? {
    acquire(target: HTMLElement) {
      const portal = registry.getSnapshot().elements.portal;
      if (!portal || target !== portal || !portal.parentElement) {
        return defaultBackgroundIsolationDriver.acquire(target);
      }
      const releases: Array<() => void> = [];
      for (const sibling of portal.parentElement.children) {
        if (
          sibling !== portal &&
          !sibling.hasAttribute("data-shell-sheet-portal") &&
          sibling instanceof portal.ownerDocument.defaultView!.HTMLElement
        ) {
          releases.push(defaultBackgroundIsolationDriver.acquire(sibling));
        }
      }
      let active = true;
      return () => {
        if (!active) return;
        active = false;
        for (const release of releases.reverse()) release();
      };
    },
  };
  const modality = createModalityLease({
    scrollLock: options.scrollLock ?? defaultScrollLockDriver,
    backgroundIsolation,
    ...(options.initialFocus ? { initialFocus: options.initialFocus } : {}),
  });

  const coordinator = createTransitionCoordinator({
    controller,
    animation,
    getEnvironment: () => environment,
    getRegistry: registry.getSnapshot,
    getInsets: () => insets,
    onGeometry(nextGeometry) {
      geometry = nextGeometry;
    },
    onBeforeVisible(snapshot) {
      const elements = registry.getSnapshot().elements;
      const visualTarget =
        snapshot.authoritativeTarget?.open === true
          ? snapshot.authoritativeTarget
          : snapshot.settledTarget;
      const popup = elements.popup;
      if (!popup || !visualTarget) return;
      if (
        snapshot.authoritativeTarget?.open === true &&
        snapshot.settledTarget === null &&
        openFocusOrigin === null
      ) {
        const HTMLElementConstructor =
          popup.ownerDocument.defaultView?.HTMLElement;
        const activeElement = popup.ownerDocument.activeElement;
        if (
          HTMLElementConstructor &&
          activeElement instanceof HTMLElementConstructor &&
          !popup.contains(activeElement)
        ) {
          openFocusOrigin = activeElement;
        }
      }
      popup.setAttribute("role", "dialog");
      if (visualTarget.modality === "modal") {
        popup.setAttribute("aria-modal", "true");
        const isolationScope = elements.inertTarget ?? elements.portal;
        if (isolationScope) modality.acquire(popup, isolationScope);
      } else {
        popup.removeAttribute("aria-modal");
      }
      if (elements.backdrop) {
        elements.backdrop.style.pointerEvents =
          visualTarget.modality === "modal" ? "" : "none";
      }
    },
    onAfterSettled(snapshot) {
      const target = snapshot.authoritativeTarget;
      if (target?.open === true && target.modality === "non-modal") {
        modality.release(true);
      }
    },
    onAfterHidden() {
      modality.release(false);
      registry.getSnapshot().elements.popup?.removeAttribute("aria-modal");
      if (openFocusOrigin?.isConnected) {
        openFocusOrigin.focus({ preventScroll: true });
      }
      openFocusOrigin = null;
    },
  });

  const gesture = createGestureSession({
    controller,
    getEnvironment: () => environment,
    getRegistry: registry.getSnapshot,
    getGeometry: () => geometry,
    ...(options.gesture ? { tuning: options.gesture } : {}),
    reconcile: () => coordinator.schedule("gesture-reconcile"),
  });

  const refreshObservers = (): void => {
    resizeObserver?.disconnect();
    resizeObserver = null;
    viewportCleanup?.();
    viewportCleanup = null;
    const currentEnvironment = environment;
    const snapshot = registry.getSnapshot();
    const portal = snapshot.elements.portal;
    if (!currentEnvironment || !portal) return;
    resizeObserver = currentEnvironment.createResizeObserver(() => {
      coordinator.schedule("resize-observer");
    });
    for (const element of Object.values(snapshot.elements)) {
      if (element) resizeObserver.observe(element);
    }
    for (const layers of snapshot.regionLayers.values()) {
      for (const layer of layers.values()) resizeObserver.observe(layer.element);
    }
    viewportCleanup = currentEnvironment.observeViewport(portal, () => {
      coordinator.schedule("viewport");
    });
  };

  const refreshDocumentListeners = (): void => {
    documentCleanup?.();
    documentCleanup = null;
    backdropCleanup?.();
    backdropCleanup = null;
    const elements = registry.getSnapshot().elements;
    const portal = elements.portal;
    if (!portal) return;
    const document = portal.ownerDocument;

    const onKeyDown = (event: KeyboardEvent): void => {
      const target = controller.getSnapshot().authoritativeTarget;
      if (target?.open !== true) return;
      if (event.key === "Escape" && options.closeOnEscape !== false) {
        event.preventDefault();
        controller.requestClose("escape", { origin: "keyboard" });
        return;
      }
      if (event.key !== "Tab" || target.modality !== "modal") return;
      const popup = registry.getSnapshot().elements.popup;
      if (!popup) return;
      const focusable = [...popup.querySelectorAll<HTMLElement>(focusableSelector)];
      if (focusable.length === 0) {
        event.preventDefault();
        popup.focus({ preventScroll: true });
        return;
      }
      const first = focusable[0]!;
      const last = focusable.at(-1)!;
      if (!popup.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    documentCleanup = () => document.removeEventListener("keydown", onKeyDown);

    if (elements.backdrop) {
      const backdrop = elements.backdrop;
      const onBackdropClick = (event: MouseEvent): void => {
        const target = controller.getSnapshot().authoritativeTarget;
        if (
          event.target === backdrop &&
          target?.open === true &&
          target.modality === "modal" &&
          options.closeOnBackdrop !== false
        ) {
          controller.requestClose("backdrop", { origin: "backdrop" });
        }
      };
      backdrop.addEventListener("click", onBackdropClick);
      backdropCleanup = () =>
        backdrop.removeEventListener("click", onBackdropClick);
    }
  };

  registryChanged = () => {
    if (destroyed) return;
    applyStructuralMechanics(registry.getSnapshot());
    refreshObservers();
    refreshDocumentListeners();
    gesture.refreshRegistrations();
    coordinator.schedule("registry");
  };

  const controllerListener = (
    _snapshot: ReturnType<typeof controller.getSnapshot>,
    event: ShellSheetEvent<TSnap, TRegionKey>,
  ): void => {
    if (event.type !== "target-synced") return;
    gesture.targetChanged();
    coordinator.schedule("target");
  };
  const unsubscribeController = controller.subscribe(controllerListener);

  return Object.freeze({
    registerPart(part, element) {
      ensureActive();
      maybeCreateEnvironment(part, element);
      mechanicLedger.capturePart(part, element);
      if (part === "portal") {
        element.setAttribute("data-shell-sheet-portal", "");
        const snapshot = controller.getSnapshot();
        const alreadySettled =
          snapshot.authoritativeTarget?.open === true &&
          snapshot.settledTarget?.targetId ===
            snapshot.authoritativeTarget.targetId &&
          snapshot.phase === "open";
        if (!alreadySettled && snapshot.phase !== "closing") {
          element.hidden = true;
        }
      }
      const cleanup = registry.registerPart(part, element);
      return () => cleanup();
    },
    registerRegionLayer(region, layer, element) {
      ensureActive();
      mechanicLedger.captureRegionLayer(element);
      const cleanup = registry.registerRegionLayer(region, layer, element);
      return () => cleanup();
    },
    registerRegionTransitionSurface(region, element) {
      ensureActive();
      mechanicLedger.captureRegionTransitionSurface(element);
      const cleanup = registry.registerRegionTransitionSurface(region, element);
      return () => cleanup();
    },
    registerDragArea(element, dragOptions) {
      ensureActive();
      const cleanup = registry.registerDragArea(element, dragOptions);
      return () => cleanup();
    },
    setInsets(nextInsets) {
      ensureActive();
      assertInsets(nextInsets);
      if (insets.top === nextInsets.top && insets.bottom === nextInsets.bottom) {
        return;
      }
      insets = Object.freeze({ ...nextInsets });
      coordinator.schedule("insets");
    },
    refresh() {
      ensureActive();
      coordinator.schedule("explicit-refresh");
    },
    getElements() {
      return destroyed ? allNullElements : registry.getSnapshot().elements;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      gesture.destroy();
      coordinator.destroy();
      unsubscribeController();
      resizeObserver?.disconnect();
      viewportCleanup?.();
      documentCleanup?.();
      backdropCleanup?.();
      modality.release(true);
      openFocusOrigin = null;
      mechanicLedger.restoreAll();
      registry.clear();
      geometry = null;
    },
  });
}
