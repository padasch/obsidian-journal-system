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

## Review philosophy

Daily notes should stay fast and raw. Higher-level review properties are meant to
be extracted from the daily signal rather than forced into every daily entry.

`journalThemes` is a review-level multiselect for recurring patterns you want to
compare over time, not a replacement for written reflection. Use short labels such
as `sleep/recovery`, `context switching`, or `creative momentum` when a pattern
keeps appearing. Write the nuance in the review reflection, then use Themes as a
small, queryable index for Bases.

## Current settings

The settings tab is organized into:

- Basic settings for shared UI, the review note folder, global review content
  switches, and review-workspace headings.
- Property settings shared across all notes, including automatic properties,
  daily modal properties, and review properties such as `journalHighlights`,
  `journalDifficulties`, `journalImprovements`, `journalLife`, `journalWork`, and
  `journalThemes`.
- Bases settings shared across all notes, including inline Bases, generated Base
  columns, per-column Base widths, display names, and row height.
- Separate Daily, Weekly, Monthly, and Annual settings sections for prompts,
  note formats, checklist prompts, and per-level long-entry embed behavior.

The settings page also includes a foldable overview explaining the intended
workflow and how the settings sections relate to each other.

### Settings guide

- Basic settings affect shared generated review structure. Use them to set the
  review folder, the heading names used in generated notes, whether review
  checklists are created, and whether long daily journal entries can be embedded
  in reviews.
- Automatic properties are maintained by the plugin and are mainly for filtering
  and linking notes across time. They provide stable keys for daily, weekly,
  monthly, and annual Bases.
- Daily properties define the prompt fields. These should stay lightweight, since
  daily notes are meant to capture raw signal quickly.
- Review properties define the condensation fields. These are where highlights,
  difficulties, improvements, life/work reflections, and themes emerge from daily
  writing.
- Bases settings control generated Obsidian Base blocks. Select which properties
  should be visible and optionally set column widths for fields that need more
  room.
- Daily settings control prompt schedule and daily note creation. Weekly,
  monthly, and annual settings control the review prompt schedule, review note
  name format, checklist prompts, and whether that level embeds daily long
  entries.

Folder fields use Obsidian's native fuzzy selection modal for quick selection.
Folder fields accept date tokens in braces, for example `journal/{YYYY}`, and show
the parsed folder underneath the setting.

## Current commands

- `Journaling System: Open daily journal prompt`
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
`journalThemes`. Generated Bases also set display names for configured columns, so
properties such as `journalWeek` and `journalDifficulties` render as `Week` and
`Difficulties`.

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
