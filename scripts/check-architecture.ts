import { readFile, readdir } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const packages = ["core", "dom", "motion", "effector", "react"] as const;
const failures: string[] = [];

const fail = (message: string): void => {
  failures.push(message);
};

const walk = async (directory: string): Promise<string[]> => {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if ([".git", "dist", "node_modules", "playwright-report", "test-results"].includes(entry.name)) {
      continue;
    }
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else files.push(path);
  }
  return files;
};

const sourceFiles = await walk(root);
for (const file of sourceFiles) {
  if ([".js", ".jsx", ".cjs", ".mjs"].includes(extname(file))) {
    fail(`Handwritten JavaScript is outside the TypeScript-only contract: ${relative(root, file)}`);
  }
}

const packageSources = (
  await Promise.all(
    packages.map(async (name) => ({
      name,
      files: (await walk(join(root, "packages", name, "src"))).filter((file) =>
        file.endsWith(".ts") || file.endsWith(".tsx"),
      ),
    })),
  )
);
const domainPattern = /cinema|theatre|stadium|noseating|p2p|lovecraft|arkham|innsmouth|dunwich|location|ticket/i;
for (const source of packageSources) {
  for (const file of source.files) {
    const text = await readFile(file, "utf8");
    if (domainPattern.test(text)) fail(`Demo domain leaked into ${relative(root, file)}`);
    if (/from\s+["']motion\/react["']/.test(text)) fail(`motion/react import found in ${relative(root, file)}`);
  }
}

const coreText = (
  await Promise.all(packageSources.find((entry) => entry.name === "core")!.files.map((file) => readFile(file, "utf8")))
).join("\n");
if (/\b(window|document|HTMLElement|Element|ResizeObserver|VisualViewport|requestAnimationFrame)\b/.test(coreText)) {
  fail("Core references browser or DOM globals.");
}
if (/\b(updateDrag|setHeight|measure|animate)\s*\(/.test(coreText)) {
  fail("Core exposes a visual-mechanics mutation seam.");
}

const reactText = (
  await Promise.all(packageSources.find((entry) => entry.name === "react")!.files.map((file) => readFile(file, "utf8")))
).join("\n");
if (/getBoundingClientRect|requestAnimationFrame|setTimeout|motion\/mini|motion\/react/.test(reactText)) {
  fail("React owns forbidden measurement, frame, timer, or animation mechanics.");
}
if (/\.css["']/.test(reactText)) fail("React adapter imports a bundled stylesheet.");

const effectorText = (
  await Promise.all(packageSources.find((entry) => entry.name === "effector")!.files.map((file) => readFile(file, "utf8")))
).join("\n");
if (/\$open\b|\$snapPoint\b|\$state\b/.test(effectorText)) {
  fail("Effector adapter owns generic state instead of transporting the application target.");
}

const manifests = await Promise.all(
  packages.map(async (name) => ({
    name,
    value: JSON.parse(await readFile(join(root, "packages", name, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
      exports?: Record<string, unknown>;
      files?: string[];
      sideEffects?: boolean;
    },
  })),
);
const coreManifest = manifests.find((entry) => entry.name === "core")!.value;
if (coreManifest.dependencies && Object.keys(coreManifest.dependencies).length > 0) fail("Core has runtime dependencies.");
for (const { name, value } of manifests) {
  if (value.sideEffects !== false) fail(`${name} must declare sideEffects:false.`);
  if (JSON.stringify(value.files) !== JSON.stringify(["dist"])) fail(`${name} must publish only dist.`);
  const rootExport = value.exports?.["."] as Record<string, unknown> | undefined;
  if (rootExport?.types !== "./dist/index.d.ts" || rootExport.import !== "./dist/index.js") {
    fail(`${name} does not expose explicit types/import ESM conditions.`);
  }
}

if (failures.length > 0) {
  throw new Error(`Architecture checks failed:\n- ${failures.join("\n- ")}`);
}
console.log(`Architecture boundaries: ${sourceFiles.length} files checked.`);
