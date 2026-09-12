# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning is
[SemVer](https://semver.org/spec/v2.0.0.html).

## 0.1.0 — 2026-09-11

Initial public release. Verified on pi 0.85.1, macOS + Ghostty, node 26.

### Added

- Event-driven terminal/tab title: provider glyph + `⏳` working / `❗ NEEDS YOU` /
  `✓` resting, plus the live tool intent or your last prompt.
- Provider emoji map for common providers, with `PI_TITLE_GLYPHS_EMOJI_<PROVIDER>`
  overrides for self-hosted and custom endpoints.
- Optional project (cwd) name in the title via `PI_TITLE_GLYPHS_CWD=1`.
- **External status badge**: any other extension can push one glyph + label into the
  title by writing `{ emoji, label, expiresAt }` to a per-session JSON file
  (`status-<pid>.json`, so one session's badge never appears in another's title).
  See the README.
