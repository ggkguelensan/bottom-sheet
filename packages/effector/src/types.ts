import type {
  ShellSheetCloseReason,
  ShellSheetControlledState,
  ShellSheetController,
  ShellSheetEvent,
  ShellSheetSnapshot,
} from "@shell-sheet/core";
import type {
  Effect,
  EventCallable,
  Store,
} from "effector";

export interface ShellSheetControllerEventPayload {
  controller: ShellSheetController;
  snapshot: Readonly<ShellSheetSnapshot>;
  event: ShellSheetEvent;
}

export interface ShellSheetEffectorOptions {
  initialState: ShellSheetControlledState;
  validateState?: (state: ShellSheetControlledState) => boolean;
}

export interface ShellSheetEffectorBinding {
  readonly $state: Store<ShellSheetControlledState>;
  readonly $open: Store<boolean>;
  readonly $snapPoint: Store<string>;
  readonly $controller: Store<ShellSheetController | null>;
  readonly $snapshot: Store<Readonly<ShellSheetSnapshot> | null>;
  readonly $lastCloseReason: Store<ShellSheetCloseReason | null>;

  readonly openRequested: EventCallable<void>;
  readonly closeRequested: EventCallable<ShellSheetCloseReason | void>;
  readonly snapRequested: EventCallable<string>;
  readonly stateReplaced: EventCallable<ShellSheetControlledState>;

  readonly controllerAttached: EventCallable<ShellSheetController>;
  readonly controllerDetached: EventCallable<void>;
  readonly controllerEventReceived: EventCallable<ShellSheetControllerEventPayload>;
  readonly syncControllerFx: Effect<
    {
      controller: ShellSheetController;
      state: ShellSheetControlledState;
    },
    void,
    Error
  >;

  /**
   * Subscribes to a controlled controller and returns a detach function.
   * This helper targets the global Effector scope. In forked scopes, bind the
   * exposed events with `scopeBind` and manage the subscription explicitly.
   */
  attach(controller: ShellSheetController): () => void;
}
