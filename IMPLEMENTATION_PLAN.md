# Journaling System Implementation Plan

## Summary

`Journaling System` is a standalone Obsidian plugin for structured daily journaling,
scheduled prompts, and weekly/monthly/yearly review notes.

Initial repository setup:

- GitHub repository: `padasch/obsidian-journal-system`
- Obsidian plugin ID: `journaling-system`
- Initial version: `0.1.0`
- Release assets for BRAT: direct `manifest.json`, `main.js`, and `styles.css`
- No dependency on any local vault structure

Reference docs:

- Obsidian sample plugin: <https://github.com/obsidianmd/obsidian-sample-plugin>
- Obsidian manifest docs: <https://docs.obsidian.md/Reference/Manifest>
- Obsidian Bases docs: <https://help.obsidian.md/bases>
- BRAT: <https://github.com/TfTHacker/obsidian42-brat>

## First Milestone

The first milestone now includes a release-ready plugin with a real settings surface,
a working journaling modal, daily-note property writing, scheduled prompt checks, and
long-entry note opening.

Files:

- `manifest.json`
- `package.json`
- `package-lock.json`
- `tsconfig.json`
- `esbuild.config.mjs`
- `src/main.ts`
- `styles.css`
- `README.md`
- `LICENSE`
- `.gitignore`
- `versions.json`
- `version-bump.mjs`
- `scripts/package-plugin.mjs`

Commands:

- `npm run check`
- `npm run build`
- `npm run package`

Plugin commands:

- ID: `open-journaling-prompt`
- Name: `Open journaling prompt`
- Behavior: open the configured journaling modal.
- ID: `open-long-journal-entry`
- Name: `Open long journal entry`
- Behavior: create/open the daily note, set the long-entry property to true, and put
  the cursor in the long journal section.
- Review note commands: `open-weekly-review`, `open-monthly-review`,
  `open-annual-review`.

Settings tab:

- Daily prompt times, weekdays, snooze duration, and missed-prompt catch-up.
- Daily note folder, date format, long-entry heading, and short-capture heading.
- Daily field labels and property names.
- Custom user-defined properties using text, number, date, multi-select, or checkbox
  types.
- Weekly, monthly, and annual review schedule settings.
- Review content options for managed rollups, inline Bases, and long-entry embeds.

## Product Direction

Daily capture fields:

- `journalShort`: quick entry for dropping thoughts
- `journalLong`: boolean/manual flag indicating long-form prose exists
- `journalWins`: multiple entries
- `journalFails`: multiple entries
- `journalTopics`: multi-select/list property
- `journalLocation`: location text
- `journalMood`: number from 1 to 10
- `journalDate`: automatic date
- `journalTime`: automatic time
- `journalWeekday`: automatic weekday

Long-form writing:

- The modal can offer an "open long journal" action.
- The plugin opens or creates the daily note and moves the cursor under `## Journal`.
- Long prose remains in the note body rather than YAML/frontmatter.
- `journalLong` is an index flag, not the long entry text.

Higher-level reviews:

- Support weekly, monthly, and annual review prompts.
- Users can choose which review levels they want and when to be prompted.
- Review notes contain user-written reflection plus plugin-managed generated sections.
- Plugin-managed rollup blocks are delimited and refreshable.
- User-authored text outside managed blocks is never overwritten.

Review rollup model:

- Metrics are computed from daily-note properties.
- Higher-level reviews may include prior review reflections where useful.
- Long-form entries can be embedded with Obsidian embeds such as
  `![[daily-note#Journal]]`.
- Inline Bases can be inserted as live evidence panels for underlying notes.

## Release Workflow

Before creating or pushing releases, authenticate GitHub CLI:

```bash
gh auth login -h github.com
```

Create and push the public repository:

```bash
git init
npm install
npm run check
npm run build
npm run package
git add .
git commit -m "Initial Journaling System scaffold"
gh repo create padasch/obsidian-journal-system --public --source=. --remote=origin --push
```

Create the BRAT-compatible release:

```bash
git tag 0.1.0
git push origin 0.1.0
gh release create 0.1.0 manifest.json main.js styles.css versions.json \
  --repo padasch/obsidian-journal-system \
  --title "0.1.0" \
  --notes "Initial BRAT-installable skeleton release."
```

BRAT should install from:

```text
https://github.com/padasch/obsidian-journal-system
```

## Test Plan

- `npm run check` passes.
- `npm run build` creates root `main.js`.
- `npm run package` creates `dist/journaling-system/` with installable assets.
- `manifest.json`, `package.json`, `versions.json`, git tag, and GitHub release all
  agree on `0.1.0`.
- GitHub release `0.1.0` contains direct release assets, not only a zip.
- BRAT can install from `https://github.com/padasch/obsidian-journal-system`.
- Obsidian command palette shows `Journaling System: Open journaling prompt`.

## Assumptions

- The first execution milestone is a release-ready skeleton, not the full journaling
  feature set.
- MIT license is acceptable.
- The plugin remains standalone and configurable.
- BRAT compatibility means direct release assets, not a zip-only release.
