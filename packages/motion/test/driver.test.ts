import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

const motion = vi.hoisted(() => ({
  animate: vi.fn(),
}));

vi.mock("motion/mini", () => ({ animate: motion.animate }));

import { createMotionAnimationDriver } from "../src/index.js";

describe("Motion mini driver", () => {
  it("converts DOM keyframes and milliseconds at the driver boundary", async () => {
    motion.animate.mockReturnValueOnce({
      finished: Promise.resolve(),
      stop: vi.fn(),
    });
    const element = {} as HTMLElement;
    const controls = createMotionAnimationDriver().animate(
      element,
      {
        opacity: [0, 1],
        transform: ["translateY(8px)", "translateY(0px)"],
      },
      {
        durationMs: 220,
        easing: "cubic-bezier(0.65, 0, 0.35, 1)",
      },
    );

    expect(motion.animate).toHaveBeenCalledWith(
      element,
      {
        opacity: [0, 1],
        transform: ["translateY(8px)", "translateY(0px)"],
      },
      { duration: 0.22, ease: [0.65, 0, 0.35, 1] },
    );
    await expect(controls.finished).resolves.toEqual({ status: "finished" });
  });

  it("keeps native Keyframe arrays compatible with the shared driver contract", async () => {
    const cancel = vi.fn();
    const nativeAnimate = vi.fn(() => ({
      finished: Promise.resolve(),
      cancel,
    }));
    const controls = createMotionAnimationDriver().animate(
      { animate: nativeAnimate } as unknown as HTMLElement,
      [{ opacity: 0 }, { opacity: 1 }],
      { durationMs: 180, easing: "ease-out" },
    );

    expect(nativeAnimate).toHaveBeenCalledWith(
      [{ opacity: 0 }, { opacity: 1 }],
      { duration: 180, easing: "ease-out" },
    );
    controls.stop();
    await expect(controls.finished).resolves.toEqual({ status: "cancelled" });
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("normalizes stop and rejected completion as cancellation", async () => {
    let resolve!: () => void;
    const stop = vi.fn();
    motion.animate.mockReturnValueOnce({
      finished: new Promise<void>((next) => {
        resolve = next;
      }),
      stop,
    });
    const controls = createMotionAnimationDriver().animate(
      {} as HTMLElement,
      { opacity: [1, 0] },
      { durationMs: 180, easing: "ease-out" },
    );
    controls.stop();
    controls.stop();
    resolve();

    expect(stop).toHaveBeenCalledTimes(1);
    await expect(controls.finished).resolves.toEqual({ status: "cancelled" });

    motion.animate.mockReturnValueOnce({
      finished: Promise.reject(new Error("cancelled")),
      stop: vi.fn(),
    });
    const rejected = createMotionAnimationDriver().animate(
      {} as HTMLElement,
      {},
      { durationMs: 1, easing: "linear" },
    );
    await expect(rejected.finished).resolves.toEqual({ status: "cancelled" });
  });

  it("imports only motion/mini", () => {
    const source = readFileSync(
      new URL("../src/index.ts", import.meta.url),
      "utf8",
    );
    expect(source).toContain('from "motion/mini"');
    expect(source).not.toContain("motion/react");
  });
});
