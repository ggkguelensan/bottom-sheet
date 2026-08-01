import { describe, expect, it, vi } from "vitest";
import { createBottomSheetController } from "../src/index.js";

const snapPoints = [
  { id: "collapsed", size: { type: "ratio", value: 0.6 } },
  { id: "expanded", size: { type: "ratio", value: 0.996 } },
] as const;

describe("createBottomSheetController", () => {
  it("owns state in uncontrolled mode", () => {
    const controller = createBottomSheetController({ snapPoints });
    const events: string[] = [];
    controller.subscribe((_snapshot, event) => events.push(event.type));

    controller.open();

    expect(controller.getSnapshot()).toMatchObject({
      open: true,
      status: "opening",
      snapPoint: "collapsed",
    });
    expect(events).toEqual(["open-requested", "state-synced"]);

    controller.settle();
    expect(controller.getSnapshot().status).toBe("open");

    controller.snapTo("expanded");
    expect(controller.getSnapshot()).toMatchObject({
      status: "snapping",
      snapPoint: "expanded",
    });

    controller.settle();
    controller.close("escape");
    expect(controller.getSnapshot()).toMatchObject({
      open: false,
      status: "closing",
    });
  });

  it("publishes intent without mutating controlled state", () => {
    const controller = createBottomSheetController({
      snapPoints,
      controlled: true,
    });
    const listener = vi.fn();
    controller.subscribe(listener);

    controller.open();

    expect(controller.getSnapshot().open).toBe(false);
    expect(listener).toHaveBeenLastCalledWith(
      expect.objectContaining({ open: false }),
      { type: "open-requested" },
    );

    controller.sync({ open: true, snapPoint: "expanded" });
    expect(controller.getSnapshot()).toMatchObject({
      open: true,
      status: "opening",
      snapPoint: "expanded",
    });
  });

  it("rejects unknown snap points", () => {
    const controller = createBottomSheetController({ snapPoints });
    expect(() => controller.snapTo("missing")).toThrow(
      "Unknown snap point: missing",
    );
  });

  it("tracks ephemeral drag state separately", () => {
    const controller = createBottomSheetController({
      snapPoints,
      initialState: { open: true },
    });

    controller.beginDrag();
    controller.updateDrag(72);
    expect(controller.getSnapshot()).toMatchObject({
      dragging: true,
      dragOffset: 72,
    });

    controller.endDrag(840);
    expect(controller.getSnapshot()).toMatchObject({
      dragging: false,
      dragOffset: 0,
    });
  });
});
