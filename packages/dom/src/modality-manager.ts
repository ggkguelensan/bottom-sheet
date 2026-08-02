import type {
  ShellBackgroundIsolationDriver,
  ShellScrollLockDriver,
} from "./types.js";

type ScrollLockState = {
  count: number;
  readonly body: HTMLElement;
  readonly view: Window | null;
  readonly overflow: string;
  readonly paddingRight: string;
  readonly scrollX: number;
  readonly scrollY: number;
  readonly ownedPaddingRight: string;
};

type IsolationState = {
  count: number;
  readonly inert: boolean;
  readonly ariaHidden: string | null;
};

const scrollLocks = new WeakMap<Document, ScrollLockState>();
const isolations = new WeakMap<HTMLElement, IsolationState>();

export const defaultScrollLockDriver: ShellScrollLockDriver = Object.freeze({
  acquire(document) {
    const existing = scrollLocks.get(document);
    if (existing) {
      existing.count += 1;
      let active = true;
      return () => {
        if (!active) return;
        active = false;
        releaseScrollLock(document);
      };
    }

    const body = document.body;
    const view = document.defaultView;
    const scrollbarWidth = view
      ? Math.max(0, view.innerWidth - document.documentElement.clientWidth)
      : 0;
    const computedPadding = view
      ? Number.parseFloat(view.getComputedStyle(body).paddingRight) || 0
      : 0;
    const ownedPaddingRight = scrollbarWidth > 0
      ? `${computedPadding + scrollbarWidth}px`
      : body.style.paddingRight;
    const state: ScrollLockState = {
      count: 1,
      body,
      view,
      overflow: body.style.overflow,
      paddingRight: body.style.paddingRight,
      scrollX: view?.scrollX ?? 0,
      scrollY: view?.scrollY ?? 0,
      ownedPaddingRight,
    };
    scrollLocks.set(document, state);
    body.style.overflow = "hidden";
    body.style.paddingRight = ownedPaddingRight;

    let active = true;
    return () => {
      if (!active) return;
      active = false;
      releaseScrollLock(document);
    };
  },
});

const releaseScrollLock = (document: Document): void => {
  const state = scrollLocks.get(document);
  if (!state) return;
  state.count -= 1;
  if (state.count > 0) return;
  scrollLocks.delete(document);
  if (state.body.style.overflow === "hidden") {
    state.body.style.overflow = state.overflow;
  }
  if (state.body.style.paddingRight === state.ownedPaddingRight) {
    state.body.style.paddingRight = state.paddingRight;
  }
  try {
    state.view?.scrollTo(state.scrollX, state.scrollY);
  } catch {
    // Test DOMs can expose scrollTo without implementing it.
  }
};

export const defaultBackgroundIsolationDriver: ShellBackgroundIsolationDriver =
  Object.freeze({
    acquire(target) {
      const existing = isolations.get(target);
      if (existing) {
        existing.count += 1;
      } else {
        isolations.set(target, {
          count: 1,
          inert: target.inert,
          ariaHidden: target.getAttribute("aria-hidden"),
        });
        target.inert = true;
        target.setAttribute("aria-hidden", "true");
      }

      let active = true;
      return () => {
        if (!active) return;
        active = false;
        const state = isolations.get(target);
        if (!state) return;
        state.count -= 1;
        if (state.count > 0) return;
        isolations.delete(target);
        if (target.inert) target.inert = state.inert;
        if (target.getAttribute("aria-hidden") === "true") {
          if (state.ariaHidden === null) target.removeAttribute("aria-hidden");
          else target.setAttribute("aria-hidden", state.ariaHidden);
        }
      };
    },
  });

export type ShellSheetModalityLease = Readonly<{
  acquire(popup: HTMLElement, inertTarget: HTMLElement): void;
  release(restoreFocus: boolean): void;
  active(): boolean;
}>;

export function createModalityLease(options: {
  readonly scrollLock: ShellScrollLockDriver;
  readonly backgroundIsolation: ShellBackgroundIsolationDriver;
  readonly initialFocus?: (popup: HTMLElement) => HTMLElement | null;
}): ShellSheetModalityLease {
  let releaseScroll: (() => void) | null = null;
  let releaseIsolation: (() => void) | null = null;
  let previousFocus: HTMLElement | null = null;

  return {
    acquire(popup, inertTarget) {
      if (releaseScroll || releaseIsolation) return;
      const document = popup.ownerDocument;
      const HTMLElementConstructor = document.defaultView?.HTMLElement;
      previousFocus =
        HTMLElementConstructor &&
        document.activeElement instanceof HTMLElementConstructor
          ? document.activeElement
          : null;
      releaseScroll = options.scrollLock.acquire(document);
      releaseIsolation = options.backgroundIsolation.acquire(inertTarget);
      const target = options.initialFocus?.(popup) ?? popup;
      if (!target.hasAttribute("tabindex") && target === popup) {
        target.tabIndex = -1;
      }
      target.focus({ preventScroll: true });
    },
    release(restoreFocus) {
      releaseIsolation?.();
      releaseScroll?.();
      releaseIsolation = null;
      releaseScroll = null;
      if (restoreFocus && previousFocus?.isConnected) {
        previousFocus.focus({ preventScroll: true });
      }
      previousFocus = null;
    },
    active: () => releaseScroll !== null || releaseIsolation !== null,
  };
}
