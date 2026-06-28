import {
  App,
  ButtonComponent,
  FuzzySuggestModal,
  MarkdownView,
  Modal,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  TAbstractFile,
  TFile,
  TFolder,
  moment as obsidianMoment,
  normalizePath,
} from "obsidian";
import type { Moment } from "moment";

type Weekday =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

type JournalPropertyType = "text" | "number" | "date" | "multiselect" | "checkbox";
type JournalPropertyRole =
  | "short"
  | "long"
  | "location"
  | "mood"
  | "custom";
type RollupSource = "hybrid-hierarchy" | "daily-notes" | "prior-reviews";
type ReviewLevel = "weekly" | "monthly" | "annual";
type JournalType = "daily" | ReviewLevel;
type BaseRowHeight = "default" | "short" | "medium" | "tall";
type BaseColumnSizes = Record<string, number>;
type BasePropertyListKey = "baseProperties" | "reviewBaseProperties";

interface JournalPropertyDefinition {
  id: string;
  enabled: boolean;
  label: string;
  property: string;
  placeholder: string;
  type: JournalPropertyType;
  role: JournalPropertyRole;
  min?: number;
  max?: number;
  builtIn?: boolean;
}

interface ReviewPropertyDefinition {
  id: string;
  enabled: boolean;
  label: string;
  property: string;
  placeholder: string;
  type: JournalPropertyType;
  levels: ReviewLevel[];
  builtIn?: boolean;
}

interface JournalingSystemSettings {
  schemaVersion: number;
  ui: {
    modalFontSizePx: number;
  };
  dailyPrompts: {
    enabled: boolean;
    times: string[];
    weekdays: Weekday[];
    snoozeMinutes: number;
    catchUpMissedPrompts: boolean;
    lastPromptKey: string;
    snoozedUntil: number;
  };
  dailyNote: {
    folder: string;
    dateFormat: string;
    createIfMissing: boolean;
    longEntryHeading: string;
    shortEntrySectionHeading: string;
  };
  properties: JournalPropertyDefinition[];
  automaticProperties: {
    date: string;
    time: string;
    weekday: string;
    type: string;
    week: string;
    month: string;
    year: string;
  };
  reviews: {
    weekly: {
      enabled: boolean;
      promptWeekday: Weekday;
      promptTime: string;
      noteNameFormat: string;
      lastPromptKey: string;
    };
    monthly: {
      enabled: boolean;
      promptDayOfMonth: number;
      promptTime: string;
      noteNameFormat: string;
      lastPromptKey: string;
    };
    annual: {
      enabled: boolean;
      promptMonthDay: string;
      promptTime: string;
      noteNameFormat: string;
      lastPromptKey: string;
    };
    folder: string;
    rollupSource: RollupSource;
    includeManagedRollupBlock: boolean;
    includeInlineBases: boolean;
    includeLongEntryEmbeds: boolean;
    includeReviewChecklist: boolean;
    includeDailyBaseOnHigherReviews: boolean;
    longEntryEmbedLevels: Record<ReviewLevel, boolean>;
    reflectionHeading: string;
    rollupHeading: string;
    sourceNotesHeading: string;
    checklistHeading: string;
    longEntriesHeading: string;
    baseProperties: string[];
    reviewBaseProperties: string[];
    baseRowHeight: BaseRowHeight;
    baseColumnSizes: BaseColumnSizes;
    reviewProperties: ReviewPropertyDefinition[];
    checklistItems: Record<ReviewLevel, string[]>;
  };
}

interface JournalValue {
  definition: JournalPropertyDefinition;
  value: string | number | string[] | boolean;
}

const SETTINGS_SCHEMA_VERSION = 7;
const moment = obsidianMoment as unknown as () => Moment;

