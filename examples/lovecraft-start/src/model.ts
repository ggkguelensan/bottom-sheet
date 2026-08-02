import {
  createEffect,
  createEvent,
  createStore,
  sample,
} from "effector";
import {
  type ShellSheetFact,
  type ShellSheetOpenTarget,
  type ShellSheetRequest,
  type ShellSheetTarget,
  type ShellTransitionIntent,
} from "@shell-sheet/core";
import { createShellSheetBinding } from "@shell-sheet/effector";
import type { LocationId } from "./locations.js";

export type DemoSnapPoint = "peek" | "content" | "expanded";
export type DemoPresentation = "sheet" | "dialog";
export type DemoDirection = "forward" | "backward" | "none" | "snap";

type DemoCommon = Readonly<{
  revision: number;
  presentation: DemoPresentation;
  preferredPresentation: DemoPresentation;
  direction: DemoDirection;
  motion: "auto" | "instant";
  cause: ShellTransitionIntent["cause"];
  causeRequestId: number | undefined;
}>;

export type ArkhamBContext = Readonly<{
  snapPoint: "content" | "expanded";
  evidenceCount: number;
}>;

export type DemoState =
  | (DemoCommon & Readonly<{ kind: "closed"; uiContext: Readonly<Record<string, never>> }>)
  | (DemoCommon & Readonly<{
      kind: "location.info";
      uiContext: Readonly<{ locationId: LocationId }>;
    }>)
  | (DemoCommon & Readonly<{
      kind: "arkham.a";
      uiContext: Readonly<{ archiveWing: "east" }>;
    }>)
  | (DemoCommon & Readonly<{
      kind: "arkham.b";
      uiContext: ArkhamBContext;
    }>)
  | (DemoCommon & Readonly<{
      kind: "arkham.c.loading";
      uiContext: Readonly<{
        token: number;
        returnTo: ArkhamBContext;
        expected: "success" | "fail";
      }>;
    }>)
  | (DemoCommon & Readonly<{
      kind: "arkham.c.success";
      uiContext: Readonly<{
        returnTo: ArkhamBContext;
        report: ArchiveReport;
      }>;
    }>)
  | (DemoCommon & Readonly<{
      kind: "arkham.c.fail";
      uiContext: Readonly<{
        returnTo: ArkhamBContext;
        message: string;
      }>;
    }>)
  | (DemoCommon & Readonly<{
      kind: "innsmouth";
      uiContext: Readonly<{ snapPoint: "peek" | "expanded" }>;
    }>)
  | (DemoCommon & Readonly<{
      kind: "dunwich";
      uiContext: Readonly<{ locationId: "dunwich" }>;
    }>)
  | (DemoCommon & Readonly<{
      kind: "antarctica";
      uiContext: Readonly<{ snapPoint: "content" | "expanded" }>;
    }>)
  | (DemoCommon & Readonly<{
      kind: "dreamlands";
      uiContext: Readonly<{ snapPoint: "peek" | "expanded" }>;
    }>);

export type ArchiveReport = Readonly<{
  title: string;
  entries: readonly string[];
}>;

export type ArchiveLoad = Readonly<{
  token: number;
  expected: "success" | "fail";
  signal: AbortSignal;
}>;

export type ArchiveLoader = (operation: ArchiveLoad) => Promise<ArchiveReport>;

const snapPoints = [
  { id: "peek", size: { type: "pixels", value: 300 } },
  { id: "content", size: { type: "content", maxRatio: 0.84 } },
  { id: "expanded", size: { type: "ratio", value: 0.94 } },
] as const satisfies ShellSheetOpenTarget<DemoSnapPoint, string>["snapPoints"];

const initialState: DemoState = {
  kind: "closed",
  uiContext: {},
  revision: 0,
  presentation: "sheet",
  preferredPresentation: "dialog",
  direction: "none",
  motion: "instant",
  cause: "hydrate",
  causeRequestId: undefined,
};

