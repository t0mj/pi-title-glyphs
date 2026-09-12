/**
 * pi-title-glyphs — live session status in your terminal/tab title.
 *
 * Renders a compact, always-current title so you can scan many pi tabs and
 * instantly see: which model provider each tab is talking to, whether it's
 * working / waiting on you / resting, and what it's doing (your last prompt,
 * or the most recent tool's intent while it runs).
 *
 *   🔸 ⏳ · Rebuilding the search index                (working — live tool intent)
 *   🦙 ❗ NEEDS YOU · confirm: Run rm -rf build?       (blocked on you)
 *   ♊ ✓ · Add a retry budget to the fetch helper      (resting — finished, idle)
 *
 * States (driven by pi events, no heuristics):
 *   working   agent_start → tool_execution_start* → ui_prompt_end → …
 *   needs-you ui_prompt_start (confirm/select/input/editor/custom dialogs)
 *   resting   agent_settled  (pi will not continue on its own)
 *
 * Tool verbiage: prefers `args.displaySummary` (written by pi-tool-display-intent
 * or any extension using that field), then a per-tool fallback (bash command,
 * path, query…). Pure string truncation with "…" — no LLM calls, ever.
 *
 * Config (env vars, optional):
 *   PI_TITLE_GLYPHS_EMOJI_<PROVIDER>=🦌  override a provider's emoji. Non-alphanumeric
 *                                        characters in the provider name become "_"
 *                                        (llama-swap → PI_TITLE_GLYPHS_EMOJI_LLAMA_SWAP)
 *   PI_TITLE_GLYPHS_CWD=1               include the project (cwd) name in the title
 *   PI_TITLE_GLYPHS_STATUS_FILE=<path>  external status badge file (see below)
 *
 * External status badge — the extension point:
 *   Any other extension can push one glyph + label into the title by writing JSON to
 *   the status file (default `<agent-dir>/extension-data/pi-title-glyphs/status-<pid>.json`):
 *
 *     { "emoji": "🔓", "label": "HOLDING", "expiresAt": 1789200000000 }
 *
 *   All fields optional. `expiresAt` is epoch milliseconds. The badge glyph sits right
 *   after the provider emoji; the label replaces the content segment when the session
 *   is not actively working. Absent, unreadable, malformed or expired ⇒ no badge, and
 *   nothing is logged. A session-queue extension, a CI watcher, or a "needs a human"
 *   signaller can all use this without this extension knowing they exist.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import * as path from "node:path";
import { externalBadge, oneLine, renderTitle, toolText } from "./format.ts";

/**
 * Where the external status badge lives — **per session**, keyed by the pi process id,
 * because badge state ("you are #2 in line") belongs to one session and must never leak
 * into another session's title. An extension running inside pi writes the file for its
 * own session with the same `process.pid` this reads. PI_TITLE_GLYPHS_STATUS_FILE
 * overrides the whole path, for a writer outside the process.
 */
function statusFile(): string {
  return (
    process.env.PI_TITLE_GLYPHS_STATUS_FILE ??
    path.join(getAgentDir(), "extension-data", "pi-title-glyphs", `status-${process.pid}.json`)
  );
}

// ------------------------------------------------------------------ main ---
export default function (pi: ExtensionAPI) {
  type State = "working" | "needs-you" | "resting";

  let state: State = "resting";
  let provider: string | undefined;
  let cwdName = "";
  let lastPrompt: string | undefined;
  let toolLine: string | undefined; // most recent tool's verbiage
  let waitInfo: { kind?: string; title?: string } | undefined;
  let ctxRef: unknown;

  function render() {
    try {
      // ctx.ui.setTitle is not in the published type surface yet — call it defensively
      // so a runtime without it degrades to "no title" instead of throwing.
      const ctx = ctxRef as { ui?: { setTitle?: (t: string) => void } } | undefined;
      ctx?.ui?.setTitle?.(
        renderTitle({ state, provider, cwdName, lastPrompt, toolLine, waitInfo, badge: externalBadge(statusFile()) }),
      );
    } catch {
      // title is best-effort chrome; never break a session over it
    }
  }

  function noteCtx(ctx: unknown) {
    ctxRef = ctx;
    const c = ctx as { cwd?: string } | undefined;
    if (c?.cwd && c.cwd !== "/") {
      cwdName = c.cwd.split("/").filter(Boolean).pop() ?? "";
    }
  }

  pi.on("session_start", async (event: { reason?: string }, ctx) => {
    noteCtx(ctx);
    const c = ctx as { model?: { provider?: string } };
    if (c?.model?.provider) provider = c.model.provider;
    state = "resting";
    toolLine = undefined;
    waitInfo = undefined;
    // Keep context across hot reloads; reset on a genuinely new/resumed session.
    if (event.reason && event.reason !== "reload") lastPrompt = undefined;
    render();
  });

  pi.on("model_select", async (event: { model?: { provider?: string } }, ctx) => {
    noteCtx(ctx);
    if (event.model?.provider) provider = event.model.provider;
    render();
  });

  pi.on("input", async (event: { text?: string; source?: string }, ctx) => {
    noteCtx(ctx);
    if (event.source === "extension") return; // injected messages aren't your requests
    const t = event.text ? oneLine(event.text) : "";
    if (t) lastPrompt = t;
    render();
  });

  pi.on("agent_start", async (_event: unknown, ctx) => {
    noteCtx(ctx);
    state = "working";
    toolLine = undefined;
    waitInfo = undefined;
    render();
  });

  pi.on("tool_execution_start", async (event: { toolName?: string; args?: unknown }, ctx) => {
    noteCtx(ctx);
    if (state !== "working") return;
    const t = toolText(event.toolName ?? "", event.args);
    if (t) toolLine = t; // keep last known verbiage when a tool has no summary
    render();
  });

  pi.on("ui_prompt_start", async (event: { kind?: string; title?: string }, ctx) => {
    noteCtx(ctx);
    state = "needs-you";
    waitInfo = {
      kind: event.kind,
      title: event.title ? oneLine(event.title) : undefined,
    };
    render();
  });

  pi.on("ui_prompt_end", async (_event: unknown, ctx) => {
    noteCtx(ctx);
    state = "working"; // agent loop resumes; agent_settled flips to resting when truly done
    waitInfo = undefined;
    render();
  });

  pi.on("agent_settled", async (_event: unknown, ctx) => {
    noteCtx(ctx);
    state = "resting";
    toolLine = undefined;
    waitInfo = undefined;
    render();
  });
}
