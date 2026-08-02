import { describe, expect, expectTypeOf, it, vi } from "vitest";
import {
  createShellSheetController,
  type ShellSheetEvent,
  type ShellSheetOpenTarget,
  type ShellSheetTarget,
} from "../src/index.js";

type Snap = "compact" | "expanded";
type Region = "header" | "summary" | "details" | "actions";

const closedTarget = (
  targetId = "closed:1",
): ShellSheetTarget<Snap, Region> => ({
  targetId,
  open: false,
  transition: { cause: "close", direction: "none", motion: "auto" },
});

const openTarget = (
  targetId: string,
  snapPoint: Snap = "compact",
  body: Region = "summary",
): ShellSheetOpenTarget<Snap, Region> => ({
  targetId,
  open: true,
  snapPoints: [
    { id: "compact", size: { type: "content", maxRatio: 0.65 } },
    { id: "expanded", size: { type: "ratio", value: 1 } },
  ],
  snapPoint,
  presentation: "sheet",
  modality: "modal",
  draggable: true,
  contentResizeBehavior: "animate",
  regions: {
    header: { key: "header", transition: "preserve" },
    body: { key: body, transition: "crossfade" },
    footer: { key: "actions", transition: "preserve" },
  },
  transition: { cause: "navigate", direction: "forward", motion: "auto" },
});

