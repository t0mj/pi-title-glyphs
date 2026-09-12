/**
 * pi-title-glyphs — title formatting and the external-badge contract.
 *
 * Everything here is pure or reads one small file: no imports from pi, so the test
 * suite runs with zero dependencies (`node --test test/`). Event wiring and the
 * agent-directory lookup live in index.ts.
 */

import * as fs from "node:fs";

// ---------------------------------------------------------------- config ---
// Only providers with an unambiguous mnemonic live here; everything else gets
// FALLBACK_EMOJI and can be named with PI_TITLE_GLYPHS_EMOJI_<PROVIDER>.
export const PROVIDER_EMOJI: Record<string, string> = {
  anthropic: "🔸",
  openai: "🟢",
  google: "♊",
  gemini: "♊",
  xai: "✖️",
  grok: "✖️",
  deepseek: "🐋",
  mistral: "🌬️",
  groq: "⚡",
  openrouter: "🔀",
  ollama: "🦙",
  llamacpp: "🐑",
  "llama-swap": "🐑",
  lmstudio: "🎛️",
  vllm: "🚀",
  local: "🏠",
  localhost: "🏠",
};
const FALLBACK_EMOJI = "🤖";

/** Env var suffix for a provider id: uppercase, non-alphanumerics → "_". */
export function envKeyFor(provider: string): string {
  return provider.toUpperCase().replace(/[^A-Z0-9]/g, "_");
}

export function emojiFor(provider: string | undefined): string {
  if (provider) {
    const override = process.env[`PI_TITLE_GLYPHS_EMOJI_${envKeyFor(provider)}`];
    if (override) return override;
    const known = PROVIDER_EMOJI[provider.toLowerCase()];
    if (known) return known;
  }
  return FALLBACK_EMOJI;
}

/** Project (cwd) name in the title — off by default. */
export function showCwd(): boolean {
  const v = (process.env.PI_TITLE_GLYPHS_CWD ?? "").trim().toLowerCase();
  return v === "1" || v === "on" || v === "true";
}

export const GLYPH_WORKING = "⏳"; // actively running tools/thinking
export const GLYPH_NEEDS_YOU = "❗"; // blocked on user input — urgent
export const GLYPH_RESTING = "✓"; // finished, idle, waiting for your next prompt

export const TITLE_BUDGET = 72; // soft cap for the whole title (terminal truncates anyway)

// -------------------------------------------------- external status badge ---
/**
 * One optional JSON file, written by any other extension. See the header for the
 * contract. Read fresh per render (a few hundred bytes); every failure mode —
 * missing, unreadable, malformed, expired — is the same silent "no badge".
 */
export type Badge = { emoji?: string; label?: string };

export function externalBadge(file: string): Badge | undefined {
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
    if (!raw || typeof raw !== "object") return undefined;
    if (typeof raw.expiresAt === "number" && Number.isFinite(raw.expiresAt) && Date.now() > raw.expiresAt) {
      return undefined;
    }
    const emoji = typeof raw.emoji === "string" ? oneLine(raw.emoji).slice(0, 8) : undefined;
    const label = typeof raw.label === "string" ? oneLine(raw.label).slice(0, 60) : undefined;
    return emoji || label ? { emoji: emoji || undefined, label: label || undefined } : undefined;
  } catch {
    return undefined; // absent / unreadable / malformed — by design
  }
}

// --------------------------------------------------------------- helpers ---
export function oneLine(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

export function ellipsize(s: string, max: number): string {
  if (max < 4) return s.slice(0, Math.max(0, max));
  return s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`;
}

export function toolText(name: string, args: unknown): string | undefined {
  if (!args || typeof args !== "object") return undefined;
  const a = args as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

  // Preferred: model-written intent (pi-tool-display-intent / displaySummary convention).
  const summary = str(a.displaySummary);
  if (summary) return oneLine(summary).slice(0, 90);

  // Per-tool fallbacks — deterministic, no inference.
  let s = "";
  switch (name) {
    case "bash":
      s = str(a.command);
      break;
    case "web_search":
    case "searxng_searxng_web_search":
      s = str(a.query);
      break;
    case "read":
    case "write":
    case "edit":
      s = str(a.path);
      break;
    case "find":
      s = str(a.pattern);
      break;
    case "subagent":
      s = `agent: ${str(a.agent)}`.trim();
      break;
    default:
      for (const v of Object.values(a)) {
        const t = str(v);
        if (t.length > 3) {
          s = t;
          break;
        }
      }
  }
  return s ? oneLine(s).slice(0, 90) : undefined;
}

/** Everything the title depends on, so the renderer is pure and testable. */
export type TitleInput = {
  state: "working" | "needs-you" | "resting";
  provider?: string;
  cwdName?: string;
  lastPrompt?: string;
  toolLine?: string;
  waitInfo?: { kind?: string; title?: string };
  badge?: Badge;
};

export function renderTitle(input: TitleInput): string {
  const { state, provider, lastPrompt, toolLine, waitInfo, badge } = input;
  const emoji = emojiFor(provider);
  const mid = showCwd() && input.cwdName ? ` ${input.cwdName}` : ""; // project name (opt-in)
  const overhead = emoji.length + 2 + mid.length + 3; // "emoji glyph[cwd] · "
  const budget = Math.max(18, TITLE_BUDGET - overhead);

  if (state === "needs-you") {
    const kind = waitInfo?.kind ? `${waitInfo.kind}: ` : "";
    const what = waitInfo?.title ?? "your input";
    return `${emoji} ${GLYPH_NEEDS_YOU} NEEDS YOU${mid} · ${ellipsize(`${kind}${what}`, budget)}`;
  }

  if (state === "working") {
    // A badge glyph sits between the provider glyph and the working glyph; the
    // content segment stays the live tool intent.
    const lead = badge?.emoji ? `${emoji} ${badge.emoji}` : emoji;
    const seg = ellipsize(toolLine ?? lastPrompt ?? "", budget);
    return seg ? `${lead} ${GLYPH_WORKING}${mid} · ${seg}` : `${lead} ${GLYPH_WORKING}${mid}`;
  }

  if (badge) {
    // Not working, and something external has a say: the badge owns the line.
    const glyph = badge.emoji ?? GLYPH_RESTING;
    return badge.label
      ? ellipsize(`${emoji} ${glyph}${mid} · ${badge.label}`, TITLE_BUDGET)
      : `${emoji} ${glyph}${mid}`;
  }

  // resting — finished and idle (or fresh session)
  if (lastPrompt) {
    return `${emoji} ${GLYPH_RESTING}${mid} · ${ellipsize(lastPrompt, budget)}`;
  }
  return `${emoji} ${GLYPH_RESTING}${mid}`;
}
