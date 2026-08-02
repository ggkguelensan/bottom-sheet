import { describe, expect, it } from "vitest";
import { createShellSheetController } from "@shell-sheet/core";
import { createLovecraftDemoModel } from "./model";

const createController = () =>
  createShellSheetController({
    controlled: true,
    snapPoints: [
      { id: "peek", size: { type: "pixels", value: 290 } },
      { id: "content", size: { type: "content", maxRatio: 0.82 } },
      { id: "expanded", size: { type: "ratio", value: 0.94 } },
    ],
  });

describe("Lovecraft demo model", () => {
  it("keeps domain scenarios in demo state while controlling the generic sheet", () => {
    const model = createLovecraftDemoModel();
    const controller = createController();
    const detach = model.sheet.attach(controller);

    model.locationSelected("arkham");
    expect(model.$screen.getState()).toEqual({
      kind: "location-info",
      locationId: "arkham",
    });
    expect(model.sheet.$state.getState()).toEqual({
      open: true,
      snapPoint: "content",
    });
    expect(model.$presentation.getState()).toBe("sheet");

    model.entranceOpened("arkham");
    expect(model.$screen.getState()).toEqual({ kind: "journey", step: 0 });
    expect(model.$presentation.getState()).toBe("dialog");

    model.nextRequested();
    expect(model.$screen.getState()).toEqual({ kind: "journey", step: 1 });
    expect(model.sheet.$snapPoint.getState()).toBe("content");

    model.nextRequested();
    expect(model.$screen.getState()).toEqual({ kind: "journey", step: 2 });
    expect(model.sheet.$snapPoint.getState()).toBe("expanded");

    model.entranceOpened("innsmouth");
    expect(model.$screen.getState()).toEqual({
      kind: "progressive-reveal",
      locationId: "innsmouth",
    });
    expect(model.sheet.$snapPoint.getState()).toBe("peek");
    expect(model.$presentation.getState()).toBe("sheet");

    controller.snapTo("expanded");
    expect(model.sheet.$snapPoint.getState()).toBe("expanded");

    detach();
    controller.destroy();
  });

  it("maps each entrance to an independent demonstration screen", () => {
    const model = createLovecraftDemoModel();

    const expected = {
      arkham: "journey",
      innsmouth: "progressive-reveal",
      dunwich: "long-scroll",
      antarctica: "image-flush",
      dreamlands: "content-swap",
    } as const;

    for (const [locationId, kind] of Object.entries(expected)) {
      model.entranceOpened(locationId as keyof typeof expected);
      expect(model.$screen.getState().kind).toBe(kind);
    }
  });
});
