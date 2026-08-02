export type ShellSheetCloseReason =
  | "api"
  | "backdrop"
  | "escape"
  | "gesture"
  | (string & {});

export type ShellSheetStatus =
  | "closed"
  | "opening"
  | "open"
  | "snapping"
  | "closing";

export type ShellSheetSnapPointSize =
  | { type: "ratio"; value: number }
  | { type: "pixels"; value: number }
  | { type: "content"; maxRatio?: number };

export interface ShellSheetSnapPoint {
  id: string;
  size: ShellSheetSnapPointSize;
}

export interface ResolvedShellSheetSnapPoint {
  id: string;
  height: number;
  offset: number;
}

export interface ShellSheetMetrics {
  viewportHeight: number;
  contentHeight: number;
  topInset?: number;
  bottomInset?: number;
  handleHeight?: number;
  minHeight?: number;
  maxHeight?: number;
}

export interface ShellSheetControlledState {
  open: boolean;
  snapPoint: string;
}

export interface ShellSheetSnapshot extends ShellSheetControlledState {
  status: ShellSheetStatus;
  dragging: boolean;
  dragOffset: number;
  sequence: number;
}

export type ShellSheetEvent =
  | { type: "open-requested" }
  | { type: "close-requested"; reason: ShellSheetCloseReason }
  | { type: "snap-requested"; snapPoint: string }
  | {
      type: "state-synced";
      state: ShellSheetControlledState;
      previous: ShellSheetControlledState;
    }
  | { type: "settled"; status: "open" | "closed" }
  | { type: "drag-started" }
  | { type: "drag-updated"; offset: number }
  | { type: "drag-ended"; offset: number; velocityY: number }
  | { type: "drag-cancelled" }
  | { type: "destroyed" };

export type ShellSheetListener = (
  snapshot: Readonly<ShellSheetSnapshot>,
  event: ShellSheetEvent,
) => void;

export interface ShellSheetControllerOptions {
  snapPoints: readonly ShellSheetSnapPoint[];
  initialState?: Partial<ShellSheetControlledState>;
  controlled?: boolean;
}

export interface ShellSheetController {
  open(): void;
  close(reason?: ShellSheetCloseReason): void;
  toggle(): void;
  snapTo(snapPoint: string): void;

  /** Applies authoritative state from an external store. */
  sync(state: ShellSheetControlledState): void;

  /** Marks the current opening, closing, or snapping animation as complete. */
  settle(): void;

  beginDrag(): void;
  updateDrag(offset: number): void;
  endDrag(velocityY: number): void;
  cancelDrag(): void;

  getSnapshot(): Readonly<ShellSheetSnapshot>;
  getSnapPoints(): readonly ShellSheetSnapPoint[];
  subscribe(listener: ShellSheetListener): () => void;
  destroy(): void;
}

export interface SelectSnapPointOptions {
  currentHeight: number;
  currentSnapPoint: string;
  velocityY: number;
  snapPoints: readonly ResolvedShellSheetSnapPoint[];
  velocityThreshold?: number;
}