const nextCommon = (
  state: DemoState,
  patch: Partial<Omit<DemoCommon, "revision">> = {},
): DemoCommon => ({
  revision: state.revision + 1,
  presentation: patch.presentation ?? state.presentation,
  preferredPresentation:
    patch.preferredPresentation ?? state.preferredPresentation,
  direction: patch.direction ?? "forward",
  motion: patch.motion ?? "auto",
  cause: patch.cause ?? "navigate",
  causeRequestId: patch.causeRequestId,
});

const transitionDirection = (
  direction: DemoDirection,
): ShellTransitionIntent["direction"] =>
  direction === "none" ? "none" : direction;

const snapForState = (state: Exclude<DemoState, { kind: "closed" }>): DemoSnapPoint => {
  switch (state.kind) {
    case "location.info":
    case "arkham.a":
    case "arkham.c.loading":
    case "arkham.c.fail":
      return "content";
    case "arkham.b":
      return state.uiContext.snapPoint;
    case "arkham.c.success":
    case "dunwich":
      return "expanded";
    case "innsmouth":
    case "dreamlands":
      return state.uiContext.snapPoint;
    case "antarctica":
      return state.uiContext.snapPoint;
  }
};

const headerKey = (state: Exclude<DemoState, { kind: "closed" }>): string => {
  switch (state.kind) {
    case "location.info":
      return `location:${state.uiContext.locationId}`;
    case "arkham.a":
    case "arkham.b":
    case "arkham.c.loading":
    case "arkham.c.success":
    case "arkham.c.fail":
      return "arkham:archive";
    case "innsmouth":
    case "dunwich":
    case "antarctica":
    case "dreamlands":
      return state.kind;
  }
};

const bodyKey = (state: Exclude<DemoState, { kind: "closed" }>): string => {
  switch (state.kind) {
    case "location.info":
      return `location:${state.uiContext.locationId}:summary`;
    case "arkham.a":
      return "arkham:a";
    case "arkham.b":
      return `arkham:b:${state.uiContext.snapPoint}`;
    case "arkham.c.loading":
      return `arkham:c:loading:${state.uiContext.token}`;
    case "arkham.c.success":
      return "arkham:c:success";
    case "arkham.c.fail":
      return "arkham:c:fail";
    case "innsmouth":
    case "antarctica":
    case "dreamlands":
      return `${state.kind}:${state.uiContext.snapPoint}`;
    case "dunwich":
      return "dunwich:report";
  }
};

const footerKey = (state: Exclude<DemoState, { kind: "closed" }>): string => {
  switch (state.kind) {
    case "location.info":
      return "location:actions";
    case "arkham.a":
      return "arkham:a:actions";
    case "arkham.b":
      return "arkham:b:actions";
    case "arkham.c.loading":
      return "arkham:loading:actions";
    case "arkham.c.success":
      return "arkham:success:actions";
    case "arkham.c.fail":
      return "arkham:fail:actions";
    case "innsmouth":
    case "dunwich":
    case "antarctica":
    case "dreamlands":
      return `${state.kind}:actions`;
  }
};

export const projectShellTarget = (
  state: DemoState,
): ShellSheetTarget<DemoSnapPoint, string> => {
  const base = {
    targetId: `lovecraft:${state.revision}:${state.kind}`,
    transition: {
      cause: state.cause,
      direction: transitionDirection(state.direction),
      motion: state.motion,
    },
    ...(state.causeRequestId === undefined
      ? {}
      : { causeRequestId: state.causeRequestId }),
  } as const;
  if (state.kind === "closed") return { ...base, open: false };

  const draggable =
    state.kind === "innsmouth" ||
    state.kind === "antarctica" ||
    state.kind === "dreamlands";
  return {
    ...base,
    open: true,
    snapPoints,
    snapPoint: snapForState(state),
    presentation: state.presentation,
    modality: state.presentation === "dialog" ? "modal" : "non-modal",
    draggable,
    contentResizeBehavior: "animate",
    regions: {
      header: { key: headerKey(state), transition: "crossfade" },
      body: { key: bodyKey(state), transition: "crossfade" },
      footer: { key: footerKey(state), transition: "crossfade" },
    },
  };
};

