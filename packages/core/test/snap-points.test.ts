import { describe, expect, it } from "vitest";
import {
  applyRubberBand,
  assertSnapPoints,
  resolveSnapPoints,
  selectReleaseDestination,
} from "../src/index.js";

describe("snap point contracts", () => {
  it("resolves fractional content geometry without counting Handle twice", () => {
    const definitions = [
      { id: "content", size: { type: "content", maxRatio: 0.75 } },
      { id: "half", size: { type: "ratio", value: 0.5 } },
      { id: "expanded", size: { type: "ratio", value: 1 } },
    ] as const;
    const metrics = {
      viewportHeight: 901.5,
      insetTop: 60.25,
      insetBottom: 20.5,
      headerHeight: 40.25,
      bodyNaturalHeight: 260.5,
      footerHeight: 51.125,
      minHeight: 140.5,
    } as const;

    const points = resolveSnapPoints(definitions, metrics);

    expect(points).toEqual([
      { id: "content", height: 351.875, declarationIndex: 0 },
      { id: "half", height: 410.375, declarationIndex: 1 },
      { id: "expanded", height: 820.75, declarationIndex: 2 },
    ]);
    expect(definitions[0]!.size.type).toBe("content");
    expect(metrics.headerHeight).toBe(40.25);
  });

  it("keeps duplicate clamped heights deterministic", () => {
    expect(
      resolveSnapPoints(
        [
          { id: "first", size: { type: "pixels", value: 500 } },
          { id: "second", size: { type: "ratio", value: 1 } },
        ],
        {
          viewportHeight: 300,
          insetTop: 0,
          insetBottom: 0,
          headerHeight: 0,
          bodyNaturalHeight: 0,
          footerHeight: 0,
        },
      ),
    ).toEqual([
      { id: "first", height: 300, declarationIndex: 0 },
      { id: "second", height: 300, declarationIndex: 1 },
    ]);
  });

  it.each([
    [[{ id: "", size: { type: "pixels", value: 10 } }]],
    [[
      { id: "same", size: { type: "pixels", value: 10 } },
      { id: "same", size: { type: "pixels", value: 20 } },
    ]],
    [[{ id: "nan", size: { type: "pixels", value: Number.NaN } }]],
    [[{ id: "infinite", size: { type: "ratio", value: Infinity } }]],
    [[{ id: "ratio", size: { type: "ratio", value: 0 } }]],
    [[{ id: "content", size: { type: "content", maxRatio: 2 } }]],
  ])("rejects invalid definitions", (definitions) => {
    expect(() => assertSnapPoints(definitions)).toThrow();
  });

  it("rejects non-finite metrics and inverted configured bounds", () => {
    const definitions = [
      { id: "content", size: { type: "content" } },
    ] as const;

    expect(() =>
      resolveSnapPoints(definitions, {
        viewportHeight: Infinity,
        insetTop: 0,
        insetBottom: 0,
        headerHeight: 0,
        bodyNaturalHeight: 0,
        footerHeight: 0,
      }),
    ).toThrow("viewportHeight");

    expect(() =>
      resolveSnapPoints(definitions, {
        viewportHeight: 600,
        insetTop: 0,
        insetBottom: 0,
        headerHeight: 0,
        bodyNaturalHeight: 0,
        footerHeight: 0,
        minHeight: 500,
        maxHeight: 400,
      }),
    ).toThrow("minHeight");
  });
});

describe("release selection", () => {
  const points = [
    { id: "compact", height: 300, declarationIndex: 0 },
    { id: "medium", height: 500, declarationIndex: 1 },
    { id: "expanded", height: 800, declarationIndex: 2 },
  ] as const;

  it("uses a projected endpoint and can cross multiple points", () => {
    expect(
      selectReleaseDestination({
        currentHeight: 500,
        activeSnapPoint: "medium",
        velocity: -2,
        dragDistance: -50,
        snapPoints: points,
      }),
    ).toEqual({ type: "snap", snapPoint: "expanded" });
  });

  it("limits navigation to one physical neighbour in sequential mode", () => {
    const sequentialPoints = [
      ...points.slice(0, 2),
      { id: "medium-alias", height: 500, declarationIndex: 3 },
      points[2]!,
      { id: "full", height: 1_000, declarationIndex: 4 },
    ] as const;

    expect(
      selectReleaseDestination({
        currentHeight: 500,
        activeSnapPoint: "medium",
        velocity: -4,
        dragDistance: -100,
        snapPoints: sequentialPoints,
        snapToSequentialPoints: true,
      }),
    ).toEqual({ type: "snap", snapPoint: "expanded" });
  });

  it("proposes close only below the lowest point and past a threshold", () => {
    expect(
      selectReleaseDestination({
        currentHeight: 250,
        activeSnapPoint: "compact",
        velocity: 0.8,
        dragDistance: 80,
        snapPoints: points,
        allowClose: true,
      }),
    ).toEqual({ type: "close" });

    expect(
      selectReleaseDestination({
        currentHeight: 290,
        activeSnapPoint: "compact",
        velocity: 0.1,
        dragDistance: 10,
        snapPoints: points,
        allowClose: true,
      }),
    ).toEqual({ type: "snap", snapPoint: "compact" });
  });

  it("prefers the active id when distances tie", () => {
    expect(
      selectReleaseDestination({
        currentHeight: 400,
        activeSnapPoint: "compact",
        velocity: 0,
        dragDistance: 0,
        snapPoints: points,
      }),
    ).toEqual({ type: "snap", snapPoint: "compact" });
  });
});

describe("rubber band", () => {
  it("is continuous, progressive, bounded and sign preserving", () => {
    expect(
      applyRubberBand({ value: 500, min: 300, max: 800, dimension: 900 }),
    ).toBe(500);

    const short = applyRubberBand({
      value: 850,
      min: 300,
      max: 800,
      dimension: 900,
    });
    const long = applyRubberBand({
      value: 1_800,
      min: 300,
      max: 800,
      dimension: 900,
    });

    expect(short).toBeGreaterThan(800);
    expect(long).toBeGreaterThan(short);
    expect(long).toBeLessThan(1_800);
    expect(Number.isFinite(long)).toBe(true);
  });
});
