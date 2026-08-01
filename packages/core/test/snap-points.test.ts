import { describe, expect, it } from "vitest";
import {
  clampSheetHeight,
  resolveSnapPoints,
  selectSnapPoint,
} from "../src/index.js";

describe("snap point algorithms", () => {
  const points = resolveSnapPoints(
    [
      { id: "content", size: { type: "content", maxRatio: 0.6 } },
      { id: "half", size: { type: "ratio", value: 0.5 } },
      { id: "expanded", size: { type: "ratio", value: 1 } },
    ],
    {
      viewportHeight: 1000,
      contentHeight: 300,
      topInset: 100,
      bottomInset: 20,
      handleHeight: 32,
      minHeight: 160,
    },
  );

  it("resolves content, ratio, insets, and offsets", () => {
    expect(points).toEqual([
      { id: "content", height: 332, offset: 648 },
      { id: "half", height: 440, offset: 540 },
      { id: "expanded", height: 880, offset: 100 },
    ]);
  });

  it("selects the nearest point at low velocity", () => {
    expect(
      selectSnapPoint({
        currentHeight: 420,
        currentSnapPoint: "half",
        velocityY: 40,
        snapPoints: points,
      }).id,
    ).toBe("half");
  });

  it("uses velocity to select the next point in the gesture direction", () => {
    expect(
      selectSnapPoint({
        currentHeight: 440,
        currentSnapPoint: "half",
        velocityY: -900,
        snapPoints: points,
      }).id,
    ).toBe("expanded");

    expect(
      selectSnapPoint({
        currentHeight: 440,
        currentSnapPoint: "half",
        velocityY: 900,
        snapPoints: points,
      }).id,
    ).toBe("content");
  });

  it("applies optional rubber band outside the snap range", () => {
    expect(clampSheetHeight(232, points, 0)).toBe(332);
    expect(clampSheetHeight(232, points, 0.2)).toBe(312);
  });
});
