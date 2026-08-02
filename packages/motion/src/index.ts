import { animate } from "motion/mini";
import type {
  ShellSheetAnimationDriver,
  ShellSheetEasing,
  ShellSheetKeyframes,
} from "@shell-sheet/dom";

const mutableKeyframes = (
  keyframes: ShellSheetKeyframes,
): Parameters<typeof animate>[1] => {
  const result: Record<string, string | number | Array<string | number>> = {};

  for (const [property, value] of Object.entries(keyframes)) {
    result[property] = Array.isArray(value)
      ? Array.from(value)
      : (value as string | number);
  }

  return result;
};

const mutableEasing = (
  easing: ShellSheetEasing,
): Exclude<
  NonNullable<Parameters<typeof animate>[2]>["ease"],
  undefined
> =>
  typeof easing === "string" ? easing : [...easing];

/**
 * Creates a tiny DOM animation driver backed only by `motion/mini`.
 * It does not import `motion/react`, motion values, layout animations, or drag.
 */
export function createMotionAnimationDriver(): ShellSheetAnimationDriver {
  return {
    animate(element, keyframes, options) {
      const controls = animate(element, mutableKeyframes(keyframes), {
        duration: options.duration / 1000,
        ease: mutableEasing(options.easing),
      });

      return {
        finished: controls.finished.then(() => undefined),
        stop: () => controls.stop(),
      };
    },
  };
}
