import type {
  ShellSheetController,
  ShellSheetEvent,
  ShellSheetFact,
  ShellSheetRequest,
  ShellSheetSnapshot,
} from "@shell-sheet/core";
import {
  createEffect,
  createEvent,
  createStore,
  sample,
  scopeBind,
  type Scope,
} from "effector";
import type {
  ShellSheetEffectorBinding,
  ShellSheetEffectorOptions,
} from "./types.js";

type Attachment<TSnap extends string, TRegionKey extends string> = {
  readonly id: number;
  readonly controller: ShellSheetController<TSnap, TRegionKey>;
};

export function createShellSheetBinding<
  TSnap extends string,
  TRegionKey extends string,
>(
  options: ShellSheetEffectorOptions<TSnap, TRegionKey>,
): ShellSheetEffectorBinding<TSnap, TRegionKey> {
  const controllerAttached = createEvent<
    ShellSheetController<TSnap, TRegionKey>
  >("shellSheet.controllerAttached");
  const controllerDetached = createEvent<void>(
    "shellSheet.controllerDetached",
  );
  const visualSnapshotReceived = createEvent<
    ShellSheetSnapshot<TSnap, TRegionKey>
  >("shellSheet.visualSnapshotReceived");

  const $controller = createStore<
    ShellSheetController<TSnap, TRegionKey> | null
  >(null, {
    name: "shellSheet.$controller",
    serialize: "ignore",
  })
    .on(controllerAttached, (_, controller) => controller)
    .reset(controllerDetached);
  const $visualSnapshot = createStore<
    ShellSheetSnapshot<TSnap, TRegionKey> | null
  >(null, {
    name: "shellSheet.$visualSnapshot",
    serialize: "ignore",
  })
    .on(visualSnapshotReceived, (_, snapshot) => snapshot)
    .reset(controllerDetached);

  const syncControllerFx = createEffect<
    Readonly<{
      controller: ShellSheetController<TSnap, TRegionKey>;
      target: ReturnType<typeof options.$target.getState>;
    }>,
    void,
    Error
  >({
    name: "shellSheet.syncControllerFx",
    handler: ({ controller, target }) => controller.sync(target),
  });

  sample({
    clock: controllerAttached,
    source: options.$target,
    fn: (target, controller) => ({ controller, target }),
    target: syncControllerFx,
  });
  sample({
    clock: options.$target,
    source: $controller,
    filter: (controller) => controller !== null,
    fn: (controller, target) => {
      if (controller === null) {
        throw new Error("ShellSheet controller disappeared during target sync.");
      }
      return { controller, target };
    },
    target: syncControllerFx,
  });

  let attachmentId = 0;
  let globalAttachment: Attachment<TSnap, TRegionKey> | null = null;
  const scopeAttachments = new WeakMap<
    Scope,
    Attachment<TSnap, TRegionKey>
  >();

  const attach = (
    controller: ShellSheetController<TSnap, TRegionKey>,
    scope?: Scope,
  ): (() => void) => {
    const existing = scope
      ? scopeAttachments.get(scope) ?? null
      : globalAttachment;
    if (existing) {
      throw new Error(
        "ShellSheet Effector binding already has an attached controller in this scope.",
      );
    }

    attachmentId += 1;
    const attachment: Attachment<TSnap, TRegionKey> = {
      id: attachmentId,
      controller,
    };
    if (scope) scopeAttachments.set(scope, attachment);
    else globalAttachment = attachment;

    const sendAttached = scope
      ? scopeBind(controllerAttached, { scope })
      : controllerAttached;
    const sendDetached = scope
      ? scopeBind(controllerDetached, { scope })
      : controllerDetached;
    const sendSnapshot = scope
      ? scopeBind(visualSnapshotReceived, { scope })
      : visualSnapshotReceived;
    const sendRequest = scope
      ? scopeBind(options.requestReceived, { scope })
      : options.requestReceived;
    const sendFact = scope
      ? scopeBind(options.visualFactReceived, { scope })
      : options.visualFactReceived;

    const unsubscribe = controller.subscribe((snapshot, event) => {
      sendSnapshot(snapshot);
      if (isRequest(event)) sendRequest(event);
      else sendFact(event);
    });
    sendAttached(controller);

    let active = true;
    return () => {
      if (!active) return;
      active = false;
      const current = scope
        ? scopeAttachments.get(scope) ?? null
        : globalAttachment;
      if (current?.id !== attachment.id) return;
      unsubscribe();
      if (scope) scopeAttachments.delete(scope);
      else globalAttachment = null;
      sendDetached();
    };
  };

  return Object.freeze({
    controllerAttached,
    controllerDetached,
    $controller,
    $visualSnapshot,
    syncControllerFx,
    attach: (controller) => attach(controller),
    attachInScope: (controller, scope) => attach(controller, scope),
  });
}

const isRequest = <TSnap extends string, TRegionKey extends string>(
  event: ShellSheetEvent<TSnap, TRegionKey>,
): event is ShellSheetRequest<TSnap> =>
  event.type === "open-requested" ||
  event.type === "close-requested" ||
  event.type === "snap-requested";
