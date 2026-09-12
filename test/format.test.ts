import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { ellipsize, emojiFor, envKeyFor, externalBadge, oneLine, renderTitle, showCwd, toolText } from "../src/format.ts";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ptg-test-"));
const badgeFile = (name: string, body: string) => {
  const p = path.join(tmp, name);
  fs.writeFileSync(p, body);
  return p;
};

test("envKeyFor normalises provider ids to legal env suffixes", () => {
  assert.equal(envKeyFor("anthropic"), "ANTHROPIC");
  assert.equal(envKeyFor("llama-swap"), "LLAMA_SWAP");
  assert.equal(envKeyFor("openai.azure"), "OPENAI_AZURE");
  assert.equal(envKeyFor("my box 2"), "MY_BOX_2");
});

test("emojiFor: known provider, unknown fallback, env override", () => {
  assert.equal(emojiFor("ollama"), "🦙");
  assert.equal(emojiFor("OLLAMA"), "🦙", "provider match is case-insensitive");
  assert.equal(emojiFor("some-private-box"), "🤖", "unknown providers fall back");
  assert.equal(emojiFor(undefined), "🤖", "no provider falls back");

  process.env.PI_TITLE_GLYPHS_EMOJI_SOME_PRIVATE_BOX = "🦌";
  try {
    assert.equal(emojiFor("some-private-box"), "🦌", "hyphenated names are overridable");
  } finally {
    delete process.env.PI_TITLE_GLYPHS_EMOJI_SOME_PRIVATE_BOX;
  }
});

test("showCwd is opt-in", () => {
  for (const v of ["", "0", "no", "off"]) {
    process.env.PI_TITLE_GLYPHS_CWD = v;
    assert.equal(showCwd(), false, `"${v}" must not enable cwd`);
  }
  for (const v of ["1", "on", "true", "TRUE"]) {
    process.env.PI_TITLE_GLYPHS_CWD = v;
    assert.equal(showCwd(), true, `"${v}" must enable cwd`);
  }
  delete process.env.PI_TITLE_GLYPHS_CWD;
});

test("oneLine and ellipsize", () => {
  assert.equal(oneLine("  a\n\tb   c "), "a b c");
  assert.equal(ellipsize("abcdef", 10), "abcdef");
  assert.equal(ellipsize("abcdef", 4), "abc…");
  assert.equal(ellipsize("ab cdef", 4), "ab…", "trailing space is trimmed before the ellipsis");
  assert.equal(ellipsize("abcdef", 2), "ab", "below 4 chars there is no room for an ellipsis");
});

test("toolText prefers displaySummary, then per-tool fallbacks", () => {
  assert.equal(toolText("bash", { displaySummary: "Rebuild the index", command: "make" }), "Rebuild the index");
  assert.equal(toolText("bash", { command: "npm test" }), "npm test");
  assert.equal(toolText("read", { path: "src/index.ts" }), "src/index.ts");
  assert.equal(toolText("find", { pattern: "*.ts" }), "*.ts");
  assert.equal(toolText("subagent", { agent: "reviewer" }), "agent: reviewer");
  assert.equal(toolText("mystery_tool", { thing: "a longer string" }), "a longer string", "unknown tools use the first substantial string");
  assert.equal(toolText("bash", undefined), undefined);
  assert.equal(toolText("bash", {}), undefined);
});

test("externalBadge: every failure mode is a silent no-badge", () => {
  assert.equal(externalBadge(path.join(tmp, "does-not-exist.json")), undefined, "absent file");
  assert.equal(externalBadge(badgeFile("bad.json", "{not json")), undefined, "malformed json");
  assert.equal(externalBadge(badgeFile("null.json", "null")), undefined, "null payload");
  assert.equal(externalBadge(badgeFile("empty.json", "{}")), undefined, "no emoji and no label");
  assert.equal(externalBadge(badgeFile("wrongtypes.json", '{"emoji":5,"label":[]}')), undefined, "wrong field types");
});

