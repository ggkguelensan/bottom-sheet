import {
  Children,
  cloneElement,
  createContext,
  createElement,
  forwardRef,
  isValidElement,
  useCallback,
  useContext,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type HTMLAttributes,
  type Key,
  type ReactElement,
  type ReactNode,
  type Ref,
} from "react";
import { createPortal } from "react-dom";
import {
  createShellSheetController,
  type ShellCloseReason,
  type ShellSheetController,
  type ShellSheetEvent,
  type ShellSheetFact,
  type ShellSheetListener,
  type ShellSheetOpenTarget,
  type ShellSheetRequest,
  type ShellSheetSnapPoint,
  type ShellSheetSnapshot,
  type ShellSheetTarget,
  type ShellTransitionIntent,
} from "@shell-sheet/core";
import {
  bindShellSheetToDom,
  type ShellAnimationDriver,
  type ShellBackgroundIsolationDriver,
  type ShellSheetDomBinding,
  type ShellSheetDomEnvironment,
  type ShellSheetGestureOptions,
  type ShellSheetInsets,
  type ShellScrollLockDriver,
} from "@shell-sheet/dom";

type PartState = Readonly<Record<string, unknown>>;
type PartRenderProps = HTMLAttributes<HTMLElement> &
  {
    ref?: Ref<HTMLElement>;
    type?: "button";
    disabled?: boolean;
  };
export type ShellSheetClassName<State> =
  | string
  | ((state: State) => string | undefined);
export type ShellSheetStyle<State> =
  | CSSProperties
  | ((state: State) => CSSProperties | undefined);
export type ShellSheetRender<State> =
  | ReactElement
  | ((props: PartRenderProps, state: State) => ReactElement);

export type ShellSheetApi<
  TSnap extends string = string,
  TRegionKey extends string = string,
> = Readonly<{
  open(): number;
  close(reason?: ShellCloseReason): number;
  toggle(): number;
  snapTo(snapPoint: TSnap): number;
  getSnapshot(): ShellSheetSnapshot<TSnap, TRegionKey>;
  subscribe(listener: ShellSheetListener<TSnap, TRegionKey>): () => void;
  readonly rootElement: HTMLElement | null;
  readonly popupElement: HTMLElement | null;
  readonly bodyElement: HTMLElement | null;
  refresh(): void;
}>;

type RootSharedProps<
  TSnap extends string,
  TRegionKey extends string,
> = Readonly<{
  children: ReactNode;
  onRequest?(request: ShellSheetRequest<TSnap>): void;
  onFact?(fact: ShellSheetFact<TSnap, TRegionKey>): void;
  apiRef?: Ref<ShellSheetApi<TSnap, TRegionKey>>;
  animation?: ShellAnimationDriver;
  environment?: ShellSheetDomEnvironment;
  gesture?: ShellSheetGestureOptions;
  insets?: ShellSheetInsets;
  scrollLock?: ShellScrollLockDriver;
  backgroundIsolation?: ShellBackgroundIsolationDriver;
  closeOnEscape?: boolean;
  closeOnBackdrop?: boolean;
  initialFocus?: (popup: HTMLElement) => HTMLElement | null;
}>;

export type ShellSheetTargetRootProps<
  TSnap extends string,
  TRegionKey extends string,
> = RootSharedProps<TSnap, TRegionKey> &
  Readonly<{
    target: ShellSheetTarget<TSnap, TRegionKey>;
    controller?: ShellSheetController<TSnap, TRegionKey>;
    open?: never;
    defaultOpen?: never;
    snapPoint?: never;
    defaultSnapPoint?: never;
  }>;

export type ShellSheetControllerRootProps<
  TSnap extends string,
  TRegionKey extends string,
> = RootSharedProps<TSnap, TRegionKey> &
  Readonly<{
    controller: ShellSheetController<TSnap, TRegionKey>;
    target?: never;
    open?: never;
    defaultOpen?: never;
    snapPoint?: never;
    defaultSnapPoint?: never;
  }>;

export type ShellSheetOpenChangeDetails<TSnap extends string = string> = Readonly<{
  reason: ShellSheetRequest<TSnap>;
}>;

export type ShellSheetTransitionStatus = "starting" | "ending" | undefined;

type ConvenienceOpenAxis =
  | Readonly<{ open: boolean; defaultOpen?: never }>
  | Readonly<{ open?: never; defaultOpen?: boolean }>;

type ConvenienceSnapAxis<TSnap extends string> =
  | Readonly<{ snapPoint: TSnap; defaultSnapPoint?: never }>
  | Readonly<{ snapPoint?: never; defaultSnapPoint?: TSnap }>;

export type ShellSheetConvenienceRootProps<
  TSnap extends string,
  TRegionKey extends string,
> = RootSharedProps<TSnap, TRegionKey> &
  ConvenienceOpenAxis &
  ConvenienceSnapAxis<TSnap> &
  Readonly<{
    target?: never;
    controller?: never;
    snapPoints: readonly ShellSheetSnapPoint<TSnap>[];
    onOpenChange?(
      open: boolean,
      details: ShellSheetOpenChangeDetails<TSnap>,
    ): void;
    onOpenChangeComplete?(open: boolean): void;
    onTransitionStatusChange?(status: ShellSheetTransitionStatus): void;
    onSnapPointChange?(snapPoint: TSnap, details: ShellSheetRequest<TSnap>): void;
    modal?: boolean;
    presentation?: "sheet" | "dialog";
    draggable?: boolean;
    contentResizeBehavior?:
      | "animate"
      | "immediate"
      | "keep-snap-and-scroll";
    transition?: ShellTransitionIntent;
  }>;

export type ShellSheetRootProps<
  TSnap extends string = string,
  TRegionKey extends string = string,
> =
  | ShellSheetTargetRootProps<TSnap, TRegionKey>
  | ShellSheetControllerRootProps<TSnap, TRegionKey>
  | ShellSheetConvenienceRootProps<TSnap, TRegionKey>;

