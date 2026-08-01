import { animate } from "motion/mini";
import type {
  BottomSheetAnimationDriver,
  BottomSheetEasing,
  BottomSheetKeyframes,
} from "@adaptive-bottom-sheet/dom";

const mutableKeyframes = (
  keyframes: BottomSheetKeyframes,
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
  easing: BottomSheetEasing,
): Exclude<
  NonNullable<Parameters<typeof animate>[2]>["ease"],
  undefined
> =>
  typeof easing === "string" ? easing : [...easing];

/**
 * Creates a tiny DOM animation driver backed only by `motion/mini`.
 * It does not import `motion/react`, motion values, layout animations, or drag.
 */
export function createMotionAnimationDriver(): BottomSheetAnimationDriver {
  return {
    animate(element, keyframes, options) {
      const controls = animate(element, mutableKeyframes(keyframes), {
        duration: options.duration / 1000,
        ease: mutableEasing(options.easing),
      });

      return {
        finished: Promise.resolve(controls).then(() => undefined),
        stop: () => controls.stop(),
      };
    },
  };
}
