import { animate } from "motion/mini";
import type {
  ShellAnimationDriver,
  ShellAnimationResult,
} from "@shell-sheet/dom";

type MotionOptions = NonNullable<Parameters<typeof animate>[2]>;

const toMotionEasing = (
  easing: string,
): Exclude<MotionOptions["ease"], undefined> => {
  if (easing[0] === "c") {
    return easing.slice(13, -1).split(",").map(Number) as [number, number, number, number];
  }
  if (easing === "linear") return "linear";
  if (easing === "ease-in-out") return "easeInOut";
  if (easing === "ease-in") return "easeIn";
  return "easeOut";
};

/** Creates a DOM driver backed only by the `motion/mini` entry point. */
export function createMotionAnimationDriver(): ShellAnimationDriver {
  return {
    animate(element, keyframes, options) {
      let stopped = false;
      const controls = Array.isArray(keyframes)
        ? (() => {
            const animation = element.animate(keyframes, {
              duration: options.durationMs,
              easing: options.easing,
            });
            return { finished: animation.finished, stop: () => animation.cancel() };
          })()
        : animate(element, keyframes as Parameters<typeof animate>[1], {
            duration: options.durationMs / 1_000,
            ease: toMotionEasing(options.easing),
          });
      const finished = controls.finished.then(
        (): ShellAnimationResult => ({ status: stopped ? "cancelled" : "finished" }),
        (): ShellAnimationResult => ({ status: "cancelled" }),
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
