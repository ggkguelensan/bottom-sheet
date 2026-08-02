import type {
  ShellSheetController,
  ShellSheetFact,
  ShellSheetRequest,
  ShellSheetSnapshot,
  ShellSheetTarget,
} from "@shell-sheet/core";
import type {
  Effect,
  EventCallable,
  Scope,
  Store,
} from "effector";

export type ShellSheetEffectorOptions<
  TSnap extends string,
  TRegionKey extends string,
> = Readonly<{
  $target: Store<ShellSheetTarget<TSnap, TRegionKey>>;
  requestReceived: EventCallable<ShellSheetRequest<TSnap>>;
  visualFactReceived: EventCallable<ShellSheetFact<TSnap, TRegionKey>>;
}>;

export type ShellSheetEffectorBinding<
  TSnap extends string,
  TRegionKey extends string,
> = Readonly<{
  controllerAttached: EventCallable<ShellSheetController<TSnap, TRegionKey>>;
  controllerDetached: EventCallable<void>;
  $controller: Store<ShellSheetController<TSnap, TRegionKey> | null>;
  $visualSnapshot: Store<ShellSheetSnapshot<TSnap, TRegionKey> | null>;
  syncControllerFx: Effect<
    Readonly<{
      controller: ShellSheetController<TSnap, TRegionKey>;
      target: ShellSheetTarget<TSnap, TRegionKey>;
    }>,
    void,
    Error
  >;
  attach(controller: ShellSheetController<TSnap, TRegionKey>): () => void;
  attachInScope(
    controller: ShellSheetController<TSnap, TRegionKey>,
    scope: Scope,
  ): () => void;
}>;
