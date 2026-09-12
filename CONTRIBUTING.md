# Contributing

Small, focused patches are very welcome — especially the ones listed under
**Known gaps** in the README.

## Layout

| File | What it is |
|---|---|
| `src/format.ts` | title formatting, the provider map, the external-badge reader. Pure plus one file read; imports nothing from pi, so it is fully unit-testable |
| `src/index.ts` | pi event wiring and the agent-directory lookup. The only file that imports `@earendil-works/pi-coding-agent` |
| `test/format.test.ts` | `node --test`, no dependencies |

## Run it

```bash
npm test                    # unit tests, no install needed
pi install ./.              # load your clone into pi, then /reload a session
```

## Load check

Extensions load before model resolution, so this exercises a full extension load with no
inference, no auth and no network — in a throwaway config directory:

```bash
PI_CODING_AGENT_DIR=$(mktemp -d) PI_OFFLINE=1 pi -p ok --model nonexistent/x \
  -e src/index.ts --no-skills --no-context-files --no-tools
```

Pass = the only output is `Error: Model "nonexistent/x" not found.`
Any `Failed to load extension` line is a real failure.

## What gets merged

- Provider glyphs for providers people actually use, and better per-tool verbiage.
- Terminal/OS fixes, with a note on what you verified.
- Anything that keeps the no-LLM, no-network, no-tools, no-state promises.

## What won't

- LLM calls, network access, or telemetry of any kind.
- Registering tools or commands (the extension deliberately registers none, so it can
  never fail to load over a tool-name conflict).
- Writing files. Reading the optional badge file is the only filesystem access.
- Anything that can throw from the event path: a title is best-effort chrome and must
  never take a session down.
