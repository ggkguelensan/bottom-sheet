# Repository instructions

`specs/README.md` is the single normative source of truth for this repository.

Before changing code:

1. Read `specs/README.md`.
2. Read `specs/architecture.md` for cross-cutting behavior.
3. Read every module/example spec touched by the change.
   For React DOM, attributes, CSS variables or theming, always read
   `specs/styling.md`.
4. Update the spec before tests and implementation when observable behavior,
   public API, dependencies or repository structure changes.
5. Do not introduce normative requirements in `docs/`, README, comments or demo
   code without reflecting them in `specs/`.

Use the workflow `spec → tests → implementation → demo evidence → verification`.
If code and spec disagree, report the implementation gap explicitly; do not
silently rewrite the spec to match existing behavior.

## Publishing

After a coherent change passes its relevant checks, commit the task changes and
push them directly to `origin/main` unless the user explicitly requests another
workflow. Do not include unrelated work or push changes with failing checks.
