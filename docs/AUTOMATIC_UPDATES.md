# Automatic card updates

Add the workflow below as `.github/workflows/update-gitlife.yml` in your GitHub profile repository. It runs weekly or manually, generates a `minimal` card from public data, and commits only when `gitlife.svg` changed.

```yaml
name: Update My GitLife card

on:
  schedule:
    - cron: "17 4 * * 1"
  workflow_dispatch:

permissions:
  contents: write

jobs:
  update-card:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22

      - name: Generate card
        env:
          GITHUB_TOKEN: ${{ github.token }}
        run: >-
          npm exec --yes --package=github:dRafaleD/my-gitlife --
          my-gitlife "$GITHUB_REPOSITORY_OWNER"
          --style minimal --theme github --output gitlife.svg

      - name: Commit changed card
        shell: bash
        run: |
          if [ -z "$(git status --porcelain -- gitlife.svg)" ]; then
            echo "Card is already current."
            exit 0
          fi
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add -- gitlife.svg
          git commit -m "chore: update My GitLife card"
          git push
```

The workflow has no `push` trigger, so its own commit does not start an update loop. `contents: write` is required only for committing the changed SVG. The GitHub-provided token stays in the action environment; My GitLife sends it only in GitHub API Authorization headers and never places it in the SVG.

To use a different presentation, change only `--style` and `--theme`. Available values are documented in the main [README](../README.md#styles-and-themes).
