// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBottomSheetController } from "@adaptive-bottom-sheet/core";
import { bindBottomSheetToDom } from "../src/index.js";
import type { BottomSheetAnimationDriver } from "../src/types.js";

class ResizeObserverStub {
  observe(): void {}
  disconnect(): void {}
  unobserve(): void {}
}

const settlePromises = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

describe("bindBottomSheetToDom", () => {
  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({ matches: false }),
    );

    document.body.innerHTML = `
      <button id="trigger">Open</button>
      <main id="app">Application</main>
      <div id="root" hidden>
        <button id="backdrop"></button>
        <section id="main">
          <button id="handle">Handle</button>
          <div id="content"><button id="action">Action</button></div>
        </section>
      </div>
    `;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("opens, manages modal semantics, and closes on Escape", async () => {
    const animate = vi.fn(() => ({
      finished: Promise.resolve(),
      stop: vi.fn(),
    }));
    const animation: BottomSheetAnimationDriver = {
      animate,
    };
    const controller = createBottomSheetController({
      snapPoints: [
        { id: "collapsed", size: { type: "ratio", value: 0.6 } },
        { id: "expanded", size: { type: "ratio", value: 0.996 } },
      ],
    });
    const trigger = document.querySelector<HTMLButtonElement>("#trigger")!;
    const app = document.querySelector<HTMLElement>("#app")!;
    const root = document.querySelector<HTMLElement>("#root")!;
    const main = document.querySelector<HTMLElement>("#main")!;
    const content = document.querySelector<HTMLElement>("#content")!;
    Object.defineProperty(content, "scrollHeight", { value: 320 });

    trigger.focus();
    const binding = bindBottomSheetToDom(
      controller,
      {
        root,
        main,
        handle: document.querySelector<HTMLElement>("#handle")!,
        content,
        backdrop: document.querySelector<HTMLElement>("#backdrop")!,
        inertTarget: app,
      },
      { animation, reducedMotion: true },
    );

    expect(root.hidden).toBe(true);
    expect(main.getAttribute("role")).toBe("dialog");
    expect(main.getAttribute("aria-modal")).toBe("true");

    controller.open();
    expect(root.hidden).toBe(false);
    expect(app.inert).toBe(true);

    await settlePromises();
    expect(controller.getSnapshot().status).toBe("open");

    document.querySelector<HTMLButtonElement>("#handle")!.click();
    await settlePromises();
    expect(controller.getSnapshot()).toMatchObject({
      status: "open",
      snapPoint: "expanded",
    });

    const heightAnimation = animate.mock.calls.find(
      ([, keyframes]) => "height" in keyframes,
    );
    expect(heightAnimation).toBeDefined();
    expect(heightAnimation?.[1].height).toEqual([
      `${window.innerHeight * 0.6}px`,
      `${window.innerHeight * 0.996}px`,
    ]);

    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    await settlePromises();

    expect(controller.getSnapshot().status).toBe("closed");
    expect(root.hidden).toBe(true);
    expect(app.inert).not.toBe(true);
    expect(document.activeElement).toBe(trigger);

    binding.destroy();
  });

  it("keeps background content available in non-modal non-draggable mode", async () => {
    const animation: BottomSheetAnimationDriver = {
      animate: () => ({ finished: Promise.resolve(), stop: vi.fn() }),
    };
    const controller = createBottomSheetController({
      snapPoints: [
        { id: "content", size: { type: "content", maxRatio: 0.996 } },
      ],
    });
    const app = document.querySelector<HTMLElement>("#app")!;
    const root = document.querySelector<HTMLElement>("#root")!;
    const main = document.querySelector<HTMLElement>("#main")!;
    const content = document.querySelector<HTMLElement>("#content")!;
    Object.defineProperty(content, "scrollHeight", { value: 320 });

    const binding = bindBottomSheetToDom(
      controller,
      {
        root,
        main,
        handle: document.querySelector<HTMLElement>("#handle")!,
        content,
        inertTarget: app,
      },
      {
        animation,
        modality: "non-modal",
        draggable: false,
        reducedMotion: true,
      },
    );

    controller.open();
    await settlePromises();

    expect(root.dataset.modality).toBe("non-modal");
    expect(main.dataset.draggable).toBe("false");
    expect(main.hasAttribute("aria-modal")).toBe(false);
    expect(app.inert).not.toBe(true);
    expect(document.body.style.overflow).toBe("");

    document.querySelector<HTMLButtonElement>("#handle")!.click();
    expect(controller.getSnapshot().snapPoint).toBe("content");

    binding.destroy();
  });
});