type InternalContext = Readonly<{
  binding: ShellSheetDomBinding<string, string> | null;
  snapshot: ShellSheetSnapshot<string, string>;
  renderTarget: ShellSheetTarget<string, string> | null;
  renderOpenTarget: ShellSheetOpenTarget<string, string> | null;
  mode: "target" | "controller" | "convenience";
  requestOpen(): void;
  requestClose(reason: ShellCloseReason): void;
  requestSnap(snapPoint: string): void;
  rootId: string;
  titlePresent: boolean;
  descriptionPresent: boolean;
  registerTitle(): () => void;
  registerDescription(): () => void;
  setConvenienceRegion(
    region: "header" | "body" | "footer",
    target: Readonly<{
      key: string;
      transition: "preserve" | "crossfade" | "replace";
    }>,
  ): void;
}>;

const ShellSheetContext = createContext<InternalContext | null>(null);
const ShellSheetRegionLayerContext = createContext<Readonly<{
  active: boolean;
  idSuffix: string;
}> | null>(null);

const useEnhancedEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

const useShellSheet = (): InternalContext => {
  const value = useContext(ShellSheetContext);
  if (!value) {
    throw new Error("ShellSheet parts must be rendered inside ShellSheet.Root.");
  }
  return value;
};

const initialSnapshot: ShellSheetSnapshot = Object.freeze({
  authoritativeTarget: null,
  settledTarget: null,
  phase: "closed",
  transitionId: null,
  interaction: null,
});

const assignRef = <Value,>(ref: Ref<Value> | undefined, value: Value | null): void => {
  if (typeof ref === "function") ref(value);
  else if (ref) (ref as { current: Value | null }).current = value;
};

const mergeRefs = <Value,>(
  first: Ref<Value> | undefined,
  second: Ref<Value> | undefined,
): Ref<Value> | undefined => {
  if (!first) return second;
  if (!second) return first;
  return (value) => {
    assignRef(first, value);
    assignRef(second, value);
  };
};

const sameIdentityList = (
  left: readonly unknown[],
  right: readonly unknown[],
): boolean =>
  left.length === right.length &&
  left.every((value, index) => Object.is(value, right[index]));

const usePartRegistration = <ElementType extends HTMLElement>(
  part: Parameters<ShellSheetDomBinding["registerPart"]>[0],
  forwardedRef?: Ref<ElementType>,
) => {
  const { binding } = useShellSheet();
  const cleanupRef = useRef<(() => void) | null>(null);
  return useCallback(
    (element: ElementType | null) => {
      cleanupRef.current?.();
      cleanupRef.current = null;
      assignRef(forwardedRef, element);
      if (element && binding) cleanupRef.current = binding.registerPart(part, element);
    },
    [binding, forwardedRef, part],
  );
};

const resolveClassName = <State,>(
  className: ShellSheetClassName<State> | undefined,
  state: State,
): string | undefined =>
  typeof className === "function" ? className(state) : className;

const resolveStyle = <State,>(
  style: ShellSheetStyle<State> | undefined,
  state: State,
): CSSProperties | undefined =>
  typeof style === "function" ? style(state) : style;

const renderPart = <State,>(
  defaultTag: "div" | "button" | "h2" | "p",
  render: ShellSheetRender<State> | undefined,
  props: PartRenderProps,
  state: State,
): ReactElement => {
  if (typeof render === "function") return render(props, state);
  if (render) {
    const elementProps = render.props as PartRenderProps;
    const legacyRef = Object.getOwnPropertyDescriptor(render, "ref")?.value as
      | Ref<HTMLElement>
      | undefined;
    const mergedRef = mergeRefs(
      elementProps.ref ?? legacyRef,
      props.ref,
    );
    const composed: PartRenderProps = {
      ...elementProps,
      ...props,
      className: [elementProps.className, props.className]
        .filter(Boolean)
        .join(" ") || undefined,
      style: { ...elementProps.style, ...props.style },
      ...(mergedRef ? { ref: mergedRef } : {}),
    };
    for (const [name, internalHandler] of Object.entries(props)) {
      const consumerHandler = elementProps[name as keyof PartRenderProps];
      if (
        name.startsWith("on") &&
        typeof consumerHandler === "function" &&
        typeof internalHandler === "function"
      ) {
        composed[name as keyof PartRenderProps] = ((event: Event) => {
          consumerHandler(event);
          if (!event.defaultPrevented) internalHandler(event);
        }) as never;
      }
    }
    return cloneElement(render, composed);
  }
  return createElement(defaultTag, props);
};

const isTargetMode = <TSnap extends string, TRegionKey extends string>(
  props: ShellSheetRootProps<TSnap, TRegionKey>,
): props is ShellSheetTargetRootProps<TSnap, TRegionKey> =>
  "target" in props && props.target !== undefined;

const isControllerMode = <TSnap extends string, TRegionKey extends string>(
  props: ShellSheetRootProps<TSnap, TRegionKey>,
): props is ShellSheetControllerRootProps<TSnap, TRegionKey> =>
  "controller" in props && props.controller !== undefined && !("target" in props);

const defaultTransition: ShellTransitionIntent = Object.freeze({
  cause: "api",
  direction: "none",
  motion: "auto",
});

export function ShellSheetRoot<
  TSnap extends string = string,
  TRegionKey extends string = string,
