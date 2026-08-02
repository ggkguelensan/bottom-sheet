export type ShellTransitionDirection =
  | "forward"
  | "backward"
  | "replace"
  | "snap"
  | "none";

export type ShellTransitionIntent = Readonly<{
  cause:
    | "open"
    | "close"
    | "navigate"
    | "snap"
    | "content"
    | "presentation"
    | "hydrate"
    | "api";
  direction: ShellTransitionDirection;
  motion: "auto" | "instant";
}>;

export type ShellRegionTransition = "preserve" | "crossfade" | "replace";

export type ShellRegionTarget<TKey extends string> = Readonly<{
  key: TKey;
  transition: ShellRegionTransition;
}>;

export type ShellSheetSnapPointSize =
  | Readonly<{ type: "ratio"; value: number }>
  | Readonly<{ type: "pixels"; value: number }>
  | Readonly<{ type: "content"; maxRatio?: number }>;

export type ShellSheetSnapPoint<TSnap extends string = string> = Readonly<{
  id: TSnap;
  size: ShellSheetSnapPointSize;
}>;

export type ResolvedShellSheetSnapPoint<
  TSnap extends string = string,
> = Readonly<{
  id: TSnap;
  height: number;
  declarationIndex: number;
}>;

export type ShellSheetClosedTarget = Readonly<{
  targetId: string;
  open: false;
  transition: ShellTransitionIntent;
  causeRequestId?: number;
}>;

export type ShellSheetOpenTarget<
  TSnap extends string = string,
  TRegionKey extends string = string,
> = Readonly<{
  targetId: string;
  open: true;
  snapPoints: readonly ShellSheetSnapPoint<TSnap>[];
  snapPoint: TSnap;
  presentation: "sheet" | "dialog";
  modality: "modal" | "non-modal";
  draggable: boolean;
  snapToSequentialPoints?: boolean;
  contentResizeBehavior: "animate" | "immediate" | "keep-snap-and-scroll";
  regions: Readonly<{
    header: ShellRegionTarget<TRegionKey>;
    body: ShellRegionTarget<TRegionKey>;
    footer: ShellRegionTarget<TRegionKey>;
  }>;
  transition: ShellTransitionIntent;
  causeRequestId?: number;
}>;

export type ShellSheetTarget<
  TSnap extends string = string,
  TRegionKey extends string = string,
> =
  | ShellSheetClosedTarget
  | ShellSheetOpenTarget<TSnap, TRegionKey>;

export type ShellSheetPhase =
  | "closed"
  | "preparing"
  | "opening"
  | "open"
  | "dragging"
  | "transitioning"
  | "closing"
  | "destroyed";

export type ShellInteractionOrigin = "handle" | "drag-area";

export type ShellSheetSnapshot<
  TSnap extends string = string,
  TRegionKey extends string = string,
> = Readonly<{
  authoritativeTarget: ShellSheetTarget<TSnap, TRegionKey> | null;
  settledTarget: ShellSheetOpenTarget<TSnap, TRegionKey> | null;
  phase: ShellSheetPhase;
  transitionId: number | null;
  interaction: Readonly<{
    interactionId: number;
    origin: ShellInteractionOrigin;
  }> | null;
}>;

export type ShellRequestOrigin =
  | "trigger"
  | "api"
  | "gesture"
  | "keyboard"
  | "backdrop"
  | "close-button";

export type ShellCloseReason =
  | "escape"
  | "backdrop"
  | "gesture"
  | "close-button"
  | "api"
  | "route-change";

export type ShellTransitionCancelReason =
  | "destroyed"
  | "driver-cancelled"
  | "registry-lost";

export type ShellInteractionCancelReason =
  | "pointer-cancelled"
  | "capture-lost"
  | "visibility-lost"
  | "target-changed"
  | "destroyed";

export type ShellGestureRelease = Readonly<{
  interactionId: number;
  distance: number;
  velocity: number;
  projectedHeight: number;
}>;

export type ShellCloseRequestDetails = Readonly<{
  origin: ShellRequestOrigin;
  release?: ShellGestureRelease;
}>;

export type ShellSnapRequestDetails = Readonly<{
  origin: ShellRequestOrigin;
  release?: ShellGestureRelease;
}>;

