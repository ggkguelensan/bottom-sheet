// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createShellSheetController } from "@shell-sheet/core";
import { bindShellSheetToDom } from "../src/index.js";
import type { ShellSheetAnimationDriver } from "../src/types.js";

class ResizeObserverStub {
  observe(): void {}
  disconnect(): void {}
  unobserve(): void {}
}

const settlePromises = async (): Promise<void> => {
  for (let index = 0; index < 10; index += 1) {
    await Promise.resolve();
  }
};

describe("bindShellSheetToDom", () => {
  beforeEach(() => {
    let nextFrameId = 0;
    const cancelledFrames = new Set<number>();
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({ matches: false }),
    );
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((callback: FrameRequestCallback) => {
        const id = ++nextFrameId;
        queueMicrotask(() => {
          if (!cancelledFrames.has(id)) callback(performance.now());
        });
        return id;
      }),
    );
    vi.stubGlobal(
      "cancelAnimationFrame",
      vi.fn((id: number) => cancelledFrames.add(id)),
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
    const animation: ShellSheetAnimationDriver = {
      animate,
    };
    const controller = createShellSheetController({
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
    const binding = bindShellSheetToDom(
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

  it("measures framework content before starting the opening animation", async () => {
    const animate = vi.fn(() => ({
      finished: Promise.resolve(),
      stop: vi.fn(),
    }));
    const controller = createShellSheetController({
      snapPoints: [
        { id: "content", size: { type: "content", maxRatio: 0.9 } },
      ],
    });
    const root = document.querySelector<HTMLElement>("#root")!;
    const main = document.querySelector<HTMLElement>("#main")!;
    const content = document.querySelector<HTMLElement>("#content")!;
    let contentHeight = 0;
    Object.defineProperty(content, "scrollHeight", {
      get: () => contentHeight,
    });

    const binding = bindShellSheetToDom(
      controller,
      {
        root,
        main,
        handle: document.querySelector<HTMLElement>("#handle")!,
        content,
        backdrop: document.querySelector<HTMLElement>("#backdrop")!,
      },
      { animation: { animate }, reducedMotion: false },
    );

    controller.open();
    expect(root.hidden).toBe(false);
    expect(root.style.visibility).toBe("hidden");
    expect(animate).not.toHaveBeenCalled();

    // Simulates React committing the requested screen after the Effector
    // event but before the browser's next paint.
    contentHeight = 420;
    await settlePromises();

    const openingAnimation = animate.mock.calls.find(
      ([, keyframes]) => "transform" in keyframes,
    );
    expect(openingAnimation?.[1].transform).toEqual([
      "translateY(420px)",
      "translateY(0px)",
    ]);
    expect(root.style.visibility).toBe("");
    expect(controller.getSnapshot().status).toBe("open");

    binding.destroy();
  });

  it("resumes an opening lifecycle when a binding is replaced", async () => {
    const animate = vi.fn(() => ({
      finished: Promise.resolve(),
      stop: vi.fn(),
    }));
    const controller = createShellSheetController({
      snapPoints: [
        { id: "content", size: { type: "content", maxRatio: 0.9 } },
      ],
    });
    const root = document.querySelector<HTMLElement>("#root")!;
    const main = document.querySelector<HTMLElement>("#main")!;
    const content = document.querySelector<HTMLElement>("#content")!;
    Object.defineProperty(content, "scrollHeight", { value: 360 });
    const elements = {
      root,
      main,
      handle: document.querySelector<HTMLElement>("#handle")!,
      content,
      backdrop: document.querySelector<HTMLElement>("#backdrop")!,
    };

    const firstBinding = bindShellSheetToDom(controller, elements, {
      animation: { animate },
    });
    controller.open();
    expect(controller.getSnapshot().status).toBe("opening");
    firstBinding.destroy();

    const replacementBinding = bindShellSheetToDom(controller, elements, {
      animation: { animate },
    });
    await settlePromises();

    expect(
      animate.mock.calls.some(([, keyframes]) => "transform" in keyframes),
    ).toBe(true);
    expect(controller.getSnapshot().status).toBe("open");

    replacementBinding.destroy();
  });

  it("keeps background content available in non-modal non-draggable mode", async () => {
    const animation: ShellSheetAnimationDriver = {
      animate: () => ({ finished: Promise.resolve(), stop: vi.fn() }),
    };
    const controller = createShellSheetController({
      snapPoints: [
        { id: "content", size: { type: "content", maxRatio: 0.996 } },
      ],
    });
    const app = document.querySelector<HTMLElement>("#app")!;
    const root = document.querySelector<HTMLElement>("#root")!;
    const main = document.querySelector<HTMLElement>("#main")!;
    const content = document.querySelector<HTMLElement>("#content")!;
    Object.defineProperty(content, "scrollHeight", { value: 320 });

    const binding = bindShellSheetToDom(
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

  it("corrects a content snap after framework content commits during snapping", async () => {
    const animate = vi.fn(() => ({
      finished: Promise.resolve(),
      stop: vi.fn(),
    }));
    const controller = createShellSheetController({
      snapPoints: [
        { id: "content", size: { type: "content", maxRatio: 0.8 } },
        { id: "expanded", size: { type: "ratio", value: 0.95 } },
      ],
      initialState: { open: true, snapPoint: "expanded" },
    });
    const root = document.querySelector<HTMLElement>("#root")!;
    const main = document.querySelector<HTMLElement>("#main")!;
    const content = document.querySelector<HTMLElement>("#content")!;
    let contentHeight = 900;
    Object.defineProperty(content, "scrollHeight", {
      get: () => contentHeight,
    });

    const binding = bindShellSheetToDom(
      controller,
      {
        root,
        main,
        handle: document.querySelector<HTMLElement>("#handle")!,
        content,
      },
      { animation: { animate }, reducedMotion: true },
    );

    controller.snapTo("content");
    contentHeight = 240;
    binding.refresh();
    await settlePromises();

    const heightAnimations = animate.mock.calls.filter(
      ([, keyframes]) => "height" in keyframes,
    );
    expect(heightAnimations.at(-1)?.[1].height).toEqual([
      `${window.innerHeight * 0.8}px`,
      "240px",
    ]);

    binding.destroy();
  });
});