test("externalBadge: valid payloads, expiry, and clamping", () => {
  assert.deepEqual(externalBadge(badgeFile("ok.json", '{"emoji":"🔓","label":"HOLDING"}')), { emoji: "🔓", label: "HOLDING" });
  assert.deepEqual(externalBadge(badgeFile("emoji-only.json", '{"emoji":"🚦"}')), { emoji: "🚦", label: undefined });
  assert.deepEqual(externalBadge(badgeFile("label-only.json", '{"label":"queued"}')), { emoji: undefined, label: "queued" });

  const future = Date.now() + 60_000;
  assert.deepEqual(externalBadge(badgeFile("fresh.json", `{"emoji":"🔓","expiresAt":${future}}`)), { emoji: "🔓", label: undefined });
  assert.equal(externalBadge(badgeFile("stale.json", `{"emoji":"🔓","expiresAt":${Date.now() - 1}}`)), undefined, "expired badge is ignored");

  const long = externalBadge(badgeFile("long.json", `{"label":"${"x".repeat(200)}"}`));
  assert.equal(long?.label?.length, 60, "labels are clamped so a writer cannot eat the whole title");
  const multi = externalBadge(badgeFile("multi.json", '{"label":"two\\nlines"}'));
  assert.equal(multi?.label, "two lines", "newlines are flattened");
});

// --- renderTitle: the five layouts, including the badge slot ---------------

test("renderTitle: base states", () => {
  assert.equal(renderTitle({ state: "resting", provider: "ollama" }), "🦙 ✓");
  assert.equal(renderTitle({ state: "resting", provider: "ollama", lastPrompt: "fix the parser" }), "🦙 ✓ · fix the parser");
  assert.equal(renderTitle({ state: "working", provider: "ollama", toolLine: "npm test" }), "🦙 ⏳ · npm test");
  assert.equal(renderTitle({ state: "working", provider: "ollama", lastPrompt: "fix it" }), "🦙 ⏳ · fix it", "falls back to the prompt with no tool line");
  assert.equal(renderTitle({ state: "working", provider: "ollama" }), "🦙 ⏳", "no content segment at all");
  assert.equal(
    renderTitle({ state: "needs-you", provider: "ollama", waitInfo: { kind: "confirm", title: "Run rm -rf build?" } }),
    "🦙 ❗ NEEDS YOU · confirm: Run rm -rf build?",
  );
  assert.equal(renderTitle({ state: "needs-you", provider: "ollama" }), "🦙 ❗ NEEDS YOU · your input", "default ask text");
});

test("renderTitle: the external badge occupies the slot after the provider glyph", () => {
  // working + badge: glyph leads, tool intent keeps the content segment
  assert.equal(
    renderTitle({ state: "working", provider: "ollama", toolLine: "npm test", badge: { emoji: "🔓" } }),
    "🦙 🔓 ⏳ · npm test",
  );
  // idle + badge with a label: the badge owns the line
  assert.equal(
    renderTitle({ state: "resting", provider: "ollama", lastPrompt: "ignored", badge: { emoji: "🔓", label: "HOLDING" } }),
    "🦙 🔓 · HOLDING",
  );
  // idle + badge, glyph only
  assert.equal(renderTitle({ state: "resting", provider: "ollama", badge: { emoji: "🚦" } }), "🦙 🚦");
  // label without a glyph falls back to the resting tick
  assert.equal(renderTitle({ state: "resting", provider: "ollama", badge: { label: "queued #2" } }), "🦙 ✓ · queued #2");
  // needs-you outranks any badge — a human is blocked, that is the most urgent thing
  assert.equal(
    renderTitle({ state: "needs-you", provider: "ollama", waitInfo: { title: "pick one" }, badge: { emoji: "🔓", label: "HOLDING" } }),
    "🦙 ❗ NEEDS YOU · pick one",
  );
});

test("renderTitle: long content is ellipsized, never unbounded", () => {
  const t = renderTitle({ state: "working", provider: "ollama", toolLine: "x".repeat(300) });
  assert.ok(t.length <= 80, `title stayed bounded (${t.length} chars)`);
  assert.ok(t.endsWith("…"), "truncation is marked");
  const b = renderTitle({ state: "resting", provider: "ollama", badge: { emoji: "🚦", label: "y".repeat(60) } });
  assert.ok(b.length <= 80, `badge line stayed bounded (${b.length} chars)`);
});

test("renderTitle: cwd is opt-in and appears in every layout", () => {
  process.env.PI_TITLE_GLYPHS_CWD = "1";
  try {
    assert.equal(renderTitle({ state: "resting", provider: "ollama", cwdName: "myproj" }), "🦙 ✓ myproj");
    assert.equal(renderTitle({ state: "working", provider: "ollama", cwdName: "myproj", toolLine: "go" }), "🦙 ⏳ myproj · go");
    assert.equal(
      renderTitle({ state: "needs-you", provider: "ollama", cwdName: "myproj", waitInfo: { title: "ok?" } }),
      "🦙 ❗ NEEDS YOU myproj · ok?",
    );
  } finally {
    delete process.env.PI_TITLE_GLYPHS_CWD;
  }
});