>(props: ShellSheetRootProps<TSnap, TRegionKey>) {
  const targetMode = isTargetMode(props);
  const controllerMode = isControllerMode(props);
  const mode = targetMode ? "target" : controllerMode ? "controller" : "convenience";
  const modeRef = useRef(mode);
  if (modeRef.current !== mode) {
    throw new Error("ShellSheet Root state mode must remain stable while mounted.");
  }
  const runtimeProps = props as Record<string, unknown>;
  if (
    mode !== "convenience" &&
    ["open", "defaultOpen", "snapPoint", "defaultSnapPoint", "snapPoints"].some(
      (name) => runtimeProps[name] !== undefined,
    )
  ) {
    throw new Error(
      "ShellSheet target/controller mode cannot be mixed with convenience state props.",
    );
  }
  if (
    mode === "convenience" &&
    ((runtimeProps.open !== undefined && runtimeProps.defaultOpen !== undefined) ||
      (runtimeProps.snapPoint !== undefined &&
        runtimeProps.defaultSnapPoint !== undefined))
  ) {
    throw new Error(
      "ShellSheet controlled and default props for the same axis are mutually exclusive.",
    );
  }
  const rootId = useId().replaceAll(":", "");
  const [localOpen, setLocalOpen] = useState(
    !targetMode && !controllerMode ? (props.defaultOpen ?? false) : false,
  );
  const [localSnap, setLocalSnap] = useState<TSnap | null>(() =>
    !targetMode && !controllerMode
      ? (props.defaultSnapPoint ?? props.snapPoints[0]?.id ?? null)
      : null,
  );
  const [convenienceRegions, setConvenienceRegions] = useState(() => ({
    header: { key: "shell-sheet:header", transition: "preserve" as const },
    body: { key: "shell-sheet:body", transition: "preserve" as const },
    footer: { key: "shell-sheet:footer", transition: "preserve" as const },
  }));
  const revisionRef = useRef(0);
  const convenienceProps =
    !targetMode && !controllerMode ? props : null;
  const selectedConvenienceSnap = convenienceProps
    ? convenienceProps.snapPoint ?? localSnap
    : null;
  const convenienceOpen = convenienceProps
    ? convenienceProps.open ?? localOpen
    : false;
  const convenienceSignature = convenienceProps
    ? JSON.stringify({
        open: convenienceOpen,
        snapPoint: selectedConvenienceSnap,
        snapPoints: convenienceProps.snapPoints,
        presentation: convenienceProps.presentation ?? "sheet",
        modality: convenienceProps.modal === false ? "non-modal" : "modal",
        draggable: convenienceProps.draggable ?? true,
        contentResizeBehavior:
          convenienceProps.contentResizeBehavior ?? "animate",
        regions: convenienceRegions,
        transition: convenienceProps.transition ?? defaultTransition,
      })
    : "external";

  const convenienceTarget = useMemo((): ShellSheetTarget<TSnap, TRegionKey> | null => {
    if (!convenienceProps) return null;
    const selected = selectedConvenienceSnap;
    if (!selected) {
      throw new Error("ShellSheet convenience mode requires at least one snap point.");
    }
    revisionRef.current += 1;
    const targetId = `${rootId}:${revisionRef.current}`;
    if (!convenienceOpen) {
      return {
        targetId,
        open: false,
        transition: convenienceProps.transition ?? defaultTransition,
      };
    }
    return {
      targetId,
      open: true,
      snapPoints: convenienceProps.snapPoints,
      snapPoint: selected,
      presentation: convenienceProps.presentation ?? "sheet",
      modality: convenienceProps.modal === false ? "non-modal" : "modal",
      draggable: convenienceProps.draggable ?? true,
      contentResizeBehavior:
        convenienceProps.contentResizeBehavior ?? "animate",
      regions: convenienceRegions as ShellSheetOpenTarget<TSnap, TRegionKey>["regions"],
      transition: convenienceProps.transition ?? defaultTransition,
    };
  }, [
    convenienceSignature,
    rootId,
  ]);

  const initialTarget = targetMode ? props.target : convenienceTarget ?? undefined;
  const ownedTarget = targetMode ? props.target : convenienceTarget;
  const ownsController =
    !controllerMode && !(targetMode && props.controller !== undefined);
  const controllerRef = useRef<ShellSheetController<TSnap, TRegionKey> | null>(null);
  if (!controllerRef.current) {
    controllerRef.current =
      targetMode && props.controller
        ? props.controller
        : controllerMode
          ? props.controller
          : createShellSheetController(initialTarget);
  }
  const controller = controllerRef.current;
  if ((targetMode && props.controller && props.controller !== controller) ||
      (controllerMode && props.controller !== controller)) {
    throw new Error("ShellSheet controller identity must remain stable while Root is mounted.");
  }

  const snapshot = useSyncExternalStore(
    useCallback((notify) => controller.subscribe(() => notify()), [controller]),
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const [binding, setBinding] = useState<ShellSheetDomBinding<TSnap, TRegionKey> | null>(null);
  const bindingLeaseRef = useRef<{
    binding: ShellSheetDomBinding<TSnap, TRegionKey>;
    signature: readonly unknown[];
    releaseRequested: boolean;
  } | null>(null);
  const [titlePresent, setTitlePresent] = useState(false);
  const [descriptionPresent, setDescriptionPresent] = useState(false);
  const titleCountRef = useRef(0);
  const descriptionCountRef = useRef(0);
  const registerTitle = useCallback(() => {
    titleCountRef.current += 1;
    setTitlePresent(true);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      titleCountRef.current -= 1;
      if (titleCountRef.current === 0) setTitlePresent(false);
    };
  }, []);
  const registerDescription = useCallback(() => {
    descriptionCountRef.current += 1;
    setDescriptionPresent(true);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      descriptionCountRef.current -= 1;
      if (descriptionCountRef.current === 0) setDescriptionPresent(false);
    };
  }, []);
  const callbacksRef = useRef(props);
  const completedOpenRef = useRef<boolean | null>(null);
  const transitionStatusRef = useRef<ShellSheetTransitionStatus>(undefined);
  callbacksRef.current = props;

  useEnhancedEffect(() => {
    if (controllerMode) return;
    if (ownedTarget) controller.sync(ownedTarget);
  }, [controller, controllerMode, ownedTarget]);

  useEnhancedEffect(() => {
    const signature = [
      controller,
      props.animation,
      props.backgroundIsolation,
      props.closeOnBackdrop,
      props.closeOnEscape,
      props.environment,
      props.gesture,
      props.initialFocus,
      props.scrollLock,
    ] as const;
    const pending = bindingLeaseRef.current;
    const lease =
      pending?.releaseRequested === true &&
      sameIdentityList(pending.signature, signature)
        ? pending
        : {
            binding: bindShellSheetToDom(controller, {
              ...(props.animation ? { animation: props.animation } : {}),
              ...(props.environment ? { environment: props.environment } : {}),
              ...(props.gesture ? { gesture: props.gesture } : {}),
              ...(props.scrollLock ? { scrollLock: props.scrollLock } : {}),
              ...(props.backgroundIsolation
                ? { backgroundIsolation: props.backgroundIsolation }
                : {}),
              ...(props.closeOnEscape === undefined
                ? {}
                : { closeOnEscape: props.closeOnEscape }),
              ...(props.closeOnBackdrop === undefined
                ? {}
                : { closeOnBackdrop: props.closeOnBackdrop }),
              ...(props.initialFocus ? { initialFocus: props.initialFocus } : {}),
            }),
            signature,
            releaseRequested: false,
          };
    lease.releaseRequested = false;
    bindingLeaseRef.current = lease;
    setBinding(lease.binding);
    if (props.insets) lease.binding.setInsets(props.insets);
    return () => {
      lease.releaseRequested = true;
      setBinding((current) => (current === lease.binding ? null : current));
      void Promise.resolve().then(() => {
        if (!lease.releaseRequested) return;
        lease.binding.destroy();
        if (bindingLeaseRef.current === lease) bindingLeaseRef.current = null;
      });
    };
  }, [
    controller,
    props.animation,
    props.backgroundIsolation,
    props.closeOnBackdrop,
    props.closeOnEscape,
    props.environment,
    props.gesture,
    props.initialFocus,
    props.scrollLock,
  ]);

  useEnhancedEffect(() => {
    if (binding && props.insets) binding.setInsets(props.insets);
  }, [binding, props.insets]);

  useEnhancedEffect(
    () =>
      controller.subscribe((_nextSnapshot, event) => {
        const currentProps = callbacksRef.current;
        if (event.type.endsWith("requested")) {
          const request = event as ShellSheetRequest<TSnap>;
          currentProps.onRequest?.(request);
          if (!isTargetMode(currentProps) && !isControllerMode(currentProps)) {
            if (request.type === "open-requested") {
              currentProps.onOpenChange?.(true, { reason: request });
              if (currentProps.open === undefined) setLocalOpen(true);
            } else if (request.type === "close-requested") {
              currentProps.onOpenChange?.(false, { reason: request });
              if (currentProps.open === undefined) setLocalOpen(false);
            } else {
              currentProps.onSnapPointChange?.(request.snapPoint, request);
              if (currentProps.snapPoint === undefined) setLocalSnap(request.snapPoint);
            }
          }
        } else {
          const fact = event as ShellSheetFact<TSnap, TRegionKey>;
          currentProps.onFact?.(fact);
          if (!isTargetMode(currentProps) && !isControllerMode(currentProps)) {
            const phase = controller.getSnapshot().phase;
            const nextStatus: ShellSheetTransitionStatus =
              fact.type === "transition-started" && phase === "opening"
                ? "starting"
                : fact.type === "transition-started" && phase === "closing"
                  ? "ending"
                  : fact.type === "transition-settled" ||
                      fact.type === "transition-cancelled"
                    ? undefined
                    : transitionStatusRef.current;
            if (nextStatus !== transitionStatusRef.current) {
              transitionStatusRef.current = nextStatus;
              currentProps.onTransitionStatusChange?.(nextStatus);
            }
          }
          if (
            fact.type === "transition-settled" &&
            !isTargetMode(currentProps) &&
            !isControllerMode(currentProps)
          ) {
            const target = controller.getSnapshot().authoritativeTarget;
            if (target?.targetId === fact.targetId) {
              const open = target.open;
              if (completedOpenRef.current !== open) {
                completedOpenRef.current = open;
                currentProps.onOpenChangeComplete?.(open);
              }
            }
          }
        }
      }),
    [controller],
  );

  useImperativeHandle(
    props.apiRef,
    (): ShellSheetApi<TSnap, TRegionKey> => ({
      open: () => controller.requestOpen("api"),
      close: (reason = "api") =>
        controller.requestClose(reason, { origin: "api" }),
      toggle: () =>
        controller.getSnapshot().authoritativeTarget?.open === true
          ? controller.requestClose("api", { origin: "api" })
          : controller.requestOpen("api"),
      snapTo: (snapPoint) =>
        controller.requestSnap(snapPoint, { origin: "api" }),
      getSnapshot: controller.getSnapshot,
      subscribe: controller.subscribe,
      get rootElement() {
        return binding?.getElements().portal ?? null;
      },
      get popupElement() {
        return binding?.getElements().popup ?? null;
      },
      get bodyElement() {
        return binding?.getElements().body ?? null;
      },
      refresh: () => binding?.refresh(),
    }),
    [binding, controller],
  );

  const ownerLeaseRef = useRef(0);
  useEffect(() => {
    if (!ownsController) return;
    ownerLeaseRef.current += 1;
    const lease = ownerLeaseRef.current;
    return () => {
      void Promise.resolve().then(() => {
        if (ownerLeaseRef.current === lease) controller.destroy();
      });
    };
  }, [controller, ownsController]);

  const erasedBinding = binding as unknown as ShellSheetDomBinding<string, string> | null;
  const erasedSnapshot = snapshot as ShellSheetSnapshot<string, string>;
  const renderTarget = (
    controllerMode ? snapshot.authoritativeTarget : ownedTarget
  ) as ShellSheetTarget<string, string> | null;
  const renderOpenTarget = (
    renderTarget?.open === true ? renderTarget : snapshot.settledTarget
  ) as ShellSheetOpenTarget<string, string> | null;
  const setConvenienceRegion = useCallback(
    (
      region: "header" | "body" | "footer",
      target: Readonly<{
        key: string;
        transition: "preserve" | "crossfade" | "replace";
      }>,
    ) => {
      if (mode !== "convenience") return;
      setConvenienceRegions((current) =>
        current[region].key === target.key &&
        current[region].transition === target.transition
          ? current
          : { ...current, [region]: target },
      );
    },
    [mode],
  );
  const context = useMemo<InternalContext>(
    () => ({
      binding: erasedBinding,
      snapshot: erasedSnapshot,
      renderTarget,
      renderOpenTarget,
      mode,
      requestOpen: () => {
        controller.requestOpen("trigger");
      },
      requestClose: (reason) => {
        controller.requestClose(reason, {
          origin: reason === "close-button" ? "close-button" : "api",
        });
      },
      requestSnap: (snapPoint) => {
        const target = controller.getSnapshot().authoritativeTarget;
        if (target?.open !== true || !target.snapPoints.some((point) => point.id === snapPoint)) {
          throw new Error(`Unknown snap point: ${snapPoint}`);
        }
        controller.requestSnap(snapPoint as TSnap, { origin: "api" });
      },
      rootId,
      titlePresent,
      descriptionPresent,
      registerTitle,
      registerDescription,
      setConvenienceRegion,
    }),
    [
      controller,
      descriptionPresent,
      erasedBinding,
      erasedSnapshot,
      mode,
      renderOpenTarget,
      renderTarget,
      rootId,
      setConvenienceRegion,
      titlePresent,
    ],
  );

  return (
    <ShellSheetContext.Provider value={context}>
      {props.children}
    </ShellSheetContext.Provider>
  );
}

