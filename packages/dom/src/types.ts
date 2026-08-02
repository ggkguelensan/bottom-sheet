import type {
  ShellSheetController,
  ResolvedShellSheetSnapPoint,
} from "@shell-sheet/core";

export type ShellSheetEasing =
  | "linear"
  | "easeIn"
  | "easeOut"
  | "easeInOut"
  | readonly [number, number, number, number];

export type ShellSheetKeyframes = Record<
  string,
  string | number | readonly (string | number)[]
>;

export interface ShellSheetAnimationOptions {
  /** Duration in milliseconds. */
  duration: number;
  easing: ShellSheetEasing;
}

export interface ShellSheetAnimationControls {
  finished: Promise<void>;
  stop(): void;
}

export interface ShellSheetAnimationDriver {
  animate(
    element: HTMLElement,
    keyframes: ShellSheetKeyframes,
    options: ShellSheetAnimationOptions,
  ): ShellSheetAnimationControls;
}

export interface ShellSheetElements {
  /** Overlay/portal root. It is hidden after the closing animation. */
  root: HTMLElement;
  /** The bottom-anchored sheet surface. */
  main: HTMLElement;
  /** Drag and toggle affordance. */
  handle?: HTMLElement;
  /** Fixed row at the top of the sheet. Its height is part of content sizing. */
  header?: HTMLElement;
  /** Element whose scrollHeight represents content height. */
  content?: HTMLElement;
  /** Fixed row at the bottom of the sheet. Its height is part of content sizing. */
  footer?: HTMLElement;
  /** Additional elements that initiate drag without gaining handle click semantics. */
  dragAreas?: readonly HTMLElement[];
  backdrop?: HTMLElement;
  /** Application region made inert while the sheet is open. */
  inertTarget?: HTMLElement;
}

export interface ShellSheetDomOptions {
  animation?: ShellSheetAnimationDriver;
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
  easing?: ShellSheetEasing;

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

export interface ShellSheetDomBinding {
  readonly controller: ShellSheetController;
  readonly elements: ShellSheetElements;
  /**
   * Replaces runtime behaviour without tearing down the DOM binding. This is
   * the path framework adapters should use for presentation or modality
   * changes so an in-flight animation and gesture keep their lifecycle.
   */
  updateOptions(options: ShellSheetDomOptions): void;
  refresh(): void;
  getResolvedSnapPoints(): readonly ResolvedShellSheetSnapPoint[];
  destroy(): void;
}
