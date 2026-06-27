import {
  App,
  Modal,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  TextComponent,
} from "obsidian";

type Weekday =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

type RollupSource = "hybrid-hierarchy" | "daily-notes" | "prior-reviews";

interface JournalTextFieldSettings {
  enabled: boolean;
  label: string;
  property: string;
}

interface JournalListFieldSettings extends JournalTextFieldSettings {
  entrySeparator: string;
}

interface JournalNumberFieldSettings extends JournalTextFieldSettings {
  min: number;
  max: number;
}

interface JournalingSystemSettings {
  dailyPrompts: {
    enabled: boolean;
    times: string[];
    weekdays: Weekday[];
    snoozeMinutes: number;
    catchUpMissedPrompts: boolean;
  };
  dailyNote: {
    folder: string;
    dateFormat: string;
    createIfMissing: boolean;
    longEntryHeading: string;
    shortEntrySectionHeading: string;
  };
  fields: {
    journalShort: JournalTextFieldSettings;
    journalLong: JournalTextFieldSettings;
    journalWins: JournalListFieldSettings;
    journalFails: JournalListFieldSettings;
    journalTopics: JournalListFieldSettings;
    journalLocation: JournalTextFieldSettings;
    journalMood: JournalNumberFieldSettings;
    automatic: {
      journalDateProperty: string;
      journalTimeProperty: string;
      journalWeekdayProperty: string;
    };
  };
  reviews: {
    weekly: {
      enabled: boolean;
      promptWeekday: Weekday;
      promptTime: string;
      noteNameFormat: string;
    };
    monthly: {
      enabled: boolean;
      promptDayOfMonth: number;
      promptTime: string;
      noteNameFormat: string;
    };
    annual: {
      enabled: boolean;
      promptMonthDay: string;
      promptTime: string;
      noteNameFormat: string;
    };
    rollupSource: RollupSource;
    includeManagedRollupBlock: boolean;
    includeInlineBases: boolean;
    includeLongEntryEmbeds: boolean;
    reflectionHeading: string;
    rollupHeading: string;
    sourceNotesHeading: string;
  };
}

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

const ROLLUP_SOURCE_LABELS: Record<RollupSource, string> = {
  "hybrid-hierarchy": "Hybrid hierarchy",
  "daily-notes": "Daily notes only",
  "prior-reviews": "Prior reviews",
};

const DEFAULT_SETTINGS: JournalingSystemSettings = {
  dailyPrompts: {
    enabled: true,
    times: ["09:00", "20:00"],
    weekdays: [...WEEKDAYS],
    snoozeMinutes: 30,
    catchUpMissedPrompts: true,
  },
  dailyNote: {
    folder: "",
    dateFormat: "YYYY-MM-DD dddd",
    createIfMissing: true,
    longEntryHeading: "Journal",
    shortEntrySectionHeading: "Journal Captures",
  },
  fields: {
    journalShort: {
      enabled: true,
      label: "Quick entry",
      property: "journalShort",
    },
    journalLong: {
      enabled: true,
      label: "Long entry written",
      property: "journalLong",
    },
    journalWins: {
      enabled: true,
      label: "Wins",
      property: "journalWins",
      entrySeparator: ";",
    },
    journalFails: {
      enabled: true,
      label: "Fails",
      property: "journalFails",
      entrySeparator: ";",
    },
    journalTopics: {
      enabled: true,
      label: "Topics on the mind",
      property: "journalTopics",
      entrySeparator: ",",
    },
    journalLocation: {
      enabled: true,
      label: "Location",
      property: "journalLocation",
    },
    journalMood: {
      enabled: true,
      label: "Mood",
      property: "journalMood",
      min: 1,
      max: 10,
    },
    automatic: {
      journalDateProperty: "journalDate",
      journalTimeProperty: "journalTime",
      journalWeekdayProperty: "journalWeekday",
    },
  },
  reviews: {
    weekly: {
      enabled: true,
      promptWeekday: "sunday",
      promptTime: "18:00",
      noteNameFormat: "[Week] WW - YYYY",
    },
    monthly: {
      enabled: true,
      promptDayOfMonth: 1,
      promptTime: "18:00",
      noteNameFormat: "MMMM YYYY",
    },
    annual: {
      enabled: true,
      promptMonthDay: "01-01",
      promptTime: "18:00",
      noteNameFormat: "YYYY [Annual Review]",
    },
    rollupSource: "hybrid-hierarchy",
    includeManagedRollupBlock: true,
    includeInlineBases: true,
    includeLongEntryEmbeds: true,
    reflectionHeading: "Review",
    rollupHeading: "Rollup",
    sourceNotesHeading: "Source Notes",
  },
};