export type ShellSheetPartProps<State extends PartState = PartState> =
  Omit<
    HTMLAttributes<HTMLElement>,
    "children" | "className" | "style"
  > &
  Readonly<{
    children?: ReactNode;
    className?: ShellSheetClassName<State>;
    style?: ShellSheetStyle<State>;
    render?: ShellSheetRender<State>;
  }>;

type CommonPartProps<State extends PartState = PartState> =
  ShellSheetPartProps<State>;

export type ShellSheetEmptyState = Readonly<Record<string, never>>;
export type ShellSheetTriggerState = Readonly<{
  disabled: boolean;
  open: boolean;
}>;
export type ShellSheetBackdropState = Readonly<{
  open: boolean;
  transitionStatus: ShellSheetTransitionStatus;
}>;
export type ShellSheetViewportState = Readonly<{
  open: boolean;
  transitionStatus: ShellSheetTransitionStatus;
  nested: false;
  nestedDialogOpen: false;
  presentation: "sheet" | "dialog" | null;
  modality: "modal" | "non-modal" | null;
}>;
export type ShellSheetPresentationState = Readonly<{
  presentation: "sheet" | "dialog" | null;
  modality: "modal" | "non-modal" | null;
  fromPresentation: "sheet" | "dialog" | null;
  toPresentation: "sheet" | "dialog" | null;
  transitioning: boolean;
}>;
export type ShellSheetPopupState = Readonly<{
  open: boolean;
  transitionStatus: ShellSheetTransitionStatus;
  expanded: boolean;
  nested: false;
  nestedDrawerOpen: false;
  nestedDrawerSwiping: false;
  swipeDirection: "down";
  swiping: boolean;
}> &
  ShellSheetPresentationState;
