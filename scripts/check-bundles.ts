import { gzipSync } from "node:zlib";
import { build } from "esbuild";

type Budget = Readonly<{
  name: string;
  source: string;
  limit: number;
}>;

const budgets: readonly Budget[] = [
  {
    name: "core public consumer",
    source: `import { createShellSheetController } from "@shell-sheet/core"; globalThis.__shell = createShellSheetController();`,
    limit: 3_072,
  },
  {
    name: "motion/mini driver",
    source: `import { createMotionAnimationDriver } from "@shell-sheet/motion"; globalThis.__driver = createMotionAnimationDriver();`,
    limit: 3_072,
  },
];

for (const budget of budgets) {
  const result = await build({
    stdin: { contents: budget.source, resolveDir: process.cwd(), loader: "ts" },
    bundle: true,
    format: "esm",
    minify: true,
    platform: "browser",
    target: ["es2022"],
    treeShaking: true,
    write: false,
  });
  const output = result.outputFiles[0];
  if (!output) throw new Error(`No bundle emitted for ${budget.name}.`);
  const size = gzipSync(output.contents).byteLength;
  console.log(`${budget.name}: ${size} B minified+gzip (limit ${budget.limit} B)`);
  if (size > budget.limit) throw new Error(`${budget.name} exceeded its bundle budget.`);
}
