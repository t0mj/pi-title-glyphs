# Release recipe + worksheet

The repeatable steps for this package, so a release is never re-derived.
Method: a 10-stage, 3-gate package-publish checklist (triage, scrub, prove it
loads for a stranger, self-vet, staged release).

## Recipe

```bash
npm test                                   # must pass; prepublishOnly runs it again
npm pack --dry-run                         # read the file list; only the files[] allowlist
# clean-room load check (no models, no auth, no network, throwaway config dir):
CLEAN=$(mktemp -d)
PI_CODING_AGENT_DIR=$CLEAN PI_OFFLINE=1 pi -p ok --model nonexistent/x \
  -e src/index.ts --no-skills --no-context-files --no-tools
#   pass = only 'Model "nonexistent/x" not found'; any "Failed to load extension" is real
PI_CODING_AGENT_DIR=$(mktemp -d) pi install .   # package-form install, then re-run the check
# scrub greps — all four empty
grep -rnE '/Users/|/home/[a-z]' . | grep -v -e '^./.git/' -e node_modules
git log --all -p | grep -ciE '<private terms>'  # history publishes with the repo
# release
git tag -a vX.Y.Z -m "vX.Y.Z" && git push origin main --tags
gh release create vX.Y.Z --title "vX.Y.Z" --notes "<changelog section>"
npm publish --dry-run                      # then, by hand: npm login && npm publish --access public
```

## v0.1.0 worksheet — 2026-09-11

| Item | Result |
|---|---|
| Origin | an earlier private build of this extension (2026-08-30), renamed for the public release |
| Name check | `pi-glance` **taken** on npm by an unrelated pi status-line package → renamed to `pi-title-glyphs` (npm + GitHub name verified free) |
| Prior art | `pi-glance` (in-TUI status line), `pi-session-title` (LLM session naming), `pi-beacon` (Linux desktop bars) — all different surfaces; documented in the README |
| pi baseline | 0.85.1 · node 26.8.1 · macOS + Ghostty |
| Stage 0 verdict | SHIP |
| Coupling audit | one coupling to a private tool's on-disk queue layout (a 59-line reader) → **seam inverted**: this package now reads one documented JSON badge file; any extension can write it |
| Scrub (Stage 2) | paths 0 · hosts/ports 0 · private provider names 0 · personal prose/prompts 0 — the demo prompts and the provider glyph map were both replaced |
| History | pre-publish leak review (allowlist prompt) found the worksheet itself → sanitized, **second history reset**; repo starts at the scrubbed state |
| Tests | 11/11 (`node --test test/`), zero dependencies — `src/format.ts` imports nothing from pi |
| Gate 2: tarball | 6 files, 8.6 kB: `src/{index,format}.ts`, README, CHANGELOG, LICENSE, package.json |
| Gate 2: load check | pass as entry file **and** as an installed package in an empty config dir; negative control (an added `throw`) correctly reported `Failed to load extension` |
| Gate 3: self-vet | network 0 · child_process/eval 0 · obfuscation 0 · **writes 0** · reads 1 (the documented badge file, user-controlled path) · env reads 3 (own namespace) · registered tools/commands 0 · prototype patches 0 · runtime deps 0 · install scripts 0 |
| Live session check | **confirmed by the maintainer 2026-09-11** after the local cutover: glyphs render correctly, no bugs observed. This was the one thing the automated checks could not verify themselves |

