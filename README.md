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
- Open the daily note for longer writing under `## Journal`, add a hidden write
  marker, synchronize the long-entry property from actual section text, and place
  the cursor where writing should start.
- Prompt for daily, weekly, monthly, and annual reviews on configurable schedules.
- Generate review workspaces with plain bullet checklist prompts, source Bases, and fillable
  review properties while preserving user-written reflection.
- Report count, mean, min, and max for enabled daily number properties inside
  generated review notes.
- Add a one-row review-fields Base to each review note so review properties can
  be edited in the note body instead of only through YAML.
- Try a weekly review wizard that shows concise daily context, offers an editable
  summary, can generate a local AI draft, steps through enabled review
  properties, then opens the review note for further writing.

## Review philosophy

Daily notes should stay fast and raw. Higher-level reviews should condense the
daily signal into a small number of readable fields rather than forcing many
overlapping categories into every review.

The default review center is `journalSummary`: one editable summary for the
review period. If the weekly wizard starts that summary from local AI, it sets
`journalSummaryAI` to `true` while still letting the user edit the text directly.
`journalTopics` is the lightweight multiselect/wiki-link index for connecting
days, weeks, months, or years to recurring vault concepts such as `[[Parenting]]`.

## Current settings

The settings tab is organized into:

- Basic settings for shared UI, the review note folder, global review content
  switches, and review-workspace headings.
- Property settings shared across all notes, including automatic properties,
  daily modal properties, and review properties such as `journalSummary`,
  `journalSummaryAI`, `journalTopics`, `journalLong`, and `journalPicture`.
- Bases settings shared across all notes, including inline Bases, generated Base
  columns, per-column Base widths, display names, and row height.
- Separate Daily, Weekly, Monthly, and Annual settings sections for prompts,
  note formats, checklist prompts, and per-level long-entry embed behavior.
- Local AI settings for optional Ollama-backed weekly summary guidance, disabled
  by default, with endpoint discovery, configurable review aspects, and editable
  weekly/monthly/annual prompt templates.
- Appearance settings for desktop modal text size, width, height, and weekly
  review context height.

The settings page also includes a boxed foldable overview explaining the intended
workflow. Major settings groups are boxed collapsible sections so the page stays
scannable as options grow.

### Settings guide

- Basic settings affect shared generated review structure. Use them to set the
  review folder, the heading names used in generated notes, whether review
  checklists and numeric summaries are created, and whether long daily journal
  entries can be embedded in reviews.
- Automatic properties are maintained by the plugin and are mainly for filtering
  and linking notes across time. They provide stable keys for daily, weekly,
  monthly, and annual Bases. `journalPicture` is maintained from linked or
  embedded image/PDF attachments.
- Daily properties define the prompt fields. These should stay lightweight, since
  daily notes are meant to capture raw signal quickly.
- Review properties define the condensation fields. The default model keeps this
  simple: `journalSummary` carries the review text, `journalSummaryAI` records
  whether it started from AI, and `journalTopics` indexes recurring vault topics.
- Bases settings control generated Obsidian Base blocks, including the editable
  Review Fields Base and source-note Bases. Select which properties should be
  visible and optionally set column widths for fields that need more room.
- Daily settings control prompt schedule, whether scheduled prompts always
  appear or only appear when today's quick entry is empty, and daily note
  creation. Weekly, monthly, and annual settings control the review prompt
  schedule, review note name format, checklist prompts, and whether that level
  embeds daily long entries.
- Local AI settings connect to Ollama on localhost only. The plugin can check the
  server, probe common local Ollama endpoints, explicitly ask Ollama to download
  the configured model, and insert weekly guidance into `journalSummary`.
  `journalSummaryAI` is set when the summary started from AI. AI prompt templates
  can be edited per review level and use these placeholders:
  - `{{sourceNotes}}`: inserts the summarized daily/review source context.
  - `{{aspects}}`: inserts the configured review aspects.
  - `{{language}}`: inserts the configured summary language.
  Templates can be reset to defaults. A dedicated summary language setting
  controls generated output language and defaults to English.
- Appearance settings control desktop modal sizing. Mobile keeps the compact
  top-half modal layout.
