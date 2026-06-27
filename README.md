# Journaling System

Journaling System is an Obsidian plugin for structured daily journaling and
periodic review workflows.

This repository currently contains an early BRAT-installable skeleton. The plugin
registers a command that opens a placeholder journaling modal and provides a settings
tab for the planned daily fields, prompt schedules, review schedules, rollup behavior,
and embedded Bases evidence panels.

## Planned workflow

- Capture structured daily properties such as wins, fails, topics, mood, location,
  and quick thoughts.
- Open the daily note for longer writing under `## Journal`.
- Prompt for daily, weekly, monthly, and annual reviews on configurable schedules.
- Generate refreshable review rollups while preserving user-written reflection.
- Use embedded Bases as live evidence panels for lower-level notes.

## Current settings

The settings tab already includes controls for:

- Daily prompt times, weekdays, snooze duration, and missed-prompt catch-up.
- Daily note folder, date format, long-entry heading, and short-capture section.
- Daily field labels and property names for `journalShort`, `journalLong`,
  `journalWins`, `journalFails`, `journalTopics`, `journalLocation`, and
  `journalMood`.
- Automatic property names for journal date, time, and weekday.
- Weekly, monthly, and annual review schedules.
- Review content options for managed rollups, inline Bases, and long-entry embeds.

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
