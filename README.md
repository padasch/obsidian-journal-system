# Journaling System

Journaling System is an Obsidian plugin for structured daily journaling and
periodic review workflows.

This repository currently contains an early BRAT-installable plugin. It provides a
configurable journaling modal, writes structured properties to the daily note, can
prompt on configured weekdays/times, and can open the daily note directly under the
long-form journal heading.

## Planned workflow

- Capture structured daily properties such as wins, fails, topics, mood, location,
  custom user properties, and quick thoughts.
- Open the daily note for longer writing under `## Journal`, set the long-entry
  property to true, and place the cursor in the journal section.
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
- Additional user-defined properties with text, number, date, multi-select, or
  checkbox property types.
- Automatic property names for journal date, time, and weekday.
- Weekly, monthly, and annual review schedules.
- Review content options for managed rollups, inline Bases, and long-entry embeds.
- Folder fields use Obsidian's native fuzzy selection modal for quick selection.

## Current commands

- `Journaling System: Open journaling prompt`
- `Journaling System: Open long journal entry`
- `Journaling System: Open weekly review`
- `Journaling System: Open monthly review`
- `Journaling System: Open annual review`

Multi-select fields suggest existing values already used for the configured property
name and rank them with lightweight fuzzy matching.

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
