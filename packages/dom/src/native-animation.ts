import type {
  ShellAnimationControls,
  ShellAnimationDriver,
  ShellAnimationResult,
} from "./types.js";

const cancelled: ShellAnimationResult = Object.freeze({
  status: "cancelled",
});
const finished: ShellAnimationResult = Object.freeze({ status: "finished" });

export function createNativeAnimationDriver(): ShellAnimationDriver {
  return {
    animate(element, keyframes, options): ShellAnimationControls {
      if (!Number.isFinite(options.durationMs) || options.durationMs < 0) {
        throw new Error("ShellSheet animation duration must be non-negative.");
      }
      if (options.easing.trim().length === 0) {
        throw new Error("ShellSheet animation easing must not be empty.");
      }

      const animation = element.animate(keyframes, {
        duration: options.durationMs,
        easing: options.easing,
        fill: "both",
      });
      let stopped = false;
      const result = animation.finished.then(
        () => (stopped ? cancelled : finished),
        () => cancelled,
      );

      return Object.freeze({
        finished: result,
        stop() {
          if (stopped) return;
          stopped = true;
          animation.cancel();
        },
      });
    },
  };
}
