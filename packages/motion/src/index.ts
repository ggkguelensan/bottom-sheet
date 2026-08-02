import { animate } from "motion/mini";
import type {
  ShellAnimationDriver,
  ShellAnimationResult,
} from "@shell-sheet/dom";

type MotionKeyframes = Parameters<typeof animate>[1];
type MotionOptions = NonNullable<Parameters<typeof animate>[2]>;

const toMotionKeyframes = (
  keyframes: Keyframe[] | PropertyIndexedKeyframes,
): MotionKeyframes => {
  if (!Array.isArray(keyframes)) {
    const result: Record<
      string,
      string | number | Array<string | number | null>
    > = {};
    for (const [property, value] of Object.entries(keyframes)) {
      if (value === undefined) continue;
      result[property] = Array.isArray(value)
        ? value.map((item) =>
            item === null || typeof item === "string" || typeof item === "number"
              ? item
              : String(item),
          )
        : typeof value === "string" || typeof value === "number"
          ? value
          : String(value);
    }
    return result as MotionKeyframes;
  }

  const propertyNames = new Set<string>();
  for (const frame of keyframes) {
    for (const property of Object.keys(frame)) {
      if (property === "offset" || property === "easing" || property === "composite") {
        continue;
      }
      propertyNames.add(property);
    }
  }
  const properties = [...propertyNames].map((property) => [
    property,
    keyframes.map((frame) => {
      const value = frame[property as keyof Keyframe];
      return value === undefined || value === null
        ? null
        : typeof value === "string" || typeof value === "number"
          ? value
          : String(value);
    }),
  ]);
  return Object.fromEntries(properties) as MotionKeyframes;
};

const toMotionEasing = (
  easing: string,
): Exclude<MotionOptions["ease"], undefined> => {
  const cubic = /^cubic-bezier\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)$/.exec(
    easing,
  );
  if (cubic) {
    const tuple = cubic.slice(1).map(Number);
    if (
      tuple.every(Number.isFinite) &&
      tuple[0]! >= 0 &&
      tuple[0]! <= 1 &&
      tuple[2]! >= 0 &&
      tuple[2]! <= 1
    ) {
      return tuple as [number, number, number, number];
    }
  }
  const named = {
    linear: "linear",
    ease: [0.25, 0.1, 0.25, 1],
    "ease-in": "easeIn",
    "ease-out": "easeOut",
    "ease-in-out": "easeInOut",
    easeIn: "easeIn",
    easeOut: "easeOut",
    easeInOut: "easeInOut",
  } as const;
  if (easing in named) {
    return named[easing as keyof typeof named];
  }
  return "easeOut";
};

const finishedResult: ShellAnimationResult = Object.freeze({
  status: "finished",
});
const cancelledResult: ShellAnimationResult = Object.freeze({
  status: "cancelled",
});

/** Creates a DOM driver backed only by the `motion/mini` entry point. */
export function createMotionAnimationDriver(): ShellAnimationDriver {
  return {
    animate(element, keyframes, options) {
      if (!Number.isFinite(options.durationMs) || options.durationMs < 0) {
        throw new Error("ShellSheet animation duration must be non-negative.");
      }
      if (options.easing.trim().length === 0) {
        throw new Error("ShellSheet animation easing must not be empty.");
      }
      let stopped = false;
      const controls = animate(element, toMotionKeyframes(keyframes), {
        duration: options.durationMs / 1_000,
        ease: toMotionEasing(options.easing),
      });
      const finished = controls.finished.then(
        () => (stopped ? cancelledResult : finishedResult),
        () => cancelledResult,
      );

      return {
        finished,
        stop() {
          if (stopped) return;
          stopped = true;
          controls.stop();
        },
      };
    },
  };
}
