import { describe, expect, it, vi } from "vitest";
import { createNativeAnimationDriver } from "../src/index.js";

type PlatformAnimation = Readonly<{
  finished: Promise<void>;
  cancel(): void;
}>;

const animationElement = (platform: PlatformAnimation): HTMLElement =>
  ({ animate: vi.fn(() => platform) }) as unknown as HTMLElement;

describe("native animation driver", () => {
  it("normalizes platform completion", async () => {
    const element = animationElement({
      finished: Promise.resolve(),
      cancel: vi.fn(),
    });
    const controls = createNativeAnimationDriver().animate(
      element,
      { opacity: [0, 1] },
      { durationMs: 180, easing: "linear" },
    );

    await expect(controls.finished).resolves.toEqual({ status: "finished" });
  });

  it("normalizes rejection and idempotent stop as cancellation", async () => {
    let resolve!: () => void;
    const cancel = vi.fn();
    const element = animationElement({
      finished: new Promise<void>((next) => {
        resolve = next;
      }),
      cancel,
    });
    const controls = createNativeAnimationDriver().animate(
      element,
      { opacity: [1, 0] },
      { durationMs: 180, easing: "linear" },
    );

    controls.stop();
    controls.stop();
    resolve();

    expect(cancel).toHaveBeenCalledTimes(1);
    await expect(controls.finished).resolves.toEqual({ status: "cancelled" });

    const rejected = createNativeAnimationDriver().animate(
      animationElement({
        finished: Promise.reject(new Error("AbortError")),
        cancel: vi.fn(),
      }),
      { opacity: [1, 0] },
      { durationMs: 180, easing: "linear" },
    );
    await expect(rejected.finished).resolves.toEqual({ status: "cancelled" });
  });

  it("rejects invalid execution options before touching the platform", () => {
    const animate = vi.fn();
    const element = { animate } as unknown as HTMLElement;
    const driver = createNativeAnimationDriver();

    expect(() =>
      driver.animate(element, {}, { durationMs: -1, easing: "linear" }),
    ).toThrow("duration");
    expect(() =>
      driver.animate(element, {}, { durationMs: 1, easing: "" }),
    ).toThrow("easing");
    expect(animate).not.toHaveBeenCalled();
  });
});
