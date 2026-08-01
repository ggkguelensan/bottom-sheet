import type {
  BottomSheetMetrics,
  BottomSheetSnapPoint,
  ResolvedBottomSheetSnapPoint,
  SelectSnapPointOptions,
} from "./types.js";

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export function assertSnapPoints(
  snapPoints: readonly BottomSheetSnapPoint[],
): void {
  if (snapPoints.length === 0) {
    throw new Error("BottomSheet requires at least one snap point.");
  }

  const ids = new Set<string>();

  for (const point of snapPoints) {
    if (!point.id.trim()) {
      throw new Error("BottomSheet snap point ids must not be empty.");
    }

    if (ids.has(point.id)) {
      throw new Error(`Duplicate BottomSheet snap point id: ${point.id}`);
    }

    ids.add(point.id);

    if (point.size.type === "ratio") {
      if (point.size.value <= 0 || point.size.value > 1) {
        throw new Error(
          `Ratio snap point "${point.id}" must be greater than 0 and at most 1.`,
        );
      }
    } else if (point.size.type === "pixels" && point.size.value < 0) {
      throw new Error(`Pixel snap point "${point.id}" must not be negative.`);
    } else if (
      point.size.type === "content" &&
      point.size.maxRatio !== undefined &&
      (point.size.maxRatio <= 0 || point.size.maxRatio > 1)
    ) {
      throw new Error(
        `Content maxRatio for "${point.id}" must be greater than 0 and at most 1.`,
      );
    }
  }
}

export function resolveSnapPoints(
  snapPoints: readonly BottomSheetSnapPoint[],
  metrics: BottomSheetMetrics,
): ResolvedBottomSheetSnapPoint[] {
  assertSnapPoints(snapPoints);

  const topInset = metrics.topInset ?? 0;
  const bottomInset = metrics.bottomInset ?? 0;
  const handleHeight = metrics.handleHeight ?? 0;
  const availableHeight = Math.max(
    0,
    metrics.viewportHeight - topInset - bottomInset,
  );
  const minHeight = clamp(metrics.minHeight ?? 0, 0, availableHeight);
  const maxHeight = clamp(
    metrics.maxHeight ?? availableHeight,
    minHeight,
    availableHeight,
  );

  return snapPoints
    .map((point) => {
      let height: number;

      switch (point.size.type) {
        case "ratio":
          height = availableHeight * point.size.value;
          break;
        case "pixels":
          height = point.size.value;
          break;
        case "content": {
          const contentMaximum =
            availableHeight * (point.size.maxRatio ?? 1);
          height = Math.min(
            metrics.contentHeight + handleHeight,
            contentMaximum,
          );
          break;
        }
      }

      const resolvedHeight = clamp(height, minHeight, maxHeight);

      return {
        id: point.id,
        height: resolvedHeight,
        offset: metrics.viewportHeight - bottomInset - resolvedHeight,
      };
    })
    .sort((left, right) => left.height - right.height);
}

export function selectSnapPoint({
  currentHeight,
  currentSnapPoint,
  velocityY,
  snapPoints,
  velocityThreshold = 700,
}: SelectSnapPointOptions): ResolvedBottomSheetSnapPoint {
  if (snapPoints.length === 0) {
    throw new Error("Cannot select a snap point from an empty list.");
  }

  const ordered = [...snapPoints].sort(
    (left, right) => left.height - right.height,
  );
  const currentIndex = ordered.findIndex(
    (point) => point.id === currentSnapPoint,
  );

  if (Math.abs(velocityY) >= velocityThreshold) {
    if (velocityY < 0) {
      const taller = ordered.find((point) => point.height > currentHeight + 0.5);
      return taller ?? ordered[ordered.length - 1]!;
    }

    for (let index = ordered.length - 1; index >= 0; index -= 1) {
      const point = ordered[index];
      if (point && point.height < currentHeight - 0.5) {
        return point;
      }
    }

    return ordered[0]!;
  }

  return ordered.reduce((nearest, point) => {
    const pointDistance = Math.abs(point.height - currentHeight);
    const nearestDistance = Math.abs(nearest.height - currentHeight);

    if (pointDistance < nearestDistance) {
      return point;
    }

    if (pointDistance === nearestDistance && currentIndex >= 0) {
      return point.id === currentSnapPoint ? point : nearest;
    }

    return nearest;
  });
}

export function clampSheetHeight(
  height: number,
  snapPoints: readonly ResolvedBottomSheetSnapPoint[],
  rubberBand = 0,
): number {
  if (snapPoints.length === 0) {
    return Math.max(0, height);
  }

  const heights = snapPoints.map((point) => point.height);
  const minimum = Math.min(...heights);
  const maximum = Math.max(...heights);

  if (height < minimum) {
    return minimum - (minimum - height) * clamp(rubberBand, 0, 1);
  }

  if (height > maximum) {
    return maximum + (height - maximum) * clamp(rubberBand, 0, 1);
  }

  return height;
}