export type ShellSheetCloseState = Readonly<{ disabled: boolean }>;
export type ShellSheetRegionState = Readonly<{
  open: boolean;
  transitionStatus: ShellSheetTransitionStatus;
  region: "header" | "body" | "footer";
  layer: "settled" | "outgoing" | "incoming";
  active: boolean;
}>;
export type ShellSheetHandleState = Readonly<{
  disabled: boolean;
  expanded: boolean;
  swiping: boolean;
}>;

export type ShellSheetTriggerProps = ButtonPartProps<ShellSheetTriggerState>;
export type ShellSheetBackdropProps = ShellSheetPartProps<ShellSheetBackdropState>;
export type ShellSheetViewportProps = ShellSheetPartProps<ShellSheetViewportState>;
export type ShellSheetPopupProps = ShellSheetPartProps<ShellSheetPopupState>;
export type ShellSheetContentProps = ShellSheetPartProps<ShellSheetEmptyState>;
export type ShellSheetCloseProps = ButtonPartProps<ShellSheetCloseState>;
export type ShellSheetTitleProps = ShellSheetPartProps<ShellSheetEmptyState>;
export type ShellSheetDescriptionProps = ShellSheetPartProps<ShellSheetEmptyState>;
export type ShellSheetDragAreaProps = ShellSheetPartProps<ShellSheetEmptyState>;
export type ShellSheetRegionProps = ShellSheetPartProps<ShellSheetRegionState> &
  Readonly<{
    transitionKey?: Key;
    transition?: "preserve" | "crossfade" | "replace";
  }>;
export type ShellSheetHandleProps = ButtonPartProps<ShellSheetHandleState>;
export type ShellSheetHeaderProps = ShellSheetRegionProps;
export type ShellSheetBodyProps = ShellSheetRegionProps;
export type ShellSheetFooterProps = ShellSheetRegionProps;

export type ShellSheetPortalProps = ShellSheetPartProps<ShellSheetEmptyState> &
  Readonly<{
    container?: Element | null;
    keepMounted?: boolean;
  }>;

export const ShellSheetPortal = forwardRef<HTMLDivElement, ShellSheetPortalProps>(
  function ShellSheetPortal(
    { children, container, keepMounted = false, ...hostProps },
    forwardedRef,
  ) {
    const { snapshot, renderTarget } = useShellSheet();
    const [mounted, setMounted] = useState(false);
    useEnhancedEffect(() => setMounted(true), []);
    const shouldRender =
      keepMounted ||
      snapshot.phase !== "closed" ||
      renderTarget?.open === true;
    if (!mounted || !shouldRender) return null;
    const target = container ?? document.body;
    return createPortal(
      <ShellSheetPortalHost {...hostProps} ref={forwardedRef}>
        {children}
      </ShellSheetPortalHost>,
      target,
    );
  },
);

const ShellSheetPortalHost = forwardRef<
  HTMLDivElement,
  ShellSheetPartProps<ShellSheetEmptyState>
>(
  function ShellSheetPortalHost(
    { children, className, style, render, ...elementProps },
    forwardedRef,
  ) {
    const ref = usePartRegistration("portal", forwardedRef);
    const state = Object.freeze({});
    return renderPart(
      "div",
      render,
      {
        ...elementProps,
        ref,
        className: resolveClassName(className, state),
        style: resolveStyle(style, state),
        children,
      },
      state,
    );
  },
);

type ButtonPartProps<State extends PartState> = CommonPartProps<State> &
  Readonly<{
    disabled?: boolean;
    nativeButton?: boolean;
    onClick?: (event: React.MouseEvent<HTMLElement>) => void;
  }>;

export const ShellSheetTrigger = forwardRef<HTMLElement, ShellSheetTriggerProps>(
  function ShellSheetTrigger(
    {
      children,
      className,
      style,
      render,
      disabled = false,
      nativeButton = true,
      onClick,
      onKeyDown,
      ...elementProps
    },
    forwardedRef,
  ) {
    const context = useShellSheet();
    const state: ShellSheetTriggerState = Object.freeze({
      disabled,
      open: context.renderTarget?.open === true,
    });
    const click = (event: React.MouseEvent<HTMLElement>) => {
      onClick?.(event);
      if (!event.defaultPrevented && !disabled) context.requestOpen();
    };
    const keyDown = (event: React.KeyboardEvent<HTMLElement>) => {
      onKeyDown?.(event);
      if (
        !event.defaultPrevented &&
        !nativeButton &&
        !disabled &&
        (event.key === "Enter" || event.key === " ")
      ) {
        event.preventDefault();
        event.currentTarget.click();
      }
    };
    return renderPart(
      "button",
      render,
      {
        ...elementProps,
        ref: forwardedRef,
        className: resolveClassName(className, state),
        style: resolveStyle(style, state),
        children,
        onClick: click,
        onKeyDown: keyDown,
        ...(nativeButton
          ? { type: "button", disabled }
          : { role: "button", tabIndex: disabled ? -1 : 0, "aria-disabled": disabled }),
      },
      state,
    );
  },
);

