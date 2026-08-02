import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const packages = ["core", "dom", "motion", "effector", "react"] as const;

const run = (command: string, args: readonly string[]): void => {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: "pipe",
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with status ${result.status ?? "unknown"}.`);
  }
};

for (const name of packages) {
  const directory = `packages/${name}`;
  run("npx", ["publint", "run", directory, "--strict"]);
  run("npx", ["attw", "--pack", directory, "--profile", "esm-only", "--no-emoji"]);
  await import(pathToFileURL(resolve(root, directory, "dist/index.js")).href);
}

run("npx", ["tsc", "-p", "fixtures/consumer/tsconfig.json", "--pretty", "false"]);
run("npx", ["vite", "build", "--config", "fixtures/consumer/vite.config.ts"]);
run("npm", [
  "install",
  "--prefix",
  "fixtures/react19",
  "--ignore-scripts",
  "--no-package-lock",
  "--no-audit",
  "--no-fund",
]);
run("npx", ["tsc", "-p", "fixtures/react19/tsconfig.json", "--pretty", "false"]);
run("npx", ["vite", "build", "--config", "fixtures/react19/vite.config.ts"]);
console.log(
  "Packed packages, Node ESM imports, React 18 primary, and React 19 compatibility fixtures passed.",
);
