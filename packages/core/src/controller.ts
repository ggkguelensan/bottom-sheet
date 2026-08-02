import { assertSnapPoints } from "./snap-points.js";
import type {
  ShellSheetCloseReason,
  ShellSheetControlledState,
  ShellSheetController,
  ShellSheetControllerOptions,
  ShellSheetEvent,
  ShellSheetListener,
  ShellSheetSnapshot,
} from "./types.js";

const controlledStateFromSnapshot = (
  snapshot: ShellSheetSnapshot,
): ShellSheetControlledState => ({
  open: snapshot.open,
  snapPoint: snapshot.snapPoint,
});

export function createShellSheetController(
  options: ShellSheetControllerOptions,
): ShellSheetController {
  assertSnapPoints(options.snapPoints);

  const snapPoints = [...options.snapPoints];
  const snapPointIds = new Set(snapPoints.map((point) => point.id));
  const controlled = options.controlled ?? false;
  const initialSnapPoint =
    options.initialState?.snapPoint ?? snapPoints[0]!.id;

  if (!snapPointIds.has(initialSnapPoint)) {
    throw new Error(`Unknown initial snap point: ${initialSnapPoint}`);
  }

  let snapshot: ShellSheetSnapshot = {
    open: options.initialState?.open ?? false,
    status: options.initialState?.open ? "open" : "closed",
    snapPoint: initialSnapPoint,
    dragging: false,
    dragOffset: 0,
    sequence: 0,
  };
  let destroyed = false;
  const listeners = new Set<ShellSheetListener>();

  const ensureActive = (): void => {
    if (destroyed) {
      throw new Error("ShellSheet controller has been destroyed.");
    }
  };

  const publish = (event: ShellSheetEvent): void => {
    for (const listener of [...listeners]) {
      listener(snapshot, event);
    }
  };

  const sync = (state: ShellSheetControlledState): void => {
    ensureActive();

    if (!snapPointIds.has(state.snapPoint)) {
      throw new Error(`Unknown snap point: ${state.snapPoint}`);
    }

    const previous = controlledStateFromSnapshot(snapshot);

    if (
      previous.open === state.open &&
      previous.snapPoint === state.snapPoint
    ) {
      return;
    }

    let status = snapshot.status;

    if (state.open !== previous.open) {
      status = state.open ? "opening" : "closing";
    } else if (state.open && state.snapPoint !== previous.snapPoint) {
      status = "snapping";
    } else if (!state.open) {
      status = "closed";
    }

    snapshot = {
      ...snapshot,
      ...state,
      status,
      dragging: false,
      dragOffset: 0,
      sequence: snapshot.sequence + 1,
    };

    publish({ type: "state-synced", state, previous });
  };

  const requestOpen = (): void => {
    ensureActive();
    publish({ type: "open-requested" });

    if (!controlled) {
      sync({ open: true, snapPoint: snapshot.snapPoint });
    }
  };

  const requestClose = (reason: ShellSheetCloseReason = "api"): void => {
    ensureActive();
    publish({ type: "close-requested", reason });

    if (!controlled) {
      sync({ open: false, snapPoint: snapshot.snapPoint });
    }
  };

  const requestSnap = (snapPoint: string): void => {
    ensureActive();

    if (!snapPointIds.has(snapPoint)) {
      throw new Error(`Unknown snap point: ${snapPoint}`);
    }

    publish({ type: "snap-requested", snapPoint });

    if (!controlled) {
      sync({ open: snapshot.open, snapPoint });
    }
  };

  const controller: ShellSheetController = {
    open: requestOpen,
    close: requestClose,
    toggle() {
      if (snapshot.open) {
        requestClose("api");
      } else {
        requestOpen();
      }
    },
    snapTo: requestSnap,
    sync,
    settle() {
      ensureActive();

      if (
        snapshot.status !== "opening" &&
        snapshot.status !== "closing" &&
        snapshot.status !== "snapping"
      ) {
        return;
      }

      const status = snapshot.open ? "open" : "closed";
      snapshot = {
        ...snapshot,
        status,
        sequence: snapshot.sequence + 1,
      };
      publish({ type: "settled", status });
    },
    beginDrag() {
      ensureActive();
      if (!snapshot.open || snapshot.dragging) return;

      snapshot = { ...snapshot, dragging: true, dragOffset: 0 };
      publish({ type: "drag-started" });
    },
    updateDrag(offset) {
      ensureActive();
      if (!snapshot.dragging || !Number.isFinite(offset)) return;

      snapshot = { ...snapshot, dragOffset: offset };
      publish({ type: "drag-updated", offset });
    },
    endDrag(velocityY) {
      ensureActive();
      if (!snapshot.dragging) return;

      const offset = snapshot.dragOffset;
      snapshot = { ...snapshot, dragging: false, dragOffset: 0 };
      publish({ type: "drag-ended", offset, velocityY });
    },
    cancelDrag() {
      ensureActive();
      if (!snapshot.dragging) return;

      snapshot = { ...snapshot, dragging: false, dragOffset: 0 };
      publish({ type: "drag-cancelled" });
    },
    getSnapshot() {
      return snapshot;
    },
    getSnapPoints() {
      return snapPoints;
    },
    subscribe(listener) {
      ensureActive();
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    destroy() {
      if (destroyed) return;
      publish({ type: "destroyed" });
      destroyed = true;
      listeners.clear();
    },
  };

  return controller;
}
