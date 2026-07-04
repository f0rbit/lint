# @f0rbit/oxfmt-config

The single ecosystem-wide formatting choice: **tabs, print width 120**, everything else oxfmt/Prettier defaults. Recorded once, here.

## Usage

Consumers don't install this directly — install `@f0rbit/lint` and run `bunx f0rbit-lint init`, which **byte-copies** the canonical `oxfmtrc.json` into the consumer repo as `.oxfmtrc.json`. The pinned oxfmt version (0.x alpha) has no `extends` support in its config schema, so copy + drift-check is the sharing mechanism: `f0rbit-lint check` compares the consumer copy byte-wise against this package's canonical file.

Repo-specific format ignores do NOT go in `.oxfmtrc.json` (that would break the drift check) — oxfmt reads `.gitignore` and `.prettierignore` from the working directory; put repo-specific exclusions in `.prettierignore`.

The `$schema` path resolves from a consumer repo root (where oxfmt is hoisted into `node_modules`), giving editor IntelliSense on the copied file.