const WEEKDAYS: Weekday[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

const WEEKDAY_LABELS: Record<Weekday, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

const PROPERTY_TYPE_LABELS: Record<JournalPropertyType, string> = {
  text: "Text",
  number: "Number",
  date: "Date",
  multiselect: "Multi-select",
  checkbox: "Checkbox",
};

const BASE_ROW_HEIGHT_LABELS: Record<BaseRowHeight, string> = {
  default: "Default",
  short: "Short",
  medium: "Medium",
  tall: "Tall",
};

const DEFAULT_REVIEW_BASE_PROPERTIES = [
  "file.name",
  "journalDate",
  "journalWeekday",
  "journalTime",
  "journalWeek",
  "journalMonth",
  "journalYear",
  "journalShort",
  "journalLong",
  "journalLocation",
  "journalMood",
];

const DEFAULT_REVIEW_SOURCE_BASE_PROPERTIES = [
  "file.name",
  "journalWeek",
  "journalMonth",
  "journalYear",
  "journalHighlights",
  "journalDifficulties",
  "journalImprovements",
  "journalLife",
  "journalWork",
  "journalThemes",
];

const DEFAULT_REVIEW_BASE_COLUMN_SIZES: BaseColumnSizes = {
  journalShort: 550,
  journalLocation: 120,
  journalHighlights: 360,
  journalDifficulties: 360,
  journalImprovements: 360,
  journalLife: 320,
  journalWork: 320,
  journalThemes: 180,
};

const LEGACY_DAILY_PROPERTY_IDS = new Set([
  "journalWins",
  "journalFails",
  "journalTopics",
]);

const LEGACY_REVIEW_PROPERTY_RENAMES: Record<string, string> = {
  journalWins: "journalHighlights",
  journalFails: "journalDifficulties",
  journalTopics: "journalThemes",
};

const REVIEW_BASE_START = "<!-- JOURNALING-SYSTEM:BASE:START -->";
const REVIEW_BASE_END = "<!-- JOURNALING-SYSTEM:BASE:END -->";
const LEGACY_REVIEW_BASE_BLOCK =
  /```base\s+views:\s+  - type: table\s+    name: Journal source notes\s+```/;
const REVIEW_LONG_ENTRIES_START = "<!-- JOURNALING-SYSTEM:LONG-ENTRIES:START -->";
const REVIEW_LONG_ENTRIES_END = "<!-- JOURNALING-SYSTEM:LONG-ENTRIES:END -->";
const LEGACY_LONG_ENTRIES_PLACEHOLDER =
  "<!-- Long-entry embeds will be generated in a later milestone. -->";
const REVIEW_ROLLUP_START = "<!-- JOURNALING-SYSTEM:ROLLUP:START -->";
const REVIEW_ROLLUP_END = "<!-- JOURNALING-SYSTEM:ROLLUP:END -->";

const DEFAULT_PROPERTIES: JournalPropertyDefinition[] = [
  {
    id: "journalShort",
    enabled: true,
    label: "Quick entry",
    property: "journalShort",
    placeholder: "Drop a quick thought",
    type: "text",
    role: "short",
    builtIn: true,
  },
  {
    id: "journalLong",
    enabled: true,
    label: "Long journal entry",
    property: "journalLong",
    placeholder: "Open the long journal section",
    type: "checkbox",
    role: "long",
    builtIn: true,
  },
  {
    id: "journalLocation",
    enabled: true,
    label: "Location",
    property: "journalLocation",
    placeholder: "Where are you?",
    type: "text",
    role: "location",
    builtIn: true,
  },
  {
    id: "journalMood",
    enabled: true,
    label: "Mood",
    property: "journalMood",
    placeholder: "1-10",
    type: "number",
    role: "mood",
    min: 1,
    max: 10,
    builtIn: true,
  },
];

const DEFAULT_REVIEW_PROPERTIES: ReviewPropertyDefinition[] = [
  {
    id: "journalHighlights",
    enabled: true,
    label: "Highlights",
    property: "journalHighlights",
    placeholder: "What stood out positively?",
    type: "multiselect",
    levels: ["weekly", "monthly", "annual"],
    builtIn: true,
  },
  {
    id: "journalDifficulties",
    enabled: true,
    label: "Difficulties",
    property: "journalDifficulties",
    placeholder: "What was difficult?",
    type: "multiselect",
    levels: ["weekly", "monthly", "annual"],
    builtIn: true,
  },
  {
    id: "journalImprovements",
    enabled: true,
    label: "Improvements",
    property: "journalImprovements",
    placeholder: "What could be improved?",
    type: "multiselect",
    levels: ["weekly", "monthly", "annual"],
    builtIn: true,
  },
  {
    id: "journalLife",
    enabled: true,
    label: "Life",
    property: "journalLife",
    placeholder: "Life reflection",
    type: "text",
    levels: ["weekly", "monthly", "annual"],
    builtIn: true,
  },
  {
    id: "journalWork",
    enabled: true,
    label: "Work",
    property: "journalWork",
    placeholder: "Work reflection",
    type: "text",
    levels: ["weekly", "monthly", "annual"],
    builtIn: true,
  },
  {
    id: "journalThemes",
    enabled: true,
    label: "Themes",
    property: "journalThemes",
    placeholder: "Recurring themes",
    type: "multiselect",
    levels: ["weekly", "monthly", "annual"],
    builtIn: true,
  },
];

const DEFAULT_REVIEW_CHECKLIST_ITEMS: Record<ReviewLevel, string[]> = {
  weekly: [
    "Read the daily short entries",
    "Skim long journal entries",
    "Identify recurring themes",
  ],
  monthly: [
    "Read the weekly reviews",
    "Compare themes across weeks",
    "Open daily notes only where needed",
  ],
  annual: [
    "Read the monthly reviews",
    "Identify repeated themes and changes",
    "Open weekly or daily notes only where needed",
  ],
};

const DEFAULT_SETTINGS: JournalingSystemSettings = {
  schemaVersion: SETTINGS_SCHEMA_VERSION,
  ui: {
    modalFontSizePx: 15,
  },
  dailyPrompts: {
    enabled: true,
    times: ["09:00", "20:00"],
    weekdays: [...WEEKDAYS],
    snoozeMinutes: 30,
    catchUpMissedPrompts: true,
    lastPromptKey: "",
    snoozedUntil: 0,
  },
  dailyNote: {
    folder: "",
    dateFormat: "YYYY-MM-DD dddd",
    createIfMissing: true,
    longEntryHeading: "Journal",
    shortEntrySectionHeading: "Journal Captures",
  },
  properties: DEFAULT_PROPERTIES.map((property) => ({ ...property })),
  automaticProperties: {
    date: "journalDate",
    time: "journalTime",
    weekday: "journalWeekday",
    type: "journalType",
    week: "journalWeek",
    month: "journalMonth",
    year: "journalYear",
  },
  reviews: {
    weekly: {
      enabled: true,
      promptWeekday: "sunday",
      promptTime: "18:00",
      noteNameFormat: "[Week] WW - YYYY",
      lastPromptKey: "",
    },
    monthly: {
      enabled: true,
      promptDayOfMonth: 1,
      promptTime: "18:00",
      noteNameFormat: "MMMM YYYY",
      lastPromptKey: "",
    },
    annual: {
      enabled: true,
      promptMonthDay: "01-01",
      promptTime: "18:00",
      noteNameFormat: "YYYY [Annual Review]",
      lastPromptKey: "",
    },
    folder: "",
    rollupSource: "hybrid-hierarchy",
    includeManagedRollupBlock: false,
    includeInlineBases: true,
    includeLongEntryEmbeds: true,
    includeReviewChecklist: true,
    includeDailyBaseOnHigherReviews: false,
    longEntryEmbedLevels: {
      weekly: true,
      monthly: false,
      annual: false,
    },
    reflectionHeading: "Review",
    rollupHeading: "Rollup",
    sourceNotesHeading: "Source Notes",
    checklistHeading: "Review Checklist",
    longEntriesHeading: "Long entries",
    baseProperties: [...DEFAULT_REVIEW_BASE_PROPERTIES],
    reviewBaseProperties: [...DEFAULT_REVIEW_SOURCE_BASE_PROPERTIES],
    baseRowHeight: "tall",
    baseColumnSizes: { ...DEFAULT_REVIEW_BASE_COLUMN_SIZES },
    reviewProperties: DEFAULT_REVIEW_PROPERTIES.map((property) => ({ ...property })),
    checklistItems: cloneChecklistItems(DEFAULT_REVIEW_CHECKLIST_ITEMS),
  },
};

export default class JournalingSystemPlugin extends Plugin {
  settings: JournalingSystemSettings = cloneSettings(DEFAULT_SETTINGS);

  async onload(): Promise<void> {
    await this.loadSettings();

    this.addCommand({
      id: "open-journaling-prompt",
      name: "Open daily journal prompt",
      callback: () => {
        new JournalingPromptModal(this.app, this).open();
      },
    });

    this.addCommand({
      id: "open-long-journal-entry",
      name: "Open long journal entry",
      callback: async () => {
        await this.openLongJournalEntry([]);
      },
    });

    this.addCommand({
      id: "open-weekly-review",
      name: "Open weekly review",
      callback: async () => {
        await this.openReview("weekly");
      },
    });

    this.addCommand({
      id: "open-monthly-review",
      name: "Open monthly review",
      callback: async () => {
        await this.openReview("monthly");
      },
    });

    this.addCommand({
      id: "open-annual-review",
      name: "Open annual review",
      callback: async () => {
        await this.openReview("annual");
      },
    });

    this.addSettingTab(new JournalingSystemSettingTab(this.app, this));

    this.app.workspace.onLayoutReady(() => {
      void this.checkSchedules();
    });
    this.registerInterval(
      window.setInterval(() => {
        void this.checkSchedules();
      }, 30_000)
    );
  }

  async loadSettings(): Promise<void> {
    this.settings = normalizeSettings(await this.loadData());
  }

  async saveSettings(): Promise<void> {
    this.settings.schemaVersion = SETTINGS_SCHEMA_VERSION;
    await this.saveData(this.settings);
  }

  getEnabledProperties(): JournalPropertyDefinition[] {
    return this.settings.properties.filter((property) => property.enabled);
  }

  getLongProperty(): JournalPropertyDefinition {
    const longProperty = this.settings.properties.find(
      (property) => property.role === "long"
    );

    return longProperty ?? DEFAULT_PROPERTIES[1];
  }

  getTodayContext(now = moment()): {
    date: string;
    time: string;
    weekday: string;
    week: string;
    month: string;
    year: string;
  } {
    return {
      date: now.format("YYYY-MM-DD"),
      time: now.format("HH:mm"),
      weekday: now.format("dddd"),
      week: now.format("GGGG-[W]WW"),
      month: now.format("YYYY-MM"),
      year: now.format("YYYY"),
    };
  }

  async checkSchedules(): Promise<void> {
    const now = moment();
    await this.checkDailyPrompt(now);
    await this.checkReviewPrompts(now);
  }

  async checkDailyPrompt(now = moment()): Promise<void> {
    const prompts = this.settings.dailyPrompts;

    if (!prompts.enabled || prompts.snoozedUntil > Date.now()) {
      return;
    }

    const weekday = now.format("dddd").toLowerCase() as Weekday;
    const currentTime = now.format("HH:mm");
    const dueTime = prompts.times.includes(currentTime)
      ? currentTime
      : prompts.catchUpMissedPrompts
        ? findLatestDuePromptTime(prompts.times, currentTime)
        : null;

    if (!prompts.weekdays.includes(weekday) || !dueTime) {
      return;
    }

    const promptKey = `${now.format("YYYY-MM-DD")}|${dueTime}`;
    if (prompts.lastPromptKey === promptKey) {
      return;
    }

    prompts.lastPromptKey = promptKey;
    await this.saveSettings();
    new DailyPromptDecisionModal(this.app, this, dueTime).open();
  }

  async checkReviewPrompts(now = moment()): Promise<void> {
    const reviews = this.settings.reviews;
    const currentTime = now.format("HH:mm");

    if (
      reviews.weekly.enabled &&
      reviews.weekly.promptTime === currentTime &&
      reviews.weekly.promptWeekday === (now.format("dddd").toLowerCase() as Weekday)
    ) {
      await this.maybeOpenReviewPrompt("weekly", now);
    }

    if (
      reviews.monthly.enabled &&
      reviews.monthly.promptTime === currentTime &&
      reviews.monthly.promptDayOfMonth === now.date()
    ) {
      await this.maybeOpenReviewPrompt("monthly", now);
    }

    if (
      reviews.annual.enabled &&
      reviews.annual.promptTime === currentTime &&
      reviews.annual.promptMonthDay === now.format("MM-DD")
    ) {
      await this.maybeOpenReviewPrompt("annual", now);
    }
  }

  async maybeOpenReviewPrompt(level: ReviewLevel, now = moment()): Promise<void> {
    const reviewSettings = this.settings.reviews[level];
    const key = `${level}|${now.format("YYYY-MM-DD")}|${reviewSettings.promptTime}`;

    if (reviewSettings.lastPromptKey === key) {
      return;
    }

    reviewSettings.lastPromptKey = key;
    await this.saveSettings();
    new ReviewPromptDecisionModal(this.app, this, level).open();
  }

  async snoozeDailyPrompt(): Promise<void> {
    this.settings.dailyPrompts.snoozedUntil =
      Date.now() + this.settings.dailyPrompts.snoozeMinutes * 60_000;
    await this.saveSettings();
    new Notice(`Journaling prompt snoozed for ${this.settings.dailyPrompts.snoozeMinutes} minutes.`);
  }

  async saveJournal(values: JournalValue[]): Promise<TFile> {
    const file = await this.getOrCreateDailyNote();
    await this.writeJournalProperties(file, values);
    await this.appendShortCapture(file, values);
    return file;
  }

  async openLongJournalEntry(values: JournalValue[]): Promise<void> {
    const file = await this.saveJournal([
      ...values,
      { definition: this.getLongProperty(), value: true },
    ]);
    await this.ensureHeading(file, this.settings.dailyNote.longEntryHeading);
    await this.openFileAtHeading(file, this.settings.dailyNote.longEntryHeading);
  }

  async openReview(level: ReviewLevel): Promise<void> {
    const file = await this.getOrCreateReviewNote(level);
    const leaf = this.app.workspace.getLeaf(false);
    await leaf.openFile(file, { active: true });
    new Notice(`Opened ${level} review.`);
  }

  async getOrCreateDailyNote(now = moment()): Promise<TFile> {
    const notePath = this.getDailyNotePath(now);
    const existing = this.app.vault.getFileByPath(notePath);

    if (existing) {
      return existing;
    }

    if (!this.settings.dailyNote.createIfMissing) {
      throw new Error(`Daily note does not exist: ${notePath}`);
    }

    await this.ensureFolderForPath(notePath);
    return await this.app.vault.create(notePath, this.createDailyNoteContent(now));
  }

  getDailyNotePath(now = moment()): string {
    const fileName = ensureMarkdownExtension(now.format(this.settings.dailyNote.dateFormat));
    const folder = renderTemplatedFolder(this.settings.dailyNote.folder, now);
    return normalizePath([folder, fileName].filter(Boolean).join("/"));
  }

  createDailyNoteContent(now = moment()): string {
    const title = now.format(this.settings.dailyNote.dateFormat);
    return `${formatFrontmatterBlock(this.getAutomaticFrontmatter("daily", now))}# ${title}\n\n## ${this.settings.dailyNote.longEntryHeading}\n`;
  }

  async getOrCreateReviewNote(level: ReviewLevel, now = moment()): Promise<TFile> {
    const notePath = this.getReviewNotePath(level, now);
    const existing = this.app.vault.getFileByPath(notePath);

    if (existing) {
      await this.writeReviewProperties(existing, level, now);
      await this.cleanupLegacyReviewScaffolding(existing);
      await this.ensureReviewChecklist(existing, level);
      await this.ensureReviewBaseBlock(existing, level, now);
      await this.ensureHigherReviewDailyBaseBlock(existing, level, now);
      await this.ensureReviewLongEntryEmbeds(existing, level, now);
      return existing;
    }

    await this.ensureFolderForPath(notePath);
    return await this.app.vault.create(notePath, this.createReviewNoteContent(level, now));
  }

  getReviewNotePath(level: ReviewLevel, now = moment()): string {
    const reviewSettings = this.settings.reviews[level];
    const fileName = ensureMarkdownExtension(now.format(reviewSettings.noteNameFormat));
    const folder = renderTemplatedFolder(this.settings.reviews.folder, now);
    return normalizePath([folder, fileName].filter(Boolean).join("/"));
  }

  createReviewNoteContent(level: ReviewLevel, now = moment()): string {
    const title = now.format(this.settings.reviews[level].noteNameFormat);
    const lines = [
      `# ${title}`,
      "",
    ];

    if (this.settings.reviews.includeReviewChecklist) {
      lines.push(
        `## ${this.settings.reviews.checklistHeading}`,
        "",
        ...this.createReviewChecklistBlock(level),
        ""
      );
    }

    if (this.settings.reviews.includeInlineBases) {
      lines.push(
        `## ${this.settings.reviews.sourceNotesHeading}`,
        "",
        ...this.createReviewBaseBlock(level, now),
        ""
      );

      if (this.shouldIncludeHigherReviewDailyBase(level)) {
        lines.push(
          "## Daily Notes",
          "",
          ...this.createDailySourceBaseBlock(level, now),
          ""
        );
      }
    }

    if (this.shouldIncludeLongEntryEmbeds(level)) {
      lines.push(
        `## ${this.settings.reviews.longEntriesHeading}`,
        "",
        ...this.createLongEntryEmbedsBlock(level, now),
        ""
      );
    }

    lines.push(`## ${this.settings.reviews.reflectionHeading}`, "");

    return `${formatFrontmatterBlock(this.getReviewFrontmatter(level, now))}${lines.join("\n")}`;
  }

  async writeJournalProperties(file: TFile, values: JournalValue[]): Promise<void> {
    const now = moment();
    const context = this.getTodayContext(now);
    const automaticFrontmatter = this.getAutomaticFrontmatter("daily", now);

    await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
      for (const [property, value] of Object.entries(automaticFrontmatter)) {
        frontmatter[property] = value;
      }

      for (const { definition, value } of values) {
        if (!definition.enabled || definition.property.trim().length === 0) {
          continue;
        }

        frontmatter[definition.property] = toFrontmatterValue(
          definition,
          frontmatter[definition.property],
          value,
          context.time
        );
      }
    });
  }

  async writeReviewProperties(file: TFile, level: ReviewLevel, now = moment()): Promise<void> {
    const automaticFrontmatter = this.getAutomaticFrontmatter(level, now);
    const reviewProperties = this.getReviewProperties(level);

    await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
      for (const [property, value] of Object.entries(automaticFrontmatter)) {
        frontmatter[property] = value;
      }

      for (const property of reviewProperties) {
        const key = property.property.trim();
        if (key.length === 0 || frontmatter[key] !== undefined) {
          continue;
        }

        frontmatter[key] = emptyReviewPropertyValue(property);
      }
    });
  }

  async cleanupLegacyReviewScaffolding(file: TFile): Promise<void> {
    const content = await this.app.vault.read(file);
    const withoutRollup = removeManagedSection(
      content,
      this.settings.reviews.rollupHeading,
      REVIEW_ROLLUP_START,
      REVIEW_ROLLUP_END
    );

    if (withoutRollup !== content) {
      await this.app.vault.modify(file, withoutRollup);
    }
  }

  async ensureReviewBaseBlock(file: TFile, level: ReviewLevel, now = moment()): Promise<void> {
    if (!this.settings.reviews.includeInlineBases) {
      return;
    }

    const content = await this.app.vault.read(file);
    const block = this.createReviewBaseBlock(level, now).join("\n");
    const withManagedBlock = replaceManagedBlock(
      content,
      REVIEW_BASE_START,
      REVIEW_BASE_END,
      block
    );
    const updated =
      withManagedBlock ??
      replaceGeneratedBaseBlockInSection(
        content,
        this.settings.reviews.sourceNotesHeading,
        block
      ) ??
      content.replace(LEGACY_REVIEW_BASE_BLOCK, block);

    if (updated !== content) {
      await this.app.vault.modify(file, updated);
      return;
    }

    if (sectionContainsBaseBlock(content, this.settings.reviews.sourceNotesHeading)) {
      return;
    }

    const withInsertedBlock = insertBlockUnderHeading(
      content,
      this.settings.reviews.sourceNotesHeading,
      block
    );

    if (withInsertedBlock !== content) {
      await this.app.vault.modify(file, withInsertedBlock);
    }
  }

  async ensureHigherReviewDailyBaseBlock(
    file: TFile,
    level: ReviewLevel,
    now = moment()
  ): Promise<void> {
    if (
      !this.settings.reviews.includeInlineBases ||
      !this.shouldIncludeHigherReviewDailyBase(level)
    ) {
      return;
    }

    const content = await this.app.vault.read(file);
    const block = this.createDailySourceBaseBlock(level, now).join("\n");
    const heading = "Daily Notes";
    const updated = replaceGeneratedBaseBlockInSection(content, heading, block);

    if (updated && updated !== content) {
      await this.app.vault.modify(file, updated);
      return;
    }

    if (sectionContainsBaseBlock(content, heading)) {
      return;
    }

    const withInsertedBlock = insertBlockUnderHeading(content, heading, block);

    if (withInsertedBlock !== content) {
      await this.app.vault.modify(file, withInsertedBlock);
    }
  }

  async ensureReviewLongEntryEmbeds(file: TFile, level: ReviewLevel, now = moment()): Promise<void> {
    if (!this.shouldIncludeLongEntryEmbeds(level)) {
      return;
    }

    const content = await this.app.vault.read(file);
    const block = this.createLongEntryEmbedsBlock(level, now).join("\n");
    const withManagedBlock = replaceManagedBlock(
      content,
      REVIEW_LONG_ENTRIES_START,
      REVIEW_LONG_ENTRIES_END,
      block
    );
    const updated =
      withManagedBlock ??
      content.replace(LEGACY_LONG_ENTRIES_PLACEHOLDER, block);

    if (updated !== content) {
      await this.app.vault.modify(file, updated);
      return;
    }

    const withGeneratedSection = replaceGeneratedLongEntriesInSection(
      content,
      this.settings.reviews.longEntriesHeading,
      block
    );

    if (withGeneratedSection && withGeneratedSection !== content) {
      await this.app.vault.modify(file, withGeneratedSection);
      return;
    }

    const withInsertedBlock = insertBlockUnderHeading(
      content,
      this.settings.reviews.longEntriesHeading,
      block
    );

    if (withInsertedBlock !== content) {
      await this.app.vault.modify(file, withInsertedBlock);
    }
  }

  async ensureReviewChecklist(file: TFile, level: ReviewLevel): Promise<void> {
    if (!this.settings.reviews.includeReviewChecklist) {
      return;
    }

    const content = await this.app.vault.read(file);
    const heading = this.settings.reviews.checklistHeading;
    if (sectionExists(content, heading)) {
      return;
    }

    const section = [
      `## ${heading}`,
      "",
      ...this.createReviewChecklistBlock(level),
    ].join("\n");
    const updated = insertSectionAfterTitle(content, section);

    if (updated !== content) {
      await this.app.vault.modify(file, updated);
    }
  }

  getAutomaticFrontmatter(journalType: JournalType, now = moment()): Record<string, string> {
    const context = this.getTodayContext(now);
    const automatic = this.settings.automaticProperties;
    const frontmatter: Record<string, string> = {};

    assignFrontmatterProperty(frontmatter, automatic.type, journalType);
    assignFrontmatterProperty(frontmatter, automatic.date, context.date);
    assignFrontmatterProperty(frontmatter, automatic.time, context.time);
    assignFrontmatterProperty(frontmatter, automatic.weekday, context.weekday);
    assignFrontmatterProperty(frontmatter, automatic.week, context.week);
    assignFrontmatterProperty(frontmatter, automatic.month, context.month);
    assignFrontmatterProperty(frontmatter, automatic.year, context.year);

    return frontmatter;
  }

  getReviewFrontmatter(level: ReviewLevel, now = moment()): Record<string, unknown> {
    const frontmatter: Record<string, unknown> = {
      ...this.getAutomaticFrontmatter(level, now),
    };

    for (const property of this.getReviewProperties(level)) {
      const key = property.property.trim();
      if (key.length > 0 && frontmatter[key] === undefined) {
        frontmatter[key] = emptyReviewPropertyValue(property);
      }
    }

    return frontmatter;
  }

  createReviewChecklistBlock(level: ReviewLevel): string[] {
    const configuredItems = normalizeChecklistItems(
      this.settings.reviews.checklistItems[level]
    );
    const propertyItems = this.getReviewProperties(level).map(
      (property) => `Fill ${property.property}`
    );

    return [...configuredItems, ...propertyItems].map((item) => `- [ ] ${item}`);
  }

  createReviewBaseBlock(level: ReviewLevel, now = moment()): string[] {
    const source = this.getReviewSource(level, now);
    const typeProperty =
      this.settings.automaticProperties.type.trim() ||
      DEFAULT_SETTINGS.automaticProperties.type;
    const columns = this.getReviewBaseProperties(level);
    const rowHeight = normalizeBaseRowHeight(this.settings.reviews.baseRowHeight);
    const columnSizes = this.getReviewBaseColumnSizes(columns);
    const displayNames = getBasePropertyDisplayNames(columns);

    return [
      "```base",
      "filters:",
      "  and:",
      `    - ${formatBasePropertyReference(typeProperty)} == ${formatBaseString(source.journalType)}`,
      `    - ${formatBasePropertyReference(source.period.property)} == ${formatBaseString(source.period.value)}`,
      ...formatBasePropertyDisplayNameBlock(displayNames),
      "views:",
      "  - type: table",
      `    name: ${source.name}`,
      ...(rowHeight === "default" ? [] : [`    rowHeight: ${rowHeight}`]),
      ...(columnSizes.length > 0
        ? [
            "    columnSize:",
            ...columnSizes.map(
              ([property, size]) => `      ${formatBaseColumnSizeKey(property)}: ${size}`
            ),
          ]
        : []),
      ...(columns.length > 0
        ? [
            "    order:",
            ...columns.map((property) => `      - ${formatBasePropertyReference(property)}`),
          ]
        : []),
      "```",
    ];
  }

  createDailySourceBaseBlock(level: ReviewLevel, now = moment()): string[] {
    const source = this.getDailySourceForReview(level, now);
    const typeProperty =
      this.settings.automaticProperties.type.trim() ||
      DEFAULT_SETTINGS.automaticProperties.type;
    const columns = normalizeDailyBaseProperties(this.settings.reviews.baseProperties);
    const rowHeight = normalizeBaseRowHeight(this.settings.reviews.baseRowHeight);
    const columnSizes = this.getReviewBaseColumnSizes(columns);
    const displayNames = getBasePropertyDisplayNames(columns);

    return [
      "```base",
      "filters:",
      "  and:",
      `    - ${formatBasePropertyReference(typeProperty)} == ${formatBaseString("daily")}`,
      `    - ${formatBasePropertyReference(source.period.property)} == ${formatBaseString(source.period.value)}`,
      ...formatBasePropertyDisplayNameBlock(displayNames),
      "views:",
      "  - type: table",
      `    name: ${source.name}`,
      ...(rowHeight === "default" ? [] : [`    rowHeight: ${rowHeight}`]),
      ...(columnSizes.length > 0
        ? [
            "    columnSize:",
            ...columnSizes.map(
              ([property, size]) => `      ${formatBaseColumnSizeKey(property)}: ${size}`
            ),
          ]
        : []),
      ...(columns.length > 0
        ? [
            "    order:",
            ...columns.map((property) => `      - ${formatBasePropertyReference(property)}`),
          ]
        : []),
      "```",
    ];
  }

  getReviewSource(
    level: ReviewLevel,
    now = moment()
  ): {
    journalType: JournalType;
    period: { property: string; value: string };
    name: string;
  } {
    const context = this.getTodayContext(now);
    const automatic = this.settings.automaticProperties;
    const weekProperty = automatic.week.trim() || DEFAULT_SETTINGS.automaticProperties.week;
    const monthProperty = automatic.month.trim() || DEFAULT_SETTINGS.automaticProperties.month;
    const yearProperty = automatic.year.trim() || DEFAULT_SETTINGS.automaticProperties.year;

    if (level === "weekly") {
      return {
        journalType: "daily",
        period: { property: weekProperty, value: context.week },
        name: "Daily notes in this week",
      };
    }

    if (level === "monthly") {
      return {
        journalType: "weekly",
        period: { property: monthProperty, value: context.month },
        name: "Weekly reviews in this month",
      };
    }

    return {
      journalType: "monthly",
      period: { property: yearProperty, value: context.year },
      name: "Monthly reviews in this year",
    };
  }

  getDailySourceForReview(
    level: ReviewLevel,
    now = moment()
  ): { period: { property: string; value: string }; name: string } {
    const context = this.getTodayContext(now);
    const automatic = this.settings.automaticProperties;
    const weekProperty = automatic.week.trim() || DEFAULT_SETTINGS.automaticProperties.week;
    const monthProperty = automatic.month.trim() || DEFAULT_SETTINGS.automaticProperties.month;
    const yearProperty = automatic.year.trim() || DEFAULT_SETTINGS.automaticProperties.year;

    if (level === "weekly") {
      return {
        period: { property: weekProperty, value: context.week },
        name: "Daily notes in this week",
      };
    }

    if (level === "monthly") {
      return {
        period: { property: monthProperty, value: context.month },
        name: "Daily notes in this month",
      };
    }

    return {
      period: { property: yearProperty, value: context.year },
      name: "Daily notes in this year",
    };
  }

  getReviewProperties(level: ReviewLevel): ReviewPropertyDefinition[] {
    return this.settings.reviews.reviewProperties.filter(
      (property) =>
        property.enabled &&
        property.property.trim().length > 0 &&
        property.levels.includes(level)
    );
  }

  shouldIncludeLongEntryEmbeds(level: ReviewLevel): boolean {
    return (
      this.settings.reviews.includeLongEntryEmbeds &&
      this.settings.reviews.longEntryEmbedLevels[level] === true
    );
  }

  shouldIncludeHigherReviewDailyBase(level: ReviewLevel): boolean {
    return level !== "weekly" && this.settings.reviews.includeDailyBaseOnHigherReviews;
  }

  createLongEntryEmbedsBlock(level: ReviewLevel, now = moment()): string[] {
    const files = this.getLongEntrySourceFiles(level, now);
    const dateProperty =
      this.settings.automaticProperties.date.trim() ||
      DEFAULT_SETTINGS.automaticProperties.date;
    const embeds =
      files.length > 0
        ? files.flatMap((file) => {
            const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
            return [
              formatJournalEmbedDateLabel(
                file,
                isRecord(frontmatter) ? frontmatter : {},
                dateProperty
              ),
              formatJournalEmbed(file, this.settings.dailyNote.longEntryHeading),
            ];
          })
        : ["No long journal entries found for this period."];

    return [
      ...embeds,
    ];
  }

  getLongEntrySourceFiles(level: ReviewLevel, now = moment()): TFile[] {
    const automatic = this.settings.automaticProperties;
    const typeProperty = automatic.type.trim() || DEFAULT_SETTINGS.automaticProperties.type;
    const dateProperty = automatic.date.trim() || DEFAULT_SETTINGS.automaticProperties.date;
    const longProperty = this.getLongProperty().property.trim() || DEFAULT_PROPERTIES[1].property;
    const period = this.getReviewPeriod(level, now);

    const files = this.app.vault
      .getMarkdownFiles()
      .filter((file) => {
        const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
        if (!isRecord(frontmatter)) {
          return false;
        }

        if (!isTruthyFrontmatterValue(frontmatter[longProperty])) {
          return false;
        }

        const journalType = frontmatter[typeProperty];
        if (journalType !== undefined && String(journalType) !== "daily") {
          return false;
        }

        return frontmatterMatchesReviewPeriod(frontmatter, period, dateProperty, level);
      })
      .sort((a, b) => {
        const aFrontmatter = this.app.metadataCache.getFileCache(a)?.frontmatter;
        const bFrontmatter = this.app.metadataCache.getFileCache(b)?.frontmatter;
        const aDate = isRecord(aFrontmatter) ? String(aFrontmatter[dateProperty] ?? "") : "";
        const bDate = isRecord(bFrontmatter) ? String(bFrontmatter[dateProperty] ?? "") : "";
        return aDate.localeCompare(bDate) || a.path.localeCompare(b.path);
      });

    return dedupeLongEntryFilesByDate(files, (file) => {
      const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
      return getJournalDateKey(
        file,
        isRecord(frontmatter) ? frontmatter : {},
        dateProperty
      );
    });
  }

  getReviewPeriod(level: ReviewLevel, now = moment()): { property: string; value: string } {
    const context = this.getTodayContext(now);
    const automatic = this.settings.automaticProperties;
    const weekProperty = automatic.week.trim() || DEFAULT_SETTINGS.automaticProperties.week;
    const monthProperty = automatic.month.trim() || DEFAULT_SETTINGS.automaticProperties.month;
    const yearProperty = automatic.year.trim() || DEFAULT_SETTINGS.automaticProperties.year;

    if (level === "weekly") {
      return { property: weekProperty, value: context.week };
    }

    if (level === "monthly") {
      return { property: monthProperty, value: context.month };
    }

    return { property: yearProperty, value: context.year };
  }

  getReviewBaseProperties(level: ReviewLevel): string[] {
    return level === "weekly"
      ? normalizeDailyBaseProperties(this.settings.reviews.baseProperties)
      : normalizeReviewBaseProperties(this.settings.reviews.reviewBaseProperties);
  }

  getReviewBaseColumnSizes(columns: string[]): Array<[string, number]> {
    const columnSizes = normalizeBaseColumnSizes(this.settings.reviews.baseColumnSizes);

    return columns.flatMap((property) => {
      const size = columnSizes[normalizeBaseColumnSizeProperty(property)];
      return size ? [[property, size] as [string, number]] : [];
    });
  }

  getAvailableBaseProperties(kind: "daily" | "review"): string[] {
    return getAvailableBasePropertiesFromSettings(this.settings, kind);
  }

  async appendShortCapture(file: TFile, values: JournalValue[]): Promise<void> {
    const shortDefinition = values.find(({ definition }) => definition.role === "short");
    if (!shortDefinition || typeof shortDefinition.value !== "string") {
      return;
    }

    const text = shortDefinition.value.trim();
    if (text.length === 0) {
      return;
    }

    const heading = this.settings.dailyNote.shortEntrySectionHeading.trim();
    if (heading.length === 0) {
      return;
    }

    const content = await this.app.vault.read(file);
    const timestamp = moment().format("HH:mm");
    let updated = content;
    const existingEntries = extractNormalizedCaptureEntries(content, heading);

    for (const line of parseShortTextEntries(text)) {
      const normalized = normalizeCaptureEntry(line);
      if (existingEntries.has(normalized)) {
        continue;
      }

      updated = insertUnderHeading(updated, heading, `- ${timestamp} ${line}`);
      existingEntries.add(normalized);
    }

    if (updated === content) {
      return;
    }

    await this.app.vault.modify(file, updated);
  }

  async ensureHeading(file: TFile, heading: string): Promise<void> {
    const cleanHeading = heading.trim();
    if (cleanHeading.length === 0) {
      return;
    }

    const content = await this.app.vault.read(file);
    if (findHeadingLine(content, cleanHeading) !== null) {
      return;
    }

    await this.app.vault.modify(file, `${content.trimEnd()}\n\n## ${cleanHeading}\n`);
  }

  async openFileAtHeading(file: TFile, heading: string): Promise<void> {
    const leaf = this.app.workspace.getLeaf(false);
    await leaf.openFile(file, { active: true });
    this.app.workspace.setActiveLeaf(leaf, { focus: true });

    window.setTimeout(async () => {
      const view = leaf.view instanceof MarkdownView ? leaf.view : null;
      if (!view) {
        return;
      }

      const content = view.editor.getValue();
      const offset = findJournalCursorOffset(content, heading);
      const position = view.editor.offsetToPos(offset);
      view.editor.setCursor(position);
      view.editor.focus();
    }, 100);
  }

  async ensureFolderForPath(path: string): Promise<void> {
    const parts = normalizePath(path).split("/");
    parts.pop();

    let current = "";
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      if (!this.app.vault.getFolderByPath(current)) {
        await this.app.vault.createFolder(current);
      }
    }
  }

  collectExistingValues(propertyName: string): string[] {
    const values = new Set<string>();

    for (const file of this.app.vault.getMarkdownFiles()) {
      const cache = this.app.metadataCache.getFileCache(file);
      const rawValue = cache?.frontmatter?.[propertyName];

      for (const value of flattenPropertyValue(rawValue)) {
        values.add(value);
      }
    }

    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }

  getTodayFrontmatter(now = moment()): Record<string, unknown> {
    const file = this.app.vault.getFileByPath(this.getDailyNotePath(now));
    if (!file) {
      return {};
    }

    const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
    return isRecord(frontmatter) ? frontmatter : {};
  }
}

