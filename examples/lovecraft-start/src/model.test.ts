import { fork, scopeBind } from "effector";
import { describe, expect, it } from "vitest";
import type { ShellSheetRequest } from "@shell-sheet/core";
import {
  createLovecraftDemoModel,
  projectShellTarget,
  type ArchiveLoad,
  type ArchiveReport,
  type DemoSnapPoint,
  type DemoState,
} from "./model.js";

type DeferredLoad = Readonly<{
  operation: ArchiveLoad;
  resolve(report: ArchiveReport): void;
  reject(error: Error): void;
}>;

const deferredLoader = () => {
  const calls: DeferredLoad[] = [];
  const loader = (operation: ArchiveLoad): Promise<ArchiveReport> =>
    new Promise((resolve, reject) => {
      calls.push({ operation, resolve, reject });
    });
  return { calls, loader };
};

const flush = async (): Promise<void> => {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
};

describe("Lovecraft application state machine", () => {
  it("projects every domain state to one complete Shell Sheet target", () => {
    const state: DemoState = {
      kind: "arkham.b",
      uiContext: { snapPoint: "expanded", evidenceCount: 3 },
      revision: 7,
      presentation: "dialog",
      preferredPresentation: "dialog",
      direction: "forward",
      motion: "auto",
      cause: "navigate",
      causeRequestId: undefined,
    };

    expect(projectShellTarget(state)).toMatchObject({
      targetId: "lovecraft:7:arkham.b",
      open: true,
      snapPoint: "expanded",
      presentation: "dialog",
      modality: "modal",
      draggable: false,
      regions: {
        header: { key: "arkham:archive" },
        body: { key: "arkham:b:expanded" },
      },
    });
  });

  it("returns from loading to the exact B state, aborts transport and ignores late success", async () => {
    const deferred = deferredLoader();
    const model = createLovecraftDemoModel(deferred.loader);
    const scope = fork();
    const openEntrance = scopeBind(model.entranceOpened, { scope });
    const next = scopeBind(model.nextRequested, { scope });
    const snap = scopeBind(model.snapRequested, { scope });
    const load = scopeBind(model.archiveRequested, { scope });
    const back = scopeBind(model.backRequested, { scope });

    openEntrance("arkham");
    next();
    snap({ snapPoint: "expanded" });
    load("success");
    expect(scope.getState(model.$state)).toMatchObject({
      kind: "arkham.c.loading",
      uiContext: { returnTo: { snapPoint: "expanded", evidenceCount: 3 } },
    });
    const pending = deferred.calls[0]!;

    back();
    expect(pending.operation.signal.aborted).toBe(true);
    expect(scope.getState(model.$state)).toMatchObject({
      kind: "arkham.b",
      uiContext: { snapPoint: "expanded", evidenceCount: 3 },
    });

    pending.resolve({ title: "Late report", entries: ["must be ignored"] });
    await flush();
    expect(scope.getState(model.$state).kind).toBe("arkham.b");
  });

  it("shows fail, retries, and accepts only the matching operation token", async () => {
    const deferred = deferredLoader();
    const model = createLovecraftDemoModel(deferred.loader);
    const scope = fork();
    const openEntrance = scopeBind(model.entranceOpened, { scope });
    const next = scopeBind(model.nextRequested, { scope });
    const load = scopeBind(model.archiveRequested, { scope });

    openEntrance("arkham");
    next();
    load("fail");
    deferred.calls[0]!.reject(new Error("Каталог временно недоступен"));
    await flush();
    expect(scope.getState(model.$state)).toMatchObject({
      kind: "arkham.c.fail",
      uiContext: { message: "Каталог временно недоступен" },
    });

    load("success");
    deferred.calls[1]!.resolve({
      title: "Закрытая опись",
      entries: ["Запись 31", "Запись 47"],
    });
    await flush();
    expect(scope.getState(model.$state)).toMatchObject({
      kind: "arkham.c.success",
      uiContext: { report: { title: "Закрытая опись" } },
    });
  });

  it("aborts the current operation when a controller close request leaves loading", async () => {
    const deferred = deferredLoader();
    const model = createLovecraftDemoModel(deferred.loader);
    const scope = fork();
    const openEntrance = scopeBind(model.entranceOpened, { scope });
    const next = scopeBind(model.nextRequested, { scope });
    const load = scopeBind(model.archiveRequested, { scope });
    const request = scopeBind(model.requestReceived, { scope });

    openEntrance("arkham");
    next();
    load("success");
    const pending = deferred.calls[0]!;
    request({
      type: "close-requested",
      sequence: 1,
      requestId: 1,
      origin: "keyboard",
      reason: "escape",
    });

    expect(pending.operation.signal.aborted).toBe(true);
    expect(scope.getState(model.$state)).toMatchObject({
      kind: "closed",
      causeRequestId: 1,
    });
    pending.resolve({ title: "Late report", entries: [] });
    await flush();
    expect(scope.getState(model.$state).kind).toBe("closed");
  });

  it("accepts valid snap proposals and rejects unsupported points without feedback", () => {
    const deferred = deferredLoader();
    const model = createLovecraftDemoModel(deferred.loader);
    const scope = fork();
    const openEntrance = scopeBind(model.entranceOpened, { scope });
    const request = scopeBind(model.requestReceived, { scope });
    openEntrance("innsmouth");

    const snapRequest = (
      requestId: number,
      snapPoint: DemoSnapPoint,
    ): ShellSheetRequest<DemoSnapPoint> => ({
      type: "snap-requested",
      sequence: requestId,
      requestId,
      origin: "gesture",
      snapPoint,
    });
    request(snapRequest(1, "expanded"));
    expect(scope.getState(model.$state)).toMatchObject({
      kind: "innsmouth",
      uiContext: { snapPoint: "expanded" },
      causeRequestId: 1,
    });
    const accepted = scope.getState(model.$state);

    request(snapRequest(2, "content"));
    expect(scope.getState(model.$state)).toBe(accepted);
  });
});