export type ShellSheetRequest<TSnap extends string = string> =
  | Readonly<{
      type: "open-requested";
      sequence: number;
      requestId: number;
      origin: ShellRequestOrigin;
    }>
  | Readonly<{
      type: "close-requested";
      sequence: number;
      requestId: number;
      origin: ShellRequestOrigin;
      reason: ShellCloseReason;
      release?: ShellGestureRelease;
    }>
  | Readonly<{
      type: "snap-requested";
      sequence: number;
      requestId: number;
      origin: ShellRequestOrigin;
      snapPoint: TSnap;
      release?: ShellGestureRelease;
    }>;

export type ShellSheetFact<
  TSnap extends string = string,
  TRegionKey extends string = string,
> =
  | Readonly<{
      type: "target-synced";
      sequence: number;
      target: ShellSheetTarget<TSnap, TRegionKey>;
    }>
  | Readonly<{
      type: "transition-started";
      sequence: number;
      targetId: string;
      transitionId: number;
    }>
  | Readonly<{
      type: "transition-settled";
      sequence: number;
      targetId: string;
      transitionId: number;
    }>
  | Readonly<{
      type: "transition-replaced";
      sequence: number;
      targetId: string;
      transitionId: number;
      replacedBy: number;
    }>
  | Readonly<{
      type: "transition-cancelled";
      sequence: number;
      targetId: string;
      transitionId: number;
      reason: ShellTransitionCancelReason;
    }>
  | Readonly<{
      type: "interaction-started" | "interaction-ended";
      sequence: number;
      interactionId: number;
      origin: ShellInteractionOrigin;
    }>
  | Readonly<{
      type: "interaction-cancelled";
      sequence: number;
      interactionId: number;
      origin: ShellInteractionOrigin;
      reason: ShellInteractionCancelReason;
    }>
  | Readonly<{
      type: "destroyed";
      sequence: number;
    }>;

export type ShellSheetEvent<
  TSnap extends string = string,
  TRegionKey extends string = string,
> = ShellSheetRequest<TSnap> | ShellSheetFact<TSnap, TRegionKey>;

export type ShellSheetListener<
  TSnap extends string = string,
  TRegionKey extends string = string,
> = (
  snapshot: ShellSheetSnapshot<TSnap, TRegionKey>,
  event: ShellSheetEvent<TSnap, TRegionKey>,
) => void;

export type ShellSheetController<
  TSnap extends string = string,
  TRegionKey extends string = string,
> = {
  sync(target: ShellSheetTarget<TSnap, TRegionKey>): void;

  requestOpen(origin?: ShellRequestOrigin): number;
  requestClose(
    reason: ShellCloseReason,
    details?: ShellCloseRequestDetails,
  ): number;
  requestSnap(snapPoint: TSnap, details: ShellSnapRequestDetails): number;

  beginTransition(targetId: string): number;
  settleTransition(transitionId: number): void;
  cancelTransition(
    transitionId: number,
    reason: ShellTransitionCancelReason,
  ): void;

  beginInteraction(origin: ShellInteractionOrigin): number;
  endInteraction(interactionId: number): void;
  cancelInteraction(
    interactionId: number,
    reason: ShellInteractionCancelReason,
  ): void;

  getSnapshot(): ShellSheetSnapshot<TSnap, TRegionKey>;
  subscribe(listener: ShellSheetListener<TSnap, TRegionKey>): () => void;
  destroy(): void;
};

export type ShellSheetMetrics = Readonly<{
  viewportHeight: number;
  insetTop: number;
  insetBottom: number;
  headerHeight: number;
  bodyNaturalHeight: number;
  footerHeight: number;
  minHeight?: number;
  maxHeight?: number;
}>;

export type SelectShellSheetReleaseDestinationInput<
  TSnap extends string = string,
> = Readonly<{
  currentHeight: number;
  activeSnapPoint: TSnap;
  velocity: number;
  dragDistance: number;
  snapPoints: readonly ResolvedShellSheetSnapPoint<TSnap>[];
  allowClose?: boolean;
  snapToSequentialPoints?: boolean;
  projectionTime?: number;
  closeVelocityThreshold?: number;
  closeDistanceThreshold?: number;
}>;

export type ShellSheetReleaseDestination<TSnap extends string = string> =
  | Readonly<{ type: "snap"; snapPoint: TSnap }>
  | Readonly<{ type: "close" }>;

export type ApplyRubberBandInput = Readonly<{
  value: number;
  min: number;
  max: number;
  dimension: number;
  constant?: number;
}>;
