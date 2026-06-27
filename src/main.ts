import { App, Modal, Notice, Plugin, Setting } from "obsidian";

export default class JournalingSystemPlugin extends Plugin {
  async onload(): Promise<void> {
    this.addCommand({
      id: "open-journaling-prompt",
      name: "Open journaling prompt",
      callback: () => {
        new JournalingPromptModal(this.app).open();
      },
    });
  }
}

class JournalingPromptModal extends Modal {
  constructor(app: App) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;

    contentEl.empty();
    contentEl.createEl("h2", { text: "Journaling System" });
    contentEl.createEl("p", {
      text: "The journaling prompt is installed. Structured fields and scheduled reviews will be added in the next milestone.",
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
