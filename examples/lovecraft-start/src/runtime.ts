import { fork, type Scope } from "effector";
import { QueryClient } from "@tanstack/react-query";
import { createShellSheetController, type ShellSheetController } from "@shell-sheet/core";
import { createMotionAnimationDriver } from "@shell-sheet/motion";
import type { ShellAnimationDriver } from "@shell-sheet/dom";
import {
  createLovecraftDemoModel,
  type ArchiveLoad,
  type ArchiveLoader,
  type ArchiveReport,
  type DemoSnapPoint,
  type LovecraftDemoModel,
} from "./model.js";

const archiveTransport = (
  operation: ArchiveLoad,
  querySignal: AbortSignal,
): Promise<ArchiveReport> =>
  new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = (): void => {
      operation.signal.removeEventListener("abort", abort);
      querySignal.removeEventListener("abort", abort);
    };
    const abort = (): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      cleanup();
      reject(new DOMException("Archive request aborted", "AbortError"));
    };
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      if (operation.expected === "fail") {
        reject(new Error("Опись не ответила до закрытия читального зала"));
        return;
      }
      resolve({
        title: "Закрытая опись восточного крыла",
        entries: [
          "Лист 31: лестница нанесена поверх более раннего плана.",
          "Лист 47: смотритель слышал каталог после опечатывания.",
          "Лист 52: координаты Иннсмута вписаны теми же чернилами.",
        ],
      });
    }, 780);
    if (operation.signal.aborted || querySignal.aborted) {
      abort();
      return;
    }
    operation.signal.addEventListener("abort", abort, { once: true });
    querySignal.addEventListener("abort", abort, { once: true });
  });

const createQueryArchiveLoader = (queryClient: QueryClient): ArchiveLoader =>
  (operation) =>
    queryClient.fetchQuery({
      queryKey: ["lovecraft", "archive", operation.token],
      retry: false,
      staleTime: Number.POSITIVE_INFINITY,
      queryFn: ({ signal }) => archiveTransport(operation, signal),
    });

export type LovecraftRuntime = Readonly<{
  queryClient: QueryClient;
  scope: Scope;
  model: LovecraftDemoModel;
  controller: ShellSheetController<DemoSnapPoint, string>;
  animation: ShellAnimationDriver;
  destroy(): void;
}>;

export const createLovecraftRuntime = (): LovecraftRuntime => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false },
    },
  });
  const model = createLovecraftDemoModel(createQueryArchiveLoader(queryClient));
  const scope = fork();
  const controller = createShellSheetController<DemoSnapPoint, string>();
  const detach = model.sheet.attachInScope(controller, scope);
  const animation = createMotionAnimationDriver();
  let active = true;

  return {
    queryClient,
    scope,
    model,
    controller,
    animation,
    destroy() {
      if (!active) return;
      active = false;
      detach();
      controller.destroy();
      queryClient.clear();
    },
  };
};
