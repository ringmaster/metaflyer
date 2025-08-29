import { ItemView, WorkspaceLeaf, TFile } from "obsidian";
import MetaflyerPlugin from "../main";
import { RulesetManager } from "../core/ruleset-manager";
import { SearchCriteriaProcessor } from "../core/search-criteria-processor";

export const METAFLYER_SIDEBAR_TYPE = "metaflyer-sidebar";

export class MetaflyerSidebar extends ItemView {
  plugin: MetaflyerPlugin;
  rulesetManager: RulesetManager;
  searchProcessor: SearchCriteriaProcessor;
  currentFile: TFile | null = null;
  searchResults: any[] = [];

  constructor(leaf: WorkspaceLeaf, plugin: MetaflyerPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.rulesetManager = plugin.rulesetManager;
    this.searchProcessor = new SearchCriteriaProcessor(this.app);
  }

  getViewType(): string {
    return METAFLYER_SIDEBAR_TYPE;
  }

  getDisplayText(): string {
    return "Metaflyer";
  }

  getIcon(): string {
    return "search";
  }

  async onOpen() {
    const container = this.containerEl.children[1];
    container.empty();

    container.createEl("h3", { text: "Metaflyer Search" });

    this.render();

    // Listen for active file changes
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => {
        this.updateForActiveFile();
      }),
    );

    // Initial load
    this.updateForActiveFile();
  }

  async onClose() {
    // Cleanup if needed
  }

  private async updateForActiveFile() {
    const activeFile = this.app.workspace.getActiveFile();

    if (activeFile?.extension === "md") {
      this.currentFile = activeFile;
      await this.performSearch();
    } else {
      this.currentFile = null;
      this.searchResults = [];
      this.render();
    }
  }

  private async performSearch() {
    if (!this.currentFile) {
      this.searchResults = [];
      this.render();
      return;
    }

    const cache = this.app.metadataCache.getFileCache(this.currentFile);
    const frontmatter = cache?.frontmatter;

    if (!frontmatter) {
      this.searchResults = [];
      this.render();
      return;
    }

    const evaluation = this.rulesetManager.evaluateMetadata(frontmatter);

    if (!evaluation.matches) {
      this.searchResults = [];
      this.render();
      return;
    }

    if (!evaluation.ruleset?.search_criteria) {
      this.searchResults = [];
      this.render();
      return;
    }

    try {
      this.searchResults = await this.searchProcessor.searchWithCriteria(
        evaluation.ruleset.search_criteria,
        frontmatter,
        this.currentFile,
      );
      this.render();
    } catch (error) {
      console.error("Error performing search:", error);
      this.searchResults = [];
      this.render();
    }
  }

  private render() {
    const container = this.containerEl.children[1];
    const contentEl =
      container.querySelector(".metaflyer-content") ||
      container.createDiv("metaflyer-content");
    contentEl.empty();

    if (!this.currentFile) {
      contentEl.createEl("p", {
        text: "No active note selected",
        attr: { style: "color: var(--text-muted); font-style: italic;" },
      });
      return;
    }

    const cache = this.app.metadataCache.getFileCache(this.currentFile);
    const frontmatter = cache?.frontmatter;
    const evaluation = this.rulesetManager.evaluateMetadata(frontmatter);

    if (!evaluation.matches) {
      contentEl.createEl("p", {
        text: "Current note matches no rulesets",
        attr: { style: "color: var(--text-muted); font-style: italic;" },
      });
      return;
    }

    if (!evaluation.ruleset?.search_criteria) {
      contentEl.createEl("p", {
        text: `Ruleset "${evaluation.ruleset?.name}" has no search criteria`,
        attr: { style: "color: var(--text-muted); font-style: italic;" },
      });
      return;
    }

    // Show current ruleset info
    const rulesetInfo = contentEl.createDiv("ruleset-info");
    rulesetInfo.style.marginBottom = "15px";
    rulesetInfo.style.padding = "10px";
    rulesetInfo.style.border = "1px solid var(--background-modifier-border)";
    rulesetInfo.style.borderRadius = "5px";
    rulesetInfo.style.backgroundColor = "var(--background-secondary)";

    rulesetInfo.createEl("h4", {
      text: `Ruleset: ${evaluation.ruleset.name}`,
      attr: { style: "margin: 0 0 5px 0;" },
    });

    const processedCriteria = this.searchProcessor.processCriteriaPlaceholders(
      evaluation.ruleset.search_criteria,
      frontmatter || {},
      this.currentFile,
    );

    rulesetInfo.createEl("p", {
      text: `Search: ${processedCriteria}`,
      attr: {
        style:
          "margin: 0; font-family: var(--font-monospace); font-size: 0.9em;",
      },
    });

    // Show search results
    const resultsHeader = contentEl.createEl("h4", {
      text: `Search Results (${this.searchResults.length})`,
      attr: { style: "margin: 15px 0 10px 0;" },
    });

    if (this.searchResults.length === 0) {
      contentEl.createEl("p", {
        text: "No matching notes found",
        attr: { style: "color: var(--text-muted); font-style: italic;" },
      });
      return;
    }

    const resultsList = contentEl.createEl("ul");
    resultsList.style.listStyle = "none";
    resultsList.style.padding = "0";

    for (const result of this.searchResults) {
      const listItem = resultsList.createEl("li");
      listItem.style.marginBottom = "8px";
      listItem.style.padding = "8px";
      listItem.style.border = "1px solid var(--background-modifier-border)";
      listItem.style.borderRadius = "3px";
      listItem.style.cursor = "pointer";
      listItem.style.transition = "background-color 0.2s";

      listItem.addEventListener("mouseenter", () => {
        listItem.style.backgroundColor = "var(--background-modifier-hover)";
      });

      listItem.addEventListener("mouseleave", () => {
        listItem.style.backgroundColor = "";
      });

      listItem.addEventListener("click", () => {
        this.app.workspace.openLinkText(result.path, "", false);
      });

      const fileName = listItem.createEl("div");
      fileName.style.fontWeight = "bold";
      fileName.style.marginBottom = "4px";
      fileName.textContent = result.basename;

      const filePath = listItem.createEl("div");
      filePath.style.fontSize = "0.85em";
      filePath.style.color = "var(--text-muted)";
      filePath.textContent = result.path;

      // Show search score and excerpt
      const scoreDiv = listItem.createEl("div");
      scoreDiv.style.fontSize = "0.8em";
      scoreDiv.style.marginTop = "4px";
      scoreDiv.style.color = "var(--text-muted)";
      scoreDiv.textContent = `Score: ${result.score.toFixed(1)}`;

      if (result.excerpt) {
        const excerptDiv = listItem.createEl("div");
        excerptDiv.style.fontSize = "0.8em";
        excerptDiv.style.marginTop = "4px";
        excerptDiv.style.color = "var(--text-muted)";
        excerptDiv.style.fontStyle = "italic";
        excerptDiv.innerHTML = result.excerpt.substring(0, 100) + "...";
      }
    }
  }
}
