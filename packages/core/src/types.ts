export type BottomSheetCloseReason =
  | "api"
  | "backdrop"
  | "escape"
  | "gesture"
  | (string & {});

export type BottomSheetStatus =
  | "closed"
  | "opening"
  | "open"
  | "snapping"
  | "closing";

export type BottomSheetSnapPointSize =
  | { type: "ratio"; value: number }
  | { type: "pixels"; value: number }
  | { type: "content"; maxRatio?: number };

export interface BottomSheetSnapPoint {
  id: string;
  size: BottomSheetSnapPointSize;
}

export interface ResolvedBottomSheetSnapPoint {
  id: string;
  height: number;
  offset: number;
}

export interface BottomSheetMetrics {
  viewportHeight: number;
  contentHeight: number;
  topInset?: number;
  bottomInset?: number;
  handleHeight?: number;
  minHeight?: number;
  maxHeight?: number;
}

export interface BottomSheetControlledState {
  open: boolean;
  snapPoint: string;
}

export interface BottomSheetSnapshot extends BottomSheetControlledState {
  status: BottomSheetStatus;
  dragging: boolean;
  dragOffset: number;
  sequence: number;
}

export type BottomSheetEvent =
  | { type: "open-requested" }
  | { type: "close-requested"; reason: BottomSheetCloseReason }
  | { type: "snap-requested"; snapPoint: string }
  | {
      type: "state-synced";
      state: BottomSheetControlledState;
      previous: BottomSheetControlledState;
    }
  | { type: "settled"; status: "open" | "closed" }
  | { type: "drag-started" }
  | { type: "drag-updated"; offset: number }
  | { type: "drag-ended"; offset: number; velocityY: number }
  | { type: "drag-cancelled" }
  | { type: "destroyed" };

export type BottomSheetListener = (
  snapshot: Readonly<BottomSheetSnapshot>,
  event: BottomSheetEvent,
) => void;

export interface BottomSheetControllerOptions {
  snapPoints: readonly BottomSheetSnapPoint[];
  initialState?: Partial<BottomSheetControlledState>;
  controlled?: boolean;
}

export interface BottomSheetController {
  open(): void;
  close(reason?: BottomSheetCloseReason): void;
  toggle(): void;
  snapTo(snapPoint: string): void;

  /** Applies authoritative state from an external store. */
  sync(state: BottomSheetControlledState): void;

  /** Marks the current opening, closing, or snapping animation as complete. */
  settle(): void;

  beginDrag(): void;
  updateDrag(offset: number): void;
  endDrag(velocityY: number): void;
  cancelDrag(): void;

  getSnapshot(): Readonly<BottomSheetSnapshot>;
  getSnapPoints(): readonly BottomSheetSnapPoint[];
  subscribe(listener: BottomSheetListener): () => void;
  destroy(): void;
}

export interface SelectSnapPointOptions {
  currentHeight: number;
  currentSnapPoint: string;
  velocityY: number;
  snapPoints: readonly ResolvedBottomSheetSnapPoint[];
  velocityThreshold?: number;
}