class DailyPromptDecisionModal extends Modal {
  constructor(
    app: App,
    private readonly plugin: JournalingSystemPlugin,
    private readonly promptTime: string
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("journaling-system-prompt");
    this.setTitle("Journaling prompt");

    contentEl.createEl("p", {
      text: `It is ${this.promptTime}.`,
    });

    new Setting(contentEl)
      .addButton((button) => {
        button
          .setButtonText("Journal now")
          .setCta()
          .onClick(() => {
            this.close();
            new JournalingPromptModal(this.app, this.plugin).open();
          });
      })
      .addButton((button) => {
        button
          .setButtonText("Snooze")
          .onClick(async () => {
            this.close();
            await this.plugin.snoozeDailyPrompt();
          });
      })
      .addButton((button) => {
        button
          .setButtonText("Skip")
          .onClick(() => {
            this.close();
          });
      });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

class ReviewPromptDecisionModal extends Modal {
  constructor(
    app: App,
    private readonly plugin: JournalingSystemPlugin,
    private readonly level: ReviewLevel
  ) {
    super(app);
  }

  onOpen(): void {
    this.contentEl.empty();
    this.setTitle(`${capitalize(this.level)} review`);
    this.contentEl.createEl("p", { text: "Open the review note now?" });

    new Setting(this.contentEl)
      .addButton((button) => {
        button
          .setButtonText("Open review")
          .setCta()
          .onClick(async () => {
            this.close();
            await this.plugin.openReview(this.level);
          });
      })
      .addButton((button) => {
        button.setButtonText("Skip").onClick(() => {
          this.close();
        });
      });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

class JournalingPromptModal extends Modal {
  private inputs = new Map<string, JournalFieldInput>();

  constructor(app: App, private readonly plugin: JournalingSystemPlugin) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    this.inputs.clear();
    contentEl.empty();
    this.modalEl.addClass("journaling-system-modal-shell");
    this.modalEl.style.setProperty(
      "--journaling-system-modal-font-size",
      `${normalizeModalFontSize(this.plugin.settings.ui.modalFontSizePx)}px`
    );
    contentEl.addClass("journaling-system-modal");
    this.setTitle(`Journal entry for ${moment().format("YYYY-MM-DD dddd")}`);

    const initialFrontmatter = this.plugin.getTodayFrontmatter();
    const fieldsEl = contentEl.createDiv({ cls: "journaling-system-modal-fields" });
    const properties = this.plugin
      .getEnabledProperties()
      .filter((definition) => definition.role !== "long");

    for (const definition of properties) {
      const fieldEl = fieldsEl.createDiv({ cls: "journaling-system-field" });
      fieldEl.createEl("label", {
        text: definition.label,
        cls: "journaling-system-field-label",
      });

      const input = createJournalInput(
        this.app,
        this.plugin,
        fieldEl,
        definition,
        initialFrontmatter[definition.property]
      );
      this.inputs.set(definition.id, input);
    }

    const buttonRow = contentEl.createDiv({ cls: "journaling-system-modal-actions" });
    new ButtonComponent(buttonRow)
      .setButtonText("Save")
      .setCta()
      .onClick(async () => {
        await this.saveAndClose();
      });

    if (this.plugin.getLongProperty().enabled) {
      new ButtonComponent(buttonRow)
        .setButtonText("Add long journal entry")
        .onClick(async () => {
          await this.addLongJournalEntry();
        });
    }

    new ButtonComponent(buttonRow)
      .setButtonText("Cancel")
      .onClick(() => {
        this.close();
      });
  }

  async saveAndClose(): Promise<void> {
    try {
      await this.plugin.saveJournal(this.collectValues());
      new Notice("Journal entry saved.");
      this.close();
    } catch (error) {
      new Notice(error instanceof Error ? error.message : "Could not save journal entry.");
    }
  }

  async addLongJournalEntry(): Promise<void> {
    try {
      await this.plugin.openLongJournalEntry(this.collectValues());
      this.close();
    } catch (error) {
      new Notice(error instanceof Error ? error.message : "Could not open long journal entry.");
    }
  }

  collectValues(): JournalValue[] {
    const values: JournalValue[] = [];

    for (const [id, input] of this.inputs) {
      const value = input.getValue();
      if (isEmptyJournalValue(value)) {
        continue;
      }

      const definition = this.plugin.settings.properties.find((property) => property.id === id);
      if (!definition) {
        continue;
      }

      values.push({ definition, value });
    }

    return values;
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

interface JournalFieldInput {
  getValue(): string | number | string[] | boolean;
}

function createJournalInput(
  app: App,
  plugin: JournalingSystemPlugin,
  fieldEl: HTMLElement,
  definition: JournalPropertyDefinition,
  initialValue: unknown
): JournalFieldInput {
  if (definition.type === "text") {
    const input =
      definition.role === "short"
        ? fieldEl.createEl("textarea", { cls: "journaling-system-textarea" })
        : fieldEl.createEl("input", { type: "text", cls: "journaling-system-input" });
    input.placeholder = definition.placeholder || definition.label;
    input.value = formatInitialTextValue(initialValue);
    return {
      getValue: () => input.value.trim(),
    };
  }

  if (definition.type === "number") {
    const input = fieldEl.createEl("input", {
      type: "number",
      cls: "journaling-system-input",
    });
    if (definition.min !== undefined) input.min = String(definition.min);
    if (definition.max !== undefined) input.max = String(definition.max);
    input.placeholder = definition.placeholder || definition.label;
    input.value = formatInitialNumberValue(initialValue);
    return {
      getValue: () => {
        if (input.value.trim().length === 0) {
          return "";
        }

        return Number(input.value);
      },
    };
  }

  if (definition.type === "date") {
    const input = fieldEl.createEl("input", {
      type: "date",
      cls: "journaling-system-input",
    });
    input.placeholder = definition.placeholder || definition.label;
    input.value = formatInitialDateValue(initialValue);
    return {
      getValue: () => input.value.trim(),
    };
  }

  if (definition.type === "checkbox") {
    const wrapper = fieldEl.createDiv({ cls: "journaling-system-checkbox-row" });
    const input = wrapper.createEl("input", { type: "checkbox" });
    input.checked = initialValue === true;
    wrapper.createEl("span", { text: definition.label });
    if (definition.placeholder.trim().length > 0) {
      fieldEl.createDiv({
        text: definition.placeholder,
        cls: "journaling-system-field-hint",
      });
    }
    return {
      getValue: () => input.checked,
    };
  }

  const existingValues = plugin.collectExistingValues(definition.property);
  const multiInput = new MultiSelectPropertyInput(
    fieldEl,
    existingValues,
    definition.placeholder || "One entry per line",
    flattenPropertyValue(initialValue).join("\n")
  );
  return {
    getValue: () => multiInput.getValues(),
  };
}

class MultiSelectPropertyInput {
  private readonly textareaEl: HTMLTextAreaElement;
  private readonly suggestionsEl: HTMLElement;

  constructor(
    containerEl: HTMLElement,
    private readonly existingValues: string[],
    placeholder: string,
    initialValue: string
  ) {
    const wrapper = containerEl.createDiv({ cls: "journaling-system-multiselect" });
    this.textareaEl = wrapper.createEl("textarea", {
      cls: "journaling-system-textarea journaling-system-multiselect-textarea",
    });
    this.textareaEl.placeholder = placeholder;
    this.textareaEl.value = initialValue;
    this.suggestionsEl = wrapper.createDiv({ cls: "journaling-system-suggestions" });

    this.textareaEl.addEventListener("input", () => this.renderSuggestions());
    this.textareaEl.addEventListener("keyup", () => this.renderSuggestions());
    this.textareaEl.addEventListener("click", () => this.renderSuggestions());
    this.textareaEl.addEventListener("blur", () => {
      window.setTimeout(() => this.suggestionsEl.empty(), 120);
    });
  }

  getValues(): string[] {
    return mergeStringArrays([], parseMultiSelectEntry(this.textareaEl.value));
  }

  private renderSuggestions(): void {
    this.suggestionsEl.empty();
    const query = getCurrentLine(this.textareaEl).trim();

    if (query.length === 0) {
      return;
    }

    const suggestions = this.existingValues
      .filter((value) => !this.currentValues().includes(value))
      .map((value) => ({ value, score: fuzzyScore(value, query) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score || a.value.localeCompare(b.value))
      .slice(0, 8);

    for (const { value } of suggestions) {
      const button = this.suggestionsEl.createEl("button", {
        text: value,
        cls: "journaling-system-suggestion",
      });
      button.type = "button";
      button.addEventListener("click", () => {
        replaceCurrentLine(this.textareaEl, value);
        this.suggestionsEl.empty();
        this.textareaEl.focus();
      });
    }
  }

  private currentValues(): string[] {
    return parseMultiSelectEntry(this.textareaEl.value);
  }
}

class JournalingSystemSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: JournalingSystemPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass("journaling-system-settings");

    containerEl.createEl("h1", { text: "Journaling System" });
    this.displaySystemIdea(containerEl);
    this.displayBasicSettings(containerEl);
    this.displayPropertySettings(containerEl);
    this.displayBaseSettings(containerEl);
    this.displayDailySettings(containerEl);
    this.displayReviewLevelSettings(containerEl, "Weekly", "weekly");
    this.displayReviewLevelSettings(containerEl, "Monthly", "monthly");
    this.displayReviewLevelSettings(containerEl, "Annual", "annual");
  }

  private displaySystemIdea(containerEl: HTMLElement): void {
    const details = containerEl.createEl("details", {
      cls: "journaling-system-system-note",
    });
    details.createEl("summary", {
      text: "How this journaling system is meant to work",
      cls: "journaling-system-system-note-summary",
    });

    const body = details.createDiv({ cls: "journaling-system-system-note-body" });
    body.createEl("p", {
      text: "Daily notes are the raw signal: quick thoughts, optional long writing, mood, and location. They should stay lightweight enough that you actually use them.",
    });
    body.createEl("p", {
      text: "Weekly reviews are the first interpretation layer: scan the daily signal, then name highlights, difficulties, improvements, and optional life/work reflections.",
    });
    body.createEl("p", {
      text: "Monthly and annual reviews synthesize patterns from previous review notes. Use written reflection for nuance, and use multiselect fields such as Themes for recurring labels you want to compare in Bases.",
    });
    body.createEl("p", {
      text: "Themes are not meant as daily topics. Treat them as short recurring patterns, for example sleep/recovery, context switching, creative momentum, or relationships. A small set of clear labels is more useful than tagging everything.",
    });
  }

  private displayBasicSettings(containerEl: HTMLElement): void {
    const section = createSettingsSection(containerEl, "Basic settings");

    const modalFontSize = normalizeModalFontSize(this.plugin.settings.ui.modalFontSizePx);
    const fontSizeSetting = new Setting(section)
      .setName("Journal modal font size")
      .setDesc("Desktop journaling prompt text size.");
    fontSizeSetting.addSlider((slider) => {
      const formattedSlider = slider as typeof slider & {
        setDisplayFormat?: (format: (value: number) => string) => typeof slider;
      };
      formattedSlider.setDisplayFormat?.((value) => `${value}px`);
      slider
        .setLimits(12, 20, 1)
        .setValue(modalFontSize)
        .onChange(async (value) => {
          const normalized = normalizeModalFontSize(value);
          this.plugin.settings.ui.modalFontSizePx = normalized;
          await this.plugin.saveSettings();
        });
    });

    this.addFolderSetting(
      section,
      "Review folder",
      this.plugin.settings.reviews.folder,
      async (value) => {
        this.plugin.settings.reviews.folder = value;
        await this.plugin.saveSettings();
      }
    );

    this.addToggleSetting(section, "Review checklist", "includeReviewChecklist");
    this.addToggleSetting(section, "Long-entry embeds", "includeLongEntryEmbeds");
    this.addTextSetting(
      section,
      "Checklist heading",
      this.plugin.settings.reviews.checklistHeading,
      async (value) => {
        this.plugin.settings.reviews.checklistHeading =
          value || DEFAULT_SETTINGS.reviews.checklistHeading;
        await this.plugin.saveSettings();
      }
    );
    this.addTextSetting(
      section,
      "Source notes heading",
      this.plugin.settings.reviews.sourceNotesHeading,
      async (value) => {
        this.plugin.settings.reviews.sourceNotesHeading =
          value || DEFAULT_SETTINGS.reviews.sourceNotesHeading;
        await this.plugin.saveSettings();
      }
    );
    this.addTextSetting(
      section,
      "Long entries heading",
      this.plugin.settings.reviews.longEntriesHeading,
      async (value) => {
        this.plugin.settings.reviews.longEntriesHeading =
          value || DEFAULT_SETTINGS.reviews.longEntriesHeading;
        await this.plugin.saveSettings();
      }
    );
    this.addTextSetting(
      section,
      "Reflection heading",
      this.plugin.settings.reviews.reflectionHeading,
      async (value) => {
        this.plugin.settings.reviews.reflectionHeading =
          value || DEFAULT_SETTINGS.reviews.reflectionHeading;
        await this.plugin.saveSettings();
      }
    );
  }

  private displayBaseSettings(containerEl: HTMLElement): void {
    const section = createSettingsSection(containerEl, "Bases settings shared across all notes");

    this.addToggleSetting(section, "Inline Bases", "includeInlineBases");
    this.addToggleSetting(
      section,
      "Daily Base in monthly/annual",
      "includeDailyBaseOnHigherReviews"
    );

    new Setting(section)
      .setName("Base row height")
      .setDesc("Controls row height for generated review Bases.")
      .addDropdown((dropdown) => {
        dropdown
          .addOptions(BASE_ROW_HEIGHT_LABELS)
          .setValue(normalizeBaseRowHeight(this.plugin.settings.reviews.baseRowHeight))
          .onChange(async (value) => {
            this.plugin.settings.reviews.baseRowHeight = normalizeBaseRowHeight(value);
            await this.plugin.saveSettings();
          });
      });

    section.createEl("h3", { text: "Daily source Base columns" });
    section.createDiv({
      cls: "journaling-system-section-note",
      text: "Used by weekly reviews and by the optional daily Base in monthly or annual reviews.",
    });
    this.renderBasePropertyTable(
      section,
      "baseProperties",
      this.plugin.getAvailableBaseProperties("daily")
    );

    section.createEl("h3", { text: "Review source Base columns" });
    section.createDiv({
      cls: "journaling-system-section-note",
      text: "Used when monthly reviews show weekly reviews and annual reviews show monthly reviews.",
    });
    this.renderBasePropertyTable(
      section,
      "reviewBaseProperties",
      this.plugin.getAvailableBaseProperties("review")
    );
  }

  private displayDailySettings(containerEl: HTMLElement): void {
    const section = createSettingsSection(containerEl, "Daily settings");

    new Setting(section)
      .setName("Enable prompts")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.dailyPrompts.enabled).onChange(async (value) => {
          this.plugin.settings.dailyPrompts.enabled = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(section)
      .setName("Times")
      .addText((text) => {
        text
          .setPlaceholder("09:00, 20:00")
          .setValue(this.plugin.settings.dailyPrompts.times.join(", "))
          .onChange(async (value) => {
            this.plugin.settings.dailyPrompts.times = parseDelimitedList(value);
            await this.plugin.saveSettings();
          });
      });

    const weekdayRow = section.createDiv({ cls: "journaling-system-weekday-row" });
    weekdayRow.createDiv({ text: "Weekdays", cls: "journaling-system-setting-label" });
    const weekdayButtons = weekdayRow.createDiv({ cls: "journaling-system-weekday-grid" });

    for (const weekday of WEEKDAYS) {
      const button = weekdayButtons.createEl("button", {
        text: WEEKDAY_LABELS[weekday].slice(0, 3),
        cls: this.plugin.settings.dailyPrompts.weekdays.includes(weekday)
          ? "journaling-system-weekday is-active"
          : "journaling-system-weekday",
      });
      button.type = "button";
      button.ariaLabel = WEEKDAY_LABELS[weekday];
      button.addEventListener("click", async () => {
        const weekdays = new Set(this.plugin.settings.dailyPrompts.weekdays);
        if (weekdays.has(weekday)) {
          weekdays.delete(weekday);
        } else {
          weekdays.add(weekday);
        }

        this.plugin.settings.dailyPrompts.weekdays = WEEKDAYS.filter((day) =>
          weekdays.has(day)
        );
        await this.plugin.saveSettings();
        this.display();
      });
    }

    new Setting(section)
      .setName("Snooze minutes")
      .addText((text) => {
        text.inputEl.type = "number";
        text
          .setValue(String(this.plugin.settings.dailyPrompts.snoozeMinutes))
          .onChange(async (value) => {
            this.plugin.settings.dailyPrompts.snoozeMinutes = clamp(
              parseInteger(value, 30),
              1,
              1440
            );
            await this.plugin.saveSettings();
          });
      });

    new Setting(section)
      .setName("Catch up missed prompts")
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.dailyPrompts.catchUpMissedPrompts)
          .onChange(async (value) => {
            this.plugin.settings.dailyPrompts.catchUpMissedPrompts = value;
            await this.plugin.saveSettings();
          });
      });

    this.addFolderSetting(
      section,
      "Folder",
      this.plugin.settings.dailyNote.folder,
      async (value) => {
        this.plugin.settings.dailyNote.folder = value;
        await this.plugin.saveSettings();
      }
    );
    this.addTextSetting(
      section,
      "Date format",
      this.plugin.settings.dailyNote.dateFormat,
      async (value) => {
        this.plugin.settings.dailyNote.dateFormat = value || DEFAULT_SETTINGS.dailyNote.dateFormat;
        await this.plugin.saveSettings();
      }
    );
    this.addTextSetting(
      section,
      "Long-entry heading",
      this.plugin.settings.dailyNote.longEntryHeading,
      async (value) => {
        this.plugin.settings.dailyNote.longEntryHeading =
          value || DEFAULT_SETTINGS.dailyNote.longEntryHeading;
        await this.plugin.saveSettings();
      }
    );
    this.addTextSetting(
      section,
      "Capture heading",
      this.plugin.settings.dailyNote.shortEntrySectionHeading,
      async (value) => {
        this.plugin.settings.dailyNote.shortEntrySectionHeading =
          value || DEFAULT_SETTINGS.dailyNote.shortEntrySectionHeading;
        await this.plugin.saveSettings();
      }
    );

    new Setting(section)
      .setName("Create note if missing")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.dailyNote.createIfMissing).onChange(async (value) => {
          this.plugin.settings.dailyNote.createIfMissing = value;
          await this.plugin.saveSettings();
        });
      });
  }

