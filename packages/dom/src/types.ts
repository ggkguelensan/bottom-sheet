import type {
  BottomSheetController,
  ResolvedBottomSheetSnapPoint,
} from "@adaptive-bottom-sheet/core";

export type BottomSheetEasing =
  | "linear"
  | "easeIn"
  | "easeOut"
  | "easeInOut"
  | readonly [number, number, number, number];

export type BottomSheetKeyframes = Record<
  string,
  string | number | readonly (string | number)[]
>;

export interface BottomSheetAnimationOptions {
  /** Duration in milliseconds. */
  duration: number;
  easing: BottomSheetEasing;
}

export interface BottomSheetAnimationControls {
  finished: Promise<void>;
  stop(): void;
}

export interface BottomSheetAnimationDriver {
  animate(
    element: HTMLElement,
    keyframes: BottomSheetKeyframes,
    options: BottomSheetAnimationOptions,
  ): BottomSheetAnimationControls;
}

export interface BottomSheetElements {
  /** Overlay/portal root. It is hidden after the closing animation. */
  root: HTMLElement;
  /** The bottom-anchored sheet surface. */
  main: HTMLElement;
  /** Drag and toggle affordance. */
  handle?: HTMLElement;
  /** Element whose scrollHeight represents content height. */
  content?: HTMLElement;
  backdrop?: HTMLElement;
  /** Application region made inert while the sheet is open. */
  inertTarget?: HTMLElement;
}

export interface BottomSheetDomOptions {
  animation?: BottomSheetAnimationDriver;
  /**
   * Modal sheets lock and inert the background. Non-modal sheets leave the
   * surrounding application interactive and do not steal focus by default.
   */
  modality?: "modal" | "non-modal";
  /** Disable every handle gesture and handle click transition. */
  draggable?: boolean;
  openDuration?: number;
  closeDuration?: number;
  snapDuration?: number;
  easing?: BottomSheetEasing;

  topInset?: number | (() => number);
  bottomInset?: number | (() => number);
  minHeight?: number;
  maxHeight?: number | (() => number);

  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  dismissOnDragDown?: boolean;
  dismissDistanceRatio?: number;
  velocityThreshold?: number;
  rubberBand?: number;

  lockScroll?: boolean;
  trapFocus?: boolean;
  restoreFocus?: boolean;
  reducedMotion?: boolean | "media";
}

export interface BottomSheetDomBinding {
  readonly controller: BottomSheetController;
  readonly elements: BottomSheetElements;
  refresh(): void;
  getResolvedSnapPoints(): readonly ResolvedBottomSheetSnapPoint[];
  destroy(): void;
}
