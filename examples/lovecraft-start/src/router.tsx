import { createRouter } from "@tanstack/react-router";
import { createLovecraftRuntime } from "./runtime.js";
import { LovecraftRuntimeProvider } from "./runtime-context.js";
import { routeTree } from "./routeTree.gen.js";

export function getRouter() {
  const runtime = createLovecraftRuntime();
  return createRouter({
    routeTree,
    context: { runtime },
    scrollRestoration: true,
    Wrap: ({ children }) => (
      <LovecraftRuntimeProvider runtime={runtime}>
        {children}
      </LovecraftRuntimeProvider>
    ),
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
