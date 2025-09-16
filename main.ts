import {
  Plugin,
  TFile,
  Notice,
  MarkdownView,
  FuzzySuggestModal,
} from "obsidian";
import { MetaflyerSettings, DEFAULT_SETTINGS } from "./core/settings";
import { MetaflyerSettingsTab } from "./settings/settings-tab";
import { RulesetManager } from "./core/ruleset-manager";
import { MetadataEnforcer } from "./enforcement/metadata-enforcer";
import { AutoOrganizer } from "./organization/auto-organizer";
import {
  MetaflyerSidebar,
  METAFLYER_SIDEBAR_TYPE,
} from "./sidebar/metaflyer-sidebar";
import { ClipboardUtils } from "./core/clipboard-utils";
import { placeholderMarkerExtension, navigateToMarker } from "./core/placeholder-markers";
import { TemplateEngine } from "./core/template-engine";
import { FooMenu } from "./foo-menu/foo-menu";

export default class MetaflyerPlugin extends Plugin {
  settings: MetaflyerSettings;
  rulesetManager: RulesetManager;
  metadataEnforcer: MetadataEnforcer;
  autoOrganizer: AutoOrganizer;
  fooMenu: FooMenu;

  async onload() {
    console.time('Metaflyer onload');
    try {
      await this.loadSettings();

      this.rulesetManager = new RulesetManager(this.settings);
      this.metadataEnforcer = new MetadataEnforcer(
        this.app,
        this.rulesetManager,
        this.settings.enableWarnings,
      );
      this.autoOrganizer = new AutoOrganizer(this.app, this.rulesetManager);
      this.fooMenu = new FooMenu(this.app, this, this.rulesetManager);

      this.addSettingTab(new MetaflyerSettingsTab(this.app, this));

      // Register placeholder marker extension
      this.registerEditorExtension(placeholderMarkerExtension);

      // Register the sidebar view
      this.registerView(
        METAFLYER_SIDEBAR_TYPE,
        (leaf) => new MetaflyerSidebar(leaf, this),
      );

      // Add command to open sidebar
      this.addCommand({
        id: "open-metaflyer-sidebar",
        name: "Open Metaflyer Sidebar",
        callback: () => {
          this.activateSidebar();
        },
      });

      this.addCommand({
        id: "organize-note",
        name: "Organize Note (Rename & Move)",
        checkCallback: (checking: boolean) => {
          const activeFile = this.app.workspace.getActiveFile();
          if (activeFile) {
            const cache = this.app.metadataCache.getFileCache(activeFile);
            const frontmatter = cache?.frontmatter;
            const evaluation = this.rulesetManager.evaluateMetadata(frontmatter);

            // Only show command if note is complete and matches a ruleset
            if (evaluation.matches && evaluation.isComplete) {
              if (!checking) {
                this.autoOrganizer.organizeNote(activeFile);
              }
              return true;
            }
          }
          return false;
        },
      });

      this.addCommand({
        id: "toggle-warnings",
        name: "Toggle Warning Visibility",
        callback: async () => {
          this.settings.enableWarnings = !this.settings.enableWarnings;
          await this.saveSettings();

          // Re-evaluate all files to apply/remove warnings
          this.metadataEnforcer.evaluateAllFiles();
        },
      });

      this.addCommand({
        id: "apply-ruleset",
        name: "Apply Ruleset to Current Note",
        checkCallback: (checking: boolean) => {
          const activeFile = this.app.workspace.getActiveFile();
          if (activeFile && activeFile.extension === "md") {
            if (!checking) {
              this.showRulesetSelector();
            }
            return true;
          }
          return false;
        },
      });

      this.addCommand({
        id: "paste-rich-text-as-markdown",
        name: "Paste Rich Text as Markdown",
        checkCallback: (checking: boolean) => {
          const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
          if (activeView && activeView.editor) {
            if (!checking) {
              this.pasteRichTextAsMarkdown();
            }
            return true;
          }
          return false;
        },
        hotkeys: [
          {
            modifiers: ["Mod", "Shift"],
            key: "v",
          },
        ],
      });

      this.addCommand({
        id: "test-html-to-markdown",
        name: "Test HTML to Markdown Conversion",
        callback: () => {
          ClipboardUtils.testHtmlToMarkdown();
        },
      });

      this.addCommand({
        id: "go-to-next-placeholder-marker",
        name: "Go to next placeholder marker",
        editorCallback: (editor, view) => {
          if (view instanceof MarkdownView) {
            // @ts-ignore - access CodeMirror instance
            const editorView = editor.cm;
            const success = navigateToMarker(editorView, 'next');
            if (!success) {
              new Notice("No placeholder markers found");
            }
          }
        },
      });

      this.addCommand({
        id: "go-to-previous-placeholder-marker",
        name: "Go to previous placeholder marker",
        editorCallback: (editor, view) => {
          if (view instanceof MarkdownView) {
            // @ts-ignore - access CodeMirror instance
            const editorView = editor.cm;
            const success = navigateToMarker(editorView, 'prev');
            if (!success) {
              new Notice("No placeholder markers found");
            }
          }
        },
      });

      this.addCommand({
        id: "show-foo-menu",
        name: "Show Foo Menu",
        callback: () => {
          this.fooMenu.showMenu();
        },
      });

      this.registerEvent(
        this.app.metadataCache.on("changed", (file: TFile) => {
          this.metadataEnforcer.evaluateFile(file);
        }),
      );

      this.registerEvent(
        this.app.vault.on("create", (file: TFile) => {
          if (file.extension === "md") {
            setTimeout(() => {
              this.metadataEnforcer.evaluateFile(file);
            }, 100);
          }
        }),
      );

      this.registerEvent(
        this.app.vault.on("rename", (file: TFile, oldPath: string) => {
          if (file.extension === "md") {
            this.metadataEnforcer.evaluateFile(file);
          }
        }),
      );

      this.registerEvent(
        this.app.workspace.on("active-leaf-change", () => {
          const activeFile = this.app.workspace.getActiveFile();
          if (activeFile && activeFile.extension === "md") {
            setTimeout(() => {
              this.metadataEnforcer.evaluateFile(activeFile);
            }, 50);
          }
        }),
      );


      this.app.workspace.onLayoutReady(() => {
        this.metadataEnforcer.evaluateAllFiles();
        // Auto-open the sidebar on first load
        this.activateSidebar();
      });

      console.timeEnd('Metaflyer onload');
    } catch (error) {
      console.error('Metaflyer: Error during onload():', error);
      throw error;
    }
  }

