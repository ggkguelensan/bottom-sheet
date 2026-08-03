// @vitest-environment jsdom

import {
  Suspense,
  StrictMode,
  act,
  createRef,
  type ReactNode,
} from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createShellSheetController,
  type ShellSheetOpenTarget,
  type ShellSheetTarget,
} from "@shell-sheet/core";
import type {
  ShellAnimationDriver,
  ShellSheetDomEnvironment,
  ShellSheetResizeObserver,
} from "@shell-sheet/dom";
import {
  ShellSheet,
  type ShellSheetApi,
} from "../src/index.js";

type Snap = "compact" | "expanded";
type Region = "header" | "a" | "b" | "footer";

const target = (
  targetId: string,
  options: Partial<
    Pick<
      ShellSheetOpenTarget<Snap, Region>,
      "snapPoint" | "presentation" | "draggable"
    >
  > & { body?: "a" | "b" } = {},
): ShellSheetOpenTarget<Snap, Region> => ({
  targetId,
  open: true,
  snapPoints: [
    { id: "compact", size: { type: "ratio", value: 0.5 } },
    { id: "expanded", size: { type: "ratio", value: 0.9 } },
  ],
  snapPoint: options.snapPoint ?? "compact",
  presentation: options.presentation ?? "sheet",
  modality: "non-modal",
  draggable: options.draggable ?? true,
  contentResizeBehavior: "animate",
  regions: {
    header: { key: "header", transition: "preserve" },
    body: {
      key: options.body ?? "a",
      transition: options.body ? "crossfade" : "preserve",
    },
    footer: { key: "footer", transition: "preserve" },
  },
  transition: { cause: "navigate", direction: "forward", motion: "auto" },
});

const closed = (targetId: string): ShellSheetTarget<Snap, Region> => ({
  targetId,
  open: false,
  transition: { cause: "close", direction: "none", motion: "auto" },
});

class Frames {
  private nextId = 0;
  private readonly callbacks = new Map<number, FrameRequestCallback>();

  request = (callback: FrameRequestCallback): number => {
    const id = ++this.nextId;
    this.callbacks.set(id, callback);
    return id;
  };

  cancel = (id: number): void => {
    this.callbacks.delete(id);
  };

  flush(): void {
    const callbacks = [...this.callbacks.entries()];
    this.callbacks.clear();
    for (const [id, callback] of callbacks) callback(id * 16.67);
  }

  pending(): number {
    return this.callbacks.size;
  }
}

class ResizeObserverStub implements ShellSheetResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

const harness = () => {
  const frames = new Frames();
  const environment: ShellSheetDomEnvironment = {
    requestAnimationFrame: frames.request,
    cancelAnimationFrame: frames.cancel,
    getComputedStyle: (element) => window.getComputedStyle(element),
    createResizeObserver: () => new ResizeObserverStub(),
    getViewport: () => ({
      offsetLeft: 0,
      offsetTop: 0,
      width: 390,
      height: 800,
      scale: 1,
    }),
    observeViewport: () => () => undefined,
    prefersReducedMotion: () => false,
    getDocumentVisibility: () => "visible",
    observeDocumentVisibility: () => () => undefined,
  };
  const animation: ShellAnimationDriver = {
    animate: vi.fn(() => ({
      finished: Promise.resolve({ status: "finished" as const }),
      stop: vi.fn(),
    })),
  };
  return { frames, environment, animation };
};

const flushVisuals = async (frames: Frames): Promise<void> => {
  await act(async () => {
    for (let index = 0; index < 12; index += 1) {
      if (frames.pending() > 0) frames.flush();
      await Promise.resolve();
    }
  });
};

