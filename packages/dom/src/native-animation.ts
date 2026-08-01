import type {
  BottomSheetAnimationDriver,
  BottomSheetEasing,
  BottomSheetKeyframes,
} from "./types.js";

const toCssEasing = (easing: BottomSheetEasing): string =>
  typeof easing === "string"
    ? {
        linear: "linear",
        easeIn: "ease-in",
        easeOut: "ease-out",
        easeInOut: "ease-in-out",
      }[easing]
    : `cubic-bezier(${easing.join(",")})`;

const toPropertyIndexedKeyframes = (
  keyframes: BottomSheetKeyframes,
): PropertyIndexedKeyframes => keyframes as PropertyIndexedKeyframes;

export function createNativeAnimationDriver(): BottomSheetAnimationDriver {
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
