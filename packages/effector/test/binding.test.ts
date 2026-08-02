import { describe, expect, it } from "vitest";
import { createShellSheetController } from "@shell-sheet/core";
import { createShellSheetBinding } from "../src/index.js";

const snapPoints = [
  { id: "collapsed", size: { type: "ratio", value: 0.6 } },
  { id: "expanded", size: { type: "ratio", value: 0.996 } },
] as const;

describe("createShellSheetBinding", () => {
  it("keeps Effector as the source of controlled state", () => {
    const controller = createShellSheetController({
      snapPoints,
      controlled: true,
    });
    const binding = createShellSheetBinding({
      initialState: { open: false, snapPoint: "collapsed" },
      validateState: ({ snapPoint }) =>
        snapPoints.some((point) => point.id === snapPoint),
    });
    const detach = binding.attach(controller);

    controller.open();
    expect(binding.$open.getState()).toBe(true);
    expect(controller.getSnapshot()).toMatchObject({
      open: true,
      status: "opening",
    });

    controller.settle();
    binding.snapRequested("expanded");
    expect(binding.$snapPoint.getState()).toBe("expanded");
    expect(controller.getSnapshot()).toMatchObject({
      snapPoint: "expanded",
      status: "snapping",
    });

    detach();
    expect(binding.$controller.getState()).toBeNull();
  });

  it("forwards component close requests and their reason", () => {
    const controller = createShellSheetController({
      snapPoints,
      controlled: true,
      initialState: { open: true },
    });
    const binding = createShellSheetBinding({
      initialState: { open: true, snapPoint: "collapsed" },
    });
    binding.attach(controller);

    controller.close("backdrop");

    expect(binding.$state.getState().open).toBe(false);
    expect(binding.$lastCloseReason.getState()).toBe("backdrop");
  });

  it("rejects invalid external snap state", () => {
    const binding = createShellSheetBinding({
      initialState: { open: false, snapPoint: "collapsed" },
      validateState: ({ snapPoint }) => snapPoint !== "missing",
    });

    binding.snapRequested("missing");
    expect(binding.$snapPoint.getState()).toBe("collapsed");
  });
});
