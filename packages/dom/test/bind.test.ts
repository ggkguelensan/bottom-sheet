// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createShellSheetController,
  type ShellSheetEvent,
  type ShellSheetOpenTarget,
  type ShellSheetTarget,
} from "@shell-sheet/core";
import {
  bindShellSheetToDom,
  type ShellAnimationDriver,
  type ShellSheetDomEnvironment,
  type ShellSheetResizeObserver,
} from "../src/index.js";

type Snap = "compact" | "expanded";
type Region = "header" | "summary" | "details" | "actions";

const closed = (targetId = "closed:1"): ShellSheetTarget<Snap, Region> => ({
  targetId,
  open: false,
  transition: { cause: "close", direction: "none", motion: "auto" },
});

const opened = (
  targetId: string,
  body: "summary" | "details" = "summary",
  snapPoint: Snap = "compact",
  presentation: "sheet" | "dialog" = "sheet",
): ShellSheetOpenTarget<Snap, Region> => ({
  targetId,
  open: true,
  snapPoints: [
    { id: "compact", size: { type: "content", maxRatio: 0.7 } },
    { id: "expanded", size: { type: "ratio", value: 1 } },
  ],
  snapPoint,
  presentation,
  modality: "modal",
  draggable: true,
  contentResizeBehavior: "animate",
  regions: {
    header: { key: "header", transition: "preserve" },
    body: { key: body, transition: "crossfade" },
    footer: { key: "actions", transition: "preserve" },
  },
  transition: { cause: "navigate", direction: "forward", motion: "auto" },
});

class FakeFrames {
  private nextId = 0;
  private readonly frames = new Map<number, FrameRequestCallback>();

  request = (callback: FrameRequestCallback): number => {
    const id = ++this.nextId;
    this.frames.set(id, callback);
    return id;
  };

  cancel = (id: number): void => {
    this.frames.delete(id);
  };

  flush(): void {
    const frames = [...this.frames.entries()];
    this.frames.clear();
    for (const [id, callback] of frames) callback(id * 16.67);
  }

  pending(): number {
    return this.frames.size;
  }
}

class FakeResizeObserver implements ShellSheetResizeObserver {
  readonly elements = new Set<Element>();
  observe = (element: Element): void => {
    this.elements.add(element);
  };
  unobserve = (element: Element): void => {
    this.elements.delete(element);
  };
  disconnect = (): void => {
    this.elements.clear();
  };
}

const defaultViewport = Object.freeze({
  offsetLeft: 0,
  offsetTop: 0,
  width: 390,
  height: 800,
  scale: 1,
});

const createHarness = (viewport = defaultViewport) => {
  const frames = new FakeFrames();
  const observer = new FakeResizeObserver();
  const environment: ShellSheetDomEnvironment = {
    requestAnimationFrame: frames.request,
    cancelAnimationFrame: frames.cancel,
    getComputedStyle: (element) => window.getComputedStyle(element),
    createResizeObserver: () => observer,
    getViewport: () => viewport,
    observeViewport: () => () => undefined,
    prefersReducedMotion: () => false,
    getDocumentVisibility: () => "visible",
    observeDocumentVisibility: () => () => undefined,
  };
  const calls: Array<{
    element: HTMLElement;
    keyframes: Keyframe[] | PropertyIndexedKeyframes;
    duration: number;
    easing: string;
  }> = [];
  const animation: ShellAnimationDriver = {
    animate(element, keyframes, options) {
      calls.push({
        element,
        keyframes,
        duration: options.durationMs,
        easing: options.easing,
      });
      return {
        finished: Promise.resolve({ status: "finished" }),
        stop: vi.fn(),
      };
    },
  };
  return { frames, observer, environment, animation, calls };
};

const rect = (height: number, width = 390): DOMRect =>
  ({
    x: 0,
    y: 800 - height,
    width,
    height,
    top: 800 - height,
    right: width,
    bottom: 800,
    left: 0,
    toJSON: () => ({}),
  }) as DOMRect;

const element = (tag = "div", height = 0): HTMLElement => {
  const node = document.createElement(tag);
  node.getBoundingClientRect = () => rect(height);
  return node;
};

