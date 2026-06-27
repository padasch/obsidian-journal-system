# Journaling System

Journaling System is an Obsidian plugin for structured daily journaling and
periodic review workflows.

This repository currently contains the first BRAT-installable skeleton. The plugin
registers a command that opens a placeholder journaling modal; the full journaling
workflow is described in `IMPLEMENTATION_PLAN.md`.

## Planned workflow

- Capture structured daily properties such as wins, fails, topics, mood, location,
  and quick thoughts.
- Open the daily note for longer writing under `## Journal`.
- Prompt for daily, weekly, monthly, and annual reviews on configurable schedules.
- Generate refreshable review rollups while preserving user-written reflection.
- Use embedded Bases as live evidence panels for lower-level notes.

## Development

Install dependencies:

```bash
npm install
```

Run TypeScript checks:

```bash
npm run check
```

Build the plugin:

```bash
npm run build
```

Create an installable plugin folder:

```bash
npm run package
```

This writes:

```text
dist/journaling-system/
```

## BRAT release assets

BRAT expects release assets as direct files. Attach at least:

- `manifest.json`
- `main.js`
- `styles.css`

The repository can then be installed in BRAT from:

```text
https://github.com/padasch/obsidian-journal-system
```
