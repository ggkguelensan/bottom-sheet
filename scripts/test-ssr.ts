import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

type StartServer = Readonly<{
  fetch(request: Request): Promise<Response>;
}>;

const moduleUrl = pathToFileURL(
  resolve(import.meta.dirname, "../examples/lovecraft-start/dist/server/server.js"),
).href;
const serverModule = await import(moduleUrl) as Readonly<{ default: StartServer }>;
const request = (): Request => new Request("http://shell-sheet.test/");
const [first, second] = await Promise.all([
  serverModule.default.fetch(request()),
  serverModule.default.fetch(request()),
]);
if (first.status !== 200 || second.status !== 200) {
  throw new Error(`TanStack Start SSR returned ${first.status}/${second.status}.`);
}
const [firstHtml, secondHtml] = await Promise.all([first.text(), second.text()]);
for (const html of [firstHtml, secondHtml]) {
  if (!html.includes("Места, которых") || !html.includes("Мискатоникский архив")) {
    throw new Error("TanStack Start SSR omitted application content.");
  }
  if (html.includes("data-shell-sheet-portal")) {
    throw new Error("Client-attached Shell Sheet Portal leaked into SSR markup.");
  }
}
console.log("TanStack Start rendered two isolated full-document SSR requests.");
