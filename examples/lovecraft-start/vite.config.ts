import { fileURLToPath, URL } from "node:url";
import viteReact from "@vitejs/plugin-react";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { defineConfig } from "vite";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [tanstackStart(), viteReact()],
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
