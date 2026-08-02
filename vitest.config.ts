import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@shell-sheet/core": fileURLToPath(
        new URL("./packages/core/src/index.ts", import.meta.url),
      ),
      "@shell-sheet/dom": fileURLToPath(
        new URL("./packages/dom/src/index.ts", import.meta.url),
      ),
      "@shell-sheet/effector": fileURLToPath(
        new URL("./packages/effector/src/index.ts", import.meta.url),
      ),
      "@shell-sheet/motion": fileURLToPath(
        new URL("./packages/motion/src/index.ts", import.meta.url),
      ),
      "@shell-sheet/react": fileURLToPath(
        new URL("./packages/react/src/index.ts", import.meta.url),
      ),
    },
  },
  test: {
    include: [
      "packages/*/test/**/*.test.{ts,tsx}",
      "examples/lovecraft-start/src/**/*.test.ts",
    ],
    environment: "node",
  },
});
