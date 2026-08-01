import type {
  BottomSheetCloseReason,
  BottomSheetControlledState,
  BottomSheetController,
  BottomSheetEvent,
  BottomSheetSnapshot,
} from "@adaptive-bottom-sheet/core";
import type {
  Effect,
  EventCallable,
  Store,
} from "effector";

export interface BottomSheetControllerEventPayload {
  controller: BottomSheetController;
  snapshot: Readonly<BottomSheetSnapshot>;
  event: BottomSheetEvent;
}

export interface BottomSheetEffectorOptions {
  initialState: BottomSheetControlledState;
  validateState?: (state: BottomSheetControlledState) => boolean;
}

export interface BottomSheetEffectorBinding {
  readonly $state: Store<BottomSheetControlledState>;
  readonly $open: Store<boolean>;
  readonly $snapPoint: Store<string>;
  readonly $controller: Store<BottomSheetController | null>;
  readonly $snapshot: Store<Readonly<BottomSheetSnapshot> | null>;
  readonly $lastCloseReason: Store<BottomSheetCloseReason | null>;

  readonly openRequested: EventCallable<void>;
  readonly closeRequested: EventCallable<BottomSheetCloseReason | void>;
  readonly snapRequested: EventCallable<string>;
  readonly stateReplaced: EventCallable<BottomSheetControlledState>;

  readonly controllerAttached: EventCallable<BottomSheetController>;
  readonly controllerDetached: EventCallable<void>;
  readonly controllerEventReceived: EventCallable<BottomSheetControllerEventPayload>;
  readonly syncControllerFx: Effect<
    {
      controller: BottomSheetController;
      state: BottomSheetControlledState;
    },
    void,
    Error
  >;

  /**
   * Subscribes to a controlled controller and returns a detach function.
   * This helper targets the global Effector scope. In forked scopes, bind the
   * exposed events with `scopeBind` and manage the subscription explicitly.
   */
  attach(controller: BottomSheetController): () => void;
}
