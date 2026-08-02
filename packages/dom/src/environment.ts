import type {
  ShellSheetDomEnvironment,
  ShellSheetViewport,
} from "./types.js";

const unsupported = (capability: string): never => {
  throw new Error(
    `ShellSheet DOM environment requires ${capability}; provide a supported browser or an injected environment.`,
  );
};

const readViewport = (portal: HTMLElement): ShellSheetViewport => {
  const view = portal.ownerDocument.defaultView;
  if (!view) return unsupported("Window");
  const visualViewport = view.visualViewport;
  return visualViewport
    ? {
        offsetLeft: visualViewport.offsetLeft,
        offsetTop: visualViewport.offsetTop,
        width: visualViewport.width,
        height: visualViewport.height,
        scale: visualViewport.scale,
      }
    : {
        offsetLeft: 0,
        offsetTop: 0,
        width: view.innerWidth,
        height: view.innerHeight,
        scale: 1,
      };
};

export function createShellSheetDomEnvironment(
  portal: HTMLElement,
): ShellSheetDomEnvironment {
  const document = portal.ownerDocument;
  const view = document.defaultView;
  if (!view) return unsupported("Window");
  const ResizeObserverConstructor = view.ResizeObserver;
  if (!ResizeObserverConstructor) return unsupported("ResizeObserver");
  if (!view.requestAnimationFrame || !view.cancelAnimationFrame) {
    return unsupported("requestAnimationFrame");
  }
  if (!view.matchMedia) return unsupported("matchMedia");

  return {
    requestAnimationFrame: (callback) => view.requestAnimationFrame(callback),
    cancelAnimationFrame: (handle) => view.cancelAnimationFrame(handle),
    getComputedStyle: (element) => view.getComputedStyle(element),
    createResizeObserver: (callback) =>
      new ResizeObserverConstructor(callback),
    getViewport: readViewport,
    observeViewport(element, callback) {
      const ownerView = element.ownerDocument.defaultView;
      if (!ownerView) return unsupported("Window");
      const viewport = ownerView.visualViewport;
      const target: EventTarget = viewport ?? ownerView;
      target.addEventListener("resize", callback);
      viewport?.addEventListener("scroll", callback);
      ownerView.addEventListener("orientationchange", callback);
      return () => {
        target.removeEventListener("resize", callback);
        viewport?.removeEventListener("scroll", callback);
        ownerView.removeEventListener("orientationchange", callback);
      };
    },
    prefersReducedMotion: () =>
      view.matchMedia("(prefers-reduced-motion: reduce)").matches,
    getDocumentVisibility: (ownerDocument) => ownerDocument.visibilityState,
    observeDocumentVisibility(ownerDocument, callback) {
      ownerDocument.addEventListener("visibilitychange", callback);
      return () => ownerDocument.removeEventListener("visibilitychange", callback);
    },
  };
}

export function assertShellSheetDomEnvironment(
  environment: ShellSheetDomEnvironment,
): void {
  for (const key of [
    "requestAnimationFrame",
    "cancelAnimationFrame",
    "getComputedStyle",
    "createResizeObserver",
    "getViewport",
    "observeViewport",
    "prefersReducedMotion",
    "getDocumentVisibility",
    "observeDocumentVisibility",
  ] as const) {
    if (typeof environment[key] !== "function") {
      throw new Error(`Invalid ShellSheet DOM environment: ${key}.`);
    }
  }
}