export default class JournalingSystemPlugin extends Plugin {
  settings: JournalingSystemSettings = DEFAULT_SETTINGS;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.addCommand({
      id: "open-journaling-prompt",
      name: "Open journaling prompt",
      callback: () => {
        new JournalingPromptModal(this.app, this.settings).open();
      },
    });

    this.addSettingTab(new JournalingSystemSettingTab(this.app, this));
  }

  async loadSettings(): Promise<void> {
    this.settings = mergeDefaults(DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}

class JournalingPromptModal extends Modal {
  constructor(app: App, private readonly settings: JournalingSystemSettings) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;

    contentEl.empty();
    contentEl.createEl("h2", { text: "Journaling System" });
    contentEl.createEl("p", {
      text: "The journaling prompt is installed. The configured fields are ready for the next implementation milestone.",
    });

    const enabledFields = getEnabledFieldLabels(this.settings);
    contentEl.createEl("p", {
      text: `Enabled daily fields: ${enabledFields.join(", ") || "none"}.`,
    });

    new Setting(contentEl)
      .addButton((button) => {
        button
          .setButtonText("Close")
          .setCta()
          .onClick(() => {
            this.close();
            new Notice("Journaling prompt closed.");
          });
      });
  }

  onClose(): void {
    this.contentEl.empty();
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

    this.displayDailyPromptSettings(containerEl);
    this.displayDailyNoteSettings(containerEl);
    this.displayFieldSettings(containerEl);
    this.displayReviewSettings(containerEl);
  }

  private displayDailyPromptSettings(containerEl: HTMLElement): void {
    containerEl.createEl("h2", { text: "Daily prompts" });

    new Setting(containerEl)
      .setName("Enable daily prompts")
      .setDesc("Prompt for daily journaling at configured times. Scheduling will be wired in the next milestone.")
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.dailyPrompts.enabled)
          .onChange(async (value) => {
            this.plugin.settings.dailyPrompts.enabled = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Prompt times")
      .setDesc("Comma- or semicolon-separated 24-hour times, for example 09:00, 20:00.")
      .addText((text) => {
        text
          .setPlaceholder("09:00, 20:00")
          .setValue(this.plugin.settings.dailyPrompts.times.join(", "))
          .onChange(async (value) => {
            this.plugin.settings.dailyPrompts.times = parseList(value, /[,;]+/);
            await this.plugin.saveSettings();
          });
      });

    const weekdaySetting = new Setting(containerEl)
      .setName("Prompt weekdays")
      .setDesc("Choose the weekdays where daily prompts should appear.");

    for (const weekday of WEEKDAYS) {
      weekdaySetting.addToggle((toggle) => {
        toggle
          .setTooltip(WEEKDAY_LABELS[weekday])
          .setValue(this.plugin.settings.dailyPrompts.weekdays.includes(weekday))
          .onChange(async (value) => {
            const weekdays = new Set(this.plugin.settings.dailyPrompts.weekdays);

            if (value) {
              weekdays.add(weekday);
            } else {
              weekdays.delete(weekday);
            }

            this.plugin.settings.dailyPrompts.weekdays = WEEKDAYS.filter((day) =>
              weekdays.has(day)
            );
            await this.plugin.saveSettings();
          });
      });
    }

    new Setting(containerEl)
      .setName("Snooze minutes")
      .setDesc("Default snooze duration for a prompt.")
      .addText((text) => {
        text.inputEl.type = "number";
        text
          .setPlaceholder("30")
          .setValue(String(this.plugin.settings.dailyPrompts.snoozeMinutes))
          .onChange(async (value) => {
            this.plugin.settings.dailyPrompts.snoozeMinutes = parsePositiveInteger(
              value,
              DEFAULT_SETTINGS.dailyPrompts.snoozeMinutes
            );
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Catch up missed prompts")
      .setDesc("Later scheduling should offer a prompt if Obsidian was closed during a configured prompt time.")
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.dailyPrompts.catchUpMissedPrompts)
          .onChange(async (value) => {
            this.plugin.settings.dailyPrompts.catchUpMissedPrompts = value;
            await this.plugin.saveSettings();
          });
      });
  }

  private displayDailyNoteSettings(containerEl: HTMLElement): void {
    containerEl.createEl("h2", { text: "Daily note target" });

    new Setting(containerEl)
      .setName("Daily note folder")
      .setDesc("Optional vault-relative folder. Leave blank to use the vault root until integration settings are implemented.")
      .addText((text) => {
        text
          .setPlaceholder("Journal/Daily")
          .setValue(this.plugin.settings.dailyNote.folder)
          .onChange(async (value) => {
            this.plugin.settings.dailyNote.folder = value.trim();
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Daily note date format")
      .setDesc("Moment-style format for daily note names.")
      .addText((text) => {
        text
          .setPlaceholder("YYYY-MM-DD dddd")
          .setValue(this.plugin.settings.dailyNote.dateFormat)
          .onChange(async (value) => {
            this.plugin.settings.dailyNote.dateFormat = value.trim();
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Create daily note if missing")
      .setDesc("Later writing behavior should create today's note before adding journal data.")
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.dailyNote.createIfMissing)
          .onChange(async (value) => {
            this.plugin.settings.dailyNote.createIfMissing = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Long entry heading")
      .setDesc("Heading where long-form journal prose should live.")
      .addText((text) => {
        text
          .setPlaceholder("Journal")
          .setValue(this.plugin.settings.dailyNote.longEntryHeading)
          .onChange(async (value) => {
            this.plugin.settings.dailyNote.longEntryHeading = value.trim();
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Short capture section heading")
      .setDesc("Optional generated section for short captures if body writing is enabled later.")
      .addText((text) => {
        text
          .setPlaceholder("Journal Captures")
          .setValue(this.plugin.settings.dailyNote.shortEntrySectionHeading)
          .onChange(async (value) => {
            this.plugin.settings.dailyNote.shortEntrySectionHeading = value.trim();
            await this.plugin.saveSettings();
          });
      });
  }

  private displayFieldSettings(containerEl: HTMLElement): void {
    containerEl.createEl("h2", { text: "Daily fields" });
    containerEl.createEl("p", {
      text: "Configure the fields that will appear in the journaling modal and the property names used for rollups.",
    });

    this.addTextFieldSetting(containerEl, "journalShort", this.plugin.settings.fields.journalShort);
    this.addTextFieldSetting(containerEl, "journalLong", this.plugin.settings.fields.journalLong);
    this.addListFieldSetting(containerEl, "journalWins", this.plugin.settings.fields.journalWins);
    this.addListFieldSetting(containerEl, "journalFails", this.plugin.settings.fields.journalFails);
    this.addListFieldSetting(containerEl, "journalTopics", this.plugin.settings.fields.journalTopics);
    this.addTextFieldSetting(
      containerEl,
      "journalLocation",
      this.plugin.settings.fields.journalLocation
    );
    this.addNumberFieldSetting(containerEl, "journalMood", this.plugin.settings.fields.journalMood);

    containerEl.createEl("h3", { text: "Automatic fields" });

    this.addPropertyNameSetting(
      containerEl,
      "Date property",
      "Property for the captured journal date.",
      this.plugin.settings.fields.automatic.journalDateProperty,
      async (value) => {
        this.plugin.settings.fields.automatic.journalDateProperty = value;
        await this.plugin.saveSettings();
      }
    );
    this.addPropertyNameSetting(
      containerEl,
      "Time property",
      "Property for the captured journal time.",
      this.plugin.settings.fields.automatic.journalTimeProperty,
      async (value) => {
        this.plugin.settings.fields.automatic.journalTimeProperty = value;
        await this.plugin.saveSettings();
      }
    );
    this.addPropertyNameSetting(
      containerEl,
      "Weekday property",
      "Property for the captured journal weekday.",
      this.plugin.settings.fields.automatic.journalWeekdayProperty,
      async (value) => {
        this.plugin.settings.fields.automatic.journalWeekdayProperty = value;
        await this.plugin.saveSettings();
      }
    );
  }

  private displayReviewSettings(containerEl: HTMLElement): void {
    containerEl.createEl("h2", { text: "Reviews" });

    new Setting(containerEl)
      .setName("Weekly reviews")
      .setDesc("Prompt for a weekly review.")
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.reviews.weekly.enabled)
          .onChange(async (value) => {
            this.plugin.settings.reviews.weekly.enabled = value;
            await this.plugin.saveSettings();
          });
      })
      .addDropdown((dropdown) => {
        dropdown
          .addOptions(WEEKDAY_LABELS)
          .setValue(this.plugin.settings.reviews.weekly.promptWeekday)
          .onChange(async (value) => {
            this.plugin.settings.reviews.weekly.promptWeekday = value as Weekday;
            await this.plugin.saveSettings();
          });
      })
      .addText((text) => {
        text.inputEl.type = "time";
        text
          .setValue(this.plugin.settings.reviews.weekly.promptTime)
          .onChange(async (value) => {
            this.plugin.settings.reviews.weekly.promptTime = value;
            await this.plugin.saveSettings();
          });
      });

    this.addTextSetting(
      containerEl,
      "Weekly note name format",
      "Format used when creating or finding weekly review notes.",
      this.plugin.settings.reviews.weekly.noteNameFormat,
      async (value) => {
        this.plugin.settings.reviews.weekly.noteNameFormat = value;
        await this.plugin.saveSettings();
      }
    );

    new Setting(containerEl)
      .setName("Monthly reviews")
      .setDesc("Prompt for a monthly review on a configured day of month.")
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.reviews.monthly.enabled)
          .onChange(async (value) => {
            this.plugin.settings.reviews.monthly.enabled = value;
            await this.plugin.saveSettings();
          });
      })
      .addText((text) => {
        text.inputEl.type = "number";
        text
          .setPlaceholder("1")
          .setValue(String(this.plugin.settings.reviews.monthly.promptDayOfMonth))
          .onChange(async (value) => {
            this.plugin.settings.reviews.monthly.promptDayOfMonth = clamp(
              parsePositiveInteger(value, 1),
              1,
              31
            );
            await this.plugin.saveSettings();
          });
      })
      .addText((text) => {
        text.inputEl.type = "time";
        text
          .setValue(this.plugin.settings.reviews.monthly.promptTime)
          .onChange(async (value) => {
            this.plugin.settings.reviews.monthly.promptTime = value;
            await this.plugin.saveSettings();
          });
      });

    this.addTextSetting(
      containerEl,
      "Monthly note name format",
      "Format used when creating or finding monthly review notes.",
      this.plugin.settings.reviews.monthly.noteNameFormat,
      async (value) => {
        this.plugin.settings.reviews.monthly.noteNameFormat = value;
        await this.plugin.saveSettings();
      }
    );

    new Setting(containerEl)
      .setName("Annual reviews")
      .setDesc("Prompt for an annual review on a configured MM-DD date.")
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.reviews.annual.enabled)
          .onChange(async (value) => {
            this.plugin.settings.reviews.annual.enabled = value;
            await this.plugin.saveSettings();
          });
      })
      .addText((text) => {
        text
          .setPlaceholder("01-01")
          .setValue(this.plugin.settings.reviews.annual.promptMonthDay)
          .onChange(async (value) => {
            this.plugin.settings.reviews.annual.promptMonthDay = value.trim();
            await this.plugin.saveSettings();
          });
      })
      .addText((text) => {
        text.inputEl.type = "time";
        text
          .setValue(this.plugin.settings.reviews.annual.promptTime)
          .onChange(async (value) => {
            this.plugin.settings.reviews.annual.promptTime = value;
            await this.plugin.saveSettings();
          });
      });

    this.addTextSetting(
      containerEl,
      "Annual note name format",
      "Format used when creating or finding annual review notes.",
      this.plugin.settings.reviews.annual.noteNameFormat,
      async (value) => {
        this.plugin.settings.reviews.annual.noteNameFormat = value;
        await this.plugin.saveSettings();
      }
    );

    containerEl.createEl("h3", { text: "Review content" });

    new Setting(containerEl)
      .setName("Rollup source")
      .setDesc("Controls how higher-level review material should be assembled later.")
      .addDropdown((dropdown) => {
        dropdown
          .addOptions(ROLLUP_SOURCE_LABELS)
          .setValue(this.plugin.settings.reviews.rollupSource)
          .onChange(async (value) => {
            this.plugin.settings.reviews.rollupSource = value as RollupSource;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Managed rollup block")
      .setDesc("Add a refreshable plugin-managed summary block to review notes.")
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.reviews.includeManagedRollupBlock)
          .onChange(async (value) => {
            this.plugin.settings.reviews.includeManagedRollupBlock = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Inline Bases evidence panels")
      .setDesc("Add inline Bases blocks that query lower-level journal notes.")
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.reviews.includeInlineBases)
          .onChange(async (value) => {
            this.plugin.settings.reviews.includeInlineBases = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Embed long entries")
      .setDesc("Embed daily long-entry sections in review notes when journalLong is true.")
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.reviews.includeLongEntryEmbeds)
          .onChange(async (value) => {
            this.plugin.settings.reviews.includeLongEntryEmbeds = value;
            await this.plugin.saveSettings();
          });
      });

    this.addTextSetting(
      containerEl,
      "Reflection heading",
      "Heading for user-written review text.",
      this.plugin.settings.reviews.reflectionHeading,
      async (value) => {
        this.plugin.settings.reviews.reflectionHeading = value;
        await this.plugin.saveSettings();
      }
    );
    this.addTextSetting(
      containerEl,
      "Rollup heading",
      "Heading for generated rollup content.",
      this.plugin.settings.reviews.rollupHeading,
      async (value) => {
        this.plugin.settings.reviews.rollupHeading = value;
        await this.plugin.saveSettings();
      }
    );
    this.addTextSetting(
      containerEl,
      "Source notes heading",
      "Heading for embedded Bases and source-note links.",
      this.plugin.settings.reviews.sourceNotesHeading,
      async (value) => {
        this.plugin.settings.reviews.sourceNotesHeading = value;
        await this.plugin.saveSettings();
      }
    );
  }

  private addTextFieldSetting(
    containerEl: HTMLElement,
    fieldName: string,
    field: JournalTextFieldSettings
  ): void {
    new Setting(containerEl)
      .setName(fieldName)
      .setDesc("Enable this modal field and choose its label and property name.")
      .addToggle((toggle) => {
        toggle
          .setValue(field.enabled)
          .onChange(async (value) => {
            field.enabled = value;
            await this.plugin.saveSettings();
          });
      })
      .addText((text) => {
        text
          .setPlaceholder("Label")
          .setValue(field.label)
          .onChange(async (value) => {
            field.label = value;
            await this.plugin.saveSettings();
          });
      })
      .addText((text) => {
        text
          .setPlaceholder("propertyName")
          .setValue(field.property)
          .onChange(async (value) => {
            field.property = normalizePropertyName(value, field.property);
            await this.plugin.saveSettings();
          });
      });
  }

  private addListFieldSetting(
    containerEl: HTMLElement,
    fieldName: string,
    field: JournalListFieldSettings
  ): void {
    this.addTextFieldSetting(containerEl, fieldName, field);

    new Setting(containerEl)
      .setName(`${fieldName} separator`)
      .setDesc("Separator used when splitting modal text into multiple entries.")
      .addText((text) => {
        text
          .setPlaceholder(";")
          .setValue(field.entrySeparator)
          .onChange(async (value) => {
            field.entrySeparator = value || DEFAULT_SETTINGS.fields.journalWins.entrySeparator;
            await this.plugin.saveSettings();
          });
      });
  }

  private addNumberFieldSetting(
    containerEl: HTMLElement,
    fieldName: string,
    field: JournalNumberFieldSettings
  ): void {
    this.addTextFieldSetting(containerEl, fieldName, field);

    new Setting(containerEl)
      .setName(`${fieldName} range`)
      .setDesc("Minimum and maximum values for the number field.")
      .addText((text) => {
        text.inputEl.type = "number";
        text
          .setPlaceholder("1")
          .setValue(String(field.min))
          .onChange(async (value) => {
            field.min = parsePositiveInteger(value, DEFAULT_SETTINGS.fields.journalMood.min);
            await this.plugin.saveSettings();
          });
      })
      .addText((text) => {
        text.inputEl.type = "number";
        text
          .setPlaceholder("10")
          .setValue(String(field.max))
          .onChange(async (value) => {
            field.max = parsePositiveInteger(value, DEFAULT_SETTINGS.fields.journalMood.max);
            await this.plugin.saveSettings();
          });
      });
  }

  private addPropertyNameSetting(
    containerEl: HTMLElement,
    name: string,
    desc: string,
    value: string,
    onChange: (value: string) => Promise<void>
  ): void {
    new Setting(containerEl)
      .setName(name)
      .setDesc(desc)
      .addText((text) => {
        text
          .setPlaceholder("propertyName")
          .setValue(value)
          .onChange(async (newValue) => {
            await onChange(normalizePropertyName(newValue, value));
          });
      });
  }

  private addTextSetting(
    containerEl: HTMLElement,
    name: string,
    desc: string,
    value: string,
    onChange: (value: string) => Promise<void>
  ): void {
    new Setting(containerEl)
      .setName(name)
      .setDesc(desc)
      .addText((text: TextComponent) => {
        text
          .setValue(value)
          .onChange(async (newValue) => {
            await onChange(newValue.trim());
          });
      });
  }
}

function getEnabledFieldLabels(settings: JournalingSystemSettings): string[] {
  return [
    settings.fields.journalShort,
    settings.fields.journalLong,
    settings.fields.journalWins,
    settings.fields.journalFails,
    settings.fields.journalTopics,
    settings.fields.journalLocation,
    settings.fields.journalMood,
  ]
    .filter((field) => field.enabled)
    .map((field) => field.label);
}

function parseList(value: string, separator: RegExp): string[] {
  return value
    .split(separator)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function parsePositiveInteger(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }

  return parsed;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function normalizePropertyName(value: string, fallback: string): string {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return fallback;
  }

  return trimmed;
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