  private displayReviewLevelSettings(
    containerEl: HTMLElement,
    label: string,
    level: ReviewLevel
  ): void {
    const section = createSettingsSection(containerEl, `${label} settings`);
    const review = this.plugin.settings.reviews[level];

    new Setting(section)
      .setName(`Enable ${label.toLowerCase()} review`)
      .addToggle((toggle) => {
        toggle.setValue(review.enabled).onChange(async (value) => {
          review.enabled = value;
          await this.plugin.saveSettings();
        });
      });

    if (level === "weekly") {
      new Setting(section)
        .setName("Prompt weekday")
        .addDropdown((dropdown) => {
          dropdown
            .addOptions(WEEKDAY_LABELS)
            .setValue(this.plugin.settings.reviews.weekly.promptWeekday)
            .onChange(async (value) => {
              this.plugin.settings.reviews.weekly.promptWeekday = value as Weekday;
              await this.plugin.saveSettings();
            });
        });
    }

    if (level === "monthly") {
      new Setting(section)
        .setName("Prompt day of month")
        .addText((text) => {
          text.inputEl.type = "number";
          text.setValue(String(this.plugin.settings.reviews.monthly.promptDayOfMonth));
          text.onChange(async (value) => {
            this.plugin.settings.reviews.monthly.promptDayOfMonth = clamp(
              parseInteger(value, 1),
              1,
              31
            );
            await this.plugin.saveSettings();
          });
        });
    }

    if (level === "annual") {
      new Setting(section)
        .setName("Prompt month-day")
        .addText((text) => {
          text.setPlaceholder("01-01").setValue(this.plugin.settings.reviews.annual.promptMonthDay);
          text.onChange(async (value) => {
            this.plugin.settings.reviews.annual.promptMonthDay = value.trim() || "01-01";
            await this.plugin.saveSettings();
          });
        });
    }

    new Setting(section)
      .setName("Prompt time")
      .addText((text) => {
        text.inputEl.type = "time";
        text.setValue(review.promptTime).onChange(async (value) => {
          review.promptTime = value;
          await this.plugin.saveSettings();
        });
      });

    this.addTextSetting(section, "Note format", review.noteNameFormat, async (value) => {
      review.noteNameFormat = value || DEFAULT_SETTINGS.reviews[level].noteNameFormat;
      await this.plugin.saveSettings();
    });

    new Setting(section)
      .setName("Long-entry embeds")
      .setDesc(`Embed matching daily long journal entries in ${label.toLowerCase()} reviews.`)
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.reviews.longEntryEmbedLevels[level] === true)
          .onChange(async (value) => {
            this.plugin.settings.reviews.longEntryEmbedLevels[level] = value;
            await this.plugin.saveSettings();
          });
      });

    this.renderChecklistSetting(section, label, level);
  }

  private displayPropertySettings(containerEl: HTMLElement): void {
    const section = createSettingsSection(containerEl, "Property settings shared across all notes");

    section.createEl("h3", { text: "Automatic properties" });
    this.addTextSetting(section, "Date", this.plugin.settings.automaticProperties.date, async (value) => {
      this.plugin.settings.automaticProperties.date = value || DEFAULT_SETTINGS.automaticProperties.date;
      await this.plugin.saveSettings();
    });
    this.addTextSetting(section, "Time", this.plugin.settings.automaticProperties.time, async (value) => {
      this.plugin.settings.automaticProperties.time = value || DEFAULT_SETTINGS.automaticProperties.time;
      await this.plugin.saveSettings();
    });
    this.addTextSetting(
      section,
      "Weekday",
      this.plugin.settings.automaticProperties.weekday,
      async (value) => {
        this.plugin.settings.automaticProperties.weekday =
          value || DEFAULT_SETTINGS.automaticProperties.weekday;
        await this.plugin.saveSettings();
      }
    );
    this.addTextSetting(section, "Type", this.plugin.settings.automaticProperties.type, async (value) => {
      this.plugin.settings.automaticProperties.type = value || DEFAULT_SETTINGS.automaticProperties.type;
      await this.plugin.saveSettings();
    });
    this.addTextSetting(section, "ISO week", this.plugin.settings.automaticProperties.week, async (value) => {
      this.plugin.settings.automaticProperties.week = value || DEFAULT_SETTINGS.automaticProperties.week;
      await this.plugin.saveSettings();
    });
    this.addTextSetting(section, "Month", this.plugin.settings.automaticProperties.month, async (value) => {
      this.plugin.settings.automaticProperties.month = value || DEFAULT_SETTINGS.automaticProperties.month;
      await this.plugin.saveSettings();
    });
    this.addTextSetting(section, "Year", this.plugin.settings.automaticProperties.year, async (value) => {
      this.plugin.settings.automaticProperties.year = value || DEFAULT_SETTINGS.automaticProperties.year;
      await this.plugin.saveSettings();
    });

    section.createEl("h3", { text: "Daily properties" });
    section.createDiv({
      cls: "journaling-system-section-note",
      text: "These definitions control the daily journal modal. Keep this light: daily notes are raw signal.",
    });

    const list = section.createDiv({ cls: "journaling-system-property-list" });
    for (const property of this.plugin.settings.properties) {
      this.renderPropertyRow(list, property);
    }

    new Setting(section).addButton((button) => {
      button
        .setButtonText("Add property")
        .setCta()
        .onClick(async () => {
          this.plugin.settings.properties.push({
            id: `custom-${Date.now()}`,
            enabled: true,
            label: "New property",
            property: "journalCustom",
            placeholder: "",
            type: "text",
            role: "custom",
          });
          await this.plugin.saveSettings();
          this.display();
        });
    });

    section.createEl("h3", { text: "Review properties" });
    section.createDiv({
      cls: "journaling-system-section-note",
      text: "These properties are added to review notes and become the condensation layer above daily writing.",
    });
    const reviewPropertyList = section.createDiv({
      cls: "journaling-system-review-property-list",
    });
    for (const property of this.plugin.settings.reviews.reviewProperties) {
      this.renderReviewPropertyRow(reviewPropertyList, property);
    }
    new Setting(section).addButton((button) => {
      button
        .setButtonText("Add review property")
        .setCta()
        .onClick(async () => {
          this.plugin.settings.reviews.reviewProperties.push({
            id: `review-custom-${Date.now()}`,
            enabled: true,
            label: "New review property",
            property: "journalReviewCustom",
            placeholder: "",
            type: "text",
            levels: ["weekly", "monthly", "annual"],
          });
          await this.plugin.saveSettings();
          this.display();
        });
    });
  }

  private renderPropertyRow(containerEl: HTMLElement, property: JournalPropertyDefinition): void {
    const row = containerEl.createDiv({ cls: "journaling-system-property-row" });
    const enabled = row.createEl("input", { type: "checkbox" });
    enabled.checked = property.enabled;
    enabled.ariaLabel = `Enable ${property.label}`;
    enabled.addEventListener("change", async () => {
      property.enabled = enabled.checked;
      await this.plugin.saveSettings();
    });

    const label = row.createEl("input", {
      type: "text",
      value: property.label,
      cls: "journaling-system-property-input",
    });
    label.ariaLabel = "Field label";
    label.addEventListener("change", async () => {
      property.label = label.value.trim() || property.label;
      await this.plugin.saveSettings();
    });

    const propertyName = row.createEl("input", {
      type: "text",
      value: property.property,
      cls: "journaling-system-property-input",
    });
    propertyName.ariaLabel = "Property name";
    propertyName.addEventListener("change", async () => {
      property.property = propertyName.value.trim() || property.property;
      await this.plugin.saveSettings();
    });

    const placeholder = row.createEl("input", {
      type: "text",
      value: property.placeholder,
      cls: "journaling-system-property-input",
    });
    placeholder.ariaLabel = "Placeholder text";
    placeholder.placeholder = "Placeholder";
    placeholder.addEventListener("change", async () => {
      property.placeholder = placeholder.value.trim();
      await this.plugin.saveSettings();
    });

    const type = row.createEl("select", { cls: "journaling-system-property-select" });
    for (const [value, labelText] of Object.entries(PROPERTY_TYPE_LABELS)) {
      type.createEl("option", { text: labelText, value });
    }
    type.value = property.type;
    type.addEventListener("change", async () => {
      property.type = type.value as JournalPropertyType;
      await this.plugin.saveSettings();
      this.display();
    });

    if (property.type === "number") {
      const min = row.createEl("input", {
        type: "number",
        value: String(property.min ?? ""),
        cls: "journaling-system-number-bound",
      });
      min.ariaLabel = "Minimum";
      min.addEventListener("change", async () => {
        property.min = min.value.trim() ? Number(min.value) : undefined;
        await this.plugin.saveSettings();
      });

      const max = row.createEl("input", {
        type: "number",
        value: String(property.max ?? ""),
        cls: "journaling-system-number-bound",
      });
      max.ariaLabel = "Maximum";
      max.addEventListener("change", async () => {
        property.max = max.value.trim() ? Number(max.value) : undefined;
        await this.plugin.saveSettings();
      });
    } else {
      row.createDiv();
      row.createDiv();
    }

    const removeButton = row.createEl("button", {
      text: property.builtIn ? "" : "Remove",
      cls: "journaling-system-remove-property",
    });
    removeButton.type = "button";
    removeButton.disabled = property.builtIn === true;
    removeButton.addEventListener("click", async () => {
      this.plugin.settings.properties = this.plugin.settings.properties.filter(
        (definition) => definition.id !== property.id
      );
      await this.plugin.saveSettings();
      this.display();
    });
  }

  private renderChecklistSetting(
    containerEl: HTMLElement,
    label: string,
    level: ReviewLevel
  ): void {
    new Setting(containerEl)
      .setName(`${label} checklist prompts`)
      .setDesc("One process item per line. Property fill-in items are added automatically.")
      .addTextArea((textarea) => {
        textarea
          .setValue(this.plugin.settings.reviews.checklistItems[level].join("\n"))
          .onChange(async (value) => {
            this.plugin.settings.reviews.checklistItems[level] =
              normalizeChecklistItems(value);
            await this.plugin.saveSettings();
          });
        textarea.inputEl.addClass("journaling-system-checklist-textarea");
      });
  }

  private renderReviewPropertyRow(
    containerEl: HTMLElement,
    property: ReviewPropertyDefinition
  ): void {
    const row = containerEl.createDiv({ cls: "journaling-system-review-property-row" });
    const enabled = row.createEl("input", { type: "checkbox" });
    enabled.checked = property.enabled;
    enabled.ariaLabel = `Enable ${property.label}`;
    enabled.addEventListener("change", async () => {
      property.enabled = enabled.checked;
      await this.plugin.saveSettings();
    });

    const label = row.createEl("input", {
      type: "text",
      value: property.label,
      cls: "journaling-system-property-input",
    });
    label.ariaLabel = "Review field label";
    label.addEventListener("change", async () => {
      property.label = label.value.trim() || property.label;
      await this.plugin.saveSettings();
    });

    const propertyName = row.createEl("input", {
      type: "text",
      value: property.property,
      cls: "journaling-system-property-input",
    });
    propertyName.ariaLabel = "Review property name";
    propertyName.addEventListener("change", async () => {
      property.property = propertyName.value.trim() || property.property;
      await this.plugin.saveSettings();
    });

    const type = row.createEl("select", { cls: "journaling-system-property-select" });
    for (const [value, labelText] of Object.entries(PROPERTY_TYPE_LABELS)) {
      type.createEl("option", { text: labelText, value });
    }
    type.value = property.type;
    type.addEventListener("change", async () => {
      property.type = type.value as JournalPropertyType;
      await this.plugin.saveSettings();
    });

    const levels = row.createDiv({ cls: "journaling-system-review-levels" });
    for (const level of REVIEW_LEVELS) {
      const labelEl = levels.createEl("label");
      const checkbox = labelEl.createEl("input", { type: "checkbox" });
      checkbox.checked = property.levels.includes(level);
      checkbox.addEventListener("change", async () => {
        const selected = new Set(property.levels);
        if (checkbox.checked) {
          selected.add(level);
        } else {
          selected.delete(level);
        }

        property.levels = REVIEW_LEVELS.filter((entry) => selected.has(entry));
        await this.plugin.saveSettings();
      });
      labelEl.createSpan({ text: capitalize(level) });
    }

    const removeButton = row.createEl("button", {
      text: property.builtIn ? "" : "Remove",
      cls: "journaling-system-remove-property",
    });
    removeButton.type = "button";
    removeButton.disabled = property.builtIn === true;
    removeButton.addEventListener("click", async () => {
      this.plugin.settings.reviews.reviewProperties =
        this.plugin.settings.reviews.reviewProperties.filter(
          (definition) => definition.id !== property.id
        );
      await this.plugin.saveSettings();
      this.display();
    });
  }

  private renderBasePropertyTable(
    containerEl: HTMLElement,
    key: BasePropertyListKey,
    availableProperties: string[]
  ): void {
    const table = containerEl.createDiv({ cls: "journaling-system-base-property-table" });
    const header = table.createDiv({
      cls: "journaling-system-base-property-row journaling-system-base-property-header",
    });
    header.createDiv({ text: "Show" });
    header.createDiv({ text: "Property" });
    header.createDiv({ text: "Column width" });

    const configuredProperties = normalizeBasePropertiesForKey(
      key,
      this.plugin.settings.reviews[key]
    );
    const selectedProperties = new Set(configuredProperties);
    const availablePropertySet = new Set(availableProperties);
    const columnSizes = normalizeBaseColumnSizes(
      this.plugin.settings.reviews.baseColumnSizes
    );
    const rows = dedupeProperties([
      ...configuredProperties,
      ...availableProperties,
      ...Object.keys(columnSizes).filter(
        (property) => selectedProperties.has(property) || availablePropertySet.has(property)
      ),
    ]);

    for (const property of rows) {
      const row = table.createDiv({ cls: "journaling-system-base-property-row" });
      const checkbox = row.createEl("input", { type: "checkbox" });
      checkbox.checked = selectedProperties.has(property);
      checkbox.ariaLabel = `Show ${property} in review Bases`;
      checkbox.addEventListener("change", async () => {
        const current = normalizeBasePropertiesForKey(
          key,
          this.plugin.settings.reviews[key]
        );
        this.plugin.settings.reviews[key] = checkbox.checked
          ? dedupeProperties([...current, property])
          : current.filter((entry) => entry !== property);
        await this.plugin.saveSettings();
      });

      const propertyLabel = row.createDiv({
        cls: "journaling-system-base-property-name",
        text: property,
      });
      propertyLabel.title = property;

      const widthInput = row.createEl("input", {
        type: "number",
        cls: "journaling-system-base-width-input",
      });
      widthInput.min = "1";
      widthInput.step = "10";
      widthInput.placeholder = "Auto";
      widthInput.value = String(columnSizes[normalizeBaseColumnSizeProperty(property)] ?? "");
      widthInput.ariaLabel = `Column width for ${property}`;
      widthInput.addEventListener("change", async () => {
        const normalized = normalizeBaseColumnSizes({
          ...this.plugin.settings.reviews.baseColumnSizes,
          [property]: widthInput.value,
        });
        this.plugin.settings.reviews.baseColumnSizes = normalized;
        widthInput.value = String(normalized[normalizeBaseColumnSizeProperty(property)] ?? "");
        await this.plugin.saveSettings();
      });
    }
  }

  private addToggleSetting(
    containerEl: HTMLElement,
    name: string,
    key:
      | "includeManagedRollupBlock"
      | "includeInlineBases"
      | "includeLongEntryEmbeds"
      | "includeReviewChecklist"
      | "includeDailyBaseOnHigherReviews"
  ): void {
    new Setting(containerEl).setName(name).addToggle((toggle) => {
      toggle.setValue(this.plugin.settings.reviews[key]).onChange(async (value) => {
        this.plugin.settings.reviews[key] = value;
        await this.plugin.saveSettings();
      });
    });
  }

  private addTextSetting(
    containerEl: HTMLElement,
    name: string,
    value: string,
    onChange: (value: string) => Promise<void>
  ): void {
    new Setting(containerEl)
      .setName(name)
      .addText((text) => {
        text.setValue(value).onChange(async (newValue) => {
          await onChange(newValue.trim());
        });
      });
  }

  private addFolderSetting(
    containerEl: HTMLElement,
    name: string,
    value: string,
    onChange: (value: string) => Promise<void>
  ): void {
    const setting = new Setting(containerEl).setName(name);
    const previewEl = setting.settingEl.createDiv({
      cls: "journaling-system-folder-preview",
    });
    const updatePreview = (folderTemplate: string): void => {
      const parsedFolder = renderTemplatedFolder(folderTemplate, moment());
      previewEl.setText(
        `Parsed folder: ${parsedFolder.length > 0 ? parsedFolder : "Vault root"}`
      );
    };

    setting
      .addText((text) => {
        text
          .setPlaceholder("journal/{YYYY}")
          .setValue(value)
          .onChange(async (newValue) => {
            const normalized = normalizePath(newValue.trim());
            updatePreview(normalized);
            await onChange(normalized);
          });
      })
      .addExtraButton((button) => {
        button
          .setIcon("folder-search")
          .setTooltip("Choose folder")
          .onClick(() => {
            new FolderSuggestModal(this.app, async (folder) => {
              const path = folder.isRoot() ? "" : folder.path;
              await onChange(path);
              this.display();
            }).open();
          });
      });

    updatePreview(value);
  }
}

