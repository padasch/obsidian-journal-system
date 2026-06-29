import {
  App,
  ButtonComponent,
  FuzzySuggestModal,
  MarkdownView,
  Modal,
  Notice,
  Plugin,
  PluginSettingTab,
  requestUrl,
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
type BaseRowHeight = "default" | "short" | "medium" | "tall" | "extra";
type BaseColumnSizes = Record<string, number>;
type BasePropertyListKey = "baseProperties" | "reviewBaseProperties";
type DailyPromptBehavior = "always" | "if-no-quick-entry";
type LocalAiProvider = "ollama";
type TopicSuggestionScope = "daily" | ReviewLevel;

interface LocalAiSettings {
  enabled: boolean;
  provider: LocalAiProvider;
  baseUrl: string;
  model: string;
  summaryProperty: string;
  summaryAiProperty: string;
  aspects: string[];
  prompts: Record<ReviewLevel, string>;
}

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
  isTopicField?: boolean;
  levels: ReviewLevel[];
  builtIn?: boolean;
}

interface JournalingSystemSettings {
  schemaVersion: number;
  ui: {
    modalFontSizePx: number;
    modalWidthPx: number;
    modalMaxHeightVh: number;
    reviewContextHeightPx: number;
  };
  ai: LocalAiSettings;
  dailyPrompts: {
    enabled: boolean;
    times: string[];
    weekdays: Weekday[];
    snoozeMinutes: number;
    catchUpMissedPrompts: boolean;
    promptBehavior: DailyPromptBehavior;
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
    picture: string;
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
    includeNumericSummary: boolean;
    includeReviewChecklist: boolean;
    includeDailyBaseOnHigherReviews: boolean;
    longEntryEmbedLevels: Record<ReviewLevel, boolean>;
    reflectionHeading: string;
    rollupHeading: string;
    sourceNotesHeading: string;
    checklistHeading: string;
    longEntriesHeading: string;
    numericSummaryHeading: string;
    baseProperties: string[];
    reviewBaseProperties: string[];
    baseRowHeight: BaseRowHeight;
    baseColumnSizes: BaseColumnSizes;
    reviewProperties: ReviewPropertyDefinition[];
    topicSuggestionFolders: {
      root: string;
      daily: string;
      weekly: string;
      monthly: string;
      annual: string;
    };
    checklistItems: Record<ReviewLevel, string[]>;
  };
}

interface JournalValue {
  definition: JournalPropertyDefinition;
  value: string | number | string[] | boolean;
}

interface ReviewValue {
  definition: ReviewPropertyDefinition;
  value: string | number | string[] | boolean;
}

interface DailyReviewSummaryItem {
  label: string;
  path: string;
  shortText: string;
  location: string;
  mood: string;
  hasLongEntry: boolean;
}

interface NumericPropertySummary {
  label: string;
  count: number;
  mean: number;
  min: number;
  max: number;
}

const SETTINGS_SCHEMA_VERSION = 12;
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
  extra: "Extra tall",
};

const DAILY_PROMPT_BEHAVIOR_LABELS: Record<DailyPromptBehavior, string> = {
  always: "Always prompt",
  "if-no-quick-entry": "Only when quick entry is empty",
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
  "journalPicture",
  "journalLocation",
  "journalMood",
];

const DEFAULT_REVIEW_SOURCE_BASE_PROPERTIES = [
  "file.name",
  "journalWeek",
  "journalMonth",
  "journalYear",
  "journalSummary",
  "journalSummaryAI",
  "journalTopics",
  "journalLong",
  "journalPicture",
];

const DEFAULT_REVIEW_BASE_COLUMN_SIZES: BaseColumnSizes = {
  journalShort: 550,
  journalSummary: 620,
  journalLocation: 120,
  journalTopics: 180,
  journalLong: 100,
  journalPicture: 120,
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

const LEGACY_REVIEW_PROPERTY_IDS = new Set([
  "journalHighlights",
  "journalDifficulties",
  "journalImprovements",
  "journalLife",
  "journalWork",
  "journalThemes",
]);

const DEFAULT_LOCAL_AI_ASPECTS = [
  "Life and wellbeing",
  "Family and relationships",
  "Parenting",
  "Work and projects",
  "Energy and health",
  "Stuck points",
  "Signals to carry forward",
];

const LOCAL_OLLAMA_BASE_URLS = [
  "http://127.0.0.1:11434",
  "http://localhost:11434",
  "http://[::1]:11434",
];

const ATTACHMENT_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "webp",
  "gif",
  "heic",
  "pdf",
  "tif",
  "tiff",
]);

const REVIEW_BASE_START = "<!-- JOURNALING-SYSTEM:BASE:START -->";
const REVIEW_BASE_END = "<!-- JOURNALING-SYSTEM:BASE:END -->";
const LEGACY_REVIEW_BASE_BLOCK =
  /```base\s+views:\s+  - type: table\s+    name: Journal source notes\s+```/;
const REVIEW_LONG_ENTRIES_START = "<!-- JOURNALING-SYSTEM:LONG-ENTRIES:START -->";
const REVIEW_LONG_ENTRIES_END = "<!-- JOURNALING-SYSTEM:LONG-ENTRIES:END -->";
const LEGACY_LONG_ENTRIES_PLACEHOLDER =
  "<!-- Long-entry embeds will be generated in a later milestone. -->";
const LONG_ENTRY_START_MARKER =
  "<!-- Journaling System: long journal entry starts here. Write below this line. -->";