const Anatomy = ({ body }: { body: string }) => (
  <>
    <ShellSheet.Backdrop />
    <ShellSheet.Viewport>
      <ShellSheet.Popup aria-label="Archive location">
        <ShellSheet.Content>
          <ShellSheet.Header>
            <ShellSheet.Handle>Drag</ShellSheet.Handle>
            <ShellSheet.Title>Archive</ShellSheet.Title>
          </ShellSheet.Header>
          <ShellSheet.Body>{body}</ShellSheet.Body>
          <ShellSheet.Footer>
            <ShellSheet.Close>Close</ShellSheet.Close>
          </ShellSheet.Footer>
        </ShellSheet.Content>
      </ShellSheet.Popup>
    </ShellSheet.Viewport>
  </>
);

describe("ShellSheet React adapter", () => {
  let host: HTMLDivElement;
  let portal: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
      .IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    portal = document.createElement("div");
    document.body.append(host, portal);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    document.body.innerHTML = "";
  });

  it("syncs an atomic target and keeps imperative API as a request port", async () => {
    const test = harness();
    const controller = createShellSheetController<Snap, Region>();
    const apiRef = createRef<ShellSheetApi<Snap, Region>>();
    const onRequest = vi.fn();

    await act(async () => {
      root.render(
        <ShellSheet.Root
          controller={controller}
          target={target("A")}
          apiRef={apiRef}
          onRequest={onRequest}
          environment={test.environment}
          animation={test.animation}
        >
          <ShellSheet.Portal container={portal} keepMounted>
            <Anatomy body="Arkham" />
          </ShellSheet.Portal>
        </ShellSheet.Root>,
      );
    });
    await flushVisuals(test.frames);

    expect(controller.getSnapshot().settledTarget?.targetId).toBe("A");
    expect(portal.querySelector("h2")?.textContent).toBe("Archive");
    expect(apiRef.current?.popupElement).toBe(portal.querySelector("[role='dialog']"));
    expect(apiRef.current?.popupElement?.dataset.open).toBe("");
    expect(apiRef.current?.popupElement?.dataset.swipeDirection).toBe("down");
    expect(
      apiRef.current?.popupElement?.style.getPropertyValue("--drawer-height"),
    ).toBe("400px");
    expect(portal.querySelector<HTMLElement>("[data-region='body']")?.parentElement?.style.overflowY)
      .toBe("auto");
    let requestId: number | undefined;
    await act(async () => {
      requestId = apiRef.current?.snapTo("expanded");
    });
    expect(requestId).toBe(1);
    expect(onRequest).toHaveBeenCalledWith(
      expect.objectContaining({ type: "snap-requested", snapPoint: "expanded" }),
    );
    expect(controller.getSnapshot().authoritativeTarget).toMatchObject({
      targetId: "A",
      snapPoint: "compact",
    });
  });

  it("uses an external controller without a second target sync", async () => {
    const test = harness();
    const controller = createShellSheetController<Snap, Region>(target("A"));
    const synced = vi.fn();
    controller.subscribe((_snapshot, event) => {
      if (event.type === "target-synced") synced(event.target.targetId);
    });

    await act(async () => {
      root.render(
        <ShellSheet.Root
          controller={controller}
          environment={test.environment}
          animation={test.animation}
        >
          <ShellSheet.Portal container={portal} keepMounted>
            <Anatomy body="Arkham" />
          </ShellSheet.Portal>
        </ShellSheet.Root>,
      );
    });
    await flushVisuals(test.frames);
    expect(synced).not.toHaveBeenCalled();

    await act(async () => {
      controller.sync(target("B", { snapPoint: "expanded" }));
    });
    await flushVisuals(test.frames);
    expect(synced).toHaveBeenCalledOnce();
    expect(controller.getSnapshot().settledTarget?.targetId).toBe("B");
  });

  it("supports Base-shaped uncontrolled open callbacks through the same target path", async () => {
    const test = harness();
    const apiRef = createRef<ShellSheetApi<Snap, Region>>();
    const onOpenChange = vi.fn();
    const onOpenChangeComplete = vi.fn();
    const onTransitionStatusChange = vi.fn();

    await act(async () => {
      root.render(
        <ShellSheet.Root<Snap, Region>
          snapPoints={[
            { id: "compact", size: { type: "ratio", value: 0.5 } },
            { id: "expanded", size: { type: "ratio", value: 0.9 } },
          ]}
          defaultOpen={false}
          defaultSnapPoint="compact"
          modal={false}
          apiRef={apiRef}
          onOpenChange={onOpenChange}
          onOpenChangeComplete={onOpenChangeComplete}
          onTransitionStatusChange={onTransitionStatusChange}
          environment={test.environment}
          animation={test.animation}
        >
          <ShellSheet.Trigger>Open</ShellSheet.Trigger>
          <ShellSheet.Portal container={portal} keepMounted>
            <Anatomy body="Dunwich" />
          </ShellSheet.Portal>
        </ShellSheet.Root>,
      );
    });
    await act(async () => {
      host.querySelector<HTMLButtonElement>("button")?.click();
    });
    await flushVisuals(test.frames);

    expect(onOpenChange).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        reason: expect.objectContaining({ type: "open-requested" }),
      }),
    );
    expect(onOpenChangeComplete).toHaveBeenLastCalledWith(true);
    expect(onTransitionStatusChange).toHaveBeenCalledWith("starting");
    expect(onTransitionStatusChange).toHaveBeenCalledWith(undefined);

    await act(async () => {
      apiRef.current?.close("api");
    });
    await flushVisuals(test.frames);
    expect(onOpenChange).toHaveBeenLastCalledWith(
      false,
      expect.objectContaining({
        reason: expect.objectContaining({ type: "close-requested" }),
      }),
    );
    expect(onOpenChangeComplete).toHaveBeenLastCalledWith(false);
  });

  it("keeps one Popup while presentation and draggable policy change", async () => {
    const test = harness();
    const controller = createShellSheetController<Snap, Region>();
    const render = (next: ShellSheetOpenTarget<Snap, Region>) => (
      <StrictMode>
        <ShellSheet.Root
          controller={controller}
          target={next}
          environment={test.environment}
          animation={test.animation}
        >
          <ShellSheet.Portal container={portal} keepMounted>
            <Anatomy body="Innsmouth" />
          </ShellSheet.Portal>
        </ShellSheet.Root>
      </StrictMode>
    );

    await act(async () => root.render(render(target("A"))));
    await flushVisuals(test.frames);
    const popup = portal.querySelector("[role='dialog']");
    expect(portal.querySelectorAll("[data-shell-sheet-portal]")).toHaveLength(1);
    expect(portal.querySelector("button[aria-label='Expand sheet']")).not.toBeNull();

    await act(async () =>
      root.render(
        render(target("B", { presentation: "dialog", draggable: false })),
      ),
    );
    await flushVisuals(test.frames);

    expect(portal.querySelector("[role='dialog']")).toBe(popup);
    expect(portal.querySelector("button[aria-label*='sheet']")).toBeNull();
    expect(portal.querySelector("[data-presentation='dialog']")).not.toBeNull();
  });

  it("mounts only changed Body layers and preserves Header/Footer identity", async () => {
    const test = harness();
    const controller = createShellSheetController<Snap, Region>();
    const render = (next: ShellSheetOpenTarget<Snap, Region>, body: string) => (
      <ShellSheet.Root
        controller={controller}
        target={next}
        environment={test.environment}
        animation={test.animation}
      >
        <ShellSheet.Portal container={portal} keepMounted>
          <Anatomy body={body} />
        </ShellSheet.Portal>
      </ShellSheet.Root>
    );

    await act(async () => root.render(render(target("A"), "Arkham")));
    await flushVisuals(test.frames);
    const header = portal.querySelector("[data-region='header']");
    const footer = portal.querySelector("[data-region='footer']");
    const bodyTransitionSurface = portal.querySelector(
      "[data-region-blur='body']",
    );
    expect(bodyTransitionSurface?.getAttribute("aria-hidden")).toBe("true");

    await act(async () =>
      root.render(render(target("B", { body: "b" }), "Innsmouth")),
    );

    const bodyLayers = portal.querySelectorAll("[data-region='body']");
    expect(bodyLayers).toHaveLength(2);
    expect(portal.textContent).toContain("Arkham");
    expect(portal.textContent).toContain("Innsmouth");
    expect(
      portal
        .querySelector("[data-region='body'][data-layer='outgoing']")
        ?.getAttribute("aria-hidden"),
    ).toBe("true");
    expect(portal.querySelector("[data-region='header']")).toBe(header);
    expect(portal.querySelector("[data-region='footer']")).toBe(footer);
    expect(portal.querySelectorAll("[data-region-blur='body']")).toHaveLength(1);
    expect(portal.querySelector("[data-region-blur='body']")).toBe(
      bodyTransitionSurface,
    );

    await flushVisuals(test.frames);
    expect(portal.querySelectorAll("[data-region='body']")).toHaveLength(1);
    expect(portal.textContent).not.toContain("Arkham");
  });

  it("keeps the outgoing Body while Suspense provides measurable incoming readiness", async () => {
    const test = harness();
    const controller = createShellSheetController<Snap, Region>();
    let ready = false;
    let resolve!: () => void;
    const pending = new Promise<void>((next) => { resolve = next; });
    const AsyncBody = () => {
      if (!ready) throw pending;
      return <>Innsmouth ready</>;
    };
    const render = (
      next: ShellSheetOpenTarget<Snap, Region>,
      body: ReactNode,
    ) => (
      <ShellSheet.Root
        controller={controller}
        target={next}
        environment={test.environment}
        animation={test.animation}
      >
        <ShellSheet.Portal container={portal} keepMounted>
          <ShellSheet.Backdrop />
          <ShellSheet.Viewport>
            <ShellSheet.Popup aria-label="Archive location">
              <ShellSheet.Content>
                <ShellSheet.Header><ShellSheet.Title>Archive</ShellSheet.Title></ShellSheet.Header>
                <ShellSheet.Body>{body}</ShellSheet.Body>
                <ShellSheet.Footer><ShellSheet.Close>Close</ShellSheet.Close></ShellSheet.Footer>
              </ShellSheet.Content>
            </ShellSheet.Popup>
          </ShellSheet.Viewport>
        </ShellSheet.Portal>
      </ShellSheet.Root>
    );

    await act(async () => root.render(render(target("A"), "Arkham ready")));
    await flushVisuals(test.frames);
    await act(async () => root.render(render(
      target("B", { body: "b" }),
      <Suspense fallback={<span>Incoming measurable fallback</span>}>
        <AsyncBody />
      </Suspense>,
    )));

    expect(portal.textContent).toContain("Arkham ready");
    expect(portal.textContent).toContain("Incoming measurable fallback");
    expect(portal.querySelector("[data-layer='outgoing']")).not.toBeNull();

    ready = true;
    await act(async () => {
      resolve();
      await pending;
    });
    expect(portal.textContent).toContain("Arkham ready");
    expect(portal.textContent).toContain("Innsmouth ready");

    await flushVisuals(test.frames);
    expect(portal.textContent).not.toContain("Arkham ready");
    expect(portal.textContent).toContain("Innsmouth ready");
  });

  it("renders the Base-shaped default anatomy and keeps DragArea pointer-only", async () => {
    const test = harness();
    const controller = createShellSheetController<Snap, Region>();
    const states: unknown[] = [];

    await act(async () => root.render(
      <ShellSheet.Root
        controller={controller}
        target={target("anatomy")}
        environment={test.environment}
        animation={test.animation}
      >
        <ShellSheet.Trigger data-part="trigger">Open</ShellSheet.Trigger>
        <ShellSheet.Portal data-part="portal" container={portal} keepMounted>
          <ShellSheet.Backdrop data-part="backdrop" />
          <ShellSheet.Viewport data-part="viewport">
            <ShellSheet.Popup
              data-part="popup"
              className={(state) => {
                states.push(state);
                return "consumer-popup";
              }}
            >
              <ShellSheet.Content data-part="content">
                <ShellSheet.Header data-part="header">
                  <ShellSheet.Handle data-part="handle">Drag</ShellSheet.Handle>
                  <ShellSheet.DragArea data-part="drag-area">Custom drag chrome</ShellSheet.DragArea>
                  <ShellSheet.Title data-part="title">Archive</ShellSheet.Title>
                </ShellSheet.Header>
                <ShellSheet.Body data-part="body">
                  <ShellSheet.Description data-part="description">Description</ShellSheet.Description>
                </ShellSheet.Body>
                <ShellSheet.Footer data-part="footer">
                  <ShellSheet.Close data-part="close">Close</ShellSheet.Close>
                </ShellSheet.Footer>
              </ShellSheet.Content>
            </ShellSheet.Popup>
          </ShellSheet.Viewport>
        </ShellSheet.Portal>
      </ShellSheet.Root>,
    ));
    await flushVisuals(test.frames);

    const expectedTags = {
      trigger: "BUTTON",
      portal: "DIV",
      backdrop: "DIV",
      viewport: "DIV",
      popup: "DIV",
      content: "DIV",
      header: "DIV",
      handle: "BUTTON",
      "drag-area": "DIV",
      title: "H2",
      body: "DIV",
      description: "P",
      footer: "DIV",
      close: "BUTTON",
    } as const;
    for (const [part, tag] of Object.entries(expectedTags)) {
      expect((part === "trigger" ? host : portal).querySelector(`[data-part='${part}']`)?.tagName).toBe(tag);
    }
    const popup = portal.querySelector<HTMLElement>("[data-part='popup']")!;
    expect(popup.dataset.presentation).toBe("sheet");
    expect(popup.dataset.swipeDirection).toBe("down");
    expect(popup.hasAttribute("data-open")).toBe(true);
    expect(popup.hasAttribute("data-expanded")).toBe(false);
    const dragArea = portal.querySelector<HTMLElement>("[data-part='drag-area']")!;
    expect(dragArea.getAttribute("role")).toBeNull();
    expect(dragArea.tabIndex).toBe(-1);
    expect(dragArea.style.touchAction).toBe("pan-x");
    expect(states.length).toBeGreaterThan(0);
    expect(states.every(Object.isFrozen)).toBe(true);
  });

  it("composes render handlers consumer-first and honors preventDefault", async () => {
    const test = harness();
    const onOpenChange = vi.fn();
    const linkRef = createRef<HTMLElement>();
    const apiRef = createRef<ShellSheetApi<Snap, Region>>();
    let frozenState = false;

    await act(async () => {
      root.render(
        <StrictMode>
          <ShellSheet.Root<Snap, Region>
            snapPoints={[
              { id: "compact", size: { type: "ratio", value: 0.5 } },
            ]}
            defaultOpen={false}
            modal={false}
            apiRef={apiRef}
            onOpenChange={onOpenChange}
            environment={test.environment}
            animation={test.animation}
          >
            <ShellSheet.Trigger
              ref={linkRef}
              nativeButton={false}
              className={(state) => {
                frozenState = Object.isFrozen(state);
                return "from-prop";
              }}
              render={
                <a
                  href="#archive"
                  className="from-render"
                  onClick={(event) => event.preventDefault()}
                />
              }
            >
              Open archive
            </ShellSheet.Trigger>
          </ShellSheet.Root>
        </StrictMode>,
      );
    });
    const link = host.querySelector<HTMLAnchorElement>("a")!;
    await act(async () => link.click());

    expect(linkRef.current).toBe(link);
    expect(link.className).toBe("from-render from-prop");
    expect(frozenState).toBe(true);
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(apiRef.current?.getSnapshot().phase).toBe("closed");
  });
});