class FolderSuggestModal extends FuzzySuggestModal<TFolder> {
  constructor(
    app: App,
    private readonly onChooseFolder: (folder: TFolder) => void | Promise<void>
  ) {
    super(app);
    this.setPlaceholder("Choose a folder");
  }

  getItems(): TFolder[] {
    const folders = this.app.vault
      .getAllLoadedFiles()
      .filter((file: TAbstractFile): file is TFolder => file instanceof TFolder)
      .sort((a, b) => this.getItemText(a).localeCompare(this.getItemText(b)));

    const root = this.app.vault.getRoot();
    return [root, ...folders.filter((folder) => !folder.isRoot())];
  }

  getItemText(folder: TFolder): string {
    return folder.isRoot() ? "Vault root" : folder.path;
  }

  onChooseItem(folder: TFolder): void {
    void this.onChooseFolder(folder);
  }
}

function createSettingsSection(containerEl: HTMLElement, title: string): HTMLElement {
  const section = containerEl.createDiv({ cls: "journaling-system-settings-section" });
  section.createEl("h2", { text: title });
  return section;
}

function normalizeSettings(saved: unknown): JournalingSystemSettings {
  const defaults = cloneSettings(DEFAULT_SETTINGS);

  if (!isRecord(saved)) {
    return defaults;
  }

  const migrated = migrateLegacySettings(saved);
  const savedSchemaVersion = getSavedSchemaVersion(migrated);
  const settings = mergeDefaults(defaults, migrated);
  settings.ui.modalFontSizePx = normalizeModalFontSize(settings.ui.modalFontSizePx);
  settings.properties = normalizePropertyDefinitions(settings.properties);
  settings.reviews.baseProperties = normalizeDailyBaseProperties(
    settings.reviews.baseProperties
  );
  if (
    settings.reviews.baseProperties.length === 0 &&
    savedSchemaVersion < SETTINGS_SCHEMA_VERSION
  ) {
    settings.reviews.baseProperties = getAvailableBasePropertiesFromSettings(settings, "daily");
  }
  settings.reviews.reviewBaseProperties = normalizeReviewBaseProperties(
    settings.reviews.reviewBaseProperties
  );
  if (
    settings.reviews.reviewBaseProperties.length === 0 &&
    savedSchemaVersion < SETTINGS_SCHEMA_VERSION
  ) {
    settings.reviews.reviewBaseProperties = [...DEFAULT_REVIEW_SOURCE_BASE_PROPERTIES];
  }
  settings.reviews.baseRowHeight = normalizeBaseRowHeight(settings.reviews.baseRowHeight);
  settings.reviews.baseColumnSizes = normalizeBaseColumnSizes(
    settings.reviews.baseColumnSizes
  );
  settings.reviews.reviewProperties = normalizeReviewPropertyDefinitions(
    settings.reviews.reviewProperties
  );
  settings.reviews.checklistItems = normalizeChecklistItemsByLevel(
    settings.reviews.checklistItems
  );
  settings.reviews.longEntryEmbedLevels = normalizeReviewLevelBooleans(
    settings.reviews.longEntryEmbedLevels,
    DEFAULT_SETTINGS.reviews.longEntryEmbedLevels
  );
  settings.reviews.includeReviewChecklist =
    settings.reviews.includeReviewChecklist === true;
  settings.reviews.includeDailyBaseOnHigherReviews =
    settings.reviews.includeDailyBaseOnHigherReviews === true;
  settings.schemaVersion = SETTINGS_SCHEMA_VERSION;
  return settings;
}

