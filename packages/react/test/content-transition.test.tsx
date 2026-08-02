// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createShellSheetController } from "@shell-sheet/core";
import type { ShellSheetAnimationDriver } from "@shell-sheet/dom";
import { ShellSheet, ShellSheetContentTransition } from "../src/index.js";

class ResizeObserverStub {
  observe(): void {}
  disconnect(): void {}
  unobserve(): void {}
}

describe("ShellSheetContentTransition", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("keeps both screens mounted during a measured content transition", async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
      .IS_REACT_ACT_ENVIRONMENT = true;
    vi.useFakeTimers();
    vi.stubGlobal(
      "requestAnimationFrame",
      (callback: FrameRequestCallback) =>
        window.setTimeout(() => callback(performance.now()), 16),
    );
    vi.stubGlobal("cancelAnimationFrame", (id: number) => window.clearTimeout(id));

    const originalRect = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function getRect() {
      const height = this.textContent?.includes("Incoming") ? 420 : 180;
      return {
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 600,
        bottom: height,
        width: 600,
        height,
        toJSON: () => ({}),
      };
    };

    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(
        <ShellSheetContentTransition transitionKey="old">
          <p>Outgoing screen</p>
        </ShellSheetContentTransition>,
      );
    });
    await act(async () => {
      root.render(
        <ShellSheetContentTransition transitionKey="new" duration={300}>
          <p>Incoming screen</p>
        </ShellSheetContentTransition>,
      );
    });

    expect(host.textContent).toContain("Outgoing screen");
    expect(host.textContent).toContain("Incoming screen");
    expect(
      host.querySelector(".shell-sheet-content-transition")?.getAttribute("data-phase"),
    ).toBe("prepared");

    await act(async () => {
      vi.advanceTimersByTime(16);
    });
    expect(
      host.querySelector(".shell-sheet-content-transition")?.getAttribute("data-phase"),
    ).toBe("prepared");

    await act(async () => {
      vi.advanceTimersByTime(16);
    });
    expect(
      host.querySelector(".shell-sheet-content-transition")?.getAttribute("data-phase"),
    ).toBe("animating");

    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    expect(host.textContent).not.toContain("Outgoing screen");
    expect(host.textContent).toContain("Incoming screen");

    await act(async () => root.unmount());
    HTMLElement.prototype.getBoundingClientRect = originalRect;
  });

  it("commits requested content immediately while the sheet is preparing to open", async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
      .IS_REACT_ACT_ENVIRONMENT = true;
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(
        <ShellSheetContentTransition transitionKey="closed">
          <p>Closed content</p>
        </ShellSheetContentTransition>,
      );
    });
    await act(async () => {
      root.render(
        <ShellSheetContentTransition transitionKey="opening" animate={false}>
          <p>Opening content</p>
        </ShellSheetContentTransition>,
      );
    });

    expect(host.textContent).toBe("Opening content");
    expect(host.querySelector("[data-layer='incoming']")).toBeNull();

    await act(async () => root.unmount());
  });

  it("animates a second content key even when the sheet is still opening", async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
      .IS_REACT_ACT_ENVIRONMENT = true;
    vi.useFakeTimers();
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false }));
    vi.stubGlobal(
      "requestAnimationFrame",
      (callback: FrameRequestCallback) =>
        window.setTimeout(() => callback(performance.now()), 16),
    );
    vi.stubGlobal("cancelAnimationFrame", (id: number) => window.clearTimeout(id));

    const controller = createShellSheetController({
      snapPoints: [
        { id: "content", size: { type: "content", maxRatio: 0.9 } },
      ],
    });
    const animation: ShellSheetAnimationDriver = {
      animate: () => ({
        finished: new Promise<void>(() => undefined),
        stop: vi.fn(),
      }),
    };
    const host = document.createElement("div");
    const portal = document.createElement("div");
    document.body.append(host, portal);
    const root = createRoot(host);
    const renderSheet = (transitionKey: string, label: string) => (
      <ShellSheet
        controller={controller}
        animation={animation}
        transitionKey={transitionKey}
        portalTarget={portal}
        modality="non-modal"
      >
        <p>{label}</p>
      </ShellSheet>
    );

    await act(async () => root.render(renderSheet("empty", "Empty")));
    await act(async () => {
      controller.open();
      root.render(renderSheet("arkham", "Arkham"));
    });

    expect(controller.getSnapshot().status).toBe("opening");
    expect(portal.textContent).toContain("Arkham");
    expect(portal.textContent).not.toContain("Empty");

    await act(async () => {
      root.render(renderSheet("innsmouth", "Innsmouth"));
    });

    expect(portal.textContent).toContain("Arkham");
    expect(portal.textContent).toContain("Innsmouth");
    expect(
      portal
        .querySelector(".shell-sheet-content-transition")
        ?.getAttribute("data-phase"),
    ).toBe("prepared");

    await act(async () => root.unmount());
    controller.destroy();
  });

  it("keeps one binding while presentation options change during opening", async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
      .IS_REACT_ACT_ENVIRONMENT = true;
    vi.useFakeTimers();
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false }));
    vi.stubGlobal(
      "requestAnimationFrame",
      (callback: FrameRequestCallback) =>
        window.setTimeout(() => callback(performance.now()), 16),
    );
    vi.stubGlobal("cancelAnimationFrame", (id: number) => window.clearTimeout(id));

    const animate = vi.fn(() => ({
      finished: Promise.resolve(),
      stop: vi.fn(),
    }));
    const animation: ShellSheetAnimationDriver = { animate };
    const controller = createShellSheetController({
      snapPoints: [
        { id: "compact", size: { type: "ratio", value: 0.4 } },
        { id: "expanded", size: { type: "ratio", value: 0.94 } },
      ],
    });
    const host = document.createElement("div");
    const portal = document.createElement("div");
    document.body.append(host, portal);
    const root = createRoot(host);
    const renderSheet = (
      presentation: "sheet" | "dialog",
      modality: "modal" | "non-modal",
    ) => (
      <ShellSheet
        controller={controller}
        animation={animation}
        transitionKey="scenario"
        portalTarget={portal}
        presentation={presentation}
        modality={modality}
        maxHeight={() => window.innerHeight - 24}
      >
        <p>Draggable scenario</p>
      </ShellSheet>
    );

    await act(async () => root.render(renderSheet("sheet", "non-modal")));
    await act(async () => {
      controller.open();
      root.render(renderSheet("dialog", "modal"));
    });
    await act(async () => {
      vi.advanceTimersByTime(32);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(
      animate.mock.calls.some(([, keyframes]) => "transform" in keyframes),
    ).toBe(true);
    expect(controller.getSnapshot().status).toBe("open");

    await act(async () => {
      portal.querySelector<HTMLButtonElement>(".shell-sheet-handle")!.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(controller.getSnapshot()).toMatchObject({
      status: "open",
      snapPoint: "expanded",
    });

    await act(async () => root.unmount());
    controller.destroy();
  });
});