const snapshotTransitionStatus = (
  snapshot: ShellSheetSnapshot<string, string>,
): ShellSheetTransitionStatus =>
  snapshot.phase === "opening"
    ? "starting"
    : snapshot.phase === "closing"
      ? "ending"
      : undefined;

const createRegisteredPart = <State extends PartState>(
  name: "backdrop" | "viewport" | "popup" | "content",
  getState: (context: InternalContext) => State,
) =>
  forwardRef<HTMLElement, ShellSheetPartProps<State>>(function RegisteredPart(
    { children, className, style, render, ...elementProps },
    forwardedRef,
  ) {
    const context = useShellSheet();
    const ref = usePartRegistration(name, forwardedRef);
    const state = getState(context);
    const aria = name === "popup"
      ? {
          role: "dialog",
          ...(context.titlePresent
            ? { "aria-labelledby": `${context.rootId}-title` }
            : {}),
          ...(context.descriptionPresent
            ? { "aria-describedby": `${context.rootId}-description` }
            : {}),
        }
      : {};
    return renderPart(
      "div",
      render,
      {
        ...elementProps,
        ref,
        className: resolveClassName(className, state),
        style: resolveStyle(style, state),
        children,
        ...aria,
      },
      state,
    );
  });

const visualTargetFromContext = (context: InternalContext) =>
  context.renderOpenTarget;

export const ShellSheetBackdrop = createRegisteredPart<ShellSheetBackdropState>(
  "backdrop",
  (context) =>
    Object.freeze({
      open: context.renderTarget?.open === true,
      transitionStatus: snapshotTransitionStatus(context.snapshot),
    }),
);
export const ShellSheetViewport = createRegisteredPart<ShellSheetViewportState>(
  "viewport",
  (context) => {
    const target = visualTargetFromContext(context);
    return Object.freeze({
      open: context.renderTarget?.open === true,
      transitionStatus: snapshotTransitionStatus(context.snapshot),
      nested: false,
      nestedDialogOpen: false,
      presentation: target?.presentation ?? null,
      modality: target?.modality ?? null,
    });
  },
);
export const ShellSheetPopup = createRegisteredPart<ShellSheetPopupState>(
  "popup",
  (context) => {
    const target = visualTargetFromContext(context);
    const authoritative = context.renderTarget;
    const settled = context.snapshot.settledTarget;
    const morphing =
      context.snapshot.phase === "transitioning" &&
      authoritative?.open === true &&
      settled !== null &&
      authoritative.presentation !== settled.presentation;
    return Object.freeze({
      open: authoritative?.open === true,
      transitionStatus: snapshotTransitionStatus(context.snapshot),
      expanded:
        target?.snapPoint === target?.snapPoints.at(-1)?.id,
      nested: false,
      nestedDrawerOpen: false,
      nestedDrawerSwiping: false,
      swipeDirection: "down",
      swiping: context.snapshot.phase === "dragging",
      presentation: target?.presentation ?? null,
      modality: target?.modality ?? null,
      fromPresentation: morphing ? settled.presentation : null,
      toPresentation: morphing ? authoritative.presentation : null,
      transitioning: morphing,
    });
  },
);
export const ShellSheetContent = createRegisteredPart<ShellSheetEmptyState>(
  "content",
  () => Object.freeze({}),
);

type RegionProps = ShellSheetRegionProps;

type RegionLayer = Readonly<{ key: string; node: ReactNode }>;

const useRegionLayers = (
  region: "header" | "body" | "footer",
  children: ReactNode,
  convenienceKey: Key | undefined,
  convenienceTransition: "preserve" | "crossfade" | "replace" | undefined,
) => {
  const context = useShellSheet();
  if (
    context.mode !== "convenience" &&
    (convenienceKey !== undefined || convenienceTransition !== undefined)
  ) {
    throw new Error(
      `ShellSheet ${region} transitionKey/transition props are available only in convenience mode.`,
    );
  }
  const target = context.renderOpenTarget;
  const targetRegion = target?.regions[region];
  const key = context.mode === "convenience"
    ? String(convenienceKey ?? targetRegion?.key ?? `shell-sheet:${region}`)
    : String(targetRegion?.key ?? `shell-sheet:${region}`);
  const transition = convenienceTransition ?? targetRegion?.transition ?? "preserve";
  const [current, setCurrent] = useState<RegionLayer>(() => ({ key, node: children }));
  const [outgoing, setOutgoing] = useState<RegionLayer | null>(null);
  const latestCurrentRef = useRef<RegionLayer>(current);
  const freezeForClose =
    context.renderTarget?.open === false &&
    context.snapshot.settledTarget !== null;
  if (current.key === key && !freezeForClose) {
    latestCurrentRef.current = { key, node: children };
  }

  useEnhancedEffect(() => {
    context.setConvenienceRegion(region, { key, transition });
  }, [context, key, region, transition]);

  useEnhancedEffect(() => {
    if (freezeForClose) return;
    if (
      context.snapshot.phase === "closed" &&
      context.renderTarget?.open === false
    ) {
      if (outgoing) setOutgoing(null);
      if (current.key !== key) setCurrent({ key, node: children });
      return;
    }
    if (current.key === key) return;
    setOutgoing(latestCurrentRef.current);
    setCurrent({ key, node: children });
  }, [children, context.renderTarget, context.snapshot.phase, current.key, freezeForClose, key, outgoing]);

  useEnhancedEffect(() => {
    const settledKey = context.snapshot.settledTarget?.regions[region].key;
    if (settledKey === current.key && outgoing) setOutgoing(null);
  }, [context.snapshot.settledTarget, current.key, outgoing, region]);

  const renderedCurrent =
    current.key === key && !freezeForClose
      ? { key, node: children }
      : current;
  return { context, current: renderedCurrent, outgoing };
};