const REVIEW_FIELDS_HEADING = "Review Fields";
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
    id: "journalSummary",
    enabled: true,
    label: "Summary",
    property: "journalSummary",
    placeholder: "Condense the review period in your own words",
    type: "text",
    levels: ["weekly", "monthly", "annual"],
    builtIn: true,
  },
  {
    id: "journalSummaryAI",
    enabled: true,
    label: "Summary started from AI",
    property: "journalSummaryAI",
    placeholder: "Set automatically when the summary starts from local AI",
    type: "checkbox",
    levels: ["weekly", "monthly", "annual"],
    builtIn: true,
  },
  {
    id: "journalTopics",
    enabled: true,
    label: "Topics",
    property: "journalTopics",
    placeholder: "One topic or [[link]] per line",
    type: "multiselect",
    isTopicField: true,
    levels: ["weekly", "monthly", "annual"],
    builtIn: true,
  },
  {
    id: "journalLong",
    enabled: true,
    label: "Long review entry",
    property: "journalLong",
    placeholder: "Marks that longer review writing exists in the note body",
    type: "checkbox",
    levels: ["weekly", "monthly", "annual"],
    builtIn: true,
  },
  {
    id: "journalPicture",
    enabled: true,
    label: "Picture attachments",
    property: "journalPicture",
    placeholder: "Set automatically when image or PDF attachments are linked",
    type: "checkbox",
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

const DEFAULT_LOCAL_AI_PROMPTS: Record<ReviewLevel, string> = {
  weekly: [
    "Summarize this week's journal notes as guidance for a weekly review.",
    "",
    "Pay attention to these review aspects:",
    "{{aspects}}",
    "",
    "Return a compact Markdown note with these headings:",
    "- Patterns",
    "- Highlights",
    "- Difficulties",
    "- Improvements to consider",
    "- Reflection prompts",
    "",
    "Keep it useful for self-reflection. Prefer short bullets. Do not copy long passages verbatim.",
    "",
    "Source notes:",
    "{{sourceNotes}}",
  ].join("\n"),
  monthly: [
    "Summarize this month's review notes as guidance for a monthly review.",
    "",
    "Pay attention to these review aspects:",
    "{{aspects}}",
    "",
    "Return a compact Markdown note with these headings:",
    "- Recurring patterns",
    "- Strong signals",
    "- Friction points",
    "- Improvements to consider",
    "- Reflection prompts",
    "",
    "Focus on patterns across weeks, not isolated daily events.",
    "",
    "Source notes:",
    "{{sourceNotes}}",
  ].join("\n"),
  annual: [
    "Summarize this year's review notes as guidance for an annual review.",
    "",
    "Pay attention to these review aspects:",
    "{{aspects}}",
    "",
    "Return a compact Markdown note with these headings:",
    "- Direction",
    "- Identity-level patterns",
    "- Important changes",
    "- Practices to continue or adjust",
    "- Reflection prompts",
    "",
    "Focus on durable themes and direction. Do not invent facts.",
    "",
    "Source notes:",
    "{{sourceNotes}}",
  ].join("\n"),
};

const DEFAULT_SETTINGS: JournalingSystemSettings = {
  schemaVersion: SETTINGS_SCHEMA_VERSION,
  ui: {
    modalFontSizePx: 15,
    modalWidthPx: 860,
    modalMaxHeightVh: 86,
    reviewContextHeightPx: 360,
  },
  ai: {
    enabled: false,
    provider: "ollama",
    baseUrl: "http://127.0.0.1:11434",
    model: "llama3.2",
    summaryProperty: "journalSummary",
    summaryAiProperty: "journalSummaryAI",
    aspects: [...DEFAULT_LOCAL_AI_ASPECTS],
    prompts: { ...DEFAULT_LOCAL_AI_PROMPTS },
  },
  dailyPrompts: {
    enabled: true,
    times: ["09:00", "20:00"],
    weekdays: [...WEEKDAYS],
    snoozeMinutes: 30,
    catchUpMissedPrompts: true,
    promptBehavior: "always",
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
    picture: "journalPicture",
  },
  reviews: {
    weekly: {
      enabled: true,
      promptWeekday: "sunday",
      promptTime: "18:00",
      noteNameFormat: "YYYY - [Week] WW",
      lastPromptKey: "",
    },
    monthly: {
      enabled: true,
      promptDayOfMonth: 1,
      promptTime: "18:00",
      noteNameFormat: "YYYY-MM MMMM",
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
    includeNumericSummary: true,
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
    numericSummaryHeading: "Numerical summary",
    baseProperties: [...DEFAULT_REVIEW_BASE_PROPERTIES],
    reviewBaseProperties: [...DEFAULT_REVIEW_SOURCE_BASE_PROPERTIES],
    baseRowHeight: "extra",
    baseColumnSizes: { ...DEFAULT_REVIEW_BASE_COLUMN_SIZES },
    reviewProperties: DEFAULT_REVIEW_PROPERTIES.map((property) => ({ ...property })),
    topicSuggestionFolders: {
      root: "",
      daily: "",
      weekly: "",
      monthly: "",
      annual: "",
    },
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
      id: "open-long-weekly-review-entry",
      name: "Open long weekly review entry",
      callback: async () => {
        await this.openLongReviewEntry("weekly");
      },
    });

    this.addCommand({
      id: "open-long-monthly-review-entry",
      name: "Open long monthly review entry",
      callback: async () => {
        await this.openLongReviewEntry("monthly");
      },
    });

    this.addCommand({
      id: "open-long-annual-review-entry",
      name: "Open long annual review entry",
      callback: async () => {
        await this.openLongReviewEntry("annual");
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
      id: "start-weekly-review-wizard",
      name: "Start weekly review wizard",
      callback: () => {
        new ReviewWizardModal(this.app, this, "weekly").open();
      },
    });

    this.addCommand({
      id: "start-monthly-review-wizard",
      name: "Start monthly review wizard",
      callback: () => {
        new ReviewWizardModal(this.app, this, "monthly").open();
      },
    });

    this.addCommand({
      id: "start-annual-review-wizard",
      name: "Start annual review wizard",
      callback: () => {
        new ReviewWizardModal(this.app, this, "annual").open();
      },
    });

    this.addCommand({
      id: "choose-review-period",
      name: "Choose review period",
      callback: () => {
        new ReviewPeriodSelectionModal(this.app, this).open();
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

  getReviewLongProperty(): string {
    const byId = this.settings.reviews.reviewProperties.find(
      (property) => property.id === "journalLong" && property.type === "checkbox"
    );
    const byIdProperty = byId?.property?.trim();
    if (byIdProperty && byIdProperty.length > 0) {
      return byIdProperty;
    }

    const byName = this.settings.reviews.reviewProperties.find(
      (property) =>
        property.type === "checkbox" &&
        property.property.trim().toLowerCase() === "journallong"
    );
    const byNameProperty = byName?.property?.trim();
    if (byNameProperty && byNameProperty.length > 0) {
      return byNameProperty;
    }

    const byLabel = this.settings.reviews.reviewProperties.find(
      (property) => property.type === "checkbox" && /\blong\b/i.test(property.label)
    );

    return byLabel?.property.trim() ?? "";
  }

  getShortProperty(): JournalPropertyDefinition | null {
    return (
      this.settings.properties.find(
        (property) => property.enabled && property.role === "short"
      ) ?? null
    );
  }

  getPictureProperty(): string {
    return (
      this.settings.automaticProperties.picture.trim() ||
      DEFAULT_SETTINGS.automaticProperties.picture
    );
  }

  async syncLongEntryStatus(file: TFile): Promise<boolean> {
    const content = await this.app.vault.read(file);
    const hasContent = hasLongJournalEntryContent(
      content,
      this.settings.dailyNote.longEntryHeading
    );
    const longProperty = this.getLongProperty().property.trim();

    if (longProperty.length === 0) {
      return hasContent;
    }

    const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
    const currentValue = isRecord(frontmatter)
      ? isTruthyFrontmatterValue(frontmatter[longProperty])
      : false;

    if (currentValue !== hasContent) {
      await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
        frontmatter[longProperty] = hasContent;
      });
    }

    return hasContent;
  }

  async syncReviewLongEntryStatus(file: TFile): Promise<boolean> {
    const hasContent = hasLongJournalEntryContent(
      await this.app.vault.read(file),
      this.settings.reviews.reflectionHeading
    );
    const longProperty = this.getReviewLongProperty();

    if (longProperty.length === 0) {
      return hasContent;
    }

    const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
    const currentValue = isRecord(frontmatter)
      ? isTruthyFrontmatterValue(frontmatter[longProperty])
      : false;

    if (currentValue !== hasContent) {
      await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
        frontmatter[longProperty] = hasContent;
      });
    }

    return hasContent;
  }

  async openLongReviewEntry(level: ReviewLevel, now = moment()): Promise<void> {
    const file = await this.getOrCreateReviewNote(level, now);
    const longProperty = this.getReviewLongProperty();

    if (longProperty.length > 0) {
      await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
        frontmatter[longProperty] = true;
      });
    }

    await this.openFileAtHeading(file, this.settings.reviews.reflectionHeading);
  }

  async syncPictureStatus(file: TFile): Promise<boolean> {
    const pictureProperty = this.getPictureProperty();
    if (pictureProperty.length === 0) {
      return noteHasPictureAttachment(this.app, file);
    }

    const hasPicture = noteHasPictureAttachment(this.app, file);
    const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
    const currentValue = isRecord(frontmatter)
      ? isTruthyFrontmatterValue(frontmatter[pictureProperty])
      : false;

    if (currentValue !== hasPicture) {
      await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
        frontmatter[pictureProperty] = hasPicture;
      });
    }

    return hasPicture;
  }

  async syncDailySourcePictureStatuses(level: ReviewLevel, now = moment()): Promise<void> {
    for (const file of this.getDailySourceFilesForReview(level, now)) {
      await this.syncPictureStatus(file);
    }
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

    const shouldPrompt = await this.shouldOpenDailyPrompt(now);
    prompts.lastPromptKey = promptKey;
    await this.saveSettings();
    if (!shouldPrompt) {
      return;
    }

    new DailyPromptDecisionModal(this.app, this, dueTime).open();
  }

  async shouldOpenDailyPrompt(now = moment()): Promise<boolean> {
    if (this.settings.dailyPrompts.promptBehavior !== "if-no-quick-entry") {
      return true;
    }

    try {
      return !(await this.dailyNoteHasQuickEntry(now));
    } catch (error) {
      console.error("Journaling System failed to check daily quick entry", error);
      return true;
    }
  }

  async dailyNoteHasQuickEntry(now = moment()): Promise<boolean> {
    const shortProperty = this.getShortProperty();
    const propertyName = shortProperty?.property.trim() ?? "";
    const file = this.app.vault.getFileByPath(this.getDailyNotePath(now));

    if (!file) {
      return false;
    }

    if (propertyName.length > 0) {
      const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
      if (
        isRecord(frontmatter) &&
        flattenPropertyValue(frontmatter[propertyName]).some(
          (entry) => entry.trim().length > 0
        )
      ) {
        return true;
      }
    }

    const heading = this.settings.dailyNote.shortEntrySectionHeading.trim();
    if (heading.length === 0) {
      return false;
    }

    const content = await this.app.vault.read(file);
    return extractNormalizedCaptureEntries(content, heading).size > 0;
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
    await this.syncPictureStatus(file);
    return file;
  }

  async openLongJournalEntry(values: JournalValue[]): Promise<void> {
    const file = await this.saveJournal([
      ...values,
      { definition: this.getLongProperty(), value: true },
    ]);
    await this.ensureLongEntrySection(file);
    await this.openFileAtHeading(file, this.settings.dailyNote.longEntryHeading);
  }

  async openReview(level: ReviewLevel, now = moment()): Promise<void> {
    const file = await this.getOrCreateReviewNote(level, now);
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
    return `${formatFrontmatterBlock(this.getAutomaticFrontmatter("daily", now))}# ${title}\n\n## ${this.settings.dailyNote.longEntryHeading}\n\n${LONG_ENTRY_START_MARKER}\n`;
  }

  async getOrCreateReviewNote(level: ReviewLevel, now = moment()): Promise<TFile> {
    const notePath = this.getReviewNotePath(level, now);
    const existing = this.app.vault.getFileByPath(notePath);

    if (existing) {
      await this.syncDailySourcePictureStatuses(level, now);
      await this.syncReviewLongEntryStatus(existing);
      await this.writeReviewProperties(existing, level, now);
      await this.syncPictureStatus(existing);
      await this.cleanupLegacyReviewScaffolding(existing);
      await this.ensureReviewChecklist(existing, level, now);
      await this.ensureReviewFieldsBaseBlock(existing, level);
      await this.ensureReviewBaseBlock(existing, level, now);
      await this.ensureHigherReviewDailyBaseBlock(existing, level, now);
      await this.ensureReviewNumericSummary(existing, level, now);
      await this.ensureReviewLongEntryEmbeds(existing, level, now);
      return existing;
    }

    await this.ensureFolderForPath(notePath);
    await this.syncDailySourcePictureStatuses(level, now);
    const created = await this.app.vault.create(
      notePath,
      await this.createReviewNoteContent(level, now)
    );
    await this.syncReviewLongEntryStatus(created);
    await this.syncPictureStatus(created);
    return created;
  }

  getReviewNotePath(level: ReviewLevel, now = moment()): string {
    const reviewSettings = this.settings.reviews[level];
    const fileName = ensureMarkdownExtension(now.format(reviewSettings.noteNameFormat));
    const folder = renderTemplatedFolder(this.settings.reviews.folder, now);
    return normalizePath([folder, fileName].filter(Boolean).join("/"));
  }

  async createReviewNoteContent(level: ReviewLevel, now = moment()): Promise<string> {
    const title = now.format(this.settings.reviews[level].noteNameFormat);
    const lines = [
      `# ${title}`,
      "",
    ];

    if (this.settings.reviews.includeReviewChecklist) {
      lines.push(
        `## ${this.settings.reviews.checklistHeading}`,
        "",
        ...this.createReviewChecklistBlock(level, now),
        ""
      );
    }

    if (this.settings.reviews.includeInlineBases) {
      lines.push(
        `## ${REVIEW_FIELDS_HEADING}`,
        "",
        ...this.createReviewFieldsBaseBlock(level),
        ""
      );

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

    if (this.settings.reviews.includeNumericSummary) {
      lines.push(
        `## ${this.getNumericSummaryHeading()}`,
        "",
        ...this.createNumericSummaryBlock(level, now),
        ""
      );
    }

    if (this.shouldIncludeLongEntryEmbeds(level)) {
      lines.push(
        `## ${this.settings.reviews.longEntriesHeading}`,
        "",
        ...(await this.createLongEntryEmbedsBlock(level, now)),
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

  async writeReviewValues(
    file: TFile,
    level: ReviewLevel,
    values: ReviewValue[],
    now = moment()
  ): Promise<void> {
    const automaticFrontmatter = this.getAutomaticFrontmatter(level, now);
    const context = this.getTodayContext(now);

    await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
      for (const [property, value] of Object.entries(automaticFrontmatter)) {
        frontmatter[property] = value;
      }

      for (const { definition, value } of values) {
        const key = definition.property.trim();
        if (!definition.enabled || key.length === 0 || !definition.levels.includes(level)) {
          continue;
        }

        const journalDefinition = reviewPropertyToJournalProperty(definition);
        frontmatter[key] = toFrontmatterValue(
          journalDefinition,
          frontmatter[key],
          value,
          context.time
        );
      }
    });
  }

  getAiSummaryProperty(): string {
    return (
      this.settings.ai.summaryProperty.trim() ||
      DEFAULT_SETTINGS.ai.summaryProperty
    );
  }

  getAiSummaryFlagProperty(): string {
    return (
      this.settings.ai.summaryAiProperty.trim() ||
      DEFAULT_SETTINGS.ai.summaryAiProperty
    );
  }

  getLocalAiPrompt(level: ReviewLevel): string {
    return (
      this.settings.ai.prompts[level]?.trim() ||
      DEFAULT_LOCAL_AI_PROMPTS[level]
    );
  }

  async writeReviewSummary(
    file: TFile,
    summary: string,
    startedFromAi: boolean
  ): Promise<void> {
    const summaryProperty = this.getAiSummaryProperty();
    const summaryAiProperty = this.getAiSummaryFlagProperty();
    if (summaryProperty.length === 0 && summaryAiProperty.length === 0) {
      return;
    }

    await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
      if (summaryProperty.length > 0) {
        frontmatter[summaryProperty] = summary.trim();
      }
      if (summaryAiProperty.length > 0) {
        frontmatter[summaryAiProperty] = startedFromAi && summary.trim().length > 0;
      }
    });
  }

  async resolveLocalAiSettings(settings = normalizeLocalAiSettings(this.settings.ai)): Promise<LocalAiSettings> {
    if (await isOllamaReachable(settings.baseUrl)) {
      return settings;
    }

    const discovered = await this.discoverLocalOllamaBaseUrl(settings.baseUrl);
    return { ...settings, baseUrl: discovered };
  }

  async discoverLocalOllamaBaseUrl(preferredBaseUrl?: string): Promise<string> {
    const candidates = dedupeProperties([
      preferredBaseUrl ?? "",
      this.settings.ai.baseUrl,
      ...LOCAL_OLLAMA_BASE_URLS,
    ]).map((baseUrl) => normalizeLocalAiBaseUrl(baseUrl));

    for (const baseUrl of dedupeProperties(candidates)) {
      if (await isOllamaReachable(baseUrl)) {
        if (this.settings.ai.baseUrl !== baseUrl) {
          this.settings.ai.baseUrl = baseUrl;
          await this.saveSettings();
        }
        return baseUrl;
      }
    }

    throw new Error("Could not find a reachable local Ollama server.");
  }

  async listLocalOllamaModels(
    settings = normalizeLocalAiSettings(this.settings.ai)
  ): Promise<string[]> {
    const resolved = await this.resolveLocalAiSettings(settings);
    const response = await requestOllamaTags(resolved.baseUrl);

    return dedupeProperties(
      getOllamaModelNames(response.json).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
    );
  }

  async findAndUseLocalOllama(): Promise<string> {
    const baseUrl = await this.discoverLocalOllamaBaseUrl(
      normalizeLocalAiBaseUrl(this.settings.ai.baseUrl)
    );
    return `Using local Ollama at ${baseUrl}.`;
  }

  async checkLocalAiStatus(): Promise<string> {
    const settings = await this.resolveLocalAiSettings();
    const response = await requestOllamaTags(settings.baseUrl);

    const models = getOllamaModelNames(response.json);
    const hasModel = ollamaModelExists(models, settings.model);
    return hasModel
      ? `Ollama is reachable and ${settings.model} is installed.`
      : `Ollama is reachable. ${settings.model} is not installed yet.`;
  }

  async pullLocalAiModel(): Promise<string> {
    const settings = await this.resolveLocalAiSettings();
    const response = await requestUrl({
      url: `${settings.baseUrl}/api/pull`,
      method: "POST",
      contentType: "application/json",
      body: JSON.stringify({ model: settings.model, stream: false }),
      throw: false,
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Ollama returned HTTP ${response.status}.`);
    }

    return `Downloaded or verified ${settings.model}.`;
  }

  async generateWeeklyAiSummary(
    dailySummary: DailyReviewSummaryItem[]
  ): Promise<string> {
    const configuredSettings = normalizeLocalAiSettings(this.settings.ai);
    if (!configuredSettings.enabled) {
      throw new Error("Local AI review assistance is disabled.");
    }
    const settings = await this.resolveLocalAiSettings(configuredSettings);

    if (dailySummary.length === 0) {
      throw new Error("No daily context is available for this week.");
    }

    const sourceText = await this.createWeeklyAiSourceText(dailySummary);
    const summary = await requestOllamaReviewSummary(
      settings,
      sourceText,
      this.getLocalAiPrompt("weekly"),
      settings.aspects
    );
    return summary;
  }

  async generateReviewAiSummary(
    level: Exclude<ReviewLevel, "weekly">,
    now = moment()
  ): Promise<string> {
    const configuredSettings = normalizeLocalAiSettings(this.settings.ai);
    if (!configuredSettings.enabled) {
      throw new Error("Local AI review assistance is disabled.");
    }
    const settings = await this.resolveLocalAiSettings(configuredSettings);

    const sourceText = await this.createReviewAiSourceText(level, now);
    if (sourceText.length === 0) {
      throw new Error(`No ${level} context is available for this period.`);
    }

    return requestOllamaReviewSummary(
      settings,
      sourceText,
      this.getLocalAiPrompt(level),
      settings.aspects
    );
  }

  private async createWeeklyAiSourceText(
    dailySummary: DailyReviewSummaryItem[]
  ): Promise<string> {
    const blocks: string[] = [];

    for (const item of dailySummary) {
      const file = this.app.vault.getFileByPath(item.path);
      const longText = file
        ? extractLongJournalEntryText(
            await this.app.vault.read(file),
            this.settings.dailyNote.longEntryHeading
          )
        : "";
      const parts = [
        `Date: ${item.label}`,
        item.location ? `Location: ${item.location}` : "",
        item.mood ? `Mood: ${item.mood}` : "",
        item.shortText ? `Quick entry: ${truncateText(item.shortText, 900)}` : "",
        longText ? `Long journal: ${truncateText(longText, 1800)}` : "",
      ].filter((part) => part.length > 0);
      blocks.push(parts.join("\n"));
    }

    return truncateText(blocks.join("\n\n---\n\n"), 18000);
  }

  private async createReviewAiSourceText(
    level: Exclude<ReviewLevel, "weekly">,
    now = moment()
  ): Promise<string> {
    const blocks: string[] = [];
    const summaryProperty = this.getAiSummaryProperty();
    const sourceFiles = this.getReviewSourceFilesForReview(level, now);
    const dateProperty =
      this.settings.automaticProperties.date.trim() ||
      DEFAULT_SETTINGS.automaticProperties.date;

    for (const file of sourceFiles) {
      const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
      const frontmatterRecord = isRecord(frontmatter) ? frontmatter : {};
      const content = await this.app.vault.read(file);
      const reflectionText = extractSectionText(content, this.settings.reviews.reflectionHeading);
      const summary = formatInitialTextValue(frontmatterRecord[summaryProperty]);
      const legacySummary = formatInitialTextValue(frontmatterRecord.journalAISummary);
      const label = formatJournalEmbedDateLabel(file, frontmatterRecord, dateProperty);

      const parts = [
        `Source: ${label}`,
        summary ? `Summary: ${truncateText(summary, 1800)}` : "",
        legacySummary && !summary ? `Summary: ${truncateText(legacySummary, 1800)}` : "",
        reflectionText ? `Reflection: ${truncateText(reflectionText, 1800)}` : "",
      ].filter((part) => part.length > 0);

      if (parts.length <= 1) {
        parts.push("No explicit summary text was found.");
      }

      blocks.push(parts.join("\n"));
    }

    return truncateText(blocks.join("\n\n---\n\n"), 22000);
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

  async ensureReviewFieldsBaseBlock(file: TFile, level: ReviewLevel): Promise<void> {
    if (!this.settings.reviews.includeInlineBases) {
      return;
    }

    const content = await this.app.vault.read(file);
    const block = this.createReviewFieldsBaseBlock(level).join("\n");
    const updated = replaceGeneratedBaseBlockInSection(
      content,
      REVIEW_FIELDS_HEADING,
      block
    );

    if (updated && updated !== content) {
      await this.app.vault.modify(file, updated);
      return;
    }

    if (sectionContainsBaseBlock(content, REVIEW_FIELDS_HEADING)) {
      return;
    }

    const withInsertedBlock = sectionExists(content, REVIEW_FIELDS_HEADING)
      ? insertBlockUnderHeading(content, REVIEW_FIELDS_HEADING, block)
      : insertSectionAfterTitle(
          content,
          [`## ${REVIEW_FIELDS_HEADING}`, "", block].join("\n")
        );

    if (withInsertedBlock !== content) {
      await this.app.vault.modify(file, withInsertedBlock);
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

  async ensureReviewNumericSummary(
    file: TFile,
    level: ReviewLevel,
    now = moment()
  ): Promise<void> {
    if (!this.settings.reviews.includeNumericSummary) {
      return;
    }

    const content = await this.app.vault.read(file);
    const heading = this.getNumericSummaryHeading();
    const block = this.createNumericSummaryBlock(level, now).join("\n");
    const updated = replaceGeneratedNumericSummaryInSection(content, heading, block);

    if (updated && updated !== content) {
      await this.app.vault.modify(file, updated);
      return;
    }

    if (sectionExists(content, heading)) {
      return;
    }

    const section = [`## ${heading}`, "", block].join("\n");
    const withInsertedSection = insertSectionBeforeFirstHeading(
      content,
      [this.settings.reviews.longEntriesHeading, this.settings.reviews.reflectionHeading],
      section
    );

    if (withInsertedSection !== content) {
      await this.app.vault.modify(file, withInsertedSection);
    }
  }

  async ensureReviewLongEntryEmbeds(file: TFile, level: ReviewLevel, now = moment()): Promise<void> {
    if (!this.shouldIncludeLongEntryEmbeds(level)) {
      return;
    }

    const content = await this.app.vault.read(file);
    const block = (await this.createLongEntryEmbedsBlock(level, now)).join("\n");
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

  async ensureReviewChecklist(file: TFile, level: ReviewLevel, now = moment()): Promise<void> {
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
      ...this.createReviewChecklistBlock(level, now),
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

  createReviewChecklistBlock(level: ReviewLevel, now = moment()): string[] {
    const configuredItems = normalizeChecklistItems(
      this.settings.reviews.checklistItems[level]
    );
    const pictureItems = this.reviewPeriodHasPictureAttachments(level, now)
      ? ["Review attached handwritten journal images or PDFs"]
      : [];
    const propertyItems = this.getReviewProperties(level)
      .filter((property) => shouldShowReviewPropertyInChecklist(property, this.settings))
      .map((property) => `Fill ${property.property}`);

    return [...configuredItems, ...pictureItems, ...propertyItems].map((item) => `- ${item}`);
  }

  reviewPeriodHasPictureAttachments(level: ReviewLevel, now = moment()): boolean {
    const pictureProperty = this.getPictureProperty();
    return this.getDailySourceFilesForReview(level, now).some((file) => {
      const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
      return (
        (pictureProperty.length > 0 &&
          isRecord(frontmatter) &&
          isTruthyFrontmatterValue(frontmatter[pictureProperty])) ||
        noteHasPictureAttachment(this.app, file)
      );
    });
  }

  createReviewFieldsBaseBlock(level: ReviewLevel): string[] {
    const columns = this.getReviewFieldsBaseProperties(level);
    const rowHeight = normalizeBaseRowHeight(this.settings.reviews.baseRowHeight);
    const encodedRowHeight = encodeBaseRowHeight(rowHeight);
    const columnSizes = this.getReviewBaseColumnSizes(columns);
    const displayNames = getBasePropertyDisplayNames(columns);

    return [
      "```base",
      "filters:",
      "  and:",
      "    - file.path == this.file.path",
      ...formatBasePropertyDisplayNameBlock(displayNames),
      "views:",
      "  - type: table",
      "    name: Review fields",
      ...(rowHeight === "default" ? [] : [`    rowHeight: ${encodedRowHeight}`]),
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

  createReviewBaseBlock(level: ReviewLevel, now = moment()): string[] {
    const source = this.getReviewSource(level, now);
    const typeProperty =
      this.settings.automaticProperties.type.trim() ||
      DEFAULT_SETTINGS.automaticProperties.type;
    const columns = this.getReviewBaseProperties(level);
    const rowHeight = normalizeBaseRowHeight(this.settings.reviews.baseRowHeight);
    const encodedRowHeight = encodeBaseRowHeight(rowHeight);
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
      ...(rowHeight === "default" ? [] : [`    rowHeight: ${encodedRowHeight}`]),
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
    const encodedRowHeight = encodeBaseRowHeight(rowHeight);
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
      ...(rowHeight === "default" ? [] : [`    rowHeight: ${encodedRowHeight}`]),
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

  getDailySourceFilesForReview(level: ReviewLevel, now = moment()): TFile[] {
    const automatic = this.settings.automaticProperties;
    const typeProperty = automatic.type.trim() || DEFAULT_SETTINGS.automaticProperties.type;
    const dateProperty = automatic.date.trim() || DEFAULT_SETTINGS.automaticProperties.date;
    const period = this.getDailySourceForReview(level, now).period;

    return this.app.vault
      .getMarkdownFiles()
      .filter((file) => {
        const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
        if (!isRecord(frontmatter)) {
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
        const aDate = getJournalDateKey(
          a,
          isRecord(aFrontmatter) ? aFrontmatter : {},
          dateProperty
        );
        const bDate = getJournalDateKey(
          b,
          isRecord(bFrontmatter) ? bFrontmatter : {},
          dateProperty
        );
        return aDate.localeCompare(bDate) || a.path.localeCompare(b.path);
      });
  }

  getReviewSourceFilesForReview(level: ReviewLevel, now = moment()): TFile[] {
    const automatic = this.settings.automaticProperties;
    const typeProperty = automatic.type.trim() || DEFAULT_SETTINGS.automaticProperties.type;
    const dateProperty = automatic.date.trim() || DEFAULT_SETTINGS.automaticProperties.date;
    const source = this.getReviewSource(level, now);

    return this.app.vault
      .getMarkdownFiles()
      .filter((file) => {
        const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
        if (!isRecord(frontmatter)) {
          return false;
        }

        const journalType = frontmatter[typeProperty];
        if (journalType !== undefined && String(journalType) !== source.journalType) {
          return false;
        }

        return frontmatterMatchesReviewPeriod(
          frontmatter,
          source.period,
          dateProperty,
          level
        );
      })
      .sort((a, b) => {
        const aFrontmatter = this.app.metadataCache.getFileCache(a)?.frontmatter;
        const bFrontmatter = this.app.metadataCache.getFileCache(b)?.frontmatter;
        const aDate = getJournalDateKey(
          a,
          isRecord(aFrontmatter) ? aFrontmatter : {},
          dateProperty
        );
        const bDate = getJournalDateKey(
          b,
          isRecord(bFrontmatter) ? bFrontmatter : {},
          dateProperty
        );
        return aDate.localeCompare(bDate) || a.path.localeCompare(b.path);
      });
  }

  async getDailyReviewSummary(
    level: ReviewLevel,
    now = moment()
  ): Promise<DailyReviewSummaryItem[]> {
    const dateProperty =
      this.settings.automaticProperties.date.trim() ||
      DEFAULT_SETTINGS.automaticProperties.date;
    const shortProperty =
      this.settings.properties.find((property) => property.role === "short")?.property ??
      DEFAULT_PROPERTIES[0].property;
    const locationProperty =
      this.settings.properties.find((property) => property.role === "location")?.property ??
      DEFAULT_PROPERTIES[2].property;
    const moodProperty =
      this.settings.properties.find((property) => property.role === "mood")?.property ??
      DEFAULT_PROPERTIES[3].property;

    const items: DailyReviewSummaryItem[] = [];
    for (const file of this.getDailySourceFilesForReview(level, now)) {
      const hasLongEntry = await this.syncLongEntryStatus(file);
      const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
      const frontmatterRecord = isRecord(frontmatter) ? frontmatter : {};
      items.push({
        label: formatJournalEmbedDateLabel(file, frontmatterRecord, dateProperty).replace(
          /^\*\*|\*\*$/g,
          ""
        ),
        path: file.path,
        shortText: flattenPropertyValue(frontmatterRecord[shortProperty]).join("; "),
        location: flattenPropertyValue(frontmatterRecord[locationProperty]).join("; "),
        mood: flattenPropertyValue(frontmatterRecord[moodProperty]).join("; "),
        hasLongEntry,
      });
    }

    return items;
  }

  async getReviewWizardContextItems(
    level: ReviewLevel,
    now = moment()
  ): Promise<DailyReviewSummaryItem[]> {
    if (level === "weekly") {
      return this.getDailyReviewSummary(level, now);
    }

    const dateProperty =
      this.settings.automaticProperties.date.trim() ||
      DEFAULT_SETTINGS.automaticProperties.date;
    const summaryProperty = this.getAiSummaryProperty();
    const summaryFallback = "journalAISummary";
    const items: DailyReviewSummaryItem[] = [];

    for (const file of this.getReviewSourceFilesForReview(level, now)) {
      const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
      const frontmatterRecord = isRecord(frontmatter) ? frontmatter : {};
      const content = await this.app.vault.read(file);
      const longText = extractSectionText(
        content,
        this.settings.reviews.reflectionHeading
      );

      const shortSummary = formatInitialTextValue(frontmatterRecord[summaryProperty]);
      const legacySummary = formatInitialTextValue(frontmatterRecord[summaryFallback]);
      const label = formatJournalEmbedDateLabel(file, frontmatterRecord, dateProperty)
        .replace(/^\*\*|\*\*$/g, "");

      items.push({
        label,
        path: file.path,
        shortText:
          shortSummary.length > 0 ? shortSummary : longText.length > 0 ? longText : legacySummary,
        location: "",
        mood: "",
        hasLongEntry: longText.length > 0,
      });
    }

    return items;
  }

  getReviewProperties(level: ReviewLevel): ReviewPropertyDefinition[] {
    return this.settings.reviews.reviewProperties.filter(
      (property) =>
        property.enabled &&
        property.property.trim().length > 0 &&
        property.levels.includes(level)
    );
  }

  getReviewWizardProperties(level: ReviewLevel): ReviewPropertyDefinition[] {
    return this.getReviewProperties(level).filter((property) =>
      shouldShowReviewPropertyInWizard(property, this.settings)
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

  getNumericSummaryHeading(): string {
    return (
      this.settings.reviews.numericSummaryHeading.trim() ||
      DEFAULT_SETTINGS.reviews.numericSummaryHeading
    );
  }

  createNumericSummaryBlock(level: ReviewLevel, now = moment()): string[] {
    const summaries = this.getDailyNumericPropertySummaries(level, now);
    if (summaries.length === 0) {
      return ["No numeric journal properties found for this period."];
    }

    return [
      "| Property | Count | Mean | Min | Max |",
      "| --- | ---: | ---: | ---: | ---: |",
      ...summaries.map(
        (summary) =>
          `| ${escapeMarkdownTableCell(summary.label)} | ${summary.count} | ${formatNumericSummaryValue(summary.mean)} | ${formatNumericSummaryValue(summary.min)} | ${formatNumericSummaryValue(summary.max)} |`
      ),
    ];
  }

  getDailyNumericPropertySummaries(
    level: ReviewLevel,
    now = moment()
  ): NumericPropertySummary[] {
    const definitions = dedupeJournalPropertyDefinitions(
      this.settings.properties.filter(
        (property) =>
          property.enabled &&
          property.type === "number" &&
          property.property.trim().length > 0
      )
    );

    if (definitions.length === 0) {
      return [];
    }

    const valuesByProperty = new Map<string, number[]>();
    for (const definition of definitions) {
      valuesByProperty.set(definition.property.trim(), []);
    }

    for (const file of this.getDailySourceFilesForReview(level, now)) {
      const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
      const frontmatterRecord = isRecord(frontmatter) ? frontmatter : {};

      for (const definition of definitions) {
        const property = definition.property.trim();
        const values = valuesByProperty.get(property);
        if (!values) {
          continue;
        }

        values.push(...parseNumericFrontmatterValues(frontmatterRecord[property]));
      }
    }

    return definitions.flatMap((definition) => {
      const values = valuesByProperty.get(definition.property.trim()) ?? [];
      if (values.length === 0) {
        return [];
      }

      const sum = values.reduce((total, value) => total + value, 0);
      return [
        {
          label: definition.label.trim() || formatBasePropertyDisplayName(definition.property),
          count: values.length,
          mean: sum / values.length,
          min: Math.min(...values),
          max: Math.max(...values),
        },
      ];
    });
  }

  async createLongEntryEmbedsBlock(level: ReviewLevel, now = moment()): Promise<string[]> {
    const files = await this.getLongEntrySourceFiles(level, now);
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

  async getLongEntrySourceFiles(level: ReviewLevel, now = moment()): Promise<TFile[]> {
    const automatic = this.settings.automaticProperties;
    const typeProperty = automatic.type.trim() || DEFAULT_SETTINGS.automaticProperties.type;
    const dateProperty = automatic.date.trim() || DEFAULT_SETTINGS.automaticProperties.date;
    const period = this.getReviewPeriod(level, now);

    const candidates = this.app.vault
      .getMarkdownFiles()
      .filter((file) => {
        const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
        const frontmatterRecord = isRecord(frontmatter) ? frontmatter : {};

        const journalType = frontmatterRecord[typeProperty];
        if (journalType !== undefined && String(journalType) !== "daily") {
          return false;
        }

        return fileMatchesReviewPeriod(
          file,
          frontmatterRecord,
          period,
          dateProperty,
          level
        );
      })
      .sort((a, b) => {
        const aFrontmatter = this.app.metadataCache.getFileCache(a)?.frontmatter;
        const bFrontmatter = this.app.metadataCache.getFileCache(b)?.frontmatter;
        const aDate = getJournalDateKey(
          a,
          isRecord(aFrontmatter) ? aFrontmatter : {},
          dateProperty
        );
        const bDate = getJournalDateKey(
          b,
          isRecord(bFrontmatter) ? bFrontmatter : {},
          dateProperty
        );
        return aDate.localeCompare(bDate) || a.path.localeCompare(b.path);
      });

    const files: TFile[] = [];
    for (const file of candidates) {
      if (await this.syncLongEntryStatus(file)) {
        files.push(file);
      }
    }

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

  getReviewFieldsBaseProperties(level: ReviewLevel): string[] {
    return dedupeProperties(
      this.getReviewProperties(level).map((property) => property.property)
    );
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

  async ensureLongEntrySection(file: TFile): Promise<void> {
    const heading = this.settings.dailyNote.longEntryHeading.trim();
    if (heading.length === 0) {
      return;
    }

    await this.ensureHeading(file, heading);

    const content = await this.app.vault.read(file);
    const headingMatch = findHeadingLine(content, heading);
    if (!headingMatch) {
      return;
    }

    const sectionEnd = findSectionEnd(content, headingMatch);
    const section = content.slice(headingMatch.end, sectionEnd);
    if (section.includes(LONG_ENTRY_START_MARKER)) {
      return;
    }

    const updated = `${content.slice(0, headingMatch.end)}\n${LONG_ENTRY_START_MARKER}\n${section.replace(/^\s*/, "\n")}${content.slice(sectionEnd)}`;
    await this.app.vault.modify(file, updated);
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

  collectExistingValues(
    propertyName: string,
    scope: TopicSuggestionScope = "daily"
  ): string[] {
    const values = new Set<string>();
    const scanRoots = this.getTopicSuggestionScanRoots(scope);
    const files = this.getMarkdownFilesForTopicSuggestionScan(scanRoots);

    for (const file of files) {
      if (!file || file.extension !== "md") {
        continue;
      }

      const cache = this.app.metadataCache.getFileCache(file);
      const rawValue = cache?.frontmatter?.[propertyName];

      for (const value of flattenPropertyValue(rawValue)) {
        values.add(value);
      }
    }

    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }

  private getTopicSuggestionScanRoots(scope: TopicSuggestionScope): string[] {
    const rootTemplate = this.settings.reviews.topicSuggestionFolders.root.trim();
    const configuredRoot = this.getTopicSuggestionTemplateRoot(rootTemplate);

    const scopedTemplate =
      scope === "daily"
        ? this.settings.reviews.topicSuggestionFolders.daily.trim() ||
          this.settings.dailyNote.folder
        : this.settings.reviews.topicSuggestionFolders[scope].trim() ||
          this.settings.reviews.folder;

    const scopedRoot = this.getTopicSuggestionTemplateRoot(scopedTemplate);
    const scanRoots = [
      configuredRoot,
      scopedRoot,
      configuredRoot.length > 0 && scopedRoot.length > 0
        ? normalizePath(`${configuredRoot}/${scopedRoot}`)
        : "",
    ];

    return dedupeProperties(scanRoots.filter((entry) => entry.length > 0));
  }

  private getMarkdownFilesForTopicSuggestionScan(scanRoots: string[]): TFile[] {
    const normalizedRoots = dedupeProperties(scanRoots.map((root) => normalizePath(root)));
    const rootFiles: TFile[] = [];
    const seenPaths = new Set<string>();

    if (normalizedRoots.length === 0) {
      return this.app.vault.getMarkdownFiles();
    }

    for (const root of normalizedRoots) {
      const folder = this.app.vault.getFolderByPath(root);
      if (!folder) {
        continue;
      }

      this.collectMarkdownFilesInFolder(folder, rootFiles, seenPaths);
    }

    if (rootFiles.length === 0) {
      return this.app.vault.getMarkdownFiles();
    }

    return rootFiles;
  }

  private collectMarkdownFilesInFolder(
    folder: TFolder,
    target: TFile[],
    seenPaths: Set<string>
  ): void {
    for (const child of folder.children) {
      if (child instanceof TFile) {
        if (child.extension === "md" && !seenPaths.has(child.path)) {
          seenPaths.add(child.path);
          target.push(child);
        }
        continue;
      }

      if (child instanceof TFolder) {
        this.collectMarkdownFilesInFolder(child, target, seenPaths);
      }
    }
  }

  private getTopicSuggestionTemplateRoot(folderTemplate: string): string {
    const cleaned = normalizePath(folderTemplate.trim());
    if (cleaned.length === 0) {
      return "";
    }

    const segments = cleaned.split("/").filter((segment) => segment.length > 0);
    const staticSegments: string[] = [];
    for (const segment of segments) {
      if (segment.includes("{")) {
        break;
      }
      staticSegments.push(segment);
    }

    return normalizePath(staticSegments.join("/"));
  }

  async getTodayFrontmatter(now = moment()): Promise<Record<string, unknown>> {
    const file = this.app.vault.getFileByPath(this.getDailyNotePath(now));
    if (!file) {
      return {};
    }

    const hasLongEntryContent = await this.syncLongEntryStatus(file);
    const hasPictureAttachment = await this.syncPictureStatus(file);
    const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
    const values = isRecord(frontmatter) ? { ...frontmatter } : {};
    const longProperty = this.getLongProperty().property.trim();
    if (longProperty.length > 0) {
      values[longProperty] = hasLongEntryContent;
    }
    const pictureProperty = this.getPictureProperty();
    if (pictureProperty.length > 0) {
      values[pictureProperty] = hasPictureAttachment;
    }

    return values;
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
      });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

class ReviewPeriodSelectionModal extends Modal {
  constructor(app: App, private readonly plugin: JournalingSystemPlugin) {
    super(app);
  }

  onOpen(): void {
    this.modalEl.addClass("journaling-system-modal-shell");
    applyModalAppearance(this.modalEl, this.plugin.settings);
    this.contentEl.addClass("journaling-system-modal");
    this.contentEl.empty();
    this.setTitle("Choose review period");

    this.contentEl.createDiv({
      cls: "journaling-system-field-hint",
      text: "Choose the current period or one of the previous two periods.",
    });

    for (const level of REVIEW_LEVELS) {
      this.renderLevel(level);
    }
  }

  private renderLevel(level: ReviewLevel): void {
    this.contentEl.createEl("h3", { text: `${capitalize(level)} reviews` });
    const options = getRecentReviewPeriodOptions(level);

    for (const option of options) {
      const setting = new Setting(this.contentEl)
        .setName(option.label)
        .setDesc(option.description);

      setting.addButton((button) => {
        button
          .setButtonText("Open review")
          .onClick(async () => {
            this.close();
            await this.plugin.openReview(level, option.date);
          });
      });

      setting.addButton((button) => {
        button
          .setButtonText("Start wizard")
          .setCta()
          .onClick(() => {
            this.close();
            new ReviewWizardModal(this.app, this.plugin, level, option.date).open();
          });
      });
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

class ReviewWizardModal extends Modal {
  private reviewFile: TFile | null = null;
  private properties: ReviewPropertyDefinition[] = [];
  private contextItems: DailyReviewSummaryItem[] = [];
  private initialFrontmatter: Record<string, unknown> = {};
  private values = new Map<string, string | number | string[] | boolean>();
  private stepIndex = 0;
  private currentInput: JournalFieldInput | null = null;
  private summaryText = "";
  private summaryStartedFromAi = false;
  private aiSummaryBusy = false;
  private readonly reviewDate: Moment;
  private readonly reviewLevel: ReviewLevel;

  constructor(
    app: App,
    private readonly plugin: JournalingSystemPlugin,
    reviewLevel: ReviewLevel,
    reviewDate: Moment = moment()
  ) {
    super(app);
    this.reviewLevel = reviewLevel;
    this.reviewDate = reviewDate.clone();
  }

  onOpen(): void {
    void this.load();
  }

  private async load(): Promise<void> {
    this.modalEl.addClass("journaling-system-modal-shell");
    applyModalAppearance(this.modalEl, this.plugin.settings);
    this.contentEl.addClass("journaling-system-modal");
    this.setTitle(
      `${capitalize(this.reviewLevel)} review wizard - ${formatReviewPeriodTitle(this.reviewLevel, this.reviewDate)}`
    );
    this.contentEl.empty();
    this.contentEl.createDiv({
      cls: "journaling-system-field-hint",
      text: `Preparing ${this.reviewLevel} review context...`,
    });

    try {
      this.reviewFile = await this.plugin.getOrCreateReviewNote(
        this.reviewLevel,
        this.reviewDate
      );
      this.properties = this.plugin.getReviewWizardProperties(this.reviewLevel);
      this.contextItems = await this.plugin.getReviewWizardContextItems(
        this.reviewLevel,
        this.reviewDate
      );
      const frontmatter = this.app.metadataCache.getFileCache(this.reviewFile)?.frontmatter;
      this.initialFrontmatter = isRecord(frontmatter) ? { ...frontmatter } : {};
      this.summaryStartedFromAi = isTruthyFrontmatterValue(
        this.initialFrontmatter[this.plugin.getAiSummaryFlagProperty()]
      );
      this.summaryText = this.getInitialSummaryText();

      this.renderStep();
    } catch (error) {
      new Notice(error instanceof Error ? error.message : "Could not start review wizard.");
      this.close();
    }
  }

  private getInitialSummaryText(): string {
    const configuredSummary = formatInitialTextValue(
      this.initialFrontmatter[this.plugin.getAiSummaryProperty()]
    );
    if (configuredSummary.length > 0) {
      return configuredSummary;
    }

    const legacySummary = formatInitialTextValue(this.initialFrontmatter.journalAISummary);
    if (legacySummary.length > 0) {
      this.summaryStartedFromAi = true;
    }

    return legacySummary;
  }

  private renderStep(): void {
    const property = this.properties[this.stepIndex];
    if (!property) {
      this.renderSummaryOnlyStep();
      return;
    }

    this.currentInput = null;
    this.contentEl.empty();
    this.setTitle(
      `${capitalize(this.reviewLevel)} review wizard - ${formatReviewPeriodTitle(this.reviewLevel, this.reviewDate)} (${this.stepIndex + 1}/${this.properties.length})`
    );

    this.renderDailyContext(this.contentEl);
    this.renderReviewSummary(this.contentEl);

    const fieldEl = this.contentEl.createDiv({ cls: "journaling-system-field" });
    fieldEl.createEl("label", {
      text: property.label,
      cls: "journaling-system-field-label",
    });
    if (property.placeholder.trim().length > 0) {
      fieldEl.createDiv({
        text: property.placeholder,
        cls: "journaling-system-field-hint",
      });
    }

    const definition = reviewPropertyToJournalProperty(property);
    this.currentInput = createJournalInput(
      this.app,
      this.plugin,
      fieldEl,
      definition,
      this.values.get(property.id) ?? this.initialFrontmatter[property.property],
      this.reviewLevel
    );

    if (
      definition.type === "multiselect" &&
      this.isTopicProperty(property)
    ) {
      const topicInput = this.currentInput as ReviewTopicsInput | null;
      if (topicInput?.addValues) {
        this.renderReviewTopicPickerButton(fieldEl, property, topicInput);
      }
    }

    const buttonRow = this.contentEl.createDiv({ cls: "journaling-system-modal-actions" });
    new ButtonComponent(buttonRow)
      .setButtonText(this.stepIndex === this.properties.length - 1 ? "Finish" : "Next")
      .setCta()
      .onClick(async () => {
        this.saveCurrentStepValue();
        if (this.stepIndex === this.properties.length - 1) {
          await this.finish();
          return;
        }

        this.stepIndex += 1;
        this.renderStep();
      });
    new ButtonComponent(buttonRow)
      .setButtonText("Cancel")
      .onClick(() => {
        this.close();
      });
  }

  private isTopicProperty(property: ReviewPropertyDefinition): boolean {
    return (
      property.isTopicField === true ||
      /\b(topic|topics|theme|themes)\b/.test(
        `${property.property} ${property.label}`.toLowerCase()
      )
    );
  }

  private renderReviewTopicPickerButton(
    fieldEl: HTMLElement,
    property: ReviewPropertyDefinition,
    topicInput: ReviewTopicsInput
  ): void {
    const actionRow = fieldEl.createDiv({
      cls: "journaling-system-topic-picker-actions",
    });
    new ButtonComponent(actionRow)
      .setButtonText("Pick existing topics")
      .onClick(() => {
        new ReviewTopicsPickerModal(
          this.app,
          property.property,
          this.plugin.collectExistingValues(property.property, this.reviewLevel),
          topicInput.getValues(),
          (selectedValues) => {
            topicInput.addValues(selectedValues);
          }
        ).open();
      });
  }

  private renderSummaryOnlyStep(): void {
    this.currentInput = null;
    this.contentEl.empty();
    this.setTitle(
      `${capitalize(this.reviewLevel)} review wizard - ${formatReviewPeriodTitle(this.reviewLevel, this.reviewDate)}`
    );
    this.renderDailyContext(this.contentEl);
    this.renderReviewSummary(this.contentEl);

    const buttonRow = this.contentEl.createDiv({ cls: "journaling-system-modal-actions" });
    new ButtonComponent(buttonRow)
      .setButtonText("Finish")
      .setCta()
      .onClick(async () => {
        await this.finish();
      });
    new ButtonComponent(buttonRow)
      .setButtonText("Cancel")
      .onClick(() => {
        this.close();
      });
  }

  private renderDailyContext(containerEl: HTMLElement): void {
    const details = containerEl.createEl("details", {
      cls: "journaling-system-review-wizard-context",
    });
    details.open = true;
    details.createEl("summary", {
      text: `Context for ${this.reviewLevel} review (${this.contextItems.length} notes)`,
      cls: "journaling-system-review-wizard-summary",
    });

    const body = details.createDiv({ cls: "journaling-system-review-wizard-context-body" });
    if (this.contextItems.length === 0) {
      body.createDiv({
        cls: "journaling-system-field-hint",
        text: `No matching notes were found for this ${formatReviewPeriodTitle(this.reviewLevel, this.reviewDate)} period.`,
      });
      return;
    }

    const sourceName = this.plugin.getReviewSource(this.reviewLevel, this.reviewDate).name;
    body.createDiv({
      text: `Sources: ${sourceName}`,
      cls: "journaling-system-field-hint",
    });

    for (const item of this.contextItems) {
      const row = body.createDiv({ cls: "journaling-system-review-wizard-day" });
      row.createDiv({
        cls: "journaling-system-review-wizard-day-title",
        text: item.label,
      });
      const metaParts = [
        item.location ? `Location: ${item.location}` : "",
        item.mood ? `Mood: ${item.mood}` : "",
        item.hasLongEntry ? "Long entry" : "",
      ].filter((part) => part.length > 0);
      if (metaParts.length > 0) {
        row.createDiv({
          cls: "journaling-system-review-wizard-day-meta",
          text: metaParts.join(" · "),
        });
      }
      row.createDiv({
        cls: "journaling-system-review-wizard-day-short",
        text: item.shortText || "No quick entry.",
      });
    }
  }

  private renderReviewSummary(containerEl: HTMLElement): void {
    const details = containerEl.createEl("details", {
      cls: "journaling-system-ai-summary",
    });
    details.open = this.summaryText.length > 0 || this.plugin.settings.ai.enabled;
    details.createEl("summary", {
      text: "Review summary",
      cls: "journaling-system-review-wizard-summary",
    });

    const body = details.createDiv({ cls: "journaling-system-ai-summary-body" });
    const textarea = body.createEl("textarea", {
      cls: "journaling-system-textarea journaling-system-review-summary-textarea",
    });
    textarea.placeholder = this.plugin.settings.ai.enabled
      ? "Write your review summary, or generate a local AI draft and edit it here."
      : "Write your review summary here.";
    textarea.value = this.summaryText;
    textarea.addEventListener("input", () => {
      this.summaryText = textarea.value;
    });

    body.createDiv({
      text: this.summaryStartedFromAi
        ? "This summary started from local AI and can be freely edited."
        : "If you generate a local AI draft, the summary will be marked as AI-started.",
      cls: "journaling-system-field-hint",
    });

    const actions = body.createDiv({ cls: "journaling-system-ai-summary-actions" });
    new ButtonComponent(actions)
      .setButtonText(this.summaryText.length > 0 ? "Regenerate AI draft" : "Generate AI draft")
      .setDisabled(!this.plugin.settings.ai.enabled || this.aiSummaryBusy)
      .onClick(async () => {
        await this.generateAiSummary();
      });
  }

  private async generateAiSummary(): Promise<void> {
    if (!this.reviewFile) {
      return;
    }

    this.saveCurrentStepValue();
    this.aiSummaryBusy = true;
    this.renderStep();

    try {
      if (this.reviewLevel === "weekly") {
        this.summaryText = await this.plugin.generateWeeklyAiSummary(this.contextItems);
      } else {
        this.summaryText = await this.plugin.generateReviewAiSummary(
          this.reviewLevel,
          this.reviewDate
        );
      }
      this.summaryStartedFromAi = true;
      this.initialFrontmatter[this.plugin.getAiSummaryProperty()] = this.summaryText;
      this.initialFrontmatter[this.plugin.getAiSummaryFlagProperty()] = true;
      new Notice(`Generated local AI ${this.reviewLevel} summary draft.`);
    } catch (error) {
      new Notice(error instanceof Error ? error.message : "Could not generate AI summary.");
    } finally {
      this.aiSummaryBusy = false;
      this.renderStep();
    }
  }

  private saveCurrentStepValue(): void {
    const property = this.properties[this.stepIndex];
    if (!property || !this.currentInput) {
      return;
    }

    const value = this.currentInput.getValue();
    if (isEmptyJournalValue(value)) {
      return;
    }

    this.values.set(property.id, value);
  }

  private async finish(): Promise<void> {
    if (!this.reviewFile) {
      this.close();
      return;
    }

    const values: ReviewValue[] = [];
    for (const property of this.properties) {
      const value = this.values.get(property.id);
      if (value === undefined || isEmptyJournalValue(value)) {
        continue;
      }

      values.push({ definition: property, value });
    }

    try {
      if (values.length > 0) {
        await this.plugin.writeReviewValues(this.reviewFile, this.reviewLevel, values);
      }
      await this.plugin.writeReviewSummary(
        this.reviewFile,
        this.summaryText,
        this.summaryStartedFromAi
      );
      this.close();
      await this.plugin.openFileAtHeading(
        this.reviewFile,
        this.plugin.settings.reviews.reflectionHeading
      );
      new Notice(`${capitalize(this.reviewLevel)} review wizard complete.`);
    } catch (error) {
      new Notice(error instanceof Error ? error.message : "Could not save review.");
    }
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
    void this.render();
  }

  private async render(): Promise<void> {
    const { contentEl } = this;
    this.inputs.clear();
    contentEl.empty();
    this.modalEl.addClass("journaling-system-modal-shell");
    applyModalAppearance(this.modalEl, this.plugin.settings);
    contentEl.addClass("journaling-system-modal");
    this.setTitle(`Journal entry for ${moment().format("YYYY-MM-DD dddd")}`);

    const initialFrontmatter = await this.plugin.getTodayFrontmatter();
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
        initialFrontmatter[definition.property],
        "daily"
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
  getValues?(): string[];
  addValues?(values: string[]): void;
}

type ReviewTopicsInput = JournalFieldInput & {
  getValues(): string[];
  addValues(values: string[]): void;
};

function createJournalInput(
  app: App,
  plugin: JournalingSystemPlugin,
  fieldEl: HTMLElement,
  definition: JournalPropertyDefinition,
  initialValue: unknown,
  collectScope: TopicSuggestionScope = "daily"
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

  const existingValues = plugin.collectExistingValues(definition.property, collectScope);
  const multiInput = new MultiSelectPropertyInput(
    fieldEl,
    existingValues,
    definition.placeholder || "One entry per line",
    flattenPropertyValue(initialValue).join("\n")
  );
  return {
    getValue: () => multiInput.getValues(),
    getValues: () => multiInput.getValues(),
    addValues: (values: string[]) => multiInput.addValues(values),
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

  addValues(values: string[]): void {
    this.textareaEl.value = mergeStringArrays(
      parseMultiSelectEntry(this.textareaEl.value),
      values
    ).join("\n");
    this.renderSuggestions();
    this.textareaEl.focus();
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

class ReviewTopicsPickerModal extends Modal {
  private readonly selectedValues = new Map<string, string>();
  private readonly availableValues: string[];
  private searchInput: HTMLInputElement | null = null;
  private listContainer: HTMLElement | null = null;
  private insertButton: HTMLButtonElement | null = null;
  private optionRows: HTMLElement[] = [];
  private filteredValues: string[] = [];
  private highlightedOptionIndex = -1;

  constructor(
    app: App,
    private readonly propertyName: string,
    availableValues: string[],
    currentValues: string[],
    private readonly onSelectValues: (values: string[]) => void | Promise<void>
  ) {
    super(app);
    this.availableValues = dedupeProperties(
      availableValues
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
    );
    for (const value of currentValues) {
      const normalized = value.trim();
      if (normalized.length > 0) {
        this.selectedValues.set(normalized.toLowerCase(), normalized);
      }
    }

    this.setTitle(`Select existing ${this.propertyName} values`);
  }

  onOpen(): void {
    this.contentEl.empty();
    this.contentEl.addClass("journaling-system-topic-picker-modal");

    this.contentEl.createEl("div", {
      text: "Pick existing values with fuzzy search, then insert them into the current field.",
      cls: "journaling-system-field-hint",
    });

    const searchRow = this.contentEl.createDiv({
      cls: "journaling-system-topic-picker-row",
    });
    this.searchInput = searchRow.createEl("input", {
      cls: "journaling-system-input journaling-system-topic-picker-search",
      value: "",
    });
    this.searchInput.placeholder = "Search existing entries...";
    this.searchInput.addEventListener("input", () => this.renderList());
    this.searchInput.addEventListener("keydown", (event) => this.handleSearchKeydown(event));

    this.listContainer = this.contentEl.createDiv({
      cls: "journaling-system-topic-picker-list",
    });

    const actions = this.contentEl.createDiv({ cls: "journaling-system-modal-actions journaling-system-topic-picker-actions" });
    const insertAction = new ButtonComponent(actions)
      .setButtonText("Insert selected")
      .setCta()
      .setDisabled(this.selectedValues.size === 0)
      .onClick(async () => {
        await this.onSelectValues(Array.from(this.selectedValues.values()));
        this.close();
      });
    this.insertButton = insertAction.buttonEl;

    new ButtonComponent(actions)
      .setButtonText("Cancel")
      .onClick(() => {
        this.close();
      });

    this.renderList();
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private renderList(): void {
    if (!this.listContainer) {
      return;
    }

    const query = this.searchInput?.value.trim() ?? "";
    this.listContainer.empty();
    this.optionRows = [];

    const availableOptions = this.availableValues
      .map((value) => ({
        value,
        score: query.length === 0 ? 0 : fuzzyScore(value, query),
      }))
      .filter(({ score }) => query.length === 0 || score > 0)
      .sort((a, b) =>
        query.length === 0
          ? a.value.localeCompare(b.value)
          : b.score - a.score || a.value.localeCompare(b.value)
      );

    this.filteredValues = availableOptions
      .slice(0, 30)
      .map((entry) => entry.value);

    if (
      this.highlightedOptionIndex < 0 ||
      this.highlightedOptionIndex >= this.filteredValues.length
    ) {
      this.highlightedOptionIndex = this.filteredValues.length > 0 ? 0 : -1;
    }

    if (availableOptions.length === 0) {
      this.listContainer.createDiv({
        text: query.length === 0
          ? "No matching existing values found."
          : "No results. Type more or add a new value directly in the field.",
        cls: "journaling-system-field-hint",
      });
      this.highlightedOptionIndex = -1;
      return;
    }

    for (const [index, { value }] of availableOptions.slice(0, 30).entries()) {
      const row = this.listContainer.createDiv({
        cls: "journaling-system-topic-picker-item",
      });
      if (index === this.highlightedOptionIndex) {
        row.addClass("is-active");
      }

      row.addEventListener("mousemove", () => {
        this.setHighlightedIndex(index);
      });

      const checkbox = row.createEl("input", { type: "checkbox" });
      const normalized = value.toLowerCase();
      checkbox.checked = this.selectedValues.has(normalized);
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) {
          this.selectedValues.set(normalized, value);
        } else {
          this.selectedValues.delete(normalized);
        }
        this.updateInsertState();
      });

      row.addEventListener("click", (event) => {
        if (event.target === checkbox) {
          return;
        }
        checkbox.checked = !checkbox.checked;
        checkbox.dispatchEvent(new Event("change"));
      });

      row.createEl("span", { text: value });
      this.optionRows.push(row);
    }
  }

  private handleSearchKeydown(event: KeyboardEvent): void {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      this.moveHighlightedOption(1);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      this.moveHighlightedOption(-1);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      void this.insertFromPicker();
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      this.close();
    }
  }

  private async insertFromPicker(): Promise<void> {
    const query = this.searchInput?.value.trim() ?? "";

    if (this.highlightedOptionIndex >= 0 && this.highlightedOptionIndex < this.filteredValues.length) {
      const value = this.filteredValues[this.highlightedOptionIndex];
      this.selectedValues.set(value.toLowerCase(), value);
      this.updateInsertState();
      this.resetSearchInput();
      this.renderList();
      return;
    }

    if (query.length > 0) {
      this.selectedValues.set(query.toLowerCase(), query);
      this.updateInsertState();
      this.resetSearchInput();
      this.renderList();
      return;
    }

    if (this.selectedValues.size > 0 && this.insertButton) {
      await this.onSelectValues(Array.from(this.selectedValues.values()));
      this.close();
      return;
    }

    this.close();
  }

  private resetSearchInput(): void {
    if (!this.searchInput) {
      return;
    }

    this.searchInput.value = "";
    this.searchInput.focus();
  }

  private moveHighlightedOption(delta: number): void {
    if (!this.filteredValues.length) {
      return;
    }

    if (this.highlightedOptionIndex === -1) {
      this.highlightedOptionIndex = 0;
    } else {
      this.highlightedOptionIndex = (this.highlightedOptionIndex + delta + this.filteredValues.length) % this.filteredValues.length;
    }
    this.updateHighlightedRow();
  }

  private setHighlightedIndex(index: number): void {
    if (index < 0 || index >= this.filteredValues.length) {
      return;
    }

    this.highlightedOptionIndex = index;
    this.updateHighlightedRow();
  }

  private updateHighlightedRow(): void {
    for (const row of this.optionRows) {
      row.removeClass("is-active");
    }

    if (this.highlightedOptionIndex >= 0 && this.highlightedOptionIndex < this.optionRows.length) {
      this.optionRows[this.highlightedOptionIndex].addClass("is-active");
    }
  }

  private updateInsertState(): void {
    if (this.insertButton) {
      this.insertButton.disabled = this.selectedValues.size === 0;
    }
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
    this.displayTopicSuggestionFolderSettings(containerEl);
    this.displayPropertySettings(containerEl);
    this.displayBaseSettings(containerEl);
    this.displayDailySettings(containerEl);
    this.displayReviewLevelSettings(containerEl, "Weekly", "weekly");
    this.displayReviewLevelSettings(containerEl, "Monthly", "monthly");
    this.displayReviewLevelSettings(containerEl, "Annual", "annual");
    this.displayLocalAiSettings(containerEl);
    this.displayAppearanceSettings(containerEl);
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
      text: "Weekly reviews are the first interpretation layer: scan the daily signal, then write one editable summary and add a few topics you want to connect across the vault.",
    });
    body.createEl("p", {
      text: "Monthly and annual reviews synthesize patterns from previous review notes. Keep the summary readable, and use topics as the small queryable index for recurring concepts.",
    });
    body.createEl("p", {
      text: "Local AI can draft a summary from local Ollama, but the summary stays editable. The AI-started flag only records provenance; the saved text is still yours to revise.",
    });

    body.createEl("h4", { text: "Settings map" });
    const list = body.createEl("ul");
    list.createEl("li", {
      text: "Basic settings control shared headings and the review folder.",
    });
    list.createEl("li", {
      text: "Property settings define the YAML property names and the fields shown in daily and review notes.",
    });
    list.createEl("li", {
      text: "Bases settings control the editable Review Fields Base and the source-note columns shown in generated Obsidian Bases.",
    });
    list.createEl("li", {
      text: "Daily, Weekly, Monthly, and Annual settings control each note type's prompt schedule, note naming, and level-specific review behavior.",
    });
    list.createEl("li", {
      text: "Local AI settings connect review wizards to a local Ollama model and save generated guidance to a review property.",
    });
    list.createEl("li", {
      text: "Appearance settings control modal size and text size for the daily prompt and review wizards.",
    });
  }

  private displayBasicSettings(containerEl: HTMLElement): void {
    const section = createSettingsSection(containerEl, "Basic settings");
    section.createDiv({
      cls: "journaling-system-section-note",
      text: "Shared defaults for generated review-note workspaces. Schedules and note naming are configured in the level-specific sections below.",
    });

    this.addFolderSetting(
      section,
      "Review folder",
      "Where weekly, monthly, and annual review notes are created. Date tokens such as {YYYY} are supported.",
      this.plugin.settings.reviews.folder,
      async (value) => {
        this.plugin.settings.reviews.folder = value;
        await this.plugin.saveSettings();
      }
    );

    this.addToggleSetting(
      section,
      "Review checklist",
      "Add checklist prompts to generated review notes. Property fill-in checklist items are generated automatically.",
      "includeReviewChecklist"
    );
    this.addToggleSetting(
      section,
      "Long-entry embeds",
      "Global switch for embedding matching daily ## Journal sections in review notes. Entries are included only when the section contains text.",
      "includeLongEntryEmbeds"
    );
    this.addToggleSetting(
      section,
      "Numerical summaries",
      "Add count, mean, min, and max tables for enabled daily number properties, such as mood, to generated review notes.",
      "includeNumericSummary"
    );
    this.addTextSetting(
      section,
      "Checklist heading",
      "Heading used above generated checklist prompts in review notes.",
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
      "Heading used above generated Bases that show source daily or review notes.",
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
      "Heading used above embedded daily long journal entries in review notes.",
      this.plugin.settings.reviews.longEntriesHeading,
      async (value) => {
        this.plugin.settings.reviews.longEntriesHeading =
          value || DEFAULT_SETTINGS.reviews.longEntriesHeading;
        await this.plugin.saveSettings();
      }
    );
    this.addTextSetting(
      section,
      "Numerical summary heading",
      "Heading used above generated mean/min/max tables in review notes.",
      this.plugin.settings.reviews.numericSummaryHeading,
      async (value) => {
        this.plugin.settings.reviews.numericSummaryHeading =
          value || DEFAULT_SETTINGS.reviews.numericSummaryHeading;
        await this.plugin.saveSettings();
      }
    );
    this.addTextSetting(
      section,
      "Reflection heading",
      "Heading for your own written review reflection. Generated refreshes preserve this section.",
      this.plugin.settings.reviews.reflectionHeading,
      async (value) => {
        this.plugin.settings.reviews.reflectionHeading =
          value || DEFAULT_SETTINGS.reviews.reflectionHeading;
        await this.plugin.saveSettings();
      }
    );
  }

  private displayTopicSuggestionFolderSettings(containerEl: HTMLElement): void {
    const section = createSettingsSection(
      containerEl,
      "Topic suggestion scan folders"
    );
    section.createDiv({
      cls: "journaling-system-section-note",
      text: "Limit where existing topic values are learned from. Keep defaults empty to use the existing daily/review folders from above.",
    });

    this.addFolderSetting(
      section,
      "Common root",
      "Optional shared parent folder for topic suggestions. Date tokens such as {YYYY} are supported.",
      this.plugin.settings.reviews.topicSuggestionFolders.root,
      async (value) => {
        this.plugin.settings.reviews.topicSuggestionFolders.root = value;
        await this.plugin.saveSettings();
      }
    );

    this.addFolderSetting(
      section,
      "Daily override",
      "Scan path (inside the common root) for daily topic suggestions. Date tokens are supported.",
      this.plugin.settings.reviews.topicSuggestionFolders.daily,
      async (value) => {
        this.plugin.settings.reviews.topicSuggestionFolders.daily = value;
        await this.plugin.saveSettings();
      }
    );

    this.addFolderSetting(
      section,
      "Weekly override",
      "Scan path (inside the common root) for weekly topic suggestions. If empty, falls back to the common/review folder settings.",
      this.plugin.settings.reviews.topicSuggestionFolders.weekly,
      async (value) => {
        this.plugin.settings.reviews.topicSuggestionFolders.weekly = value;
        await this.plugin.saveSettings();
      }
    );

    this.addFolderSetting(
      section,
      "Monthly override",
      "Scan path (inside the common root) for monthly topic suggestions. If empty, falls back to the common/review folder settings.",
      this.plugin.settings.reviews.topicSuggestionFolders.monthly,
      async (value) => {
        this.plugin.settings.reviews.topicSuggestionFolders.monthly = value;
        await this.plugin.saveSettings();
      }
    );

    this.addFolderSetting(
      section,
      "Annual override",
      "Scan path (inside the common root) for annual topic suggestions. If empty, falls back to the common/review folder settings.",
      this.plugin.settings.reviews.topicSuggestionFolders.annual,
      async (value) => {
        this.plugin.settings.reviews.topicSuggestionFolders.annual = value;
        await this.plugin.saveSettings();
      }
    );
  }

  private displayBaseSettings(containerEl: HTMLElement): void {
    const section = createSettingsSection(containerEl, "Bases settings shared across all notes");
    section.createDiv({
      cls: "journaling-system-section-note",
      text: "Bases are generated into review notes so you can edit review fields in place and browse the underlying daily or review notes without copying their full content.",
    });

    this.addToggleSetting(
      section,
      "Inline Bases",
      "Add Obsidian Base blocks to generated review notes, including the editable Review Fields Base and source-note Bases.",
      "includeInlineBases"
    );
    this.addToggleSetting(
      section,
      "Daily Base in monthly/annual",
      "Also include a daily-note Base in monthly and annual reviews, in addition to the hierarchical weekly/monthly review Base.",
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
      text: "Used by weekly reviews and by the optional daily Base in monthly or annual reviews. Select Show to include a property, and set a width in pixels when a column needs more room.",
    });
    this.renderBasePropertyTable(
      section,
      "baseProperties",
      this.plugin.getAvailableBaseProperties("daily")
    );

    section.createEl("h3", { text: "Review source Base columns" });
    section.createDiv({
      cls: "journaling-system-section-note",
      text: "Used when monthly reviews show weekly reviews and annual reviews show monthly reviews. These columns should focus on condensed review properties, not raw daily detail.",
    });
    this.renderBasePropertyTable(
      section,
      "reviewBaseProperties",
      this.plugin.getAvailableBaseProperties("review")
    );
  }

  private displayDailySettings(containerEl: HTMLElement): void {
    const section = createSettingsSection(containerEl, "Daily settings");
    section.createDiv({
      cls: "journaling-system-section-note",
      text: "Controls when the daily prompt appears and where daily notes are created. The fields inside the prompt are configured in Property settings.",
    });

    new Setting(section)
      .setName("Enable prompts")
      .setDesc("Turn scheduled daily prompts on or off. The command remains available even when scheduled prompts are disabled.")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.dailyPrompts.enabled).onChange(async (value) => {
          this.plugin.settings.dailyPrompts.enabled = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(section)
      .setName("Prompt behavior")
      .setDesc("Choose whether scheduled daily prompts always appear, or only appear when today's quick-entry field is still empty.")
      .addDropdown((dropdown) => {
        dropdown
          .addOptions(DAILY_PROMPT_BEHAVIOR_LABELS)
          .setValue(
            normalizeDailyPromptBehavior(
              this.plugin.settings.dailyPrompts.promptBehavior
            )
          )
          .onChange(async (value) => {
            this.plugin.settings.dailyPrompts.promptBehavior =
              normalizeDailyPromptBehavior(value);
            await this.plugin.saveSettings();
          });
      });

    new Setting(section)
      .setName("Times")
      .setDesc("Prompt times in 24-hour format, separated by commas. Example: 09:00, 20:00.")
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
    const weekdayLabel = weekdayRow.createDiv();
    weekdayLabel.createDiv({ text: "Weekdays", cls: "journaling-system-setting-label" });
    weekdayLabel.createDiv({
      text: "Only selected weekdays can trigger scheduled daily prompts.",
      cls: "journaling-system-setting-description",
    });
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
      .setDesc("How long the prompt waits before asking again when snoozed.")
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
      .setDesc("Show a missed prompt after Obsidian opens if a scheduled prompt time passed while the app was closed.")
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
      "Daily note folder. Date tokens such as journal/{YYYY} create year-based folders.",
      this.plugin.settings.dailyNote.folder,
      async (value) => {
        this.plugin.settings.dailyNote.folder = value;
        await this.plugin.saveSettings();
      }
    );
    this.addTextSetting(
      section,
      "Date format",
      "Moment-style note name format used for daily note files, for example YYYY-MM-DD dddd.",
      this.plugin.settings.dailyNote.dateFormat,
      async (value) => {
        this.plugin.settings.dailyNote.dateFormat = value || DEFAULT_SETTINGS.dailyNote.dateFormat;
        await this.plugin.saveSettings();
      }
    );
    this.addTextSetting(
      section,
      "Long-entry heading",
      "Heading where long journal writing lives inside the daily note. Review embeds scan this section and the plugin adds a hidden write marker below it.",
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
      "Heading for short daily captures written into the note body, separate from frontmatter properties.",
      this.plugin.settings.dailyNote.shortEntrySectionHeading,
      async (value) => {
        this.plugin.settings.dailyNote.shortEntrySectionHeading =
          value || DEFAULT_SETTINGS.dailyNote.shortEntrySectionHeading;
        await this.plugin.saveSettings();
      }
    );

    new Setting(section)
      .setName("Create note if missing")
      .setDesc("Create the daily note automatically when the prompt or long-entry command is used.")
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
    section.createDiv({
      cls: "journaling-system-section-note",
      text: this.getReviewLevelDescription(level),
    });
    const review = this.plugin.settings.reviews[level];

    new Setting(section)
      .setName(`Enable ${label.toLowerCase()} review`)
      .setDesc(`Turn scheduled ${label.toLowerCase()} review prompts on or off. The command remains available either way.`)
      .addToggle((toggle) => {
        toggle.setValue(review.enabled).onChange(async (value) => {
          review.enabled = value;
          await this.plugin.saveSettings();
        });
      });

    if (level === "weekly") {
      new Setting(section)
        .setName("Prompt weekday")
        .setDesc("Weekday when the weekly review prompt should appear.")
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
        .setDesc("Calendar day when the monthly review prompt should appear, from 1 to 31.")
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
        .setDesc("Month and day for the annual review prompt, written as MM-DD.")
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
      .setDesc(`Time of day for the ${label.toLowerCase()} review prompt.`)
      .addText((text) => {
        text.inputEl.type = "time";
        text.setValue(review.promptTime).onChange(async (value) => {
          review.promptTime = value;
          await this.plugin.saveSettings();
        });
      });

    this.addTextSetting(
      section,
      "Note format",
      "Moment-style note name format for this review level.",
      review.noteNameFormat,
      async (value) => {
        review.noteNameFormat = value || DEFAULT_SETTINGS.reviews[level].noteNameFormat;
        await this.plugin.saveSettings();
      }
    );

    new Setting(section)
      .setName("Long-entry embeds")
      .setDesc(`Embed daily long journal sections in ${label.toLowerCase()} reviews when actual text exists under the configured heading.`)
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

  private getReviewLevelDescription(level: ReviewLevel): string {
    if (level === "weekly") {
      return "Weekly reviews are the first interpretation layer. They use daily notes as source material and are the best place to name highlights, difficulties, improvements, and life/work reflections.";
    }

    if (level === "monthly") {
      return "Monthly reviews synthesize patterns from weekly reviews. They can also include a daily-note Base when you want to browse raw entries while reflecting.";
    }

    return "Annual reviews synthesize direction from monthly reviews. Keep annual properties high-level so the year view stays readable.";
  }

  private displayLocalAiSettings(containerEl: HTMLElement): void {
    const section = createSettingsSection(containerEl, "Local AI settings");
    section.createDiv({
      cls: "journaling-system-section-note",
      text: "Optional local-only review assistance. The plugin talks to Ollama on localhost, puts generated guidance into the editable review summary, and does not send note text to cloud services.",
    });

    new Setting(section)
      .setName("Enable local AI review assistance")
      .setDesc("Show AI summary generation in review wizards.")
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.ai.enabled)
          .onChange(async (value) => {
            this.plugin.settings.ai.enabled = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(section)
      .setName("Provider")
      .setDesc("Only Ollama is supported for now.")
      .addDropdown((dropdown) => {
        dropdown
          .addOption("ollama", "Ollama")
          .setValue(this.plugin.settings.ai.provider)
          .onChange(async () => {
            this.plugin.settings.ai.provider = "ollama";
            await this.plugin.saveSettings();
          });
      });

    this.addTextSetting(
      section,
      "Ollama URL",
      "Local Ollama server URL. Only localhost, 127.0.0.1, and [::1] URLs are accepted.",
      this.plugin.settings.ai.baseUrl,
      async (value) => {
        const normalized = normalizeLocalAiBaseUrl(value);
        if (normalized !== value.replace(/\/+$/g, "")) {
          new Notice("Using local default Ollama URL.");
        }
        this.plugin.settings.ai.baseUrl = normalized;
        await this.plugin.saveSettings();
      }
    );

    this.renderLocalAiModelSetting(section);

    this.addTextSetting(
      section,
      "Summary property",
      "Review-note property where the editable summary is saved.",
      this.plugin.settings.ai.summaryProperty,
      async (value) => {
        this.plugin.settings.ai.summaryProperty =
          value.trim() || DEFAULT_SETTINGS.ai.summaryProperty;
        await this.plugin.saveSettings();
      }
    );

    this.addTextSetting(
      section,
      "AI-started flag property",
      "Boolean review-note property set to true when the editable summary started from a local AI draft.",
      this.plugin.settings.ai.summaryAiProperty,
      async (value) => {
        this.plugin.settings.ai.summaryAiProperty =
          value.trim() || DEFAULT_SETTINGS.ai.summaryAiProperty;
        await this.plugin.saveSettings();
      }
    );

    new Setting(section)
      .setName("Ollama status")
      .setDesc("Check whether the local server is reachable and whether the selected model is installed.")
      .addButton((button) => {
        button.setButtonText("Check Ollama").onClick(async () => {
          try {
            new Notice(await this.plugin.checkLocalAiStatus());
          } catch (error) {
            new Notice(
              error instanceof Error
                ? error.message
                : "Could not reach Ollama on the configured local URL."
            );
          }
        });
      })
      .addButton((button) => {
        button.setButtonText("Find local Ollama").onClick(async () => {
          try {
            new Notice(await this.plugin.findAndUseLocalOllama());
            this.display();
          } catch (error) {
            new Notice(
              error instanceof Error
                ? error.message
                : "Could not find a reachable local Ollama server."
            );
          }
        });
      })
      .addButton((button) => {
        button.setButtonText("Download model").onClick(async () => {
          const settings = normalizeLocalAiSettings(this.plugin.settings.ai);
          const confirmed = window.confirm(
            `Download or verify ${settings.model} with Ollama? This can take several minutes and uses Ollama's local model store.`
          );
          if (!confirmed) {
            return;
          }

          try {
            new Notice(`Downloading or verifying ${settings.model}...`);
            new Notice(await this.plugin.pullLocalAiModel());
          } catch (error) {
            new Notice(
              error instanceof Error
                ? error.message
                : "Could not download the selected Ollama model."
            );
          }
        });
      });

    this.addFullWidthTextAreaSetting(
      section,
      "Review aspects",
      "One reflection aspect per line. These guide AI output and are separate from topic tags or note links. Prompts can insert this list with {{aspects}}.",
      this.plugin.settings.ai.aspects.join("\n"),
      async (value) => {
        this.plugin.settings.ai.aspects = normalizeLocalAiAspects(value);
        await this.plugin.saveSettings();
      },
      {
        textareaClass: "journaling-system-ai-prompt-textarea",
        resetLabel: "Reset",
        resetTooltip: "Reset to default review aspects",
        onReset: async () => {
          this.plugin.settings.ai.aspects = [...DEFAULT_LOCAL_AI_ASPECTS];
          await this.plugin.saveSettings();
          this.display();
        },
      }
    );

    section.createEl("h3", { text: "Review AI prompts" });
    section.createDiv({
      cls: "journaling-system-section-note",
      text: "Use {{sourceNotes}} where the journal context should be inserted and {{aspects}} where the aspect list should appear. If placeholders are missing, the plugin appends the missing context automatically.",
    });
    for (const level of REVIEW_LEVELS) {
      this.renderLocalAiPromptSetting(section, level);
    }
  }

  private renderLocalAiPromptSetting(
    containerEl: HTMLElement,
    level: ReviewLevel
  ): void {
    this.addFullWidthTextAreaSetting(
      containerEl,
      `${capitalize(level)} AI prompt`,
      `Prompt template for ${level} AI review guidance.`,
      this.plugin.settings.ai.prompts[level],
      async (value) => {
        this.plugin.settings.ai.prompts[level] = normalizeLocalAiPrompt(
          value,
          DEFAULT_LOCAL_AI_PROMPTS[level]
        );
        await this.plugin.saveSettings();
      },
      {
        textareaClass: "journaling-system-ai-prompt-textarea",
        resetLabel: "Reset",
        resetTooltip: "Reset to default prompt",
        onReset: async () => {
          this.plugin.settings.ai.prompts[level] = DEFAULT_LOCAL_AI_PROMPTS[level];
          await this.plugin.saveSettings();
          this.display();
        },
      }
    );
  }

  private renderLocalAiModelSetting(containerEl: HTMLElement): void {
    const setting = new Setting(containerEl)
      .setName("Model")
      .setDesc(
        "Ollama model used for review summaries. Small default: llama3.2."
      );

    const selectedModelText = setting.controlEl.createDiv({
      cls: "journaling-system-ollama-model-selection",
      text: `Selected model: ${this.plugin.settings.ai.model}`,
    });

    const actions = setting.settingEl.createDiv({
      cls: "journaling-system-ollama-model-actions",
    });

    let chooseModelButton: ButtonComponent | null = null;

    const description = setting.descEl;
    let installedModels: string[] = [];

    const updateDescription = (models: string[], baseDescription?: string): void => {
      if (!description) {
        return;
      }

      const detectedText =
        models.length === 0
          ? "No local models discovered yet. Click Refresh models."
          : `Detected local models (${models.length}): ${models.join(", ")}`;
      const extra =
        baseDescription && baseDescription.length > 0
          ? `${baseDescription} `
          : "";

      description.empty();
      description.createEl("div", {
        text: `${extra}Ollama model used for review summaries. Small default: llama3.2.`,
      });
      description.createEl("div", {
        text: detectedText,
        cls: "journaling-system-setting-description",
      });
    };

    const applySelectedModel = async (value: string): Promise<void> => {
      this.plugin.settings.ai.model = value;
      selectedModelText.setText(`Selected model: ${value}`);
      updateDescription(installedModels);
      await this.plugin.saveSettings();
    };

    const openModelPicker = () => {
      new OllamaModelSelectModal(
        this.app,
        installedModels,
        async (model) => {
          await applySelectedModel(model);
        }
      ).open();
    };

    const updateAvailableModels = async (showResultMessage = true): Promise<void> => {
      chooseModelButton?.setDisabled(true);
      try {
        installedModels = await this.plugin.listLocalOllamaModels();
        if (installedModels.length === 0) {
          updateDescription([], "No installed models were returned.");
          chooseModelButton?.setDisabled(true);
          if (showResultMessage) {
            new Notice("No local Ollama models were found.");
          }
          return;
        }

        updateDescription(installedModels, "Local Ollama models:");
        chooseModelButton?.setDisabled(false);
        if (!installedModels.includes(this.plugin.settings.ai.model)) {
          const fallback = installedModels[0] ?? DEFAULT_SETTINGS.ai.model;
          await applySelectedModel(fallback);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not read local models.";
        updateDescription([], `Could not reach local Ollama: ${message}`);
        chooseModelButton?.setDisabled(true);
      } finally {
        if (showResultMessage && installedModels.length > 0) {
          new Notice("Local Ollama models refreshed.");
        }
      }
    };

    chooseModelButton = new ButtonComponent(actions)
      .setButtonText("Choose installed model")
      .setTooltip("Pick an installed Ollama model.")
      .setCta()
      .onClick(async () => {
        openModelPicker();
      });

    new ButtonComponent(actions)
      .setButtonText("Refresh models")
      .setTooltip("Rescan for installed Ollama models.")
      .onClick(async () => {
        await updateAvailableModels();
      });

    void updateAvailableModels(false);
  }

  private displayAppearanceSettings(containerEl: HTMLElement): void {
    const section = createSettingsSection(containerEl, "Appearance settings");
    section.createDiv({
      cls: "journaling-system-section-note",
      text: "Desktop modal sizing for the daily journal prompt and review wizards. Mobile keeps the compact top-half layout.",
    });

    this.addSliderSetting(
      section,
      "Modal text size",
      "Text size used inside journaling modals on desktop.",
      normalizeModalFontSize(this.plugin.settings.ui.modalFontSizePx),
      { min: 12, max: 20, step: 1, unit: "px" },
      async (value) => {
        this.plugin.settings.ui.modalFontSizePx = normalizeModalFontSize(value);
        await this.plugin.saveSettings();
      }
    );

    this.addSliderSetting(
      section,
      "Modal width",
      "Maximum desktop modal width. Wider modals make review context easier to scan.",
      normalizeModalWidth(this.plugin.settings.ui.modalWidthPx),
      { min: 640, max: 1100, step: 20, unit: "px" },
      async (value) => {
        this.plugin.settings.ui.modalWidthPx = normalizeModalWidth(value);
        await this.plugin.saveSettings();
      }
    );

    this.addSliderSetting(
      section,
      "Modal max height",
      "Maximum desktop modal height as a percentage of the viewport.",
      normalizeModalMaxHeight(this.plugin.settings.ui.modalMaxHeightVh),
      { min: 60, max: 94, step: 2, unit: "vh" },
      async (value) => {
        this.plugin.settings.ui.modalMaxHeightVh = normalizeModalMaxHeight(value);
        await this.plugin.saveSettings();
      }
    );

    this.addSliderSetting(
      section,
      "Review context height",
      "Scrollable context area inside the review wizard.",
      normalizeReviewContextHeight(this.plugin.settings.ui.reviewContextHeightPx),
      { min: 180, max: 560, step: 20, unit: "px" },
      async (value) => {
        this.plugin.settings.ui.reviewContextHeightPx =
          normalizeReviewContextHeight(value);
        await this.plugin.saveSettings();
      }
    );
  }

  private displayPropertySettings(containerEl: HTMLElement): void {
    const section = createSettingsSection(containerEl, "Property settings shared across all notes");
    section.createDiv({
      cls: "journaling-system-section-note",
      text: "Property names are YAML frontmatter keys written into notes. Labels only change how fields appear in the prompt/settings UI.",
    });

    section.createEl("h3", { text: "Automatic properties" });
    section.createDiv({
      cls: "journaling-system-section-note",
      text: "Automatic properties are maintained by the plugin so Bases can reliably filter by date, weekday, note type, week, month, and year.",
    });
    this.addTextSetting(section, "Date", "Calendar date of the journal note.", this.plugin.settings.automaticProperties.date, async (value) => {
      this.plugin.settings.automaticProperties.date = value || DEFAULT_SETTINGS.automaticProperties.date;
      await this.plugin.saveSettings();
    });
    this.addTextSetting(section, "Time", "Time when the daily journal prompt was saved.", this.plugin.settings.automaticProperties.time, async (value) => {
      this.plugin.settings.automaticProperties.time = value || DEFAULT_SETTINGS.automaticProperties.time;
      await this.plugin.saveSettings();
    });
    this.addTextSetting(
      section,
      "Weekday",
      "Weekday label derived from the note date.",
      this.plugin.settings.automaticProperties.weekday,
      async (value) => {
        this.plugin.settings.automaticProperties.weekday =
          value || DEFAULT_SETTINGS.automaticProperties.weekday;
        await this.plugin.saveSettings();
      }
    );
    this.addTextSetting(section, "Type", "Note type marker such as daily, weekly, monthly, or annual.", this.plugin.settings.automaticProperties.type, async (value) => {
      this.plugin.settings.automaticProperties.type = value || DEFAULT_SETTINGS.automaticProperties.type;
      await this.plugin.saveSettings();
    });
    this.addTextSetting(section, "ISO week", "ISO week key used to connect daily notes to weekly reviews.", this.plugin.settings.automaticProperties.week, async (value) => {
      this.plugin.settings.automaticProperties.week = value || DEFAULT_SETTINGS.automaticProperties.week;
      await this.plugin.saveSettings();
    });
    this.addTextSetting(section, "Month", "Month key used to connect notes to monthly reviews.", this.plugin.settings.automaticProperties.month, async (value) => {
      this.plugin.settings.automaticProperties.month = value || DEFAULT_SETTINGS.automaticProperties.month;
      await this.plugin.saveSettings();
    });
    this.addTextSetting(section, "Year", "Year key used to connect notes to annual reviews.", this.plugin.settings.automaticProperties.year, async (value) => {
      this.plugin.settings.automaticProperties.year = value || DEFAULT_SETTINGS.automaticProperties.year;
      await this.plugin.saveSettings();
    });
    this.addTextSetting(
      section,
      "Picture",
      "Boolean property set when a note links or embeds common image/PDF journal attachments.",
      this.plugin.settings.automaticProperties.picture,
      async (value) => {
        this.plugin.settings.automaticProperties.picture =
          value || DEFAULT_SETTINGS.automaticProperties.picture;
        await this.plugin.saveSettings();
      }
    );

    section.createEl("h3", { text: "Daily properties" });
    section.createDiv({
      cls: "journaling-system-section-note",
      text: "These definitions control the daily journal modal. Keep daily fields light: text captures nuance, number fields work for simple scales, and multiselect fields should only be used when you want reusable labels.",
    });
    this.renderPropertyRowHeader(section, false);

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
      text: "These properties are added to review notes and become the condensation layer above daily writing. The default model uses one editable summary, an AI-started flag, and topics for vault links.",
    });
    this.renderPropertyRowHeader(section, true);
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

  private renderPropertyRowHeader(containerEl: HTMLElement, isReview: boolean): void {
    const row = containerEl.createDiv({
      cls: isReview
        ? "journaling-system-review-property-row journaling-system-property-header"
        : "journaling-system-property-row journaling-system-property-header",
    });

    const labels = isReview
        ? ["On", "Label", "Property", "Type", "Topic field", "Levels", ""]
        : ["On", "Label", "Property", "Placeholder", "Type", "Min", "Max", ""];

    for (const label of labels) {
      row.createDiv({ text: label });
    }
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
    this.addFullWidthTextAreaSetting(
      containerEl,
      `${label} checklist prompts`,
      "One process item per line. Property fill-in items are added automatically.",
      this.plugin.settings.reviews.checklistItems[level].join("\n"),
      async (value) => {
        this.plugin.settings.reviews.checklistItems[level] = normalizeChecklistItems(value);
        await this.plugin.saveSettings();
      },
      {
        textareaClass: "journaling-system-checklist-textarea",
      }
    );
  }

  private addFullWidthTextAreaSetting(
    containerEl: HTMLElement,
    name: string,
    description: string,
    value: string,
    onChange: (value: string) => Promise<void>,
    options?: {
      textareaClass?: string;
      resetLabel?: string;
      resetTooltip?: string;
      onReset?: () => Promise<void>;
      placeholder?: string;
    }
  ): void {
    const settingContainer = containerEl.createDiv({
      cls: "journaling-system-full-width-textarea-setting",
    });

    const setting = new Setting(settingContainer)
      .setName(name)
      .setDesc(description);

    const textarea = settingContainer.createEl("textarea", {
      cls: options?.textareaClass ?? "journaling-system-textarea",
    });
    textarea.value = value;
    textarea.placeholder = options?.placeholder ?? "";

    textarea.addEventListener("input", async () => {
      await onChange(textarea.value);
    });

    if (options?.resetLabel && options?.onReset) {
      const actions = settingContainer.createDiv({
        cls: "journaling-system-full-width-textarea-actions",
      });
      const resetButton = new ButtonComponent(actions)
        .setButtonText(options.resetLabel)
        .setTooltip(options.resetTooltip ?? options.resetLabel)
        .onClick(async () => {
          await options.onReset?.();
        });
      resetButton.setCta();
    }

    const textareaSettingClass = "journaling-system-full-width-textarea-item";
    setting.settingEl.classList.add(textareaSettingClass);
    if (setting.descEl) {
      setting.descEl.style.gridColumn = "1 / -1";
    }

    // Prevent the default action row from reserving horizontal space for controls.
    if (!options?.resetLabel || !options?.onReset) {
      setting.controlEl.empty();
    }
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

    const topicFieldCell = row.createDiv();
    const topicField = topicFieldCell.createEl("input", { type: "checkbox" });
    topicField.checked = property.isTopicField === true;
    topicField.ariaLabel = `Treat ${property.label} as a topic picker field`;
    topicField.addEventListener("change", async () => {
      property.isTopicField = topicField.checked;
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
    descriptionOrKey:
      | "includeManagedRollupBlock"
      | "includeInlineBases"
      | "includeLongEntryEmbeds"
      | "includeNumericSummary"
      | "includeReviewChecklist"
      | "includeDailyBaseOnHigherReviews"
      | string,
    maybeKey?:
      | "includeManagedRollupBlock"
      | "includeInlineBases"
      | "includeLongEntryEmbeds"
      | "includeNumericSummary"
      | "includeReviewChecklist"
      | "includeDailyBaseOnHigherReviews"
  ): void {
    const description = maybeKey ? descriptionOrKey : undefined;
    const key = maybeKey ?? (descriptionOrKey as
      | "includeManagedRollupBlock"
      | "includeInlineBases"
      | "includeLongEntryEmbeds"
      | "includeNumericSummary"
      | "includeReviewChecklist"
      | "includeDailyBaseOnHigherReviews");
    const setting = new Setting(containerEl).setName(name);
    if (description) {
      setting.setDesc(description);
    }

    setting.addToggle((toggle) => {
      toggle.setValue(this.plugin.settings.reviews[key]).onChange(async (value) => {
        this.plugin.settings.reviews[key] = value;
        await this.plugin.saveSettings();
      });
    });
  }

  private addSliderSetting(
    containerEl: HTMLElement,
    name: string,
    description: string,
    value: number,
    limits: { min: number; max: number; step: number; unit: string },
    onChange: (value: number) => Promise<void>
  ): void {
    const setting = new Setting(containerEl).setName(name).setDesc(description);
    setting.addSlider((slider) => {
      const formattedSlider = slider as typeof slider & {
        setDisplayFormat?: (format: (value: number) => string) => typeof slider;
      };
      formattedSlider.setDisplayFormat?.((sliderValue) => `${sliderValue}${limits.unit}`);
      slider
        .setLimits(limits.min, limits.max, limits.step)
        .setValue(value)
        .onChange(async (sliderValue) => {
          await onChange(sliderValue);
        });
    });
  }

  private addTextSetting(
    containerEl: HTMLElement,
    name: string,
    descriptionOrValue: string,
    valueOrOnChange: string | ((value: string) => Promise<void>),
    maybeOnChange?: (value: string) => Promise<void>
  ): void {
    const description = typeof valueOrOnChange === "string" ? descriptionOrValue : undefined;
    const value = typeof valueOrOnChange === "string" ? valueOrOnChange : descriptionOrValue;
    const onChange = typeof valueOrOnChange === "string" ? maybeOnChange : valueOrOnChange;

    if (!onChange) {
      throw new Error(`Missing onChange handler for ${name}`);
    }

    const setting = new Setting(containerEl).setName(name);
    if (description) {
      setting.setDesc(description);
    }

    setting.addText((text) => {
      text.setValue(value).onChange(async (newValue) => {
        await onChange(newValue.trim());
      });
    });
  }

  private addFolderSetting(
    containerEl: HTMLElement,
    name: string,
    descriptionOrValue: string,
    valueOrOnChange: string | ((value: string) => Promise<void>),
    maybeOnChange?: (value: string) => Promise<void>
  ): void {
    const description = typeof valueOrOnChange === "string" ? descriptionOrValue : undefined;
    const value = typeof valueOrOnChange === "string" ? valueOrOnChange : descriptionOrValue;
    const onChange = typeof valueOrOnChange === "string" ? maybeOnChange : valueOrOnChange;

    if (!onChange) {
      throw new Error(`Missing onChange handler for ${name}`);
    }

    const setting = new Setting(containerEl).setName(name);
    if (description) {
      setting.setDesc(description);
    }

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

class OllamaModelSelectModal extends FuzzySuggestModal<string> {
  constructor(
    app: App,
    private readonly models: string[],
    private readonly onChooseModel: (model: string) => void | Promise<void>
  ) {
    super(app);
    this.setPlaceholder("Choose an installed Ollama model");
  }

  getItems(): string[] {
    return this.models;
  }

  getItemText(model: string): string {
    return model;
  }

  onChooseItem(model: string): void {
    void this.onChooseModel(model);
    this.close();
  }
}

function createSettingsSection(containerEl: HTMLElement, title: string): HTMLElement {
  const section = containerEl.createEl("details", {
    cls: "journaling-system-settings-section",
  });
  section.open = true;
  section.createEl("summary", {
    text: title,
    cls: "journaling-system-settings-section-summary",
  });
  return section.createDiv({ cls: "journaling-system-settings-section-body" });
}

function normalizeSettings(saved: unknown): JournalingSystemSettings {
  const defaults = cloneSettings(DEFAULT_SETTINGS);

  if (!isRecord(saved)) {
    return defaults;
  }

  const migrated = migrateLegacySettings(saved);
  const savedSchemaVersion = getSavedSchemaVersion(migrated);
  const settings = mergeDefaults(defaults, migrated);
  migrateDefaultReviewFormats(settings, savedSchemaVersion);
  migrateSimplifiedReviewModel(settings, savedSchemaVersion);
  settings.ai = normalizeLocalAiSettings(settings.ai);
  settings.ui.modalFontSizePx = normalizeModalFontSize(settings.ui.modalFontSizePx);
  settings.ui.modalWidthPx = normalizeModalWidth(settings.ui.modalWidthPx);
  settings.ui.modalMaxHeightVh = normalizeModalMaxHeight(
    settings.ui.modalMaxHeightVh
  );
  settings.ui.reviewContextHeightPx = normalizeReviewContextHeight(
    settings.ui.reviewContextHeightPx
  );
  settings.dailyPrompts.promptBehavior = normalizeDailyPromptBehavior(
    settings.dailyPrompts.promptBehavior
  );
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
  settings.reviews.topicSuggestionFolders = normalizeTopicSuggestionFolders(
    settings.reviews.topicSuggestionFolders
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
  settings.reviews.includeNumericSummary =
    settings.reviews.includeNumericSummary === true;
  settings.reviews.includeDailyBaseOnHigherReviews =
    settings.reviews.includeDailyBaseOnHigherReviews === true;
  settings.reviews.numericSummaryHeading =
    typeof settings.reviews.numericSummaryHeading === "string" &&
    settings.reviews.numericSummaryHeading.trim().length > 0
      ? settings.reviews.numericSummaryHeading
      : DEFAULT_SETTINGS.reviews.numericSummaryHeading;
  settings.schemaVersion = SETTINGS_SCHEMA_VERSION;
  return settings;
}

function getSavedSchemaVersion(saved: Record<string, unknown>): number {
  return typeof saved.schemaVersion === "number" && Number.isFinite(saved.schemaVersion)
    ? saved.schemaVersion
    : 0;
}

function migrateDefaultReviewFormats(
  settings: JournalingSystemSettings,
  savedSchemaVersion: number
): void {
  if (savedSchemaVersion >= 8) {
    return;
  }

  if (settings.reviews.weekly.noteNameFormat === "[Week] WW - YYYY") {
    settings.reviews.weekly.noteNameFormat =
      DEFAULT_SETTINGS.reviews.weekly.noteNameFormat;
  }

  if (settings.reviews.monthly.noteNameFormat === "MMMM YYYY") {
    settings.reviews.monthly.noteNameFormat =
      DEFAULT_SETTINGS.reviews.monthly.noteNameFormat;
  }

  if (settings.reviews.baseRowHeight === "tall") {
    settings.reviews.baseRowHeight = DEFAULT_SETTINGS.reviews.baseRowHeight;
  }
}

function migrateSimplifiedReviewModel(
  settings: JournalingSystemSettings,
  savedSchemaVersion: number
): void {
  if (savedSchemaVersion >= 12) {
    return;
  }

  if (settings.ai.summaryProperty === "journalAISummary") {
    settings.ai.summaryProperty = DEFAULT_SETTINGS.ai.summaryProperty;
  }

  settings.reviews.reviewBaseProperties = [
    ...DEFAULT_REVIEW_SOURCE_BASE_PROPERTIES,
  ];

  settings.reviews.reviewProperties = settings.reviews.reviewProperties.map((property) =>
    LEGACY_REVIEW_PROPERTY_IDS.has(property.id) ||
    LEGACY_REVIEW_PROPERTY_IDS.has(property.property)
      ? { ...property, enabled: false }
      : property
  );
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
      picture: DEFAULT_SETTINGS.automaticProperties.picture,
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

function dedupeJournalPropertyDefinitions(
  properties: JournalPropertyDefinition[]
): JournalPropertyDefinition[] {
  const seen = new Set<string>();
  const deduped: JournalPropertyDefinition[] = [];

  for (const property of properties) {
    const cleanProperty = property.property.trim();
    const key = cleanProperty.toLowerCase();
    if (cleanProperty.length === 0 || seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push({ ...property, property: cleanProperty });
  }

  return deduped;
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

function reviewPropertyToJournalProperty(
  property: ReviewPropertyDefinition
): JournalPropertyDefinition {
  return {
    id: property.id,
    enabled: property.enabled,
    label: property.label,
    property: property.property,
    placeholder: property.placeholder,
    type: property.type,
    role: "custom",
    builtIn: property.builtIn,
  };
}

function shouldShowReviewPropertyInWizard(
  property: ReviewPropertyDefinition,
  settings: JournalingSystemSettings
): boolean {
  const propertyName = property.property.trim();
  return (
    propertyName !== settings.ai.summaryProperty.trim() &&
    propertyName !== settings.ai.summaryAiProperty.trim() &&
    propertyName !== settings.automaticProperties.picture.trim() &&
    propertyName !== "journalLong"
  );
}

function shouldShowReviewPropertyInChecklist(
  property: ReviewPropertyDefinition,
  settings: JournalingSystemSettings
): boolean {
  const propertyName = property.property.trim();
  return (
    propertyName !== settings.ai.summaryAiProperty.trim() &&
    propertyName !== settings.automaticProperties.picture.trim() &&
    propertyName !== "journalLong"
  );
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
      isTopicField:
        property.isTopicField === true ||
        (!("isTopicField" in property) &&
          defaultProperty?.isTopicField === true) ||
        false,
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

function normalizeTopicSuggestionFolders(value: unknown): {
  root: string;
  daily: string;
  weekly: string;
  monthly: string;
  annual: string;
} {
  const record = isRecord(value) ? value : {};
  const normalizeFolder = (entry: unknown): string =>
    typeof entry === "string" ? normalizePath(entry.trim()) : "";

  return {
    root: normalizeFolder(record.root),
    daily: normalizeFolder(record.daily),
    weekly: normalizeFolder(record.weekly),
    monthly: normalizeFolder(record.monthly),
    annual: normalizeFolder(record.annual),
  };
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
  if (value === "extra-tall") {
    return "extra";
  }

  return value === "short" ||
    value === "medium" ||
    value === "tall" ||
    value === "extra" ||
    value === "default"
    ? value
    : "extra";
}

function encodeBaseRowHeight(value: BaseRowHeight): string {
  return value;
}

function normalizeDailyPromptBehavior(value: unknown): DailyPromptBehavior {
  return value === "if-no-quick-entry" ? value : "always";
}

function normalizeLocalAiSettings(value: unknown): LocalAiSettings {
  const raw = isRecord(value) ? value : {};
  return {
    enabled: raw.enabled === true,
    provider: "ollama",
    baseUrl: normalizeLocalAiBaseUrl(raw.baseUrl),
    model: normalizeLocalAiModel(raw.model),
    summaryProperty: normalizeAiSummaryProperty(raw.summaryProperty),
    summaryAiProperty: normalizeAiSummaryFlagProperty(raw.summaryAiProperty),
    aspects: normalizeLocalAiAspects(raw.aspects),
    prompts: normalizeLocalAiPrompts(raw.prompts),
  };
}

function normalizeLocalAiAspects(value: unknown): string[] {
  const aspects = Array.isArray(value)
    ? value.map((entry) => String(entry))
    : typeof value === "string"
      ? value.split(/\r?\n/)
      : DEFAULT_LOCAL_AI_ASPECTS;

  const normalized = aspects
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  return normalized.length > 0 ? normalized : [...DEFAULT_LOCAL_AI_ASPECTS];
}

function normalizeLocalAiPrompts(value: unknown): Record<ReviewLevel, string> {
  const raw = isRecord(value) ? value : {};
  return {
    weekly: normalizeLocalAiPrompt(raw.weekly, DEFAULT_LOCAL_AI_PROMPTS.weekly),
    monthly: normalizeLocalAiPrompt(raw.monthly, DEFAULT_LOCAL_AI_PROMPTS.monthly),
    annual: normalizeLocalAiPrompt(raw.annual, DEFAULT_LOCAL_AI_PROMPTS.annual),
  };
}

function normalizeLocalAiPrompt(value: unknown, fallback: string): string {
  const prompt = String(value ?? "").trim();
  return prompt.length > 0 ? prompt : fallback;
}

function normalizeLocalAiBaseUrl(value: unknown): string {
  const fallback = DEFAULT_SETTINGS.ai.baseUrl;
  const raw = String(value ?? "").trim().replace(/\/+$/g, "");
  if (raw.length === 0) {
    return fallback;
  }

  try {
    const url = new URL(raw);
    const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
    const isLocalHost = host === "localhost" || host === "127.0.0.1" || host === "::1";
    if ((url.protocol === "http:" || url.protocol === "https:") && isLocalHost) {
      return url.origin;
    }
  } catch {
    return fallback;
  }

  return fallback;
}

function normalizeLocalAiModel(value: unknown): string {
  const model = String(value ?? "").trim();
  return model.length > 0 ? model : DEFAULT_SETTINGS.ai.model;
}

function normalizeAiSummaryProperty(value: unknown): string {
  const property = String(value ?? "").trim();
  return property.length > 0 ? property : DEFAULT_SETTINGS.ai.summaryProperty;
}

function normalizeAiSummaryFlagProperty(value: unknown): string {
  const property = String(value ?? "").trim();
  return property.length > 0 ? property : DEFAULT_SETTINGS.ai.summaryAiProperty;
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

function escapeMarkdownTableCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function formatNumericSummaryValue(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded)
    ? String(rounded)
    : rounded.toFixed(2).replace(/0+$/g, "").replace(/\.$/, "");
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
    automatic.picture,
    ...(kind === "daily"
      ? settings.properties.map((property) => property.property)
      : [
          ...settings.reviews.reviewProperties.map((property) => property.property),
          settings.ai.summaryProperty,
          settings.ai.summaryAiProperty,
        ]),
  ]);
}

function reviewPeriodLabel(level: ReviewLevel): string {
  return level === "weekly" ? "week" : level === "monthly" ? "month" : "year";
}

function getRecentReviewPeriodOptions(
  level: ReviewLevel,
  reference = moment(),
  count = 3
): Array<{ date: Moment; label: string; description: string }> {
  return Array.from({ length: count }, (_, offset) => {
    const date = getReviewPeriodDate(level, reference, offset);
    return {
      date,
      label: getReviewPeriodOptionLabel(level, offset),
      description: formatReviewPeriodDescription(level, date),
    };
  });
}

function getReviewPeriodDate(
  level: ReviewLevel,
  reference: Moment,
  offset: number
): Moment {
  const date = reference.clone();
  if (level === "weekly") {
    return date.subtract(offset, "weeks");
  }

  if (level === "monthly") {
    return date.subtract(offset, "months");
  }

  return date.subtract(offset, "years");
}

function getReviewPeriodOptionLabel(level: ReviewLevel, offset: number): string {
  if (offset === 0) {
    return `This ${reviewPeriodLabel(level)}`;
  }

  if (offset === 1) {
    return `Last ${reviewPeriodLabel(level)}`;
  }

  return `${offset} ${reviewPeriodLabel(level)}s ago`;
}

function formatReviewPeriodTitle(level: ReviewLevel, date: Moment): string {
  if (level === "weekly") {
    return date.format("GGGG-[W]WW");
  }

  if (level === "monthly") {
    return date.format("MMMM YYYY");
  }

  return date.format("YYYY");
}

function formatReviewPeriodDescription(level: ReviewLevel, date: Moment): string {
  if (level === "weekly") {
    const start = date.clone().startOf("isoWeek").format("YYYY-MM-DD");
    const end = date.clone().endOf("isoWeek").format("YYYY-MM-DD");
    return `${formatReviewPeriodTitle(level, date)} · ${start} to ${end}`;
  }

  if (level === "monthly") {
    return `${date.format("YYYY-MM")} · ${date.format("MMMM YYYY")}`;
  }

  return date.format("YYYY");
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

function insertSectionBeforeFirstHeading(
  content: string,
  headings: string[],
  section: string
): string {
  for (const heading of headings) {
    const headingMatch = findHeadingLine(content, heading);
    if (!headingMatch) {
      continue;
    }

    const before = content.slice(0, headingMatch.start).trimEnd();
    const after = content.slice(headingMatch.start).trimStart();
    return before.length > 0
      ? `${before}\n\n${section}\n\n${after}`
      : `${section}\n\n${after}`;
  }

  return `${content.trimEnd()}\n\n${section}\n`;
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
    !/name:\s+(Review fields|Daily notes in this|Weekly reviews in this|Monthly reviews in this|Journal source notes)/.test(
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

function replaceGeneratedNumericSummaryInSection(
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
    /^\s*(?:(?:\|\s*Property\s*\|\s*Count\s*\|\s*Mean\s*\|\s*Min\s*\|\s*Max\s*\|\s*\n\|\s*---\s*\|\s*---:\s*\|\s*---:\s*\|\s*---:\s*\|\s*---:\s*\|\s*\n(?:\|[^\n]*\|\s*\n?)*)|No numeric journal properties found for this period\.)/.exec(
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

function fileMatchesReviewPeriod(
  file: TFile,
  frontmatter: Record<string, unknown>,
  period: { property: string; value: string },
  dateProperty: string,
  level: ReviewLevel
): boolean {
  if (frontmatterMatchesReviewPeriod(frontmatter, period, dateProperty, level)) {
    return true;
  }

  const dateMatch = /\d{4}-\d{2}-\d{2}/.exec(file.path);
  const date = dateMatch ? parseJournalDate(dateMatch[0]) : null;
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

function noteHasPictureAttachment(app: App, file: TFile): boolean {
  const cache = app.metadataCache.getFileCache(file);
  const linktexts = [
    ...(cache?.links ?? []),
    ...(cache?.embeds ?? []),
    ...(cache?.frontmatterLinks ?? []),
  ]
    .map((entry) => entry.link)
    .filter((link): link is string => typeof link === "string" && link.trim().length > 0);

  return linktexts.some((linktext) =>
    linkTargetsPictureAttachment(app, file.path, linktext)
  );
}

function linkTargetsPictureAttachment(
  app: App,
  sourcePath: string,
  linktext: string
): boolean {
  const linkpath = normalizeAttachmentLinktext(linktext);
  if (linkpath.length === 0) {
    return false;
  }

  if (hasPictureAttachmentExtension(linkpath)) {
    return true;
  }

  const linkedFile = app.metadataCache.getFirstLinkpathDest(linkpath, sourcePath);
  return linkedFile ? hasPictureAttachmentExtension(linkedFile.path) : false;
}

function normalizeAttachmentLinktext(linktext: string): string {
  return linktext
    .split("|")[0]
    .split("#")[0]
    .replace(/^!/, "")
    .trim();
}

function hasPictureAttachmentExtension(path: string): boolean {
  const cleanPath = path.split("?")[0].trim().toLowerCase();
  const extension = cleanPath.includes(".")
    ? cleanPath.slice(cleanPath.lastIndexOf(".") + 1)
    : "";
  return ATTACHMENT_EXTENSIONS.has(extension);
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

function extractSectionText(content: string, heading: string): string {
  const headingMatch = findHeadingLine(content, heading);
  if (!headingMatch) {
    return "";
  }

  const sectionEnd = findSectionEnd(content, headingMatch);
  return content.slice(headingMatch.end, sectionEnd).replace(/<!--[\s\S]*?-->/g, "").trim();
}

function normalizeCaptureEntry(line: string): string {
  return line
    .trim()
    .replace(/^[-*]\s+/, "")
    .replace(/^\d{2}:\d{2}\s+/, "")
    .trim()
    .toLowerCase();
}

function hasLongJournalEntryContent(content: string, heading: string): boolean {
  const headingMatch = findHeadingLine(content, heading);
  if (!headingMatch) {
    return false;
  }

  const sectionEnd = findSectionEnd(content, headingMatch);
  const section = content.slice(headingMatch.end, sectionEnd);
  return stripLongEntryNonContent(section).trim().length > 0;
}

function extractLongJournalEntryText(content: string, heading: string): string {
  const headingMatch = findHeadingLine(content, heading);
  if (!headingMatch) {
    return "";
  }

  const sectionEnd = findSectionEnd(content, headingMatch);
  const section = content.slice(headingMatch.end, sectionEnd);
  return stripLongEntryNonContent(section).replace(/\n{3,}/g, "\n\n").trim();
}

function stripLongEntryNonContent(section: string): string {
  return section
    .replace(LONG_ENTRY_START_MARKER, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .trim();
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 20)).trim()}... [truncated]`;
}

function findJournalCursorOffset(content: string, heading: string): number {
  const headingMatch = findHeadingLine(content, heading);
  if (!headingMatch) {
    return content.length;
  }

  const sectionEnd = findSectionEnd(content, headingMatch);
  const rawSection = content.slice(headingMatch.end, sectionEnd);
  const markerIndex = rawSection.indexOf(LONG_ENTRY_START_MARKER);
  if (markerIndex >= 0) {
    const markerEnd = headingMatch.end + markerIndex + LONG_ENTRY_START_MARKER.length;
    const afterMarker = rawSection.slice(markerIndex + LONG_ENTRY_START_MARKER.length);
    if (stripLongEntryNonContent(afterMarker).length === 0) {
      const nextLineStart = content.indexOf("\n", markerEnd);
      return nextLineStart === -1 ? markerEnd : nextLineStart + 1;
    }

    return sectionEnd;
  }

  const section = stripLongEntryNonContent(rawSection);

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

function parseNumericFrontmatterValues(value: unknown): number[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => parseNumericFrontmatterValues(entry));
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? [value] : [];
  }

  if (typeof value === "string") {
    const clean = value.trim();
    if (clean.length === 0) {
      return [];
    }

    const numericValue = Number(clean);
    return Number.isFinite(numericValue) ? [numericValue] : [];
  }

  return [];
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

function applyModalAppearance(
  modalEl: HTMLElement,
  settings: JournalingSystemSettings
): void {
  modalEl.style.setProperty(
    "--journaling-system-modal-font-size",
    `${normalizeModalFontSize(settings.ui.modalFontSizePx)}px`
  );
  modalEl.style.setProperty(
    "--journaling-system-modal-width",
    `${normalizeModalWidth(settings.ui.modalWidthPx)}px`
  );
  modalEl.style.setProperty(
    "--journaling-system-modal-max-height",
    `${normalizeModalMaxHeight(settings.ui.modalMaxHeightVh)}vh`
  );
  modalEl.style.setProperty(
    "--journaling-system-review-context-max-height",
    `${normalizeReviewContextHeight(settings.ui.reviewContextHeightPx)}px`
  );
}

function normalizeModalFontSize(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return clamp(Number.isFinite(parsed) ? Math.round(parsed) : 15, 12, 20);
}

function normalizeModalWidth(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return clamp(Number.isFinite(parsed) ? Math.round(parsed) : 860, 640, 1100);
}

function normalizeModalMaxHeight(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return clamp(Number.isFinite(parsed) ? Math.round(parsed) : 86, 60, 94);
}

function normalizeReviewContextHeight(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return clamp(Number.isFinite(parsed) ? Math.round(parsed) : 360, 180, 560);
}

async function requestOllamaReviewSummary(
  settings: LocalAiSettings,
  sourceText: string,
  promptTemplate: string,
  aspects: string[]
): Promise<string> {
  const response = await requestUrl({
    url: `${settings.baseUrl}/api/chat`,
    method: "POST",
    contentType: "application/json",
    body: JSON.stringify({
      model: settings.model,
      stream: false,
      messages: [
        {
          role: "system",
          content:
            "You are a private local journaling assistant. Use only the supplied journal notes. Be concise, concrete, and reflective. Do not diagnose, moralize, or invent facts.",
        },
        {
          role: "user",
          content: buildReviewAiPrompt(promptTemplate, sourceText, aspects),
        },
      ],
      options: {
        temperature: 0.3,
      },
    }),
    throw: false,
  });

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Ollama returned HTTP ${response.status}.`);
  }

  const content = response.json?.message?.content;
  if (typeof content !== "string" || content.trim().length === 0) {
    throw new Error("Ollama returned an empty summary.");
  }

  return content.trim();
}

async function requestOllamaTags(baseUrl: string) {
  const response = await requestUrl({
    url: `${baseUrl}/api/tags`,
    method: "GET",
    throw: false,
  });

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Ollama returned HTTP ${response.status}.`);
  }

  return response;
}

async function isOllamaReachable(baseUrl: string): Promise<boolean> {
  try {
    await requestOllamaTags(baseUrl);
    return true;
  } catch {
    return false;
  }
}

function buildReviewAiPrompt(
  promptTemplate: string,
  sourceText: string,
  aspects: string[]
): string {
  const aspectsText = formatAiAspectList(aspects);
  let prompt = promptTemplate.trim();
  const usedAspectsPlaceholder = prompt.includes("{{aspects}}");
  const usedSourcePlaceholder = prompt.includes("{{sourceNotes}}");

  prompt = prompt
    .split("{{aspects}}")
    .join(aspectsText)
    .split("{{sourceNotes}}")
    .join(sourceText);

  const appendedSections = [
    prompt,
    !usedAspectsPlaceholder && aspectsText.length > 0
      ? ["", "Review aspects:", aspectsText].join("\n")
      : "",
    !usedSourcePlaceholder ? ["", "Source notes:", sourceText].join("\n") : "",
  ].filter((section) => section.length > 0);

  return appendedSections.join("\n");
}

function formatAiAspectList(aspects: string[]): string {
  return normalizeLocalAiAspects(aspects)
    .map((aspect) => `- ${aspect}`)
    .join("\n");
}

function getOllamaModelNames(value: unknown): string[] {
  if (!isRecord(value) || !Array.isArray(value.models)) {
    return [];
  }

  return value.models
    .flatMap((model) => {
      if (!isRecord(model)) {
        return [];
      }

      return [model.name, model.model]
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
    });
}

function ollamaModelExists(models: string[], configuredModel: string): boolean {
  const normalizedConfigured = normalizeOllamaModelName(configuredModel);
  return models.some(
    (model) => normalizeOllamaModelName(model) === normalizedConfigured
  );
}

function normalizeOllamaModelName(model: string): string {
  return model.trim().replace(/:latest$/i, "");
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
