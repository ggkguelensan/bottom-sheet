import {
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type Key,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import type {
  ShellSheetController,
  ShellSheetListener,
  ShellSheetSnapshot,
} from "@shell-sheet/core";
import {
  bindShellSheetToDom,
  type ShellSheetAnimationDriver,
  type ShellSheetDomBinding,
  type ShellSheetDomOptions,
} from "@shell-sheet/dom";

export type ShellSheetPresentation = "sheet" | "dialog";

export interface ShellSheetApi {
  readonly controller: ShellSheetController;
  readonly rootElement: HTMLElement | null;
  readonly mainElement: HTMLElement | null;
  readonly contentElement: HTMLElement | null;
  open(): void;
  close(reason?: Parameters<ShellSheetController["close"]>[0]): void;
  toggle(): void;
  snapTo(snapPoint: string): void;
  getSnapshot(): Readonly<ShellSheetSnapshot>;
  subscribe(listener: ShellSheetListener): () => void;
  refresh(): void;
}

export interface ShellSheetContentTransitionProps {
  transitionKey: Key;
  children: ReactNode;
  animate?: boolean;
  className?: string;
  duration?: number;
  direction?: "forward" | "backward" | "neutral";
}

type PresentedContent = {
  key: Key;
  node: ReactNode;
};

/**
 * Keeps the outgoing and incoming content mounted long enough to measure both.
 * Its height interpolation deliberately drives the surrounding content-sized
 * sheet. The isolated wrapper has no layout dependants outside the sheet.
 */
export function ShellSheetContentTransition({
  transitionKey,
  children,
  animate = true,
  className,
  duration = 300,
  direction = "neutral",
}: ShellSheetContentTransitionProps) {
  const [presented, setPresented] = useState<PresentedContent>(() => ({
    key: transitionKey,
    node: children,
  }));
  const [phase, setPhase] = useState<"idle" | "prepared" | "animating">(
    "idle",
  );
  const hostRef = useRef<HTMLDivElement>(null);
  const outgoingRef = useRef<HTMLDivElement>(null);
  const incomingRef = useRef<HTMLDivElement>(null);
  const sequenceRef = useRef(0);
  const changing = presented.key !== transitionKey;

  useLayoutEffect(() => {
    if (!changing) return;

    const host = hostRef.current;
    if (!host) return;

    const sequence = ++sequenceRef.current;

    // A closed sheet has no outgoing content visible to the user. Committing
    // the requested screen before its opening measurement prevents the shell
    // from animating from the empty screen's height.
    if (!animate) {
      setPresented({ key: transitionKey, node: children });
      setPhase("idle");
      host.style.height = "auto";
      return;
    }

    const outgoing = outgoingRef.current;
    const incoming = incomingRef.current;
    if (!outgoing || !incoming) return;

    const reducedMotion =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const effectiveDuration = reducedMotion ? Math.min(120, duration) : duration;
    const fromHeight = host.style.height
      ? host.getBoundingClientRect().height
      : outgoing.getBoundingClientRect().height;
    const toHeight = incoming.getBoundingClientRect().height;

    host.style.height = `${fromHeight}px`;
    setPhase("prepared");

    let animationFrame: number | null = null;
    let completionTimer: number | null = null;
    const preparationFrame = requestAnimationFrame(() => {
      if (sequence !== sequenceRef.current) return;

      // The first frame paints the prepared outgoing/incoming layers. Starting
      // in a second frame guarantees that CSS observes two distinct computed
      // states and can interpolate between them.
      animationFrame = requestAnimationFrame(() => {
        if (sequence !== sequenceRef.current) return;
        setPhase("animating");
        host.style.height = `${toHeight}px`;

        completionTimer = window.setTimeout(() => {
          if (sequence !== sequenceRef.current) return;
          setPresented({ key: transitionKey, node: children });
          setPhase("idle");
          host.style.height = "auto";
        }, effectiveDuration + 34);
      });
    });

    return () => {
      cancelAnimationFrame(preparationFrame);
      if (animationFrame !== null) cancelAnimationFrame(animationFrame);
      if (completionTimer !== null) window.clearTimeout(completionTimer);
    };
  }, [animate, changing, children, duration, transitionKey]);

  const classes = ["shell-sheet-content-transition", className]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      ref={hostRef}
      className={classes}
      data-direction={direction}
      data-phase={phase}
      style={
        {
          "--shell-sheet-content-duration": `${duration}ms`,
        } as CSSProperties
      }
    >
      <div
        ref={outgoingRef}
        className="shell-sheet-content-transition__layer"
        data-layer="outgoing"
        aria-hidden={changing || undefined}
      >
        {presented.node}
      </div>

      {changing ? (
        <div
          ref={incomingRef}
          className="shell-sheet-content-transition__layer"
          data-layer="incoming"
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

export interface ShellSheetProps {
  controller: ShellSheetController;
  transitionKey: Key;
  children: ReactNode;
  presentation?: ShellSheetPresentation;
  modality?: "modal" | "non-modal";
  draggable?: boolean;
  animation?: ShellSheetAnimationDriver;
  inertTarget?: HTMLElement | null;
  portalTarget?: Element | null;
  className?: string;
  contentClassName?: string;
  label?: string;
  direction?: ShellSheetContentTransitionProps["direction"];
  transitionDuration?: number;
  topInset?: ShellSheetDomOptions["topInset"];
  bottomInset?: ShellSheetDomOptions["bottomInset"];
  maxHeight?: ShellSheetDomOptions["maxHeight"];
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  style?: CSSProperties;
}

export const ShellSheet = forwardRef<ShellSheetApi, ShellSheetProps>(
  function ShellSheet(
    {
      controller,
      transitionKey,
      children,
      presentation = "sheet",
      modality = "modal",
      draggable = true,
      animation,
      inertTarget,
      portalTarget,
      className,
      contentClassName,
      label = "Details",
      direction = "neutral",
      transitionDuration = 300,
      topInset,
      bottomInset,
      maxHeight,
      closeOnBackdrop,
      closeOnEscape,
      style,
    },
    forwardedRef,
  ) {
    const rootRef = useRef<HTMLDivElement>(null);
    const mainRef = useRef<HTMLElement>(null);
    const handleRef = useRef<HTMLButtonElement>(null);
    const measureRef = useRef<HTMLDivElement>(null);
    const backdropRef = useRef<HTMLButtonElement>(null);
    const bindingRef = useRef<ShellSheetDomBinding | null>(null);
    const openingContentKeyRef = useRef<Key | null>(null);
    const snapshot = useSyncExternalStore(
      (notify) => controller.subscribe(() => notify()),
      () => controller.getSnapshot(),
      () => controller.getSnapshot(),
    );

    if (snapshot.status === "opening") {
      openingContentKeyRef.current ??= transitionKey;
    } else {
      openingContentKeyRef.current = null;
    }

    const shouldAnimateContent =
      snapshot.status !== "opening" ||
      openingContentKeyRef.current !== transitionKey;

    useLayoutEffect(() => {
      const root = rootRef.current;
      const main = mainRef.current;
      const content = measureRef.current;
      if (!root || !main || !content) return;

      const options: ShellSheetDomOptions = {
        ...(animation ? { animation } : {}),
      };
      const binding = bindShellSheetToDom(
        controller,
        {
          root,
          main,
          content,
          ...(handleRef.current ? { handle: handleRef.current } : {}),
          ...(backdropRef.current ? { backdrop: backdropRef.current } : {}),
          ...(inertTarget ? { inertTarget } : {}),
        },
        options,
      );

      bindingRef.current = binding;
      return () => {
        binding.destroy();
        if (bindingRef.current === binding) bindingRef.current = null;
      };
    }, [animation, controller, inertTarget]);

    useLayoutEffect(() => {
      bindingRef.current?.updateOptions({
        modality,
        draggable,
        ...(animation ? { animation } : {}),
        ...(topInset !== undefined ? { topInset } : {}),
        ...(bottomInset !== undefined ? { bottomInset } : {}),
        ...(maxHeight !== undefined ? { maxHeight } : {}),
        ...(closeOnBackdrop !== undefined ? { closeOnBackdrop } : {}),
        ...(closeOnEscape !== undefined ? { closeOnEscape } : {}),
      });
    }, [
      animation,
      bottomInset,
      closeOnBackdrop,
      closeOnEscape,
      draggable,
      maxHeight,
      modality,
      topInset,
    ]);

    useImperativeHandle(
      forwardedRef,
      () => ({
        controller,
        get rootElement() {
          return rootRef.current;
        },
        get mainElement() {
          return mainRef.current;
        },
        get contentElement() {
          return measureRef.current;
        },
        open: () => controller.open(),
        close: (reason) => controller.close(reason),
        toggle: () => controller.toggle(),
        snapTo: (snapPoint) => controller.snapTo(snapPoint),
        getSnapshot: () => controller.getSnapshot(),
        subscribe: (listener) => controller.subscribe(listener),
        refresh: () => bindingRef.current?.refresh(),
      }),
      [controller],
    );

    if (typeof document === "undefined") return null;
    const target = portalTarget ?? document.body;

    return createPortal(
      <div
        ref={rootRef}
        className={["shell-sheet-root", className].filter(Boolean).join(" ")}
        data-presentation={presentation}
        style={style}
        hidden
      >
        <button
          ref={backdropRef}
          className="shell-sheet-backdrop"
          type="button"
          aria-label="Close"
          tabIndex={-1}
        />
        <section
          ref={mainRef}
          className="shell-sheet-main"
          data-presentation={presentation}
          aria-label={label}
        >
          <button ref={handleRef} className="shell-sheet-handle" type="button">
            <span aria-hidden="true" />
          </button>
          <div className="shell-sheet-viewport">
            <div
              ref={measureRef}
              className={["shell-sheet-content", contentClassName]
                .filter(Boolean)
                .join(" ")}
            >
              <ShellSheetContentTransition
                transitionKey={transitionKey}
                animate={shouldAnimateContent}
                duration={transitionDuration}
                direction={direction}
              >
                {children}
              </ShellSheetContentTransition>
            </div>
          </div>
        </section>
      </div>,
      target,
    );
  },
);