export function createLovecraftDemoModel(loader: ArchiveLoader) {
  const stateReplaced = createEvent<DemoState>("lovecraft.stateReplaced");
  const locationSelected = createEvent<LocationId>("lovecraft.locationSelected");
  const entranceOpened = createEvent<LocationId>("lovecraft.entranceOpened");
  const nextRequested = createEvent<void>("lovecraft.nextRequested");
  const backRequested = createEvent<void>("lovecraft.backRequested");
  const exitRequested = createEvent<void>("lovecraft.exitRequested");
  const archiveRequested = createEvent<"success" | "fail">(
    "lovecraft.archiveRequested",
  );
  const presentationChanged = createEvent<DemoPresentation>(
    "lovecraft.presentationChanged",
  );
  const responsivePresentationResolved = createEvent<Readonly<{
    mobile: boolean;
    initial: boolean;
  }>>("lovecraft.responsivePresentationResolved");
  const snapRequested = createEvent<Readonly<{
    snapPoint: DemoSnapPoint;
    causeRequestId?: number;
  }>>("lovecraft.snapRequested");
  const closeRequested = createEvent<number | undefined>(
    "lovecraft.closeRequested",
  );
  const operationStarted = createEvent<Readonly<{
    token: number;
    expected: "success" | "fail";
    returnTo: ArkhamBContext;
  }>>("lovecraft.operationStarted");

  const $state = createStore<DemoState>(initialState, {
    name: "lovecraft.$state",
  }).on(stateReplaced, (_, state) => state);
  const $shellTarget = $state.map(projectShellTarget);

  const controllers = new Map<number, AbortController>();
  const loadArchiveFx = createEffect<
    Readonly<{ token: number; expected: "success" | "fail" }>,
    Readonly<{ token: number; report: ArchiveReport }>,
    Error
  >({
    name: "lovecraft.loadArchiveFx",
    async handler({ token, expected }) {
      const controller = new AbortController();
      controllers.set(token, controller);
      try {
        const report = await loader({
          token,
          expected,
          signal: controller.signal,
        });
        return { token, report };
      } finally {
        if (controllers.get(token) === controller) controllers.delete(token);
      }
    },
  });
  const cancelArchiveFx = createEffect<number, void>({
    name: "lovecraft.cancelArchiveFx",
    handler(token) {
      controllers.get(token)?.abort();
      controllers.delete(token);
    },
  });

  let operationSequence = 0;

  sample({
    clock: locationSelected,
    source: $state,
    fn: (state, locationId): DemoState => ({
      ...nextCommon(state, {
        presentation: "sheet",
        direction: "none",
        cause: "open",
      }),
      kind: "location.info",
      uiContext: { locationId },
    }),
    target: stateReplaced,
  });

  sample({
    clock: entranceOpened,
    source: $state,
    fn: (state, locationId): DemoState => {
      const presentation =
        locationId === "arkham" || locationId === "dunwich"
          ? state.preferredPresentation
          : "sheet";
      const common = nextCommon(state, {
        presentation,
        direction: "forward",
        cause: "navigate",
      });
      switch (locationId) {
        case "arkham":
          return { ...common, kind: "arkham.a", uiContext: { archiveWing: "east" } };
        case "innsmouth":
          return { ...common, kind: "innsmouth", uiContext: { snapPoint: "peek" } };
        case "dunwich":
          return { ...common, kind: "dunwich", uiContext: { locationId: "dunwich" } };
        case "antarctica":
          return { ...common, kind: "antarctica", uiContext: { snapPoint: "content" } };
        case "dreamlands":
          return { ...common, kind: "dreamlands", uiContext: { snapPoint: "peek" } };
      }
    },
    target: stateReplaced,
  });

  sample({
    clock: nextRequested,
    source: $state,
    filter: (state): state is Extract<DemoState, { kind: "arkham.a" }> =>
      state.kind === "arkham.a",
    fn: (state): DemoState => ({
      ...nextCommon(state),
      kind: "arkham.b",
      uiContext: { snapPoint: "content", evidenceCount: 3 },
    }),
    target: stateReplaced,
  });

  sample({
    clock: archiveRequested,
    source: $state,
    filter: (state): state is
      | Extract<DemoState, { kind: "arkham.b" }>
      | Extract<DemoState, { kind: "arkham.c.fail" }> =>
      state.kind === "arkham.b" || state.kind === "arkham.c.fail",
    fn: (state, expected) => {
      if (state.kind !== "arkham.b" && state.kind !== "arkham.c.fail") {
        throw new Error("Archive can only start from Arkham B or its failure state.");
      }
      return {
        token: ++operationSequence,
        expected,
        returnTo:
          state.kind === "arkham.b" ? state.uiContext : state.uiContext.returnTo,
      };
    },
    target: operationStarted,
  });

  sample({
    clock: operationStarted,
    source: $state,
    fn: (state, operation): DemoState => ({
      ...nextCommon(state),
      kind: "arkham.c.loading",
      uiContext: operation,
    }),
    target: stateReplaced,
  });
  sample({
    clock: operationStarted,
    fn: ({ token, expected }) => ({ token, expected }),
    target: loadArchiveFx,
  });

  sample({
    clock: loadArchiveFx.done,
    source: $state,
    filter: (state, { params }): state is Extract<
      DemoState,
      { kind: "arkham.c.loading" }
    > =>
      state.kind === "arkham.c.loading" &&
      state.uiContext.token === params.token,
    fn: (state, { result }): DemoState => {
      if (state.kind !== "arkham.c.loading") {
        throw new Error("Only the current loading state can accept archive success.");
      }
      return {
        ...nextCommon(state),
        kind: "arkham.c.success",
        uiContext: {
          returnTo: state.uiContext.returnTo,
          report: result.report,
        },
      };
    },
    target: stateReplaced,
  });
  sample({
    clock: loadArchiveFx.fail,
    source: $state,
    filter: (state, { params, error }): state is Extract<
      DemoState,
      { kind: "arkham.c.loading" }
    > =>
      state.kind === "arkham.c.loading" &&
      state.uiContext.token === params.token &&
      error.name !== "AbortError",
    fn: (state, { error }): DemoState => {
      if (state.kind !== "arkham.c.loading") {
        throw new Error("Only the current loading state can accept archive failure.");
      }
      return {
        ...nextCommon(state),
        kind: "arkham.c.fail",
        uiContext: {
          returnTo: state.uiContext.returnTo,
          message: error.message,
        },
      };
    },
    target: stateReplaced,
  });

  sample({
    clock: [
      backRequested,
      exitRequested,
      closeRequested,
      locationSelected,
      entranceOpened,
    ],
    source: $state,
    filter: (state): state is Extract<
      DemoState,
      { kind: "arkham.c.loading" }
    > => state.kind === "arkham.c.loading",
    fn: (state) => {
      if (state.kind !== "arkham.c.loading") {
        throw new Error("Only a loading operation can be cancelled.");
      }
      return state.uiContext.token;
    },
    target: cancelArchiveFx,
  });
  sample({
    clock: backRequested,
    source: $state,
    filter: (state) => state.kind.startsWith("arkham."),
    fn: (state): DemoState => {
      const common = nextCommon(state, { direction: "backward" });
      switch (state.kind) {
        case "arkham.b":
          return { ...common, kind: "arkham.a", uiContext: { archiveWing: "east" } };
        case "arkham.c.loading":
        case "arkham.c.success":
        case "arkham.c.fail":
          return { ...common, kind: "arkham.b", uiContext: state.uiContext.returnTo };
        case "arkham.a":
          return state;
        default:
          return state;
      }
    },
    target: stateReplaced,
  });

  sample({
    clock: snapRequested,
    source: $state,
    filter: (state) =>
      state.kind === "arkham.b" ||
      state.kind === "innsmouth" ||
      state.kind === "antarctica" ||
      state.kind === "dreamlands",
    fn: (state, request): DemoState => {
      const common = nextCommon(state, {
        direction: "snap",
        cause: "snap",
        causeRequestId: request.causeRequestId,
      });
      switch (state.kind) {
        case "arkham.b":
          return request.snapPoint === "content" || request.snapPoint === "expanded"
            ? { ...common, kind: "arkham.b", uiContext: { ...state.uiContext, snapPoint: request.snapPoint } }
            : state;
        case "innsmouth":
          return request.snapPoint === "peek" || request.snapPoint === "expanded"
            ? { ...common, kind: "innsmouth", uiContext: { snapPoint: request.snapPoint } }
            : state;
        case "antarctica":
          return request.snapPoint === "content" || request.snapPoint === "expanded"
            ? { ...common, kind: "antarctica", uiContext: { snapPoint: request.snapPoint } }
            : state;
        case "dreamlands":
          return request.snapPoint === "peek" || request.snapPoint === "expanded"
            ? { ...common, kind: "dreamlands", uiContext: { snapPoint: request.snapPoint } }
            : state;
        default:
          return state;
      }
    },
    target: stateReplaced,
  });

  const closeFromState = (state: DemoState, causeRequestId?: number): DemoState => ({
    ...nextCommon(state, {
      direction: "none",
      cause: "close",
      causeRequestId,
    }),
    kind: "closed",
    uiContext: {},
  });
  sample({
    clock: exitRequested,
    source: $state,
    fn: (state) => closeFromState(state),
    target: stateReplaced,
  });
  sample({
    clock: closeRequested,
    source: $state,
    fn: (state, requestId) => closeFromState(state, requestId),
    target: stateReplaced,
  });

  sample({
    clock: presentationChanged,
    source: $state,
    fn: (state, presentation): DemoState => ({
      ...state,
      ...nextCommon(state, {
        presentation,
        preferredPresentation: presentation,
        direction: "none",
        cause: "presentation",
      }),
    }),
    target: stateReplaced,
  });
  sample({
    clock: responsivePresentationResolved,
    source: $state,
    fn: (state, resolution): DemoState => ({
      ...state,
      ...nextCommon(state, {
        presentation: resolution.mobile ? "sheet" : state.preferredPresentation,
        direction: "none",
        cause: "presentation",
        motion: resolution.initial ? "instant" : "auto",
      }),
    }),
    target: stateReplaced,
  });

  const requestReceived = createEvent<ShellSheetRequest<DemoSnapPoint>>(
    "lovecraft.requestReceived",
  );
  const visualFactReceived = createEvent<ShellSheetFact<DemoSnapPoint, string>>(
    "lovecraft.visualFactReceived",
  );
  const sheet = createShellSheetBinding({
    $target: $shellTarget,
    requestReceived,
    visualFactReceived,
  });
  sample({
    clock: requestReceived,
    filter: (request): request is Extract<
      ShellSheetRequest<DemoSnapPoint>,
      { type: "snap-requested" }
    > => request.type === "snap-requested",
    fn: (request) => {
      if (request.type !== "snap-requested") {
        throw new Error("Only snap requests can reach the snap projection.");
      }
      return {
        snapPoint: request.snapPoint,
        causeRequestId: request.requestId,
      };
    },
    target: snapRequested,
  });
  sample({
    clock: requestReceived,
    filter: (request): request is Extract<
      ShellSheetRequest<DemoSnapPoint>,
      { type: "close-requested" }
    > => request.type === "close-requested",
    fn: (request) => request.requestId,
    target: closeRequested,
  });

  return {
    sheet,
    $state,
    $shellTarget,
    requestReceived,
    visualFactReceived,
    locationSelected,
    entranceOpened,
    nextRequested,
    backRequested,
    exitRequested,
    archiveRequested,
    presentationChanged,
    responsivePresentationResolved,
    snapRequested,
    effects: {
      loadArchiveFx,
      cancelArchiveFx,
    },
  } as const;
}

export type LovecraftDemoModel = ReturnType<typeof createLovecraftDemoModel>;
