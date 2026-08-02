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
      [
        { opacity: 0, transform: "translateY(8px)" },
        { opacity: 1 },
      ],
      {
        durationMs: 220,
        easing: "cubic-bezier(0.65, 0, 0.35, 1)",
      },
    );

    expect(motion.animate).toHaveBeenCalledWith(
      element,
      {
        opacity: [0, 1],
        transform: ["translateY(8px)", null],
      },
      { duration: 0.22, ease: [0.65, 0, 0.35, 1] },
    );
    await expect(controls.finished).resolves.toEqual({ status: "finished" });
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

  it("validates options and imports only motion/mini", () => {
    const driver = createMotionAnimationDriver();
    expect(() =>
      driver.animate(
        {} as HTMLElement,
        {},
        { durationMs: Number.NaN, easing: "linear" },
      ),
    ).toThrow("duration");
    expect(() =>
      driver.animate(
        {} as HTMLElement,
        {},
        { durationMs: 1, easing: "" },
      ),
    ).toThrow("easing");

    const source = readFileSync(
      new URL("../src/index.ts", import.meta.url),
      "utf8",
    );
    expect(source).toContain('from "motion/mini"');
    expect(source).not.toContain("motion/react");
  });
});