const RegionLayerView = ({
  region,
  layer,
  identity,
  children,
}: {
  region: "header" | "body" | "footer";
  layer: "settled" | "outgoing" | "incoming";
  identity: string;
  children: ReactNode;
}) => {
  const { binding } = useShellSheet();
  const cleanupRef = useRef<(() => void) | null>(null);
  const ref = useCallback(
    (element: HTMLDivElement | null) => {
      cleanupRef.current?.();
      cleanupRef.current = null;
      if (element && binding) {
        cleanupRef.current = binding.registerRegionLayer(
          region,
          { key: identity, layer },
          element,
        );
      }
    },
    [binding, identity, layer, region],
  );
  const active = layer !== "outgoing";
  const idSuffix = useId().replaceAll(":", "");
  return (
    <ShellSheetRegionLayerContext.Provider value={{ active, idSuffix }}>
      <div
        ref={ref}
        data-region={region}
        data-layer={layer}
        data-active={active ? "" : undefined}
        data-starting-style={layer === "incoming" ? "" : undefined}
        data-ending-style={layer === "outgoing" ? "" : undefined}
        aria-hidden={active ? undefined : true}
      >
        {children}
      </div>
    </ShellSheetRegionLayerContext.Provider>
  );
};

const RegionTransitionSurface = ({
  region,
}: {
  region: "header" | "body" | "footer";
}) => {
  const { binding } = useShellSheet();
  const cleanupRef = useRef<(() => void) | null>(null);
  const ref = useCallback(
    (element: HTMLDivElement | null) => {
      cleanupRef.current?.();
      cleanupRef.current = null;
      if (element && binding) {
        cleanupRef.current = binding.registerRegionTransitionSurface(
          region,
          element,
        );
      }
    },
    [binding, region],
  );

  return (
    <div
      ref={ref}
      data-region-blur={region}
      aria-hidden="true"
    />
  );
};

const createRegion = (region: "body" | "footer") =>
  forwardRef<HTMLDivElement, RegionProps>(function Region(
    {
      children,
      transitionKey,
      transition,
      className,
      style,
      render,
      ...elementProps
    },
    forwardedRef,
  ) {
    const { binding } = useShellSheet();
    const layers = useRegionLayers(region, children, transitionKey, transition);
    const cleanupRef = useRef<(() => void) | null>(null);
    const ref = useCallback((element: HTMLDivElement | null) => {
      cleanupRef.current?.();
      cleanupRef.current = null;
      assignRef(forwardedRef, element);
      if (element && binding) cleanupRef.current = binding.registerPart(region, element);
    }, [binding, forwardedRef]);
    const state: ShellSheetRegionState = Object.freeze({
      region,
      open: layers.context.renderTarget?.open === true,
      transitionStatus: snapshotTransitionStatus(layers.context.snapshot),
      layer: layers.outgoing ? "incoming" : "settled",
      active: true,
    });
    return renderPart(
      "div",
      render,
      {
        ...elementProps,
        ref,
        className: resolveClassName(className, state),
        style: resolveStyle(style, state),
        children: (
          <>
            {layers.outgoing ? (
              <RegionLayerView region={region} layer="outgoing" identity={layers.outgoing.key}>
                {layers.outgoing.node}
              </RegionLayerView>
            ) : null}
            <RegionLayerView
              region={region}
              layer={layers.outgoing ? "incoming" : "settled"}
              identity={layers.current.key}
            >
              {layers.current.node}
            </RegionLayerView>
            <RegionTransitionSurface region={region} />
          </>
        ),
      },
      state,
    );
  });

export const ShellSheetBody = createRegion("body");
export const ShellSheetFooter = createRegion("footer");

export const ShellSheetHandle = forwardRef<HTMLElement, ShellSheetHandleProps>(
  function ShellSheetHandle(
    {
      children,
      className,
      style,
      render,
      disabled = false,
      nativeButton = true,
      onKeyDown,
      ...elementProps
    },
    forwardedRef,
  ) {
    const context = useShellSheet();
    const target = context.renderOpenTarget;
    const ref = usePartRegistration("handle", forwardedRef);
    if (!target?.draggable) return null;
    const expanded = target.snapPoint === target.snapPoints.at(-1)?.id;
    const state: ShellSheetHandleState = Object.freeze({
      disabled,
      expanded,
      swiping: context.snapshot.phase === "dragging",
    });
    const keyDown = (event: React.KeyboardEvent<HTMLElement>) => {
      onKeyDown?.(event);
      if (
        !event.defaultPrevented &&
        !nativeButton &&
        !disabled &&
        (event.key === "Enter" || event.key === " ")
      ) {
        event.preventDefault();
        event.currentTarget.click();
      }
    };
    return renderPart(
      "button",
      render,
      {
        ...elementProps,
        ref,
        className: resolveClassName(className, state),
        style: resolveStyle(style, state),
        children,
        onKeyDown: keyDown,
        "aria-expanded": expanded,
        "aria-label": expanded ? "Collapse sheet" : "Expand sheet",
        ...(nativeButton
          ? { type: "button", disabled }
          : { role: "button", tabIndex: disabled ? -1 : 0, "aria-disabled": disabled }),
      },
      state,
    );
  },
);

export const ShellSheetHeader = forwardRef<HTMLDivElement, RegionProps>(
  function ShellSheetHeader(
    {
      children,
      transitionKey,
      transition,
      className,
      style,
      render,
      ...elementProps
    },
    forwardedRef,
  ) {
    const { binding } = useShellSheet();
    const directChildren = Children.toArray(children);
    const handleChildren = directChildren.filter(
      (child) => isValidElement(child) && child.type === ShellSheetHandle,
    );
    const contentChildren = directChildren.filter(
      (child) => !(isValidElement(child) && child.type === ShellSheetHandle),
    );
    const layers = useRegionLayers(
      "header",
      contentChildren,
      transitionKey,
      transition,
    );
    const cleanupRef = useRef<(() => void) | null>(null);
    const ref = useCallback((element: HTMLDivElement | null) => {
      cleanupRef.current?.();
      cleanupRef.current = null;
      assignRef(forwardedRef, element);
      if (element && binding) cleanupRef.current = binding.registerPart("header", element);
    }, [binding, forwardedRef]);
    const state: ShellSheetRegionState = Object.freeze({
      region: "header",
      open: layers.context.renderTarget?.open === true,
      transitionStatus: snapshotTransitionStatus(layers.context.snapshot),
      layer: layers.outgoing ? "incoming" : "settled",
      active: true,
    });
    return renderPart(
      "div",
      render,
      {
        ...elementProps,
        ref,
        className: resolveClassName(className, state),
        style: resolveStyle(style, state),
        children: (
          <>
            {handleChildren}
            {layers.outgoing ? (
              <RegionLayerView region="header" layer="outgoing" identity={layers.outgoing.key}>
                {layers.outgoing.node}
              </RegionLayerView>
            ) : null}
            <RegionLayerView
              region="header"
              layer={layers.outgoing ? "incoming" : "settled"}
              identity={layers.current.key}
            >
              {layers.current.node}
            </RegionLayerView>
            <RegionTransitionSurface region="header" />
          </>
        ),
      },
      state,
    );
  },
);

