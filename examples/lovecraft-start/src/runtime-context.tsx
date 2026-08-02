import { createContext, useContext, type ReactNode } from "react";
import { Provider as EffectorProvider } from "effector-react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { LovecraftRuntime } from "./runtime.js";

const RuntimeContext = createContext<LovecraftRuntime | null>(null);

export function LovecraftRuntimeProvider({
  runtime,
  children,
}: Readonly<{ runtime: LovecraftRuntime; children: ReactNode }>) {
  return (
    <RuntimeContext.Provider value={runtime}>
      <QueryClientProvider client={runtime.queryClient}>
        <EffectorProvider value={runtime.scope}>{children}</EffectorProvider>
      </QueryClientProvider>
    </RuntimeContext.Provider>
  );
}

export const useLovecraftRuntime = (): LovecraftRuntime => {
  const runtime = useContext(RuntimeContext);
  if (!runtime) {
    throw new Error("Lovecraft runtime is not available in the router context.");
  }
  return runtime;
};
