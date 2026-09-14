# pi-title-glyphs

Live session status in your terminal/tab title. Scan a row of pi tabs and see at a glance
**which provider each one is talking to**, **whether it's working, waiting on you, or
resting**, and **what it's doing** — without clicking into any of them.

```
🔸 ⏳ · Rebuilding the search index                 working — most recent tool intent
🦙 ❗ NEEDS YOU · confirm: Run rm -rf build?         blocked on you (urgent)
♊ ✓ · Add a retry budget to the fetch helper        resting — finished, idle
```

![The headers, in the wild](https://raw.githubusercontent.com/t0mj/pi-title-glyphs/main/img/headers.png)

No LLM calls, ever. Every state comes from a pi event, and every string is plain
truncation — so the title costs no tokens and adds no latency.

## Install

```bash
pi install npm:pi-title-glyphs
pi install git:github.com/t0mj/pi-title-glyphs@v0.1.0
pi install ./pi-title-glyphs          # a local clone, for development
```

Then restart or `/reload` a session. There is nothing to configure.

## States

Event-driven, no heuristics or polling:

| State | Glyph | Trigger | Title content |
|---|---|---|---|
| working | `⏳` | `agent_start`, refreshed on each `tool_execution_start` | the running tool's intent (else your last prompt) |
| needs-you | `❗ NEEDS YOU` | `ui_prompt_start` — confirm / select / input / editor / custom dialogs | what pi is asking |
| resting | `✓` | `agent_settled` (pi will not continue on its own) | your last prompt |

**Tool verbiage** prefers the model-written `displaySummary` field on a tool call —
produced by [pi-tool-display-intent](https://www.npmjs.com/package/@zhcsyncer/pi-tool-display-intent)
or any extension using that convention. Without it, there is a deterministic per-tool
fallback: the bash command, the read/write/edit path, the search query, the subagent name,
then the first substantial string argument.

## Provider glyphs

Built-in, for providers with an unambiguous mnemonic:

| | | | | | |
|---|---|---|---|---|---|
| `anthropic` 🔸 | `openai` 🟢 | `google`/`gemini` ♊ | `xai`/`grok` ✖️ | `deepseek` 🐋 | `mistral` 🌬️ |
| `groq` ⚡ | `openrouter` 🔀 | `ollama` 🦙 | `llamacpp`/`llama-swap` 🐑 | `lmstudio` 🎛️ | `vllm` 🚀 |
| `local`/`localhost` 🏠 | | | | | |

Anything else gets `🤖`. That is the normal case for a self-hosted or custom endpoint —
name it yourself:

```sh
export PI_TITLE_GLYPHS_EMOJI_MYBOX="🦌"      # provider "mybox"
export PI_TITLE_GLYPHS_EMOJI_LLAMA_SWAP="🐏"  # non-alphanumerics become "_"
```

Glyphs update live on `model_select`, so the title follows `/model` and Ctrl+P.

## Config

All optional, all environment variables.

| Variable | Default | Effect |
|---|---|---|
| `PI_TITLE_GLYPHS_EMOJI_<PROVIDER>` | built-in map, else `🤖` | glyph for one provider. Uppercase the provider id and replace non-alphanumerics with `_` |
| `PI_TITLE_GLYPHS_CWD` | off | `1`/`on`/`true` adds the project directory name to the title |
| `PI_TITLE_GLYPHS_STATUS_FILE` | `<agent-dir>/extension-data/pi-title-glyphs/status-<pid>.json` | where the external status badge is read from (per session by default) |

## External status badge — the extension point

Any other extension can push **one glyph and one short label** into the title by writing
JSON to the status file. This extension knows nothing about who writes it.

```jsonc
// <agent-dir>/extension-data/pi-title-glyphs/status-<pid>.json
{ "emoji": "🔓", "label": "HOLDING", "expiresAt": 1789200000000 }
```

The file is **per session**, keyed by the pi process id — badge state like "you are #2 in
line" belongs to one session and must never appear in another tab's title. An extension
running inside pi writes the file for its own session using `process.pid`, which is the
same pid this extension reads. A writer *outside* the pi process should be pointed at an
explicit path with `PI_TITLE_GLYPHS_STATUS_FILE`.

| Field | Type | Meaning |
|---|---|---|
| `emoji` | string, ≤8 chars | glyph shown immediately after the provider glyph |
| `label` | string, ≤60 chars | replaces the content segment while the session is **not** working; newlines flattened |
| `expiresAt` | number | epoch milliseconds; a badge past this is ignored |

All fields are optional. **Absent, unreadable, malformed or expired means no badge** — the
file is never created, written or logged by this extension, and a bad payload can never
break a title. Labels and glyphs are clamped so a writer cannot eat the whole title.

Useful for a session-queue extension ("you're #2 in line"), a CI watcher, a long-running
job, or a "needs a human" signaller. Write the file, and the next title render picks it up.

Two caveats for writers: this extension re-renders only when a **pi event** fires, so
during a long quiet stretch (a session parked in a queue, say) the writer should also set
the title itself for immediacy — the badge is what keeps the indicator alive across this
extension's own later renders. And set `expiresAt`, so a crashed writer's badge disappears
on its own; clean up your file when the state ends.

## Degradation

| Condition | Behavior |
|---|---|
| terminal that ignores title escapes | pi sets no title; the extension is harmless |
| print / RPC mode (`pi -p`, headless) | events fire, title calls are no-ops |
| unknown or self-hosted provider | `🤖`, override with the env var above |
| no status file (the normal case) | no badge, no error, no file created |
| a pi build without `ctx.ui.setTitle` | calls are guarded; the extension stays inert |

It registers **no tools and no commands**, so it cannot conflict with another extension's
tool names. It reads nothing from your workspace and writes nothing anywhere.

## Not to be confused with

The pi ecosystem has several adjacent things, all different from this one:

- **[pi-glance](https://www.npmjs.com/package/pi-glance)** — a rounded editor and adaptive
  status *line* inside the TUI.
- **[pi-session-title](https://www.npmjs.com/package/pi-session-title)** — generates a
  *name* for a session.
- **[pi-beacon](https://www.npmjs.com/package/pi-beacon)** — live session observability on
  Linux desktop bars (waybar, quickshell).

This one writes the **terminal/tab title**, from pi events, on any OS.

## Requirements and portability

- **pi** 0.85.1 (verified). Earlier versions probably work; `ctx.ui.setTitle` is not in
  pi's published type surface, so it is called defensively.
- **node** ≥ 22.19.0.
- **Verified on** macOS 15 + Ghostty. Nothing in the code is mac- or terminal-specific:
  there are no escape sequences, no `TERM` checks and no platform branches — pi owns the
  title surface, so this extension inherits whatever pi supports.

### Known gaps / PRs welcome

- **Other terminals and OSes are untested**, not unsupported. If your terminal shows the
  title, it works; if it doesn't, `pi` is where the title is set, not here.
- **Title length** is soft-capped at 72 characters (`TITLE_BUDGET` in `src/format.ts`) —
  terminals truncate differently and nobody has measured the good value per terminal.
- **Per-tool verbiage** (`toolText` in `src/format.ts`) knows the built-in tools and the
  `displaySummary` convention. New tools fall back to the first substantial string
  argument; a better fallback for a tool you use is a two-line patch.

## Uninstall

```bash
pi remove npm:pi-title-glyphs
```

It stores nothing, so there is no state to clean up. If another extension created the
status file, remove `<agent-dir>/extension-data/pi-title-glyphs/` yourself.

## Development

```bash
git clone https://github.com/t0mj/pi-title-glyphs && cd pi-title-glyphs
npm test                              # zero dependencies: src/format.ts imports nothing from pi
pi install ./.                        # run your clone
```

See [CONTRIBUTING.md](CONTRIBUTING.md). `src/format.ts` is pure formatting plus the badge
reader (fully unit-tested); `src/index.ts` is the pi event wiring.

## Credits

The `displaySummary` convention comes from
[pi-tool-display-intent](https://www.npmjs.com/package/@zhcsyncer/pi-tool-display-intent).

MIT © t0mj
