import type {
  ResolvedShellSheetSnapPoint,
  ShellSheetController,
} from "@shell-sheet/core";

export type ShellSheetPart =
  | "portal"
  | "backdrop"
  | "viewport"
  | "popup"
  | "content"
  | "header"
  | "body"
  | "footer"
  | "handle"
  | "inert-target";

export type ShellRegionName = "header" | "body" | "footer";
export type ShellRegionLayerName = "settled" | "outgoing" | "incoming";

export type ShellRegionLayer<TKey extends string = string> = Readonly<{
  key: TKey;
  layer: ShellRegionLayerName;
}>;

export type DragAreaOptions = Readonly<{
  id?: string;
}>;

export type ShellSheetInsets = Readonly<{
  top: number;
  bottom: number;
}>;

export type ShellSheetElements = Readonly<{
  portal: HTMLElement | null;
  backdrop: HTMLElement | null;
  viewport: HTMLElement | null;
  popup: HTMLElement | null;
  content: HTMLElement | null;
  header: HTMLElement | null;
  body: HTMLElement | null;
  footer: HTMLElement | null;
  handle: HTMLElement | null;
  inertTarget: HTMLElement | null;
}>;

export type ShellSheetViewport = Readonly<{
  offsetLeft: number;
  offsetTop: number;
  width: number;
  height: number;
  scale: number;
}>;

export type ShellAnimationResult =
  | Readonly<{ status: "finished" }>
  | Readonly<{ status: "cancelled" }>;

export type ShellAnimationControls = Readonly<{
  finished: Promise<ShellAnimationResult>;
  stop(): void;
}>;

export type ShellAnimationOptions = Readonly<{
  durationMs: number;
  easing: string;
}>;

export type ShellAnimationDriver = Readonly<{
  animate(
    element: HTMLElement,
    keyframes: Keyframe[] | PropertyIndexedKeyframes,
    options: ShellAnimationOptions,
  ): ShellAnimationControls;
}>;

export type ShellSheetResizeObserver = Readonly<{
  observe(element: Element): void;
  unobserve(element: Element): void;
  disconnect(): void;
}>;

export type ShellSheetDomEnvironment = Readonly<{
  requestAnimationFrame(callback: FrameRequestCallback): number;
  cancelAnimationFrame(handle: number): void;
  getComputedStyle(element: Element): CSSStyleDeclaration;
  createResizeObserver(
    callback: ResizeObserverCallback,
  ): ShellSheetResizeObserver;
  getViewport(portal: HTMLElement): ShellSheetViewport;
  observeViewport(portal: HTMLElement, callback: () => void): () => void;
  prefersReducedMotion(): boolean;
  getDocumentVisibility(document: Document): DocumentVisibilityState;
  observeDocumentVisibility(
    document: Document,
    callback: () => void,
  ): () => void;
}>;

export type ShellScrollLockDriver = Readonly<{
  acquire(document: Document): () => void;
}>;

export type ShellBackgroundIsolationDriver = Readonly<{
  acquire(target: HTMLElement): () => void;
}>;

export type ShellSheetGestureOptions = Readonly<{
  activationDistance?: number;
  projectionTime?: number;
  closeVelocityThreshold?: number;
  closeDistanceThreshold?: number;
  rubberBandConstant?: number;
}>;

export type ShellSheetDomOptions = Readonly<{
  animation?: ShellAnimationDriver;
  environment?: ShellSheetDomEnvironment;
  gesture?: ShellSheetGestureOptions;
  scrollLock?: ShellScrollLockDriver;
  backgroundIsolation?: ShellBackgroundIsolationDriver;
  closeOnEscape?: boolean;
  closeOnBackdrop?: boolean;
  initialFocus?: (popup: HTMLElement) => HTMLElement | null;
}>;

export type ShellSheetDomBinding<
  TSnap extends string = string,
  TRegionKey extends string = string,
> = Readonly<{
  registerPart(part: ShellSheetPart, element: HTMLElement): () => void;
  registerRegionLayer(
    region: ShellRegionName,
    layer: ShellRegionLayer<TRegionKey>,
    element: HTMLElement,
  ): () => void;
  registerDragArea(
    element: HTMLElement,
    options?: DragAreaOptions,
  ): () => void;
  setInsets(insets: ShellSheetInsets): void;
  refresh(): void;
  getElements(): ShellSheetElements;
  destroy(): void;
}>;

export type ShellSheetRegistrySnapshot<TRegionKey extends string = string> =
  Readonly<{
    elements: ShellSheetElements;
    regionLayers: ReadonlyMap<
      ShellRegionName,
      ReadonlyMap<ShellRegionLayerName, Readonly<{
        key: TRegionKey;
        element: HTMLElement;
        token: number;
      }>>
    >;
    dragAreas: readonly Readonly<{
      element: HTMLElement;
      id: string | undefined;
      token: number;
    }>[];
  }>;

export type ShellSheetMeasuredGeometry<TSnap extends string = string> =
  Readonly<{
    viewport: ShellSheetViewport;
    resolvedSnapPoints: readonly ResolvedShellSheetSnapPoint<TSnap>[];
    targetHeight: number;
    currentRect: DOMRectReadOnly;
    keyboardInset: number;
    headerHeight: number;
    bodyNaturalHeight: number;
    footerHeight: number;
  }>;

export type ShellSheetDomInternals<
  TSnap extends string = string,
  TRegionKey extends string = string,
> = Readonly<{
  controller: ShellSheetController<TSnap, TRegionKey>;
  getRegistry(): ShellSheetRegistrySnapshot<TRegionKey>;
  getResolvedSnapPoints(): readonly ResolvedShellSheetSnapPoint<TSnap>[];
  schedule(reason: string): void;
}>;