const registerAnatomy = (
  binding: ReturnType<typeof bindShellSheetToDom<Snap, Region>>,
  bodyKey: "summary" | "details" = "summary",
) => {
  const portal = element("div");
  portal.hidden = true;
  const backdrop = element("div");
  backdrop.style.opacity = "0.4";
  const viewport = element("div", 800);
  const popup = element("div", 0);
  const content = element("div");
  const header = element("div", 60);
  const body = element("div", 0);
  const footer = element("div", 72);
  const handle = element("button", 20);
  const inertTarget = element("main");
  const headerLayer = element("div", 40);
  const bodyLayer = element("div", 320);
  Object.defineProperty(bodyLayer, "scrollHeight", { value: 320 });
  const footerLayer = element("div", 72);
  const headerTransitionSurface = element("div", 40);
  const bodyTransitionSurface = element("div", 320);
  const footerTransitionSurface = element("div", 72);

  const cleanups = [
    binding.registerPart("portal", portal),
    binding.registerPart("backdrop", backdrop),
    binding.registerPart("viewport", viewport),
    binding.registerPart("popup", popup),
    binding.registerPart("content", content),
    binding.registerPart("header", header),
    binding.registerPart("body", body),
    binding.registerPart("footer", footer),
    binding.registerPart("handle", handle),
    binding.registerPart("inert-target", inertTarget),
    binding.registerRegionLayer(
      "header",
      { key: "header", layer: "settled" },
      headerLayer,
    ),
    binding.registerRegionLayer(
      "body",
      { key: bodyKey, layer: "settled" },
      bodyLayer,
    ),
    binding.registerRegionLayer(
      "footer",
      { key: "actions", layer: "settled" },
      footerLayer,
    ),
    binding.registerRegionTransitionSurface("header", headerTransitionSurface),
    binding.registerRegionTransitionSurface("body", bodyTransitionSurface),
    binding.registerRegionTransitionSurface("footer", footerTransitionSurface),
  ];
  document.body.append(portal, inertTarget);
  portal.append(backdrop, viewport);
  viewport.append(popup);
  popup.append(content);
  content.append(header, body, footer);
  header.append(handle, headerLayer, headerTransitionSurface);
  body.append(bodyLayer, bodyTransitionSurface);
  footer.append(footerLayer, footerTransitionSurface);

  return {
    portal,
    backdrop,
    viewport,
    popup,
    content,
    header,
    body,
    footer,
    handle,
    inertTarget,
    headerLayer,
    bodyLayer,
    footerLayer,
    headerTransitionSurface,
    bodyTransitionSurface,
    footerTransitionSurface,
    cleanups,
  };
};

const flushAll = async (frames: FakeFrames): Promise<void> => {
  for (let index = 0; index < 8; index += 1) {
    if (frames.pending() > 0) frames.flush();
    await Promise.resolve();
  }
};