  onunload() {
    this.metadataEnforcer?.cleanup();
    this.fooMenu?.destroy();
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
    this.rulesetManager.updateSettings(this.settings);
    this.metadataEnforcer.updateSettings(this.settings.enableWarnings);
  }

  async activateSidebar() {
    const existing = this.app.workspace.getLeavesOfType(METAFLYER_SIDEBAR_TYPE);

    if (existing.length > 0) {
      // Sidebar already exists, just focus it
      this.app.workspace.revealLeaf(existing[0]);
    } else {
      // Create new sidebar
      const leaf = this.app.workspace.getRightLeaf(false);
      if (leaf) {
        await leaf.setViewState({
          type: METAFLYER_SIDEBAR_TYPE,
          active: true,
        });
      }
    }
  }

  showRulesetSelector() {
    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) return;

    new RulesetSelectorModal(
      this.app,
      this.settings.rulesets,
      async (selectedRuleset) => {
        await this.applyRulesetToFile(activeFile, selectedRuleset);
      },
    ).open();
  }

  private async applyRulesetToFile(file: TFile, ruleset: any) {
    try {
      // Read current file content
      const content = await this.app.vault.read(file);
      const cache = this.app.metadataCache.getFileCache(file);
      const currentFrontmatter = cache?.frontmatter || {};

      // Merge the ruleset's metadata_match properties into the current frontmatter
      const updatedFrontmatter = {
        ...currentFrontmatter,
        ...ruleset.metadata_match,
      };

      // Update the file with the new frontmatter
      await this.updateFileFrontmatter(file, updatedFrontmatter);

      new Notice(`Applied ruleset "${ruleset.name}" to current note`);
    } catch (error) {
      console.error("Error applying ruleset:", error);
      new Notice("Error applying ruleset. Check console for details.");
    }
  }

  private async updateFileFrontmatter(
    file: TFile,
    frontmatter: Record<string, any>,
  ) {
    const content = await this.app.vault.read(file);
    const lines = content.split("\n");

    let frontmatterStart = -1;
    let frontmatterEnd = -1;

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim() === "---") {
        if (frontmatterStart === -1) {
          frontmatterStart = i;
        } else {
          frontmatterEnd = i;
          break;
        }
      }
    }

    const yamlContent = this.stringifyFrontmatter(frontmatter);

    let newContent: string;
    if (frontmatterStart >= 0 && frontmatterEnd > frontmatterStart) {
      // Replace existing frontmatter
      const beforeFrontmatter = lines.slice(0, frontmatterStart);
      const afterFrontmatter = lines.slice(frontmatterEnd + 1);
      newContent = [
        ...beforeFrontmatter,
        "---",
        yamlContent,
        "---",
        ...afterFrontmatter,
      ].join("\n");
    } else {
      // Add new frontmatter at the beginning
      newContent = `---\n${yamlContent}\n---\n${content}`;
    }

    await this.app.vault.modify(file, newContent);
  }

  private stringifyFrontmatter(frontmatter: Record<string, any>): string {
    const lines: string[] = [];

    for (const [key, value] of Object.entries(frontmatter)) {
      if (Array.isArray(value)) {
        if (value.length === 0) {
          lines.push(`${key}: []`);
        } else {
          lines.push(`${key}:`);
          for (const item of value) {
            lines.push(`  - ${this.escapeYamlValue(item)}`);
          }
        }
      } else {
        lines.push(`${key}: ${this.escapeYamlValue(value)}`);
      }
    }

    return lines.join("\n");
  }

  private escapeYamlValue(value: any): string {
    if (typeof value === "string") {
      if (
        value.includes(":") ||
        value.includes('"') ||
        value.includes("'") ||
        value.includes("\n") ||
        value.includes("#")
      ) {
        return `"${value.replace(/"/g, '\\"')}"`;
      }
    }
    return String(value);
  }

  private async pasteRichTextAsMarkdown() {
    try {
      const result = await ClipboardUtils.convertClipboardToMarkdown();

      if (result === null) {
        // Error message already shown by ClipboardUtils
        return;
      }

      if (result.content.trim() === "") {
        new Notice("Clipboard appears to be empty");
        return;
      }

      const success = ClipboardUtils.insertTextAtCursor(
        this.app,
        result.content,
      );

      if (!success) {
        new Notice("❌ No active markdown editor found");
      }
    } catch (error) {
      console.error("Error pasting rich text as markdown:", error);
      new Notice("❌ Failed to paste rich text. Try regular paste (Ctrl+V)");
    }
  }
}

class RulesetSelectorModal extends FuzzySuggestModal<any> {
  private rulesets: any[];
  private onSelect: (ruleset: any) => void;

  constructor(app: any, rulesets: any[], onSelect: (ruleset: any) => void) {
    super(app);
    this.rulesets = rulesets;
    this.onSelect = onSelect;

    this.setPlaceholder("Select a ruleset to apply...");
  }

  getItems(): any[] {
    return this.rulesets;
  }

  getItemText(ruleset: any): string {
    return ruleset.name;
  }

  onChooseItem(ruleset: any, evt: MouseEvent | KeyboardEvent) {
    this.onSelect(ruleset);
  }
}
