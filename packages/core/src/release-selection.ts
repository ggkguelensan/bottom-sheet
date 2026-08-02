import type {
  ResolvedShellSheetSnapPoint,
  SelectShellSheetReleaseDestinationInput,
  ShellSheetReleaseDestination,
} from "./types.js";

const DEFAULT_PROJECTION_TIME = 180;
const DEFAULT_CLOSE_VELOCITY_THRESHOLD = 0.7;

const assertFinite = (name: string, value: number): void => {
  if (!Number.isFinite(value)) {
    throw new Error(`ShellSheet ${name} must be finite.`);
  }
};

const physicalPoints = <TSnap extends string>(
  points: readonly ResolvedShellSheetSnapPoint<TSnap>[],
  activeSnapPoint: TSnap,
): readonly ResolvedShellSheetSnapPoint<TSnap>[] => {
  const sorted = [...points].sort(
    (left, right) =>
      left.height - right.height ||
      left.declarationIndex - right.declarationIndex,
  );
  const result: ResolvedShellSheetSnapPoint<TSnap>[] = [];

  for (const point of sorted) {
    const previous = result[result.length - 1];
    if (!previous || previous.height !== point.height) {
      result.push(point);
      continue;
    }
    if (point.id === activeSnapPoint) {
      result[result.length - 1] = point;
    }
  }

  return result;
};

export function selectReleaseDestination<TSnap extends string>(
  input: SelectShellSheetReleaseDestinationInput<TSnap>,
): ShellSheetReleaseDestination<TSnap> {
  const projectionTime = input.projectionTime ?? DEFAULT_PROJECTION_TIME;
  const closeVelocityThreshold =
    input.closeVelocityThreshold ?? DEFAULT_CLOSE_VELOCITY_THRESHOLD;

  assertFinite("currentHeight", input.currentHeight);
  assertFinite("release velocity", input.velocity);
  assertFinite("dragDistance", input.dragDistance);
  assertFinite("projectionTime", projectionTime);
  assertFinite("closeVelocityThreshold", closeVelocityThreshold);
  if (projectionTime < 0 || closeVelocityThreshold < 0) {
    throw new Error(
      "ShellSheet release thresholds and projection time must not be negative.",
    );
  }
  if (input.snapPoints.length === 0) {
    throw new Error("Cannot select a release destination without snap points.");
  }

  const ids = new Set<string>();
  for (const point of input.snapPoints) {
    if (ids.has(point.id)) {
      throw new Error(`Duplicate resolved snap point id: ${point.id}`);
    }
    ids.add(point.id);
    assertFinite(`resolved height for "${point.id}"`, point.height);
    if (
      point.height < 0 ||
      !Number.isSafeInteger(point.declarationIndex) ||
      point.declarationIndex < 0
    ) {
      throw new Error(`Invalid resolved snap point: ${point.id}`);
    }
  }
  if (!ids.has(input.activeSnapPoint)) {
    throw new Error(`Unknown active snap point: ${input.activeSnapPoint}`);
  }

  const points = physicalPoints(input.snapPoints, input.activeSnapPoint);
  const lowest = points[0]!;
  const projectedHeight =
    input.currentHeight - input.velocity * projectionTime;
  const closeDistanceThreshold =
    input.closeDistanceThreshold ?? Math.min(96, lowest.height * 0.25);
  assertFinite("closeDistanceThreshold", closeDistanceThreshold);
  if (closeDistanceThreshold < 0) {
    throw new Error("ShellSheet closeDistanceThreshold must not be negative.");
  }

  const directedBelowLowest =
    projectedHeight < lowest.height &&
    (input.velocity > 0 || input.dragDistance > 0);
  if (
    input.allowClose === true &&
    directedBelowLowest &&
    (input.velocity >= closeVelocityThreshold ||
      input.dragDistance >= closeDistanceThreshold)
  ) {
    return { type: "close" };
  }

  const nearest = points.reduce((best, point) => {
    const distance = Math.abs(point.height - projectedHeight);
    const bestDistance = Math.abs(best.height - projectedHeight);
    if (distance < bestDistance) return point;
    if (distance > bestDistance) return best;
    if (point.id === input.activeSnapPoint) return point;
    if (best.id === input.activeSnapPoint) return best;
    return point.declarationIndex < best.declarationIndex ? point : best;
  });

  if (input.snapToSequentialPoints !== true) {
    return { type: "snap", snapPoint: nearest.id };
  }

  const activeIndex = points.findIndex(
    (point) => point.id === input.activeSnapPoint,
  );
  const direction = Math.sign(projectedHeight - input.currentHeight);
  if (direction === 0) {
    return { type: "snap", snapPoint: nearest.id };
  }
  const destinationIndex = Math.min(
    points.length - 1,
    Math.max(0, activeIndex + direction),
  );
  return { type: "snap", snapPoint: points[destinationIndex]!.id };
}
