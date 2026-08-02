import type {
  ResolvedShellSheetSnapPoint,
  ShellSheetMetrics,
  ShellSheetSnapPoint,
} from "./types.js";

const assertFinite = (name: string, value: number): void => {
  if (!Number.isFinite(value)) {
    throw new Error(`ShellSheet ${name} must be finite.`);
  }
};

const assertNonNegative = (name: string, value: number): void => {
  assertFinite(name, value);
  if (value < 0) {
    throw new Error(`ShellSheet ${name} must not be negative.`);
  }
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export function assertSnapPoints<TSnap extends string>(
  snapPoints: readonly ShellSheetSnapPoint<TSnap>[],
): void {
  if (snapPoints.length === 0) {
    throw new Error("ShellSheet requires at least one snap point.");
  }

  const ids = new Set<string>();

  for (const point of snapPoints) {
    if (point.id.trim().length === 0) {
      throw new Error("ShellSheet snap point ids must not be empty.");
    }
    if (ids.has(point.id)) {
      throw new Error(`Duplicate ShellSheet snap point id: ${point.id}`);
    }
    ids.add(point.id);

    if (point.size.type === "content") {
      if (point.size.maxRatio !== undefined) {
        assertFinite(`content maxRatio for "${point.id}"`, point.size.maxRatio);
        if (point.size.maxRatio <= 0 || point.size.maxRatio > 1) {
          throw new Error(
            `Content maxRatio for "${point.id}" must be greater than 0 and at most 1.`,
          );
        }
      }
      continue;
    }

    assertFinite(`size for "${point.id}"`, point.size.value);
    if (point.size.type === "ratio") {
      if (point.size.value <= 0 || point.size.value > 1) {
        throw new Error(
          `Ratio snap point "${point.id}" must be greater than 0 and at most 1.`,
        );
      }
    } else if (point.size.value < 0) {
      throw new Error(`Pixel snap point "${point.id}" must not be negative.`);
    }
  }
}

const assertMetrics = (metrics: ShellSheetMetrics): void => {
  assertNonNegative("viewportHeight", metrics.viewportHeight);
  assertNonNegative("insetTop", metrics.insetTop);
  assertNonNegative("insetBottom", metrics.insetBottom);
  assertNonNegative("headerHeight", metrics.headerHeight);
  assertNonNegative("bodyNaturalHeight", metrics.bodyNaturalHeight);
  assertNonNegative("footerHeight", metrics.footerHeight);

  if (metrics.minHeight !== undefined) {
    assertNonNegative("minHeight", metrics.minHeight);
  }
  if (metrics.maxHeight !== undefined) {
    assertNonNegative("maxHeight", metrics.maxHeight);
  }
  if (
    metrics.minHeight !== undefined &&
    metrics.maxHeight !== undefined &&
    metrics.minHeight > metrics.maxHeight
  ) {
    throw new Error("ShellSheet minHeight must not exceed maxHeight.");
  }
};

export function resolveSnapPoints<TSnap extends string>(
  snapPoints: readonly ShellSheetSnapPoint<TSnap>[],
  metrics: ShellSheetMetrics,
): readonly ResolvedShellSheetSnapPoint<TSnap>[] {
  assertSnapPoints(snapPoints);
  assertMetrics(metrics);

  const available = Math.max(
    0,
    metrics.viewportHeight - metrics.insetTop - metrics.insetBottom,
  );
  const upperBound = Math.min(available, metrics.maxHeight ?? available);
  const lowerBound = Math.min(upperBound, metrics.minHeight ?? 0);
  const naturalHeight =
    metrics.headerHeight +
    metrics.bodyNaturalHeight +
    metrics.footerHeight;

  return snapPoints
    .map((point, declarationIndex) => {
      let rawHeight: number;
      switch (point.size.type) {
        case "ratio":
          rawHeight = available * point.size.value;
          break;
        case "pixels":
          rawHeight = point.size.value;
          break;
        case "content":
          rawHeight = Math.min(
            naturalHeight,
            available * (point.size.maxRatio ?? 1),
          );
          break;
      }

      return {
        id: point.id,
        height: clamp(rawHeight, lowerBound, upperBound),
        declarationIndex,
      };
    })
    .sort(
      (left, right) =>
        left.height - right.height ||
        left.declarationIndex - right.declarationIndex,
    );
}