function getSavedSchemaVersion(saved: Record<string, unknown>): number {
  return typeof saved.schemaVersion === "number" && Number.isFinite(saved.schemaVersion)
    ? saved.schemaVersion
    : 0;
}

function migrateLegacySettings(saved: Record<string, unknown>): Record<string, unknown> {
  if (Array.isArray(saved.properties)) {
    return saved;
  }

  const fields = isRecord(saved.fields) ? saved.fields : null;
  if (!fields) {
    return saved;
  }

  const properties = DEFAULT_PROPERTIES.map((definition) => {
    const legacyValue = fields[definition.id];
    const legacy: Record<string, unknown> = isRecord(legacyValue) ? legacyValue : {};
    return {
      ...definition,
      enabled:
        typeof legacy["enabled"] === "boolean" ? legacy["enabled"] : definition.enabled,
      label: typeof legacy["label"] === "string" ? legacy["label"] : definition.label,
      property:
        typeof legacy["property"] === "string" ? legacy["property"] : definition.property,
      placeholder:
        typeof legacy["placeholder"] === "string"
          ? legacy["placeholder"]
          : definition.placeholder,
    };
  });

  const automatic = isRecord(fields.automatic) ? fields.automatic : {};

  return {
    ...saved,
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    properties,
    automaticProperties: {
      date:
        typeof automatic.journalDateProperty === "string"
          ? automatic.journalDateProperty
          : DEFAULT_SETTINGS.automaticProperties.date,
      time:
        typeof automatic.journalTimeProperty === "string"
          ? automatic.journalTimeProperty
          : DEFAULT_SETTINGS.automaticProperties.time,
      weekday:
        typeof automatic.journalWeekdayProperty === "string"
          ? automatic.journalWeekdayProperty
          : DEFAULT_SETTINGS.automaticProperties.weekday,
      type:
        typeof automatic.journalTypeProperty === "string"
          ? automatic.journalTypeProperty
          : DEFAULT_SETTINGS.automaticProperties.type,
      week:
        typeof automatic.journalWeekProperty === "string"
          ? automatic.journalWeekProperty
          : DEFAULT_SETTINGS.automaticProperties.week,
      month:
        typeof automatic.journalMonthProperty === "string"
          ? automatic.journalMonthProperty
          : DEFAULT_SETTINGS.automaticProperties.month,
      year:
        typeof automatic.journalYearProperty === "string"
          ? automatic.journalYearProperty
          : DEFAULT_SETTINGS.automaticProperties.year,
    },
  };
}

