import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  resolve: {
    alias: {
      "@shell-sheet/core": fileURLToPath(
        new URL("../../packages/core/src/index.ts", import.meta.url),
      ),
      "@shell-sheet/dom": fileURLToPath(
        new URL("../../packages/dom/src/index.ts", import.meta.url),
      ),
      "@shell-sheet/effector": fileURLToPath(
        new URL("../../packages/effector/src/index.ts", import.meta.url),
      ),
      "@shell-sheet/motion": fileURLToPath(
        new URL("../../packages/motion/src/index.ts", import.meta.url),
      ),
      "@shell-sheet/react": fileURLToPath(
        new URL("../../packages/react/src/index.ts", import.meta.url),
      ),
    },
  },
});