- Default review note name formats are `YYYY - [Week] WW`, `YYYY-MM MMMM`, and
  `YYYY [Annual Review]`.

Folder fields use Obsidian's native fuzzy selection modal for quick selection.
Folder fields accept date tokens in braces, for example `journal/{YYYY}`, and show
the parsed folder underneath the setting.

## Current commands

- `Journaling System: Open daily journal prompt`
- `Journaling System: Open long journal entry`
- `Journaling System: Open weekly review`
- `Journaling System: Start weekly review wizard`
- `Journaling System: Choose review period`
- `Journaling System: Open monthly review`
- `Journaling System: Open annual review`

Multi-select fields suggest existing values already used for the configured property
name and rank them with lightweight fuzzy matching. Enter multiple values by putting
one value on each line.

When the journaling modal is reopened for a daily note that already has journal
properties, existing values are prefilled so the entry can be continued or edited.
Scheduled daily prompts can be set to always ask, or to ask only when the current
daily note has no quick entry yet. The command `Open daily journal prompt` remains
manual and always opens the modal.

Daily and review notes receive `journalType` frontmatter. Daily notes also receive
period keys such as `journalWeek`, `journalMonth`, and `journalYear`. Notes also
receive `journalPicture` when they link or embed common image/PDF attachment
types such as PNG, JPG, JPEG, WEBP, GIF, HEIC, PDF, TIF, or TIFF. The flag is
refreshed when the daily prompt opens and when review notes are created/refreshed.
New review checklists include a prompt to review attached handwritten journal
images or PDFs when matching source notes contain picture attachments.

Generated reviews include a Review Fields Base filtered to the current note, so
review properties can be edited directly from the review note. Generated weekly
reviews also include a Base of matching daily notes and long-entry embeds by
default. Generated monthly reviews use weekly reviews as their primary Base
source. Generated annual reviews use monthly reviews as their primary Base source.
Monthly and annual reviews can optionally include an additional daily note Base
for deeper browsing.

Generated review notes also include a Numerical summary section by default. It
scans matching daily notes for enabled number properties, such as `journalMood`,
and reports count, mean, min, and max for the review period. Custom daily number
properties are included automatically.

The weekly review wizard is a trial flow. It creates or opens the weekly review,
shows concise daily context, lets the user write or edit `journalSummary`, steps
through the enabled weekly review properties, saves the entered properties, and
then opens the note at the reflection heading.
When local AI review assistance is enabled, the wizard can generate a private
Ollama-backed weekly summary from the matching daily quick entries and long
journal sections. The generated text is inserted into the editable summary
textarea, where it can be changed before saving. The summary is saved to
`journalSummary` by default; `journalSummaryAI` is set to `true` when the text
started from AI. Local AI prompt templates support three placeholders:
`{{sourceNotes}}`, `{{aspects}}`, and `{{language}}`. If a placeholder is omitted,
the missing section is appended automatically at generation time.

Use `Choose review period` to open the current period or either of the previous
two weeks, months, or years. Weekly period rows can also start the weekly review
wizard for that selected week.

Review Base columns can be selected separately for daily-source Bases and
review-source Bases, with an optional column-width field for each property. Default
widths are set for fields such as `journalShort`, `journalSummary`,
`journalLocation`, `journalTopics`, `journalLong`, and `journalPicture`.
Generated Bases also set display names for configured columns, so properties such
as `journalWeek` and `journalSummary` render as `Week` and `Summary`. The default
setting is shown as `Extra tall` and generated Bases write it as
`rowHeight: extra`.

When long-entry embeds are enabled for a review level, review notes scan matching
daily notes and embed `## Journal` sections that contain actual text. The
long-entry property is synchronized from that scan so Bases can still display or
filter it, but an empty section with a stale true property will not be embedded.
Each embedded long entry is preceded by a bold `YYYY-MM-DD dddd` label.
Generated review notes avoid visible management comments; old placeholder Rollup
sections and generated marker comments are cleaned up when review notes are reopened.

Daily long-entry sections include this edit-mode marker below the configured
heading:

```md
<!-- Journaling System: long journal entry starts here. Write below this line. -->
```

The marker is ignored by the scanner and is hidden in rendered notes/embeds.

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