describe("createShellSheetController", () => {
  it("preserves literal snap and region unions", () => {
    const target = openTarget("A");
    const controller = createShellSheetController(target);

    expectTypeOf(controller.requestSnap).parameter(0).toEqualTypeOf<Snap>();
    expectTypeOf(controller.getSnapshot().authoritativeTarget).toEqualTypeOf<
      ShellSheetTarget<Snap, Region> | null
    >();
  });

  it("syncs an atomic target without treating a request as state", () => {
    const controller = createShellSheetController<Snap, Region>(closedTarget());
    const events: ShellSheetEvent<Snap, Region>[] = [];
    controller.subscribe((_snapshot, event) => events.push(event));

    const requestId = controller.requestOpen("trigger");

    expect(controller.getSnapshot().authoritativeTarget).toEqual(
      closedTarget(),
    );
    expect(events[0]).toMatchObject({
      type: "open-requested",
      requestId,
      sequence: 1,
      origin: "trigger",
    });

    const target = openTarget("A");
    controller.sync(target);

    expect(controller.getSnapshot()).toMatchObject({
      authoritativeTarget: target,
      settledTarget: null,
      phase: "preparing",
      transitionId: null,
    });
    expect(events[1]).toMatchObject({ type: "target-synced", sequence: 2 });
  });

  it("uses target and transition identity to reject stale completion", () => {
    const controller = createShellSheetController<Snap, Region>(closedTarget());
    const events: ShellSheetEvent<Snap, Region>[] = [];
    controller.subscribe((_snapshot, event) => events.push(event));

    controller.sync(openTarget("A"));
    const transitionA = controller.beginTransition("A");
    controller.sync(openTarget("B", "expanded", "details"));

    controller.settleTransition(transitionA);
    expect(controller.getSnapshot().settledTarget).toBeNull();

    const transitionB = controller.beginTransition("B");
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "transition-replaced",
        transitionId: transitionA,
        replacedBy: transitionB,
      }),
    );

    controller.settleTransition(transitionB);
    expect(controller.getSnapshot()).toMatchObject({
      phase: "open",
      transitionId: null,
      settledTarget: { targetId: "B", snapPoint: "expanded" },
    });
  });

  it("gives every started transition exactly one terminal fact", () => {
    const controller = createShellSheetController<Snap, Region>(openTarget("A"));
    const events: ShellSheetEvent<Snap, Region>[] = [];
    controller.subscribe((_snapshot, event) => events.push(event));

    const first = controller.beginTransition("A");
    const second = controller.beginTransition("A");
    controller.cancelTransition(second, "driver-cancelled");
    controller.cancelTransition(second, "driver-cancelled");
    controller.settleTransition(first);

    const terminals = events.filter(
      (event) =>
        event.type === "transition-settled" ||
        event.type === "transition-replaced" ||
        event.type === "transition-cancelled",
    );
    expect(terminals).toEqual([
      expect.objectContaining({
        type: "transition-replaced",
        transitionId: first,
        replacedBy: second,
      }),
      expect.objectContaining({
        type: "transition-cancelled",
        transitionId: second,
      }),
    ]);
  });

  it("keeps snapshots referentially stable and rejects reused target ids", () => {
    const target = openTarget("A");
    const controller = createShellSheetController(target);
    const initial = controller.getSnapshot();

    controller.sync(target);
    expect(controller.getSnapshot()).toBe(initial);

    expect(() => controller.sync({ ...target })).toThrow("targetId");

    const next = openTarget("B", "expanded", "details");
    controller.sync(next);
    expect(() => controller.sync(target)).toThrow("reused");
  });

  it("publishes reentrant work through FIFO without starving listeners", () => {
    const controller = createShellSheetController<Snap, Region>(closedTarget());
    const order: string[] = [];

    controller.subscribe((_snapshot, event) => {
      order.push(`first:${event.type}`);
      if (event.type === "open-requested") {
        controller.sync(openTarget("A"));
      }
    });
    controller.subscribe((_snapshot, event) => {
      order.push(`second:${event.type}`);
    });

    controller.requestOpen();

    expect(order).toEqual([
      "first:open-requested",
      "second:open-requested",
      "first:target-synced",
      "second:target-synced",
    ]);
  });

  it("isolates listener failures while preserving publication order", () => {
    const controller = createShellSheetController<Snap, Region>(closedTarget());
    const healthy = vi.fn();
    controller.subscribe(() => {
      throw new Error("listener failed");
    });
    controller.subscribe(healthy);

    expect(() => controller.requestOpen()).toThrow("listener failed");
    expect(healthy).toHaveBeenCalledOnce();
    expect(controller.getSnapshot().authoritativeTarget).toEqual(
      closedTarget(),
    );
  });

  it("publishes one release proposal after ending a DOM interaction", () => {
    const controller = createShellSheetController<Snap, Region>(openTarget("A"));
    const events: ShellSheetEvent<Snap, Region>[] = [];
    controller.subscribe((_snapshot, event) => events.push(event));

    const interactionId = controller.beginInteraction("handle");
    controller.endInteraction(interactionId);
    controller.requestSnap("expanded", {
      origin: "gesture",
      release: {
        interactionId,
        distance: -180,
        velocity: -1.2,
        projectedHeight: 780,
      },
    });

    expect(events.map((event) => event.type)).toEqual([
      "interaction-started",
      "interaction-ended",
      "snap-requested",
    ]);
    expect(() =>
      controller.requestSnap("expanded", {
        origin: "gesture",
        release: {
          interactionId,
          distance: -180,
          velocity: -1.2,
          projectedHeight: 780,
        },
      }),
    ).toThrow("release");
  });

  it("restores the active transition phase after an overlapping interaction", () => {
    const controller = createShellSheetController<Snap, Region>(openTarget("A"));
    controller.beginTransition("A");
    const interactionId = controller.beginInteraction("handle");

    expect(controller.getSnapshot().phase).toBe("dragging");
    controller.endInteraction(interactionId);

    expect(controller.getSnapshot().phase).toBe("opening");
  });

  it("destroys idempotently and releases retained target graphs", () => {
    const controller = createShellSheetController<Snap, Region>(openTarget("A"));
    const events: string[] = [];
    controller.subscribe((_snapshot, event) => events.push(event.type));

    const interaction = controller.beginInteraction("drag-area");
    const transition = controller.beginTransition("A");
    expect(interaction).toBe(1);
    expect(transition).toBe(1);

    controller.destroy();
    controller.destroy();

    expect(events.slice(-3)).toEqual([
      "interaction-cancelled",
      "transition-cancelled",
      "destroyed",
    ]);
    expect(controller.getSnapshot()).toEqual({
      authoritativeTarget: null,
      settledTarget: null,
      phase: "destroyed",
      transitionId: null,
      interaction: null,
    });
    expect(() => controller.requestOpen()).toThrow("destroyed");
  });
});
