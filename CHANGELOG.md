# Changelog

All notable changes to My GitLife are documented here.

## [Unreleased]

## [0.1.0] - 2026-08-24

### Added

- `story`, `compact`, and `minimal` SVG card styles.
- `midnight`, `github`, and `minimal` themes.
- Public GitHub profile, owned-repository, language-byte, and recent-event analytics.
- Partial and approximate language-data fallbacks for GitHub API limits.
- Safe local SVG output and `--stdout` support.
- Bounded, allowlisted avatar embedding with initials fallback.
- CSS-only animation and reduced-motion support.
- Copy-ready GitHub Actions documentation for scheduled card updates.

### Security

- Private, forked, and differently owned repositories are excluded before analytics and rendering.
- Output paths are confined to the working directory and unrelated files are not overwritten.
- User-controlled text and links are XML-escaped in generated cards.

[Unreleased]: https://github.com/dRafaleD/my-gitlife/compare/main...HEAD
[0.1.0]: https://github.com/dRafaleD/my-gitlife/tree/main
