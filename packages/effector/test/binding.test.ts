import {
  createShellSheetController,
  type ShellSheetOpenTarget,
  type ShellSheetTarget,
} from "@shell-sheet/core";
import {
  allSettled,
  createEvent,
  createStore,
  fork,
} from "effector";
import { describe, expect, it, vi } from "vitest";
import { createShellSheetBinding } from "../src/index.js";

type Snap = "compact" | "expanded";
type Region = "header" | "body" | "footer";

const closed = (targetId: string): ShellSheetTarget<Snap, Region> => ({
  targetId,
  open: false,
  transition: { cause: "close", direction: "none", motion: "auto" },
});

const opened = (
  targetId: string,
  snapPoint: Snap,
): ShellSheetOpenTarget<Snap, Region> => ({
  targetId,
  open: true,
  snapPoints: [
    { id: "compact", size: { type: "ratio", value: 0.5 } },
    { id: "expanded", size: { type: "ratio", value: 1 } },
  ],
  snapPoint,
  presentation: "sheet",
  modality: "modal",
  draggable: true,
  contentResizeBehavior: "animate",
  regions: {
    header: { key: "header", transition: "preserve" },
    body: { key: "body", transition: "preserve" },
    footer: { key: "footer", transition: "preserve" },
  },
  transition: { cause: "snap", direction: "snap", motion: "auto" },
});

describe("createShellSheetBinding", () => {
  it("syncs an application-owned target and never creates domain state", () => {
    const targetChanged = createEvent<ShellSheetTarget<Snap, Region>>();
    const $target = createStore(closed("closed:1")).on(
      targetChanged,
      (_, target) => target,
    );
    const requestReceived = createEvent();
    const visualFactReceived = createEvent();
    const request = vi.fn();
    requestReceived.watch(request);
    const binding = createShellSheetBinding({
      $target,
      requestReceived,
      visualFactReceived,
    });
    const controller = createShellSheetController<Snap, Region>();
    const detach = binding.attach(controller);

    expect(controller.getSnapshot().authoritativeTarget).toBe($target.getState());
    targetChanged(opened("A", "compact"));
    expect(controller.getSnapshot().authoritativeTarget).toBe($target.getState());

    controller.requestSnap("expanded", { origin: "api" });
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "snap-requested",
        snapPoint: "expanded",
      }),
    );
    expect($target.getState().open && $target.getState().snapPoint).toBe(
      "compact",
    );
    expect(binding).not.toHaveProperty("$state");
    expect(binding).not.toHaveProperty("$open");
    expect(binding).not.toHaveProperty("$snapPoint");

    detach();
    expect(binding.$controller.getState()).toBeNull();
  });

  it("forwards facts and snapshots without feeding them back into target", () => {
    const targetChanged = createEvent<ShellSheetTarget<Snap, Region>>();
    const initial = opened("A", "compact");
    const $target = createStore<ShellSheetTarget<Snap, Region>>(initial).on(
      targetChanged,
      (_, target) => target,
    );
    const requestReceived = createEvent();
    const visualFactReceived = createEvent();
    const facts = vi.fn();
    visualFactReceived.watch(facts);
    const binding = createShellSheetBinding({
      $target,
      requestReceived,
      visualFactReceived,
    });
    const controller = createShellSheetController<Snap, Region>();
    const detach = binding.attach(controller);
    const transitionId = controller.beginTransition("A");
    controller.settleTransition(transitionId);

    expect(facts).toHaveBeenCalledWith(
      expect.objectContaining({ type: "transition-settled", targetId: "A" }),
    );
    expect(binding.$visualSnapshot.getState()).toBe(controller.getSnapshot());
    expect($target.getState()).toBe(initial);

    detach();
    expect(binding.$visualSnapshot.getState()).toBeNull();
  });

  it("rejects simultaneous controllers and keeps stale cleanup token-safe", () => {
    const $target = createStore<ShellSheetTarget<Snap, Region>>(closed("closed:1"));
    const binding = createShellSheetBinding({
      $target,
      requestReceived: createEvent(),
      visualFactReceived: createEvent(),
    });
    const first = createShellSheetController<Snap, Region>();
    const second = createShellSheetController<Snap, Region>();
    const detachFirst = binding.attach(first);

    expect(() => binding.attach(second)).toThrow("already has");
    detachFirst();
    const detachSecond = binding.attach(second);
    detachFirst();
    expect(binding.$controller.getState()).toBe(second);

    detachSecond();
    expect(binding.$controller.getState()).toBeNull();
  });

  it("isolates controller and visual snapshot in a forked scope", async () => {
    const targetChanged = createEvent<ShellSheetTarget<Snap, Region>>();
    const $target = createStore(closed("closed:1")).on(
      targetChanged,
      (_, target) => target,
    );
    const requestReceived = createEvent();
    const visualFactReceived = createEvent();
    const binding = createShellSheetBinding({
      $target,
      requestReceived,
      visualFactReceived,
    });
    const firstScope = fork();
    const secondScope = fork();
    const firstController = createShellSheetController<Snap, Region>();
    const secondController = createShellSheetController<Snap, Region>();
    const detachFirst = binding.attachInScope(firstController, firstScope);
    const detachSecond = binding.attachInScope(secondController, secondScope);

    await allSettled(targetChanged, {
      scope: firstScope,
      params: opened("A", "compact"),
    });

    expect(firstController.getSnapshot().authoritativeTarget?.targetId).toBe("A");
    expect(secondController.getSnapshot().authoritativeTarget?.targetId).toBe(
      "closed:1",
    );
    expect(firstScope.getState(binding.$controller)).toBe(firstController);
    expect(secondScope.getState(binding.$controller)).toBe(secondController);
    expect(binding.$controller.getState()).toBeNull();

    detachFirst();
    detachSecond();
  });
});
