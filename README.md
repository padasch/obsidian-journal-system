# Journaling System

Journaling System is an Obsidian plugin for structured daily journaling and
periodic review workflows.

This repository currently contains an early BRAT-installable plugin. It provides a
configurable journaling modal, writes structured properties to the daily note, can
prompt on configured weekdays/times, and can open the daily note directly under the
long-form journal heading.

## Workflow

- Daily notes are the raw signal: quick thoughts, optional long writing, mood, and
  location.
- Weekly reviews are the first interpretation layer over daily notes.
- Monthly reviews synthesize patterns from weekly reviews.
- Annual reviews focus on direction and identity-level reflection from monthly
  reviews.
- Open the daily note for longer writing under `## Journal`, set the long-entry
  property to true, and place the cursor in the journal section.
- Prompt for daily, weekly, monthly, and annual reviews on configurable schedules.
- Generate review workspaces with checklist prompts, source Bases, and fillable
  review properties while preserving user-written reflection.

## Current settings

The settings tab already includes controls for:

- Daily prompt times, weekdays, snooze duration, missed-prompt catch-up, and
  desktop journal modal font size.
- Daily note folder, date format, long-entry heading, and short-capture section.
- Daily field labels and property names for `journalShort`, `journalLong`,
  `journalLocation`, and `journalMood`.
- Additional user-defined properties with text, number, date, multi-select, or
  checkbox property types.
- Per-field placeholder text for all journal fields.
- Automatic property names for journal type, date, time, weekday, ISO week,
  month, and year.
- Weekly, monthly, and annual review schedules.
- Review properties such as `journalHighlights`, `journalDifficulties`,
  `journalImprovements`, `journalLife`, `journalWork`, and `journalThemes`.
- Review checklist prompts per level.
- Review content options for inline Bases, long-entry embeds by review level,
  generated Base columns, per-column Base widths, and Base row height.
- Folder fields use Obsidian's native fuzzy selection modal for quick selection.
- Folder fields accept date tokens in braces, for example `journal/{YYYY}`, and show
  the parsed folder underneath the setting.

## Current commands

- `Journaling System: Open journaling prompt`
- `Journaling System: Open long journal entry`
- `Journaling System: Open weekly review`
- `Journaling System: Open monthly review`
- `Journaling System: Open annual review`

Multi-select fields suggest existing values already used for the configured property
name and rank them with lightweight fuzzy matching. Enter multiple values by putting
one value on each line.

When the journaling modal is reopened for a daily note that already has journal
properties, existing values are prefilled so the entry can be continued or edited.

Daily and review notes receive `journalType` frontmatter. Daily notes also receive
period keys such as `journalWeek`, `journalMonth`, and `journalYear`.

Generated weekly reviews include a checklist, a Base of matching daily notes, and
long-entry embeds by default. Generated monthly reviews use weekly reviews as their
primary Base source. Generated annual reviews use monthly reviews as their primary
Base source. Monthly and annual reviews can optionally include an additional daily
note Base for deeper browsing.

Review Base columns can be selected separately for daily-source Bases and
review-source Bases, with an optional column-width field for each property. Default
widths are set for `journalShort`, `journalLocation`, `journalHighlights`,
`journalDifficulties`, `journalImprovements`, `journalLife`, `journalWork`, and
`journalThemes`.

When long-entry embeds are enabled for a review level, review notes embed matching
daily `## Journal` sections for notes whose long-entry property is true.
Each embedded long entry is preceded by a bold `YYYY-MM-DD dddd` label.
Generated review notes avoid visible management comments; old placeholder Rollup
sections and generated marker comments are cleaned up when review notes are reopened.

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
