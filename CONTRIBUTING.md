# Contributing to My GitLife

Thanks for helping improve My GitLife. Keep changes focused and preserve the public-data-only privacy boundary.

## Local setup

Requires Node.js 22.13 or newer.

```bash
git clone https://github.com/dRafaleD/my-gitlife.git
cd my-gitlife
npm ci
```

## Checks

Run these before opening a pull request:

```bash
npm run typecheck
npm test
npm run build
npm audit
```

Changes to a card renderer should cover all styles and themes, preserve valid XML, XML escaping, deterministic output, reduced-motion support, and the existing output-path safeguards.

## Pull requests

1. Create a focused branch from `main`.
2. Add or update tests for behavior changes.
3. Keep unrelated refactors out of the same pull request.
4. Explain user-visible changes and privacy or security implications.
5. Confirm the complete check suite passes.

Never commit tokens, `.env` files, local cards, build output, caches, or private GitHub data.