describe("target DOM binding", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("uses token-safe dynamic part registration", () => {
    const harness = createHarness();
    const controller = createShellSheetController<Snap, Region>(closed());
    const binding = bindShellSheetToDom(controller, {
      environment: harness.environment,
      animation: harness.animation,
    });
    const first = element();
    const second = element();
    const cleanupFirst = binding.registerPart("popup", first);
    binding.registerPart("popup", second);

    cleanupFirst();
    expect(binding.getElements().popup).toBe(second);

    binding.destroy();
    expect(binding.getElements()).toEqual({
      portal: null,
      backdrop: null,
      viewport: null,
      popup: null,
      content: null,
      header: null,
      body: null,
      footer: null,
      handle: null,
      inertTarget: null,
    });
    expect(() => binding.registerPart("popup", first)).toThrow("destroyed");
  });

  it("restores only adapter-owned mechanic properties and attributes on destroy", () => {
    const harness = createHarness();
    const controller = createShellSheetController<Snap, Region>(closed());
    const binding = bindShellSheetToDom(controller, {
      environment: harness.environment,
      animation: harness.animation,
    });
    const portal = element();
    const popup = element();
    const body = element();
    const layer = element();
    portal.style.visibility = "collapse";
    popup.style.height = "13px";
    popup.style.minHeight = "5px";
    popup.style.setProperty("--drawer-height", "7px");
    popup.style.setProperty("--consumer-color", "rebeccapurple");
    popup.setAttribute("data-open", "consumer-value");
    popup.setAttribute("role", "alert");
    popup.setAttribute("data-consumer", "preserved");
    body.style.overflowY = "visible";
    layer.style.alignSelf = "center";
    layer.setAttribute("aria-hidden", "false");

    binding.registerPart("portal", portal);
    binding.registerPart("popup", popup);
    binding.registerPart("body", body);
    binding.registerRegionLayer(
      "body",
      { key: "summary", layer: "settled" },
      layer,
    );

    expect(popup.style.minHeight).toBe("0px");
    expect(body.style.overflowY).toBe("auto");
    expect(layer.style.alignSelf).toBe("start");
    binding.destroy();

    expect(portal.style.visibility).toBe("collapse");
    expect(portal.hasAttribute("data-shell-sheet-portal")).toBe(false);
    expect(popup.style.height).toBe("13px");
    expect(popup.style.minHeight).toBe("5px");
    expect(popup.style.getPropertyValue("--drawer-height")).toBe("7px");
    expect(popup.style.getPropertyValue("--consumer-color")).toBe(
      "rebeccapurple",
    );
    expect(popup.getAttribute("data-open")).toBe("consumer-value");
    expect(popup.getAttribute("role")).toBe("alert");
    expect(popup.getAttribute("data-consumer")).toBe("preserved");
    expect(body.style.overflowY).toBe("visible");
    expect(layer.style.alignSelf).toBe("center");
    expect(layer.getAttribute("aria-hidden")).toBe("false");
  });

  it("measures a content target, animates opening, and settles one token", async () => {
    const harness = createHarness();
    const controller = createShellSheetController<Snap, Region>(closed());
    const events: ShellSheetEvent<Snap, Region>[] = [];
    controller.subscribe((_snapshot, event) => events.push(event));
    const binding = bindShellSheetToDom(controller, {
      environment: harness.environment,
      animation: harness.animation,
      scrollLock: { acquire: () => () => undefined },
      backgroundIsolation: { acquire: () => () => undefined },
    });
    const anatomy = registerAnatomy(binding);

    controller.sync(opened("A"));
    await flushAll(harness.frames);

    expect(controller.getSnapshot()).toMatchObject({
      phase: "open",
      settledTarget: { targetId: "A" },
    });
    expect(anatomy.popup.style.getPropertyValue("--drawer-height")).toBe(
      "452px",
    );
    expect(anatomy.popup.dataset.open).toBe("");
    expect(anatomy.popup.dataset.presentation).toBe("sheet");
    expect(anatomy.portal.hidden).toBe(false);
    expect(
      harness.calls.some(
        (call) =>
          "transform" in call.keyframes &&
          Array.from(call.keyframes.transform ?? []).includes("translateY(100%)"),
      ),
    ).toBe(true);
    expect(
      events.filter((event) => event.type === "transition-settled"),
    ).toHaveLength(1);

    harness.calls.length = 0;
    controller.sync(closed("closed:after-open"));
    await flushAll(harness.frames);

    expect(controller.getSnapshot().phase).toBe("closed");
    expect(anatomy.portal.hidden).toBe(true);
    expect(
      harness.calls.some(
        (call) =>
          call.element === anatomy.popup &&
          "transform" in call.keyframes &&
          Array.from(call.keyframes.transform ?? []).includes("translateY(100%)"),
      ),
    ).toBe(true);
    expect(
      events.filter((event) => event.type === "transition-settled"),
    ).toHaveLength(2);

    binding.destroy();
  });

  it("finishes all layout reads before the first mechanic write in each frame", async () => {
    const harness = createHarness();
    const controller = createShellSheetController<Snap, Region>(closed());
    const binding = bindShellSheetToDom(controller, {
      environment: harness.environment,
      animation: harness.animation,
      scrollLock: { acquire: () => () => undefined },
      backgroundIsolation: { acquire: () => () => undefined },
    });
    const anatomy = registerAnatomy(binding);
    let frameWrote = false;
    const violations: string[] = [];
    const nodes = [
      anatomy.portal,
      anatomy.backdrop,
      anatomy.viewport,
      anatomy.popup,
      anatomy.content,
      anatomy.header,
      anatomy.body,
      anatomy.footer,
      anatomy.handle,
      anatomy.headerLayer,
      anatomy.bodyLayer,
      anatomy.footerLayer,
    ];
    for (const node of nodes) {
      const readRect = node.getBoundingClientRect.bind(node);
      node.getBoundingClientRect = () => {
        if (frameWrote) violations.push(`layout read after write: ${node.tagName}`);
        return readRect();
      };
      const setProperty = node.style.setProperty.bind(node.style);
      node.style.setProperty = (...args) => {
        frameWrote = true;
        return setProperty(...args);
      };
      const setAttribute = node.setAttribute.bind(node);
      node.setAttribute = (name, value) => {
        frameWrote = true;
        setAttribute(name, value);
      };
      const removeAttribute = node.removeAttribute.bind(node);
      node.removeAttribute = (name) => {
        frameWrote = true;
        removeAttribute(name);
      };
      const toggleAttribute = node.toggleAttribute.bind(node);
      node.toggleAttribute = (name, force) => {
        frameWrote = true;
        return force === undefined
          ? toggleAttribute(name)
          : toggleAttribute(name, force);
      };
    }

    controller.sync(opened("read-before-write"));
    for (let index = 0; index < 8; index += 1) {
      frameWrote = false;
      if (harness.frames.pending() > 0) harness.frames.flush();
      await Promise.resolve();
    }
    expect(violations).toEqual([]);
    expect(controller.getSnapshot().settledTarget?.targetId).toBe("read-before-write");
    binding.destroy();
  });

  it("falls back from invalid CSS timing tokens and warns once per value", async () => {
    const harness = createHarness();
    const controller = createShellSheetController<Snap, Region>(closed());
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const binding = bindShellSheetToDom(controller, {
      environment: harness.environment,
      animation: harness.animation,
      scrollLock: { acquire: () => () => undefined },
      backgroundIsolation: { acquire: () => () => undefined },
    });
    const anatomy = registerAnatomy(binding);
    anatomy.popup.style.setProperty("--shell-sheet-open-duration", "later");
    anatomy.popup.style.setProperty("--shell-sheet-easing-enter", "spring(4)");

    controller.sync(opened("invalid-timing"));
    await flushAll(harness.frames);
    const entrance = harness.calls.find(
      (call) => call.element === anatomy.popup && "transform" in call.keyframes,
    );
    expect(entrance).toMatchObject({
      duration: 280,
      easing: "cubic-bezier(0.32, 0.72, 0, 1)",
    });
    expect(warning).toHaveBeenCalledTimes(2);

    controller.sync(closed("invalid-timing:closed"));
    await flushAll(harness.frames);
    expect(warning).toHaveBeenCalledTimes(2);
    binding.destroy();
    warning.mockRestore();
  });

  it("projects a VisualViewport keyboard inset without duplicating external insets", async () => {
    const harness = createHarness({
      offsetLeft: 0,
      offsetTop: 80,
      width: 390,
      height: 520,
      scale: 1,
    });
    const controller = createShellSheetController<Snap, Region>(closed());
    const binding = bindShellSheetToDom(controller, {
      environment: harness.environment,
      animation: harness.animation,
      scrollLock: { acquire: () => () => undefined },
      backgroundIsolation: { acquire: () => () => undefined },
    });
    const anatomy = registerAnatomy(binding);
    binding.setInsets({ top: 12, bottom: 24 });

    controller.sync(opened("keyboard"));
    await flushAll(harness.frames);
    expect(
      anatomy.viewport.style.getPropertyValue("--drawer-keyboard-inset"),
    ).toBe("200px");
    expect(Number.parseFloat(anatomy.popup.style.height)).toBeCloseTo(338.8);
    binding.destroy();
  });

  it("uses a Portal-sibling isolation strategy when no inert target is registered", async () => {
    const harness = createHarness();
    const controller = createShellSheetController<Snap, Region>(closed());
    const binding = bindShellSheetToDom(controller, {
      environment: harness.environment,
      animation: harness.animation,
      scrollLock: { acquire: () => () => undefined },
    });
    const anatomy = registerAnatomy(binding);
    anatomy.cleanups[9]?.();

    controller.sync(opened("modal"));
    await flushAll(harness.frames);
    expect(anatomy.inertTarget.inert).toBe(true);
    expect(anatomy.inertTarget.getAttribute("aria-hidden")).toBe("true");

    controller.sync(closed("modal:closed"));
    await flushAll(harness.frames);
    expect(anatomy.inertTarget.inert).toBeUndefined();
    expect(anatomy.inertTarget.hasAttribute("aria-hidden")).toBe(false);

    binding.destroy();
  });

  it("reference-counts shared modal isolation and restores exact external values", async () => {
    const harness = createHarness();
    const firstController = createShellSheetController<Snap, Region>(closed("first:closed"));
    const secondController = createShellSheetController<Snap, Region>(closed("second:closed"));
    const firstBinding = bindShellSheetToDom(firstController, {
      environment: harness.environment,
      animation: harness.animation,
    });
    const secondBinding = bindShellSheetToDom(secondController, {
      environment: harness.environment,
      animation: harness.animation,
    });
    const first = registerAnatomy(firstBinding);
    const second = registerAnatomy(secondBinding);
    first.cleanups[9]?.();
    second.cleanups[9]?.();
    const sharedBackground = element("main");
    sharedBackground.inert = false;
    sharedBackground.setAttribute("aria-hidden", "external");
    document.body.append(sharedBackground);
    firstBinding.registerPart("inert-target", sharedBackground);
    secondBinding.registerPart("inert-target", sharedBackground);
    document.body.style.overflow = "clip";
    document.body.style.paddingRight = "7px";
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);

    firstController.sync(opened("first:open"));
    secondController.sync(opened("second:open"));
    await flushAll(harness.frames);
    expect(sharedBackground.inert).toBe(true);
    expect(sharedBackground.getAttribute("aria-hidden")).toBe("true");
    expect(document.body.style.overflow).toBe("hidden");

    firstController.sync(closed("first:closed:again"));
    await flushAll(harness.frames);
    expect(sharedBackground.inert).toBe(true);
    expect(sharedBackground.getAttribute("aria-hidden")).toBe("true");
    expect(document.body.style.overflow).toBe("hidden");

    secondController.sync(closed("second:closed:again"));
    await flushAll(harness.frames);
    expect(sharedBackground.inert).toBe(false);
    expect(sharedBackground.getAttribute("aria-hidden")).toBe("external");
    expect(document.body.style.overflow).toBe("clip");
    expect(document.body.style.paddingRight).toBe("7px");

    firstBinding.destroy();
    secondBinding.destroy();
    scrollTo.mockRestore();
    document.body.style.overflow = "";
    document.body.style.paddingRight = "";
  });

  it("crossfades only a changed Body while geometry uses the same coordinator", async () => {
    const harness = createHarness();
    const controller = createShellSheetController<Snap, Region>(closed());
    const binding = bindShellSheetToDom(controller, {
      environment: harness.environment,
      animation: harness.animation,
      scrollLock: { acquire: () => () => undefined },
      backgroundIsolation: { acquire: () => () => undefined },
    });
    const anatomy = registerAnatomy(binding);
    controller.sync(opened("A"));
    await flushAll(harness.frames);
    harness.calls.length = 0;

    const incoming = element("div", 500);
    Object.defineProperty(incoming, "scrollHeight", { value: 500 });
    const outgoingAction = document.createElement("button");
    anatomy.bodyLayer.append(outgoingAction);
    outgoingAction.focus();
    anatomy.body.append(incoming);
    binding.registerRegionLayer(
      "body",
      { key: "details", layer: "incoming" },
      incoming,
    );
    controller.sync(opened("B", "details"));
    await flushAll(harness.frames);

    const animatedElements = harness.calls.map((call) => call.element);
    expect(animatedElements).toContain(anatomy.popup);
    expect(animatedElements).toContain(anatomy.bodyLayer);
    expect(animatedElements).toContain(incoming);
    expect(animatedElements).toContain(anatomy.bodyTransitionSurface);
    expect(animatedElements).not.toContain(anatomy.headerLayer);
    expect(animatedElements).not.toContain(anatomy.footerLayer);
    expect(document.activeElement).toBe(anatomy.popup);
    expect(controller.getSnapshot().settledTarget?.targetId).toBe("B");

    const incomingTransition = harness.calls.find(
      (call) => call.element === incoming,
    );
    expect(incomingTransition).toMatchObject({
      duration: 220,
      easing: "cubic-bezier(0.65, 0, 0.35, 1)",
      keyframes: {
        opacity: [0, 1],
      },
    });
    const outgoingTransition = harness.calls.find(
      (call) => call.element === anatomy.bodyLayer,
    );
    expect(outgoingTransition).toMatchObject({
      duration: 220,
      easing: "cubic-bezier(0.65, 0, 0.35, 1)",
      keyframes: {
        opacity: [1, 0],
      },
    });
    const blurTransition = harness.calls.find(
      (call) => call.element === anatomy.bodyTransitionSurface,
    );
    expect(blurTransition).toMatchObject({
      duration: 220,
      easing: "cubic-bezier(0.65, 0, 0.35, 1)",
      keyframes: [
        {
          offset: 0,
          opacity: 0,
          backdropFilter: "blur(0px)",
        },
        {
          offset: 0.5,
          opacity: 1,
          backdropFilter: "blur(2px)",
        },
        {
          offset: 1,
          opacity: 0,
          backdropFilter: "blur(0px)",
        },
      ],
    });

    binding.destroy();
  });

  it("morphs the same Popup between sheet and dialog rects without scaling text", async () => {
    const harness = createHarness();
    const controller = createShellSheetController<Snap, Region>(closed());
    const binding = bindShellSheetToDom(controller, {
      environment: harness.environment,
      animation: harness.animation,
      scrollLock: { acquire: () => () => undefined },
      backgroundIsolation: { acquire: () => () => undefined },
    });
    const anatomy = registerAnatomy(binding);
    const popupIdentity = anatomy.popup;
    anatomy.popup.getBoundingClientRect = () => {
      if (anatomy.popup.dataset.presentation === "dialog") {
        return {
          ...rect(452, 320),
          x: 35,
          left: 35,
          right: 355,
          y: 120,
          top: 120,
          bottom: 572,
        } as DOMRect;
      }
      return rect(452, 390);
    };

    controller.sync(opened("sheet"));
    await flushAll(harness.frames);
    harness.calls.length = 0;

    controller.sync(opened("dialog", "summary", "compact", "dialog"));
    await flushAll(harness.frames);

    expect(binding.getElements().popup).toBe(popupIdentity);
    const popupMorph = harness.calls.find(
      (call) => call.element === anatomy.popup && "width" in call.keyframes,
    );
    expect(popupMorph?.keyframes).toMatchObject({
      width: ["390px", "320px"],
      height: ["452px", "452px"],
    });
    expect(String(popupMorph?.keyframes.transform)).not.toContain("scale");
    expect(anatomy.popup.dataset.presentation).toBe("dialog");
    expect(anatomy.popup.hasAttribute("data-from-presentation")).toBe(false);
    expect(anatomy.popup.hasAttribute("data-to-presentation")).toBe(false);
    expect(anatomy.popup.hasAttribute("data-transitioning")).toBe(false);

    binding.destroy();
  });

  it("replaces A→B with C from current visual geometry and ignores stale completions", async () => {
    const harness = createHarness();
    type DeferredCall = {
      element: HTMLElement;
      keyframes: Keyframe[] | PropertyIndexedKeyframes;
      stop: ReturnType<typeof vi.fn>;
      resolve(result: { status: "finished" | "cancelled" }): void;
    };
    const deferred: DeferredCall[] = [];
    const animation: ShellAnimationDriver = {
      animate(animatedElement, keyframes) {
        let resolve!: DeferredCall["resolve"];
        const finished = new Promise<{ status: "finished" | "cancelled" }>(
          (next) => {
            resolve = next;
          },
        );
        const call = {
          element: animatedElement,
          keyframes,
          stop: vi.fn(),
          resolve,
        };
        deferred.push(call);
        return { finished, stop: call.stop };
      },
    };
    const controller = createShellSheetController<Snap, Region>(closed());
    const events: ShellSheetEvent<Snap, Region>[] = [];
    controller.subscribe((_snapshot, event) => events.push(event));
    const binding = bindShellSheetToDom(controller, {
      environment: harness.environment,
      animation,
      scrollLock: { acquire: () => () => undefined },
      backgroundIsolation: { acquire: () => () => undefined },
    });
    const anatomy = registerAnatomy(binding);
    let visibleHeight = 0;
    anatomy.popup.getBoundingClientRect = () => rect(visibleHeight);

    controller.sync(opened("A"));
    await flushAll(harness.frames);
    for (const call of deferred) call.resolve({ status: "finished" });
    await Promise.resolve();
    await Promise.resolve();
    visibleHeight = 452;
    expect(controller.getSnapshot().settledTarget?.targetId).toBe("A");

    let detailsHeight = 360;
    const details = element("div", 360);
    Object.defineProperty(details, "scrollHeight", {
      get: () => detailsHeight,
    });
    anatomy.body.append(details);
    binding.registerRegionLayer(
      "body",
      { key: "details", layer: "incoming" },
      details,
    );
    const bStart = deferred.length;
    controller.sync(opened("B", "details"));
    await flushAll(harness.frames);
    const bCalls = deferred.slice(bStart);
    expect(bCalls.length).toBeGreaterThan(0);

    visibleHeight = 510;
    detailsHeight = 500;
    const bRetargetStart = deferred.length;
    binding.refresh();
    await flushAll(harness.frames);
    const bRetargetCalls = deferred.slice(bRetargetStart);
    expect(bCalls.every((call) => call.stop.mock.calls.length === 1)).toBe(true);
    expect(
      bRetargetCalls.some((call) => call.element === anatomy.bodyLayer),
    ).toBe(true);
    expect(
      bRetargetCalls.some((call) => call.element === details),
    ).toBe(true);

    anatomy.bodyLayer.style.opacity = "0.55";
    details.style.opacity = "0.45";
    anatomy.bodyTransitionSurface.style.opacity = "0.75";
    anatomy.bodyTransitionSurface.style.setProperty(
      "backdrop-filter",
      "blur(0.8px)",
    );
    const cStart = deferred.length;
    controller.sync(opened("C", "summary"));
    await flushAll(harness.frames);
    const cCalls = deferred.slice(cStart);

    expect(
      bRetargetCalls.every((call) => call.stop.mock.calls.length === 1),
    ).toBe(true);
    const cGeometry = cCalls.find(
      (call) => call.element === anatomy.popup && "height" in call.keyframes,
    );
    expect(cGeometry?.keyframes).toMatchObject({
      height: ["510px", "452px"],
    });
    const restoredSummary = cCalls.find(
      (call) => call.element === anatomy.bodyLayer,
    );
    expect(restoredSummary?.keyframes).toMatchObject({ opacity: [0.55, 1] });
    const continuedBlur = cCalls.find(
      (call) => call.element === anatomy.bodyTransitionSurface,
    );
    expect(continuedBlur?.keyframes).toMatchObject([
      {
        offset: 0,
        opacity: 0.75,
        backdropFilter: "blur(0.8px)",
      },
      { offset: 0.5, opacity: 1, backdropFilter: "blur(2px)" },
      { offset: 1, opacity: 0, backdropFilter: "blur(0px)" },
    ]);
    const cTransitionId = controller.getSnapshot().transitionId;

    for (const call of [...bCalls, ...bRetargetCalls]) {
      call.resolve({ status: "finished" });
    }
    await Promise.resolve();
    await Promise.resolve();
    expect(controller.getSnapshot().transitionId).toBe(cTransitionId);
    expect(controller.getSnapshot().settledTarget?.targetId).toBe("A");

    for (const call of cCalls) call.resolve({ status: "finished" });
    await Promise.resolve();
    await Promise.resolve();
    expect(controller.getSnapshot().settledTarget?.targetId).toBe("C");
    expect(
      events.some(
        (event) => event.type === "transition-replaced" && event.targetId === "B",
      ),
    ).toBe(true);

    binding.destroy();
  });

  it("keeps pointer moves DOM-local and publishes one release request", async () => {
    const harness = createHarness();
    const controller = createShellSheetController<Snap, Region>(closed());
    const binding = bindShellSheetToDom(controller, {
      environment: harness.environment,
      animation: harness.animation,
      scrollLock: { acquire: () => () => undefined },
      backgroundIsolation: { acquire: () => () => undefined },
    });
    const anatomy = registerAnatomy(binding);
    anatomy.handle.setPointerCapture = vi.fn();
    const eventTypes: string[] = [];
    controller.subscribe((_snapshot, event) => eventTypes.push(event.type));
    controller.sync(opened("A"));
    await flushAll(harness.frames);
    eventTypes.length = 0;
    const handleLabel = document.createElement("span");
    anatomy.handle.append(handleLabel);

    const pointer = (
      type: string,
      y: number,
      time: number,
      pointerId = 1,
      isPrimary = true,
    ): PointerEvent => {
      const event = new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX: 10,
        clientY: y,
        button: 0,
      }) as PointerEvent;
      Object.defineProperties(event, {
        pointerId: { value: pointerId },
        isPrimary: { value: isPrimary },
        timeStamp: { value: time },
      });
      return event;
    };

    handleLabel.dispatchEvent(pointer("pointerdown", 600, 0));
    handleLabel.dispatchEvent(pointer("pointermove", 560, 20));
    handleLabel.dispatchEvent(pointer("pointermove", 500, 40));
    harness.frames.flush();

    expect(eventTypes).toEqual(["interaction-started"]);
    const heightBeforeSecondPointer = anatomy.popup.style.height;
    handleLabel.dispatchEvent(pointer("pointerdown", 300, 45, 2, false));
    handleLabel.dispatchEvent(pointer("pointermove", 100, 50, 2, false));
    handleLabel.dispatchEvent(pointer("pointerup", 100, 55, 2, false));
    harness.frames.flush();
    expect(eventTypes).toEqual(["interaction-started"]);
    expect(anatomy.popup.style.height).toBe(heightBeforeSecondPointer);

    handleLabel.dispatchEvent(pointer("pointerup", 480, 60));
    expect(eventTypes).toEqual([
      "interaction-started",
      "interaction-ended",
      "snap-requested",
    ]);
    await flushAll(harness.frames);
    expect(anatomy.popup.style.height).toBe("452px");
    expect(
      anatomy.popup.style.getPropertyValue("--drawer-swipe-movement-y"),
    ).toBe("0px");

    binding.destroy();
  });

  it("runs Handle click toggle after consumer cancellation handlers", async () => {
    const harness = createHarness();
    const controller = createShellSheetController<Snap, Region>(closed());
    const binding = bindShellSheetToDom(controller, {
      environment: harness.environment,
      animation: harness.animation,
      scrollLock: { acquire: () => () => undefined },
      backgroundIsolation: { acquire: () => () => undefined },
    });
    const anatomy = registerAnatomy(binding);
    controller.sync(opened("A"));
    await flushAll(harness.frames);
    const requests: string[] = [];
    controller.subscribe((_snapshot, event) => {
      if (event.type.endsWith("requested")) requests.push(event.type);
    });
    const prevent = (event: MouseEvent) => event.preventDefault();
    anatomy.handle.addEventListener("click", prevent);

    anatomy.handle.click();
    await Promise.resolve();
    expect(requests).toEqual([]);

    anatomy.handle.removeEventListener("click", prevent);
    anatomy.handle.click();
    await Promise.resolve();
    expect(requests).toEqual(["snap-requested"]);

    binding.destroy();
  });
});
