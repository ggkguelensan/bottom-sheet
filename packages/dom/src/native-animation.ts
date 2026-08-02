import type {
  ShellSheetAnimationDriver,
  ShellSheetEasing,
  ShellSheetKeyframes,
} from "./types.js";

const toCssEasing = (easing: ShellSheetEasing): string =>
  typeof easing === "string"
    ? {
        linear: "linear",
        easeIn: "ease-in",
        easeOut: "ease-out",
        easeInOut: "ease-in-out",
      }[easing]
    : `cubic-bezier(${easing.join(",")})`;

const toPropertyIndexedKeyframes = (
  keyframes: ShellSheetKeyframes,
): PropertyIndexedKeyframes => keyframes as PropertyIndexedKeyframes;

export function createNativeAnimationDriver(): ShellSheetAnimationDriver {
  return {
    animate(element, keyframes, options) {
      const animation = element.animate(toPropertyIndexedKeyframes(keyframes), {
        duration: options.duration,
        easing: toCssEasing(options.easing),
        fill: "both",
      });

      const finished = animation.finished.then(
        () => undefined,
        () => undefined,
      );

      return {
        finished,
        stop: () => animation.cancel(),
      };
    },
  };
}