function normalizePropertyDefinitions(
  properties: JournalPropertyDefinition[]
): JournalPropertyDefinition[] {
  return properties
    .filter((property) => !isLegacyDailyPropertyDefinition(property))
    .map((property) => {
      const defaultProperty = DEFAULT_PROPERTIES.find(
        (definition) => definition.id === property.id
      );

      return {
        ...property,
        placeholder:
          typeof property.placeholder === "string"
            ? property.placeholder
            : defaultProperty?.placeholder ?? "",
      };
    });
}

function isLegacyDailyPropertyDefinition(property: JournalPropertyDefinition): boolean {
  const propertyName = property.property.trim();
  const role = property.role as string;
  return (
    LEGACY_DAILY_PROPERTY_IDS.has(property.id) ||
    LEGACY_DAILY_PROPERTY_IDS.has(propertyName) ||
    role === "wins" ||
    role === "fails" ||
    role === "topics"
  );
}

function assignFrontmatterProperty(
  frontmatter: Record<string, unknown>,
  property: string,
  value: string
): void {
  const key = property.trim();
  if (key.length > 0) {
    frontmatter[key] = value;
  }
}

function formatFrontmatterBlock(frontmatter: Record<string, unknown>): string {
  const lines = Object.entries(frontmatter)
    .filter(([property]) => property.trim().length > 0)
    .map(([property, value]) => `${formatYamlKey(property)}: ${formatYamlValue(value)}`);

  return lines.length > 0 ? `---\n${lines.join("\n")}\n---\n\n` : "";
}

function formatYamlKey(property: string): string {
  return /^[A-Za-z_][A-Za-z0-9_-]*$/.test(property) ? property : JSON.stringify(property);
}

function formatYamlValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.length > 0
      ? `[${value.map((entry) => formatYamlString(String(entry))).join(", ")}]`
      : "[]";
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return formatYamlString(String(value ?? ""));
}

function formatYamlString(value: string): string {
  return JSON.stringify(value);
}

function emptyReviewPropertyValue(
  property: ReviewPropertyDefinition
): string | number | string[] | boolean {
  if (property.type === "multiselect") {
    return [];
  }

  if (property.type === "checkbox") {
    return false;
  }

  if (property.type === "number") {
    return "";
  }

  return "";
}

function normalizeReviewPropertyDefinitions(
  properties: ReviewPropertyDefinition[]
): ReviewPropertyDefinition[] {
  const normalized = new Map<string, ReviewPropertyDefinition>();

  for (const property of Array.isArray(properties) ? properties : []) {
    const defaultProperty = DEFAULT_REVIEW_PROPERTIES.find(
      (definition) => definition.id === property.id
    );
    normalized.set(property.id, {
      ...property,
      enabled:
        typeof property.enabled === "boolean"
          ? property.enabled
          : defaultProperty?.enabled ?? true,
      label:
        typeof property.label === "string" && property.label.trim().length > 0
          ? property.label
          : defaultProperty?.label ?? property.property,
      property:
        typeof property.property === "string" && property.property.trim().length > 0
          ? property.property
          : defaultProperty?.property ?? property.id,
      placeholder:
        typeof property.placeholder === "string"
          ? property.placeholder
          : defaultProperty?.placeholder ?? "",
      type: normalizeJournalPropertyType(property.type, defaultProperty?.type ?? "text"),
      levels: normalizeReviewLevels(property.levels, defaultProperty?.levels ?? ["weekly"]),
      builtIn: property.builtIn ?? defaultProperty?.builtIn,
    });
  }

  for (const property of DEFAULT_REVIEW_PROPERTIES) {
    if (!normalized.has(property.id)) {
      normalized.set(property.id, { ...property, levels: [...property.levels] });
    }
  }

  return Array.from(normalized.values());
}

function normalizeJournalPropertyType(
  value: unknown,
  fallback: JournalPropertyType
): JournalPropertyType {
  return value === "text" ||
    value === "number" ||
    value === "date" ||
    value === "multiselect" ||
    value === "checkbox"
    ? value
    : fallback;
}

function normalizeReviewLevels(value: unknown, fallback: ReviewLevel[]): ReviewLevel[] {
  const levels = Array.isArray(value)
    ? value.filter((level): level is ReviewLevel => isReviewLevel(level))
    : fallback;

  return REVIEW_LEVELS.filter((level) => levels.includes(level));
}

function normalizeChecklistItemsByLevel(
  value: unknown
): Record<ReviewLevel, string[]> {
  const record = isRecord(value) ? value : {};
  return {
    weekly: normalizeChecklistItems(record.weekly ?? DEFAULT_REVIEW_CHECKLIST_ITEMS.weekly),
    monthly: normalizeChecklistItems(record.monthly ?? DEFAULT_REVIEW_CHECKLIST_ITEMS.monthly),
    annual: normalizeChecklistItems(record.annual ?? DEFAULT_REVIEW_CHECKLIST_ITEMS.annual),
  };
}

function normalizeChecklistItems(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => String(entry).trim())
      .filter((entry) => entry.length > 0);
  }

  if (typeof value === "string") {
    return value
      .split(/\r?\n/)
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }

  return [];
}

function cloneChecklistItems(
  value: Record<ReviewLevel, string[]>
): Record<ReviewLevel, string[]> {
  return {
    weekly: [...value.weekly],
    monthly: [...value.monthly],
    annual: [...value.annual],
  };
}

function normalizeReviewLevelBooleans(
  value: unknown,
  fallback: Record<ReviewLevel, boolean>
): Record<ReviewLevel, boolean> {
  const record = isRecord(value) ? value : {};
  return {
    weekly: typeof record.weekly === "boolean" ? record.weekly : fallback.weekly,
    monthly: typeof record.monthly === "boolean" ? record.monthly : fallback.monthly,
    annual: typeof record.annual === "boolean" ? record.annual : fallback.annual,
  };
}

const REVIEW_LEVELS: ReviewLevel[] = ["weekly", "monthly", "annual"];

function isReviewLevel(value: unknown): value is ReviewLevel {
  return value === "weekly" || value === "monthly" || value === "annual";
}

