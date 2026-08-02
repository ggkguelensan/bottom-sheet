import { assertSnapPoints } from "./snap-points.js";
import type {
  ShellRegionTarget,
  ShellSheetOpenTarget,
  ShellSheetTarget,
  ShellTransitionIntent,
} from "./types.js";

const transitionCauses = new Set([
  "open",
  "close",
  "navigate",
  "snap",
  "content",
  "presentation",
  "hydrate",
  "api",
]);
const transitionDirections = new Set([
  "forward",
  "backward",
  "replace",
  "snap",
  "none",
]);
const transitionMotions = new Set(["auto", "instant"]);
const regionTransitions = new Set(["preserve", "crossfade", "replace"]);

const assertNonEmpty = (name: string, value: string): void => {
  if (value.trim().length === 0) {
    throw new Error(`ShellSheet ${name} must not be empty.`);
  }
};

const assertTransition = (transition: ShellTransitionIntent): void => {
  if (
    !transitionCauses.has(transition.cause) ||
    !transitionDirections.has(transition.direction) ||
    !transitionMotions.has(transition.motion)
  ) {
    throw new Error("Invalid ShellSheet transition intent.");
  }
};

const assertRegion = <TKey extends string>(
  name: string,
  region: ShellRegionTarget<TKey>,
): void => {
  assertNonEmpty(`${name} region key`, region.key);
  if (!regionTransitions.has(region.transition)) {
    throw new Error(`Invalid ShellSheet ${name} region transition.`);
  }
};

const assertCauseRequestId = (causeRequestId: number | undefined): void => {
  if (
    causeRequestId !== undefined &&
    (!Number.isSafeInteger(causeRequestId) || causeRequestId <= 0)
  ) {
    throw new Error("ShellSheet causeRequestId must be a positive integer.");
  }
};

export function assertShellSheetTarget<
  TSnap extends string,
  TRegionKey extends string,
>(
  target: ShellSheetTarget<TSnap, TRegionKey>,
): asserts target is ShellSheetTarget<TSnap, TRegionKey> {
  if (typeof target !== "object" || target === null) {
    throw new Error("ShellSheet target must be an object.");
  }
  if (typeof target.targetId !== "string" || typeof target.open !== "boolean") {
    throw new Error("ShellSheet targetId and open fields are invalid.");
  }
  assertNonEmpty("targetId", target.targetId);
  if (typeof target.transition !== "object" || target.transition === null) {
    throw new Error("Invalid ShellSheet transition intent.");
  }
  assertTransition(target.transition);
  assertCauseRequestId(target.causeRequestId);

  if (!target.open) return;

  if (typeof target.draggable !== "boolean") {
    throw new Error("ShellSheet draggable must be a boolean.");
  }

  assertSnapPoints(target.snapPoints);
  if (!target.snapPoints.some((point) => point.id === target.snapPoint)) {
    throw new Error(`Unknown selected snap point: ${target.snapPoint}`);
  }
  if (target.presentation !== "sheet" && target.presentation !== "dialog") {
    throw new Error("Invalid ShellSheet presentation.");
  }
  if (target.modality !== "modal" && target.modality !== "non-modal") {
    throw new Error("Invalid ShellSheet modality.");
  }
  if (
    target.contentResizeBehavior !== "animate" &&
    target.contentResizeBehavior !== "immediate" &&
    target.contentResizeBehavior !== "keep-snap-and-scroll"
  ) {
    throw new Error("Invalid ShellSheet content resize behavior.");
  }
  assertRegion("header", target.regions.header);
  assertRegion("body", target.regions.body);
  assertRegion("footer", target.regions.footer);
}

export function assertPreservedRegions<
  TSnap extends string,
  TRegionKey extends string,
>(
  previous: ShellSheetOpenTarget<TSnap, TRegionKey>,
  next: ShellSheetOpenTarget<TSnap, TRegionKey>,
): void {
  for (const region of ["header", "body", "footer"] as const) {
    const previousRegion = previous.regions[region];
    const nextRegion = next.regions[region];
    if (
      nextRegion.transition === "preserve" &&
      nextRegion.key !== previousRegion.key
    ) {
      throw new Error(
        `ShellSheet ${region} region cannot change key with preserve transition.`,
      );
    }
  }
}