export const ShellSheetDragArea = forwardRef<HTMLDivElement, ShellSheetDragAreaProps>(
  function ShellSheetDragArea(
    { children, className, style, render, ...elementProps },
    forwardedRef,
  ) {
    const { binding } = useShellSheet();
    const cleanupRef = useRef<(() => void) | null>(null);
    const ref = useCallback((element: HTMLDivElement | null) => {
      cleanupRef.current?.();
      cleanupRef.current = null;
      assignRef(forwardedRef, element);
      if (element && binding) cleanupRef.current = binding.registerDragArea(element);
    }, [binding, forwardedRef]);
    const state = Object.freeze({});
    return renderPart("div", render, {
      ...elementProps,
      ref,
      className: resolveClassName(className, state),
      style: resolveStyle(style, state),
      children,
    }, state);
  },
);

export const ShellSheetClose = forwardRef<HTMLElement, ShellSheetCloseProps>(
  function ShellSheetClose(
    {
      children,
      className,
      style,
      render,
      disabled = false,
      nativeButton = true,
      onClick,
      onKeyDown,
      ...elementProps
    },
    forwardedRef,
  ) {
    const { requestClose } = useShellSheet();
    const state: ShellSheetCloseState = Object.freeze({ disabled });
    const click = (event: React.MouseEvent<HTMLElement>) => {
      onClick?.(event);
      if (!event.defaultPrevented && !disabled) requestClose("close-button");
    };
    const keyDown = (event: React.KeyboardEvent<HTMLElement>) => {
      onKeyDown?.(event);
      if (
        !event.defaultPrevented &&
        !nativeButton &&
        !disabled &&
        (event.key === "Enter" || event.key === " ")
      ) {
        event.preventDefault();
        event.currentTarget.click();
      }
    };
    return renderPart("button", render, {
      ...elementProps,
      ref: forwardedRef,
      className: resolveClassName(className, state),
      style: resolveStyle(style, state),
      children,
      onClick: click,
      onKeyDown: keyDown,
      ...(nativeButton
        ? { type: "button", disabled }
        : { role: "button", tabIndex: disabled ? -1 : 0, "aria-disabled": disabled }),
    }, state);
  },
);

const createSemanticPart = (kind: "title" | "description") =>
  forwardRef<HTMLElement, ShellSheetPartProps<ShellSheetEmptyState>>(function SemanticPart(
    { children, className, style, render, ...elementProps },
    forwardedRef,
  ) {
    const context = useShellSheet();
    const layer = useContext(ShellSheetRegionLayerContext);
    const register =
      kind === "title" ? context.registerTitle : context.registerDescription;
    useEnhancedEffect(() => register(), [register]);
    const state = Object.freeze({});
    return renderPart(kind === "title" ? "h2" : "p", render, {
      ...elementProps,
      ref: forwardedRef,
      id:
        layer && !layer.active
          ? `${context.rootId}-${kind}-${layer.idSuffix}`
          : `${context.rootId}-${kind}`,
      className: resolveClassName(className, state),
      style: resolveStyle(style, state),
      children,
    }, state);
  });

export const ShellSheetTitle = createSemanticPart("title");
export const ShellSheetDescription = createSemanticPart("description");

export const ShellSheet = Object.freeze({
  Root: ShellSheetRoot,
  Trigger: ShellSheetTrigger,
  Portal: ShellSheetPortal,
  Backdrop: ShellSheetBackdrop,
  Viewport: ShellSheetViewport,
  Popup: ShellSheetPopup,
  Content: ShellSheetContent,
  Header: ShellSheetHeader,
  Body: ShellSheetBody,
  Footer: ShellSheetFooter,
  Handle: ShellSheetHandle,
  DragArea: ShellSheetDragArea,
  Title: ShellSheetTitle,
  Description: ShellSheetDescription,
  Close: ShellSheetClose,
});

export namespace ShellSheet {
  export namespace Root {
    export type Props<
      TSnap extends string = string,
      TRegionKey extends string = string,
    > = ShellSheetRootProps<TSnap, TRegionKey>;
  }
  export namespace Trigger {
    export type Props = ShellSheetTriggerProps;
    export type State = ShellSheetTriggerState;
  }
  export namespace Portal {
    export type Props = ShellSheetPortalProps;
    export type State = ShellSheetEmptyState;
  }
  export namespace Backdrop {
    export type Props = ShellSheetBackdropProps;
    export type State = ShellSheetBackdropState;
  }
  export namespace Viewport {
    export type Props = ShellSheetViewportProps;
    export type State = ShellSheetViewportState;
  }
  export namespace Popup {
    export type Props = ShellSheetPopupProps;
    export type State = ShellSheetPopupState;
  }
  export namespace Content {
    export type Props = ShellSheetContentProps;
    export type State = ShellSheetEmptyState;
  }
  export namespace Header {
    export type Props = ShellSheetHeaderProps;
    export type State = ShellSheetRegionState;
  }
  export namespace Body {
    export type Props = ShellSheetBodyProps;
    export type State = ShellSheetRegionState;
  }
  export namespace Footer {
    export type Props = ShellSheetFooterProps;
    export type State = ShellSheetRegionState;
  }
  export namespace Handle {
    export type Props = ShellSheetHandleProps;
    export type State = ShellSheetHandleState;
  }
  export namespace DragArea {
    export type Props = ShellSheetDragAreaProps;
    export type State = ShellSheetEmptyState;
  }
  export namespace Title {
    export type Props = ShellSheetTitleProps;
    export type State = ShellSheetEmptyState;
  }
  export namespace Description {
    export type Props = ShellSheetDescriptionProps;
    export type State = ShellSheetEmptyState;
  }
  export namespace Close {
    export type Props = ShellSheetCloseProps;
    export type State = ShellSheetCloseState;
  }
}