function dedupeProperties(properties: string[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const property of properties) {
    const clean = property.trim();
    const key = clean.toLowerCase();
    if (clean.length === 0 || seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(clean);
  }

  return deduped;
}

function normalizeBaseProperties(value: unknown): string[] {
  if (Array.isArray(value)) {
    return dedupeProperties(value.map((entry) => String(entry)));
  }

  if (typeof value === "string") {
    return parseLineList(value);
  }

  return [];
}

function normalizeDailyBaseProperties(value: unknown): string[] {
  return normalizeBaseProperties(value).filter(
    (property) => !LEGACY_DAILY_PROPERTY_IDS.has(normalizeBaseColumnSizeProperty(property))
  );
}

function normalizeReviewBaseProperties(value: unknown): string[] {
  return dedupeProperties(
    normalizeBaseProperties(value).map((property) => renameLegacyReviewProperty(property))
  );
}

function normalizeBasePropertiesForKey(
  key: BasePropertyListKey,
  value: unknown
): string[] {
  return key === "baseProperties"
    ? normalizeDailyBaseProperties(value)
    : normalizeReviewBaseProperties(value);
}

function renameLegacyReviewProperty(property: string): string {
  const clean = normalizeBaseColumnSizeProperty(property);
  return LEGACY_REVIEW_PROPERTY_RENAMES[clean] ?? clean;
}

function normalizeBaseColumnSizes(value: unknown): BaseColumnSizes {
  if (!isRecord(value)) {
    return {};
  }

  const normalized: BaseColumnSizes = {};
  for (const [property, size] of Object.entries(value)) {
    const cleanProperty = renameLegacyReviewProperty(property);
    const cleanSize = normalizeBaseColumnSize(size);
    if (cleanProperty.length > 0 && cleanSize !== null) {
      normalized[cleanProperty] = cleanSize;
    }
  }

  return normalized;
}

function normalizeBaseColumnSizeProperty(property: string): string {
  const clean = property.trim();
  if (clean.startsWith("note.")) {
    return clean.slice("note.".length);
  }

  const noteBracketMatch = /^note\[(["'])(.*)\1\]$/.exec(clean);
  if (noteBracketMatch) {
    return noteBracketMatch[2];
  }

  return clean;
}

function normalizeBaseColumnSize(value: unknown): number | null {
  const size =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.trim())
        : Number.NaN;

  if (!Number.isFinite(size) || size <= 0) {
    return null;
  }

  return Math.round(size);
}

function parseLineList(value: string): string[] {
  return dedupeProperties(value.split(/\r?\n/));
}

function normalizeBaseRowHeight(value: unknown): BaseRowHeight {
  return value === "short" || value === "medium" || value === "tall" || value === "default"
    ? value
    : "tall";
}

function formatBasePropertyReference(property: string): string {
  const clean = property.trim();
  if (clean === "file.name" || /^[A-Za-z_][A-Za-z0-9_]*$/.test(clean)) {
    return clean;
  }

  return `note[${formatBaseString(clean)}]`;
}

function formatBaseColumnSizeKey(property: string): string {
  const clean = normalizeBaseColumnSizeProperty(property);
  const reference =
    clean === "file.name"
      ? clean
      : /^[A-Za-z_][A-Za-z0-9_]*$/.test(clean)
        ? `note.${clean}`
        : `note[${formatBaseString(clean)}]`;

  return /^[A-Za-z_][A-Za-z0-9_.-]*$/.test(reference)
    ? reference
    : JSON.stringify(reference);
}

function getBasePropertyDisplayNames(columns: string[]): Array<[string, string]> {
  return columns.map((property) => [
    formatBaseColumnSizeKey(property),
    formatBasePropertyDisplayName(property),
  ]);
}

function formatBasePropertyDisplayName(property: string): string {
  const clean = normalizeBaseColumnSizeProperty(property);
  const withoutJournal = clean.replace(/^journal/i, "");
  const labelSource = withoutJournal.length > 0 ? withoutJournal : clean;
  return titleCaseWords(labelSource);
}

function formatBasePropertyDisplayNameBlock(displayNames: Array<[string, string]>): string[] {
  if (displayNames.length === 0) {
    return [];
  }

  return [
    "properties:",
    ...displayNames.flatMap(([property, displayName]) => [
      `  ${property}:`,
      `    displayName: ${formatBaseString(displayName)}`,
    ]),
  ];
}

function titleCaseWords(value: string): string {
  return value
    .replace(/\./g, " ")
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter((part) => part.length > 0)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function formatBaseString(value: string): string {
  return JSON.stringify(value);
}

function getAvailableBasePropertiesFromSettings(
  settings: JournalingSystemSettings,
  kind: "daily" | "review"
): string[] {
  const automatic = settings.automaticProperties;
  return dedupeProperties([
    "file.name",
    automatic.type,
    automatic.date,
    automatic.weekday,
    automatic.time,
    automatic.week,
    automatic.month,
    automatic.year,
    ...(kind === "daily"
      ? settings.properties.map((property) => property.property)
      : settings.reviews.reviewProperties.map((property) => property.property)),
  ]);
}

function reviewPeriodLabel(level: ReviewLevel): string {
  return level === "weekly" ? "week" : level === "monthly" ? "month" : "year";
}

function toFrontmatterValue(
  definition: JournalPropertyDefinition,
  existing: unknown,
  value: string | number | string[] | boolean,
  time: string
): string | number | string[] | boolean {
  if (definition.type === "multiselect") {
    return mergeStringArrays(flattenPropertyValue(existing), Array.isArray(value) ? value : []);
  }

  if (definition.type === "number") {
    return typeof value === "number" && Number.isFinite(value) ? value : existingValueOrBlank(existing);
  }

  if (definition.type === "checkbox") {
    return Boolean(value);
  }

  if (definition.type === "date") {
    return String(value);
  }

  const text = String(value).trim();
  return text;
}

function insertUnderHeading(content: string, heading: string, line: string): string {
  const headingMatch = findHeadingLine(content, heading);
  if (!headingMatch) {
    return `${content.trimEnd()}\n\n## ${heading}\n${line}\n`;
  }

  const insertAt = findSectionEnd(content, headingMatch);
  const before = content.slice(0, insertAt).trimEnd();
  const after = content.slice(insertAt);
  return `${before}\n${line}\n${after}`;
}

function replaceManagedBlock(
  content: string,
  startMarker: string,
  endMarker: string,
  replacement: string
): string | null {
  const startIndex = content.indexOf(startMarker);
  if (startIndex === -1) {
    return null;
  }

  const endIndex = content.indexOf(endMarker, startIndex + startMarker.length);
  if (endIndex === -1) {
    return null;
  }

  return `${content.slice(0, startIndex)}${replacement}${content.slice(endIndex + endMarker.length)}`;
}

function removeManagedSection(
  content: string,
  heading: string,
  startMarker: string,
  endMarker: string
): string {
  const cleanHeading = heading.trim();
  if (cleanHeading.length === 0) {
    return content;
  }

  const headingMatch = findHeadingLine(content, cleanHeading);
  if (!headingMatch) {
    return content;
  }

  const sectionEnd = findSectionEnd(content, headingMatch);
  const section = content.slice(headingMatch.start, sectionEnd);
  if (!section.includes(startMarker) || !section.includes(endMarker)) {
    return content;
  }

  const before = content.slice(0, headingMatch.start).trimEnd();
  const after = content.slice(sectionEnd).trimStart();
  if (before.length === 0) {
    return after.length > 0 ? `${after}\n` : "";
  }

  return after.length > 0 ? `${before}\n\n${after}` : `${before}\n`;
}

function insertBlockUnderHeading(content: string, heading: string, block: string): string {
  const cleanHeading = heading.trim();
  if (cleanHeading.length === 0) {
    return content;
  }

  const headingMatch = findHeadingLine(content, cleanHeading);
  if (!headingMatch) {
    return `${content.trimEnd()}\n\n## ${cleanHeading}\n\n${block}\n`;
  }

  const before = content.slice(0, headingMatch.end).trimEnd();
  const after = content.slice(headingMatch.end).trimStart();
  return after.length > 0 ? `${before}\n\n${block}\n\n${after}` : `${before}\n\n${block}\n`;
}

function sectionExists(content: string, heading: string): boolean {
  return heading.trim().length > 0 && findHeadingLine(content, heading) !== null;
}

function insertSectionAfterTitle(content: string, section: string): string {
  const titleMatch = /^#\s+.+$/m.exec(content);
  if (!titleMatch) {
    return `${section}\n\n${content.trimStart()}`;
  }

  const lineEnd = content.indexOf("\n", titleMatch.index);
  const insertAt = lineEnd === -1 ? content.length : lineEnd + 1;
  const before = content.slice(0, insertAt).trimEnd();
  const after = content.slice(insertAt).trimStart();
  return after.length > 0
    ? `${before}\n\n${section}\n\n${after}`
    : `${before}\n\n${section}\n`;
}

function replaceGeneratedBaseBlockInSection(
  content: string,
  heading: string,
  block: string
): string | null {
  const cleanHeading = heading.trim();
  if (cleanHeading.length === 0) {
    return null;
  }

  const headingMatch = findHeadingLine(content, cleanHeading);
  if (!headingMatch) {
    return null;
  }

  const sectionEnd = findSectionEnd(content, headingMatch);
  const section = content.slice(headingMatch.end, sectionEnd);
  const match = /```base[\s\S]*?```/.exec(section);
  if (!match) {
    return null;
  }

  if (
    !/name:\s+(Daily notes in this|Weekly reviews in this|Monthly reviews in this|Journal source notes)/.test(
      match[0]
    )
  ) {
    return null;
  }

  const start = headingMatch.end + match.index;
  const end = start + match[0].length;
  return `${content.slice(0, start)}${block}${content.slice(end)}`;
}

function replaceGeneratedLongEntriesInSection(
  content: string,
  heading: string,
  block: string
): string | null {
  const cleanHeading = heading.trim();
  if (cleanHeading.length === 0) {
    return null;
  }

  const headingMatch = findHeadingLine(content, cleanHeading);
  if (!headingMatch) {
    return null;
  }

  const sectionEnd = findSectionEnd(content, headingMatch);
  const section = content.slice(headingMatch.end, sectionEnd);

  if (section.trim().length === 0) {
    return `${content.slice(0, headingMatch.end)}\n${block}\n${content.slice(sectionEnd)}`;
  }

  const generatedMatch =
    /^\s*(?:(?:\*\*[^\n]+\*\*\s*)?(?:!\[\[[^\n]+\]\]|No long journal entries found for this period\.)\s*)+/.exec(
      section
    );
  if (!generatedMatch) {
    return null;
  }

  const remaining = section.slice(generatedMatch[0].length).trimStart();
  const nextSection = remaining.length > 0 ? `\n${block}\n\n${remaining}` : `\n${block}\n`;
  return `${content.slice(0, headingMatch.end)}${nextSection}${content.slice(sectionEnd)}`;
}

function sectionContainsBaseBlock(content: string, heading: string): boolean {
  const cleanHeading = heading.trim();
  if (cleanHeading.length === 0) {
    return false;
  }

  const headingMatch = findHeadingLine(content, cleanHeading);
  if (!headingMatch) {
    return false;
  }

  const sectionEnd = findSectionEnd(content, headingMatch);
  return content.slice(headingMatch.end, sectionEnd).includes("```base");
}

function frontmatterMatchesReviewPeriod(
  frontmatter: Record<string, unknown>,
  period: { property: string; value: string },
  dateProperty: string,
  level: ReviewLevel
): boolean {
  if (String(frontmatter[period.property] ?? "") === period.value) {
    return true;
  }

  const dateValue = frontmatter[dateProperty];
  if (dateValue === undefined || dateValue === null) {
    return false;
  }

  const date = parseJournalDate(String(dateValue));
  if (!date?.isValid()) {
    return false;
  }

  if (level === "weekly") {
    return date.format("GGGG-[W]WW") === period.value;
  }

  if (level === "monthly") {
    return date.format("YYYY-MM") === period.value;
  }

  return date.format("YYYY") === period.value;
}

function parseJournalDate(value: string): Moment | null {
  const clean = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    return null;
  }

  const parseMoment = obsidianMoment as unknown as (
    input: string,
    format: string,
    strict: boolean
  ) => Moment;
  return parseMoment(clean, "YYYY-MM-DD", true);
}

function isTruthyFrontmatterValue(value: unknown): boolean {
  if (value === true) {
    return true;
  }

  if (typeof value === "string") {
    return value.toLowerCase() === "true";
  }

  return false;
}

function formatJournalEmbed(file: TFile, heading: string): string {
  const linkPath = file.path.replace(/\.md$/i, "");
  const cleanHeading = heading.trim();
  return cleanHeading.length > 0
    ? `![[${linkPath}#${cleanHeading}]]`
    : `![[${linkPath}]]`;
}

function formatJournalEmbedDateLabel(
  file: TFile,
  frontmatter: Record<string, unknown>,
  dateProperty: string
): string {
  const frontmatterDate = frontmatter[dateProperty];
  const frontmatterMoment =
    frontmatterDate === undefined || frontmatterDate === null
      ? null
      : parseJournalDate(String(frontmatterDate));

  if (frontmatterMoment?.isValid()) {
    return `**${frontmatterMoment.format("YYYY-MM-DD dddd")}**`;
  }

  const dateMatch = /\d{4}-\d{2}-\d{2}/.exec(file.path);
  const pathMoment = dateMatch ? parseJournalDate(dateMatch[0]) : null;
  if (pathMoment?.isValid()) {
    return `**${pathMoment.format("YYYY-MM-DD dddd")}**`;
  }

  return `**${file.basename}**`;
}

function dedupeLongEntryFilesByDate(
  files: TFile[],
  getDateKey: (file: TFile) => string
): TFile[] {
  const seen = new Set<string>();
  const deduped: TFile[] = [];

  for (const file of files) {
    const key = getDateKey(file);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(file);
  }

  return deduped;
}

function getJournalDateKey(
  file: TFile,
  frontmatter: Record<string, unknown>,
  dateProperty: string
): string {
  const frontmatterDate = frontmatter[dateProperty];
  const frontmatterMoment =
    frontmatterDate === undefined || frontmatterDate === null
      ? null
      : parseJournalDate(String(frontmatterDate));

  if (frontmatterMoment?.isValid()) {
    return frontmatterMoment.format("YYYY-MM-DD");
  }

  const dateMatch = /\d{4}-\d{2}-\d{2}/.exec(file.path);
  const pathMoment = dateMatch ? parseJournalDate(dateMatch[0]) : null;
  return pathMoment?.isValid() ? pathMoment.format("YYYY-MM-DD") : file.path;
}

function extractNormalizedCaptureEntries(content: string, heading: string): Set<string> {
  const headingMatch = findHeadingLine(content, heading);
  if (!headingMatch) {
    return new Set();
  }

  const sectionEnd = findSectionEnd(content, headingMatch);
  const section = content.slice(headingMatch.end, sectionEnd);
  return new Set(
    section
      .split(/\r?\n/)
      .map((line) => normalizeCaptureEntry(line))
      .filter((line) => line.length > 0)
  );
}

function parseShortTextEntries(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function normalizeCaptureEntry(line: string): string {
  return line
    .trim()
    .replace(/^[-*]\s+/, "")
    .replace(/^\d{2}:\d{2}\s+/, "")
    .trim()
    .toLowerCase();
}

function findJournalCursorOffset(content: string, heading: string): number {
  const headingMatch = findHeadingLine(content, heading);
  if (!headingMatch) {
    return content.length;
  }

  const sectionEnd = findSectionEnd(content, headingMatch);
  const section = content.slice(headingMatch.end, sectionEnd).trim();

  if (section.length === 0) {
    return headingMatch.end;
  }

  return sectionEnd;
}

function findHeadingLine(
  content: string,
  heading: string
): { level: number; start: number; end: number } | null {
  const escaped = escapeRegExp(heading.trim());
  const regex = new RegExp(`^(#{1,6})\\s+${escaped}\\s*$`, "im");
  const match = regex.exec(content);

  if (!match) {
    return null;
  }

  const lineEnd = content.indexOf("\n", match.index);
  return {
    level: match[1].length,
    start: match.index,
    end: lineEnd === -1 ? content.length : lineEnd + 1,
  };
}

function findSectionEnd(
  content: string,
  headingMatch: { level: number; start: number; end: number }
): number {
  const afterHeading = content.slice(headingMatch.end);
  const nextHeading = new RegExp(`^#{1,${headingMatch.level}}\\s+`, "m").exec(afterHeading);
  return nextHeading ? headingMatch.end + nextHeading.index : content.length;
}

function flattenPropertyValue(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => flattenPropertyValue(entry));
  }

  if (value === null || value === undefined || value === "") {
    return [];
  }

  return [String(value)];
}

function formatInitialTextValue(value: unknown): string {
  if (Array.isArray(value)) {
    return flattenPropertyValue(value).join("\n");
  }

  if (value === null || value === undefined) {
    return "";
  }

  return String(value);
}

function formatInitialNumberValue(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "";
}

function formatInitialDateValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  const text = String(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function mergeStringArrays(existing: string[], added: string[]): string[] {
  const values = new Map<string, string>();

  for (const value of [...existing, ...added]) {
    const cleaned = value.trim();
    if (cleaned.length > 0) {
      values.set(cleaned.toLowerCase(), cleaned);
    }
  }

  return Array.from(values.values());
}

function isEmptyJournalValue(value: string | number | string[] | boolean): boolean {
  if (Array.isArray(value)) {
    return value.length === 0;
  }

  if (typeof value === "string") {
    return value.trim().length === 0;
  }

  if (typeof value === "number") {
    return !Number.isFinite(value);
  }

  return value === false;
}

function parseDelimitedList(value: string): string[] {
  return value
    .split(/[,;]+/)
    .map((item) => item.trim())
    .filter((item) => /^\d{2}:\d{2}$/.test(item))
    .filter((item) => item.length > 0);
}

function parseMultiSelectEntry(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function getCurrentLine(textarea: HTMLTextAreaElement): string {
  const value = textarea.value;
  const cursor = textarea.selectionStart ?? value.length;
  const lineStart = value.lastIndexOf("\n", Math.max(0, cursor - 1)) + 1;
  const lineEndIndex = value.indexOf("\n", cursor);
  const lineEnd = lineEndIndex === -1 ? value.length : lineEndIndex;
  return value.slice(lineStart, lineEnd);
}

function replaceCurrentLine(textarea: HTMLTextAreaElement, replacement: string): void {
  const value = textarea.value;
  const cursor = textarea.selectionStart ?? value.length;
  const lineStart = value.lastIndexOf("\n", Math.max(0, cursor - 1)) + 1;
  const lineEndIndex = value.indexOf("\n", cursor);
  const lineEnd = lineEndIndex === -1 ? value.length : lineEndIndex;
  const nextLine = lineEndIndex === -1 ? "\n" : "";
  const nextValue = `${value.slice(0, lineStart)}${replacement}${nextLine}${value.slice(lineEnd)}`;
  const nextCursor = lineStart + replacement.length + nextLine.length;

  textarea.value = nextValue;
  textarea.setSelectionRange(nextCursor, nextCursor);
}

function findLatestDuePromptTime(times: string[], currentTime: string): string | null {
  const dueTimes = [...times]
    .filter((time) => time <= currentTime)
    .sort();

  return dueTimes.length > 0 ? dueTimes[dueTimes.length - 1] : null;
}

function parseInteger(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function normalizeModalFontSize(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return clamp(Number.isFinite(parsed) ? Math.round(parsed) : 15, 12, 20);
}

function ensureMarkdownExtension(fileName: string): string {
  return fileName.endsWith(".md") ? fileName : `${fileName}.md`;
}

function renderTemplatedFolder(folderTemplate: string, date: Moment): string {
  const rendered = folderTemplate.replace(/\{([^{}]+)\}/g, (_match, token: string) =>
    date.format(token)
  );
  return normalizePath(rendered.trim());
}

function existingValueOrBlank(existing: unknown): number | string {
  return typeof existing === "number" ? existing : "";
}

function fuzzyScore(value: string, query: string): number {
  const haystack = value.toLowerCase();
  const needle = query.toLowerCase();

  if (haystack === needle) return 1000;
  if (haystack.startsWith(needle)) return 800 - haystack.length;
  if (haystack.includes(needle)) return 500 - haystack.indexOf(needle);

  let score = 0;
  let queryIndex = 0;
  for (let i = 0; i < haystack.length && queryIndex < needle.length; i += 1) {
    if (haystack[i] === needle[queryIndex]) {
      score += 10;
      queryIndex += 1;
    }
  }

  return queryIndex === needle.length ? score : 0;
}

function capitalize(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cloneSettings(settings: JournalingSystemSettings): JournalingSystemSettings {
  return JSON.parse(JSON.stringify(settings)) as JournalingSystemSettings;
}

function mergeDefaults<T>(defaults: T, saved: unknown): T {
  if (Array.isArray(defaults)) {
    return (Array.isArray(saved) ? saved : defaults) as T;
  }

  if (isRecord(defaults)) {
    const savedRecord = isRecord(saved) ? saved : {};
    const merged: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(defaults)) {
      merged[key] = mergeDefaults(value, savedRecord[key]);
    }

    return merged as T;
  }

  return (saved === undefined ? defaults : saved) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
