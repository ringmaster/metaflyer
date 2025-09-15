import { ItemView, WorkspaceLeaf, TFile, MarkdownView } from "obsidian";
import MetaflyerPlugin from "../main";
import { RulesetManager } from "../core/ruleset-manager";
import { SearchCriteriaProcessor } from "../core/search-criteria-processor";
import { TemplateEngine, TemplateContext } from "../core/template-engine";
import { OllamaClient, OllamaResponse } from "../core/ollama-client";
import { ClipboardUtils } from "../core/clipboard-utils";

export const METAFLYER_SIDEBAR_TYPE = "metaflyer-sidebar";

export class MetaflyerSidebar extends ItemView {
  plugin: MetaflyerPlugin;
  rulesetManager: RulesetManager;
  searchProcessor: SearchCriteriaProcessor;
  currentFile: TFile | null = null;
  searchResults: any[] = [];
  aiSuggestions: string[] = [];
  regexMatches: {
    fullLine: string;
    content: string;
    checkboxAndContent: string;
  }[] = [];
  isLoadingAI: boolean = false;
  currentOllamaRequest: AbortController | null = null;
  activeEditor: any = null; // Store reference to active editor

  // Cache to prevent duplicate Ollama queries
  lastSearchCriteria: string = "";
  lastSearchResultsHash: string = "";
  lastOllamaQuery: string = "";
  lastFileHash: string = "";

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
    // Cancel any pending Ollama requests
    if (this.currentOllamaRequest) {
      this.currentOllamaRequest.abort();
      this.currentOllamaRequest = null;
    }
  }

  private async updateForActiveFile() {
    const activeFile = this.app.workspace.getActiveFile();

    // If the sidebar view itself becomes active, don't update
    const activeView = this.app.workspace.getActiveViewOfType(
      this.constructor as any,
    );
    if (activeView === this) {
      return; // Don't regenerate when sidebar becomes active
    }

    // Cancel any pending Ollama requests
    if (this.currentOllamaRequest) {
      this.currentOllamaRequest.abort();
      this.currentOllamaRequest = null;
    }

    if (activeFile?.extension === "md") {
      // Check if this is the same file we already processed
      if (this.currentFile?.path === activeFile.path) {
        return; // Same file, no need to regenerate
      }

      this.currentFile = activeFile;
      this.regexMatches = [];
      this.isLoadingAI = false;

      // Reset cache when file changes
      this.resetCache();

      await this.performSearch();
    } else {
      this.currentFile = null;
      this.searchResults = [];
      this.regexMatches = [];
      this.isLoadingAI = false;
      this.resetCache();
      this.render();
    }
  }

  private resetCache() {
    this.lastSearchCriteria = "";
    this.lastSearchResultsHash = "";
    this.lastOllamaQuery = "";
    this.lastFileHash = "";
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

    // Check if we need to perform search
    // For backward compatibility, if search_result_count is undefined, default to showing results
    const needsSearch =
      evaluation.ruleset?.search_criteria &&
      (evaluation.ruleset?.search_result_count === undefined ||
        (evaluation.ruleset?.search_result_count || 0) > 0);

    if (needsSearch) {
      try {
        const allResults = await this.searchProcessor.searchWithCriteria(
          evaluation.ruleset.search_criteria,
          frontmatter,
          this.currentFile,
        );

        // Limit results based on search_result_count
        // If undefined (backward compatibility), show all results like before
        if (evaluation.ruleset.search_result_count === undefined) {
          this.searchResults = allResults;
        } else {
          const maxResults = evaluation.ruleset.search_result_count || 0;
          this.searchResults = allResults.slice(0, maxResults);
        }

        // After search completes, extract regex matches from search results
        await this.extractRegexMatches();

        // Render again after regex extraction completes
        this.render();
      } catch (error) {
        console.error("Error performing search:", error);
        this.searchResults = [];
        this.render();
      }
    } else {
      this.searchResults = [];
      this.render();

      // No search results, so no regex matches to extract
      this.regexMatches = [];
    }
  }

  private async extractRegexMatches() {
    this.regexMatches = [];

    if (!this.searchResults || this.searchResults.length === 0) {
      console.log("No search results to extract regex matches from");
      return;
    }

    // Apply regex: ^\s*-\s\[\S\](.+)$ capture full line, checkbox part, and content
    const regex = /^(\s*-\s*)(\[\S\](.+))$/gm;

    // Process each search result file
    for (const result of this.searchResults) {
      try {
        let fileContent = "";

        // Get file content - first try from result, then read from vault
        if (result.content) {
          fileContent = result.content;
        } else if (result.path) {
          const file = this.app.vault.getAbstractFileByPath(result.path);
          if (file instanceof TFile) {
            fileContent = await this.app.vault.read(file);
          }
        }

        if (!fileContent) {
          continue;
        }

        console.log(`Processing file for regex matches: ${result.path}`);

        // Find all matches in this file
        let match;
        while ((match = regex.exec(fileContent)) !== null) {
          const fullLine = (match[1] + match[2]).trim(); // Full line with checkbox
          const checkboxAndContent = match[2].trim(); // Checkbox + content after list marker
          const content = match[3].trim(); // Just the content after checkbox
          console.log("Found regex match:", fullLine);
          if (
            fullLine &&
            !this.regexMatches.some((m) => m.fullLine === fullLine)
          ) {
            this.regexMatches.push({ fullLine, content, checkboxAndContent });
          }
        }
      } catch (error) {
        console.warn(
          `Error processing file ${result.path} for regex matches:`,
          error,
        );
      }
    }

    console.log("Total unique regex matches found:", this.regexMatches.length);
  }

  private async shouldUseCachedOllamaResults(
    ruleset: any,
    frontmatter: any,
  ): Promise<boolean> {
    if (!this.currentFile) return false;

    try {
      const currentFileContent = await this.app.vault.read(this.currentFile);
      const currentFileHash = this.hashString(currentFileContent);
      const currentSearchCriteria = ruleset.search_criteria || "";
      const currentSearchResultsHash = this.hashSearchResults();
      const currentOllamaQuery = ruleset.ollama_query;

      // Check if all relevant data matches the cache
      const cacheValid =
        this.lastFileHash === currentFileHash &&
        this.lastSearchCriteria === currentSearchCriteria &&
        this.lastSearchResultsHash === currentSearchResultsHash &&
        this.lastOllamaQuery === currentOllamaQuery &&
        this.aiSuggestions.length > 0; // Only use cache if we have suggestions

      if (cacheValid) {
        console.log("Using cached Ollama results");
        return true;
      }
    } catch (error) {
      console.warn("Error checking cache validity:", error);
    }

    return false;
  }

  private async cacheOllamaResults(
    ruleset: any,
    frontmatter: any,
    processedQuery: string,
  ) {
    if (!this.currentFile) return;

    try {
      const currentFileContent = await this.app.vault.read(this.currentFile);
      this.lastFileHash = this.hashString(currentFileContent);
      this.lastSearchCriteria = ruleset.search_criteria || "";
      this.lastSearchResultsHash = this.hashSearchResults();
      this.lastOllamaQuery = ruleset.ollama_query;
    } catch (error) {
      console.warn("Error caching Ollama results:", error);
    }
  }

  private hashString(str: string): string {
    // Simple hash function for caching purposes
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString();
  }

  private hashSearchResults(): string {
    // Create a hash of search results content
    const resultContent = this.searchResults
      .map((r) => `${r.path}|${r.title}|${r.excerpt}|${r.score}`)
      .join("||");
    return this.hashString(resultContent);
  }

  private render() {
    // Store the currently active editor before rendering
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (activeView && activeView.editor) {
      this.activeEditor = activeView.editor;
    }

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

    // Show current ruleset info
    this.renderRulesetInfo(
      contentEl as HTMLElement,
      evaluation.ruleset,
      frontmatter,
    );

    // Show search results if configured
    // For backward compatibility, if search_result_count is undefined, default to showing results (like before)
    const shouldShowSearchResults =
      evaluation.ruleset?.search_criteria &&
      (evaluation.ruleset?.search_result_count === undefined ||
        (evaluation.ruleset?.search_result_count || 0) > 0);

    if (shouldShowSearchResults) {
      this.renderSearchResults(contentEl as HTMLElement);
    }

    // Note: regex extraction happens after search completes, not here
    console.log("Regex matches available:", this.regexMatches);

    // Show regex matches if any found
    if (this.regexMatches.length > 0) {
      console.log("Rendering regex matches");
      this.renderRegexMatches(contentEl as HTMLElement);
    } else {
      console.log("No regex matches to render");
    }
  }

  private renderRulesetInfo(
    contentEl: HTMLElement,
    ruleset: any,
    frontmatter: any,
  ) {
    const rulesetInfo = contentEl.createDiv("ruleset-info");
    rulesetInfo.style.marginBottom = "15px";
    rulesetInfo.style.padding = "10px";
    rulesetInfo.style.border = "1px solid var(--background-modifier-border)";
    rulesetInfo.style.borderRadius = "5px";
    rulesetInfo.style.backgroundColor = "var(--background-secondary)";

    rulesetInfo.createEl("h4", {
      text: `Ruleset: ${ruleset.name}`,
      attr: { style: "margin: 0 0 5px 0;" },
    });

    if (ruleset.search_criteria) {
      const processedCriteria =
        this.searchProcessor.processCriteriaPlaceholders(
          ruleset.search_criteria,
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
    }
  }

  private renderSearchResults(contentEl: HTMLElement) {
    const resultsHeader = contentEl.createEl("h4", {
      text: "Related Notes",
      attr: { style: "margin: 15px 0 10px 0;" },
    });

    if (this.searchResults.length === 0) {
      contentEl.createEl("p", {
        text: "No related notes found",
        attr: { style: "color: var(--text-muted); font-style: italic;" },
      });
      return;
    }

    const resultsList = contentEl.createEl("ul", "metaflyer-search-results");

    for (const result of this.searchResults) {
      const listItem = resultsList.createEl("li");

      listItem.addEventListener("click", () => {
        // Open in new tab as specified in requirements
        this.app.workspace.openLinkText(result.path, "", true);
      });

      const fileName = listItem.createEl("div", "file-name");
      fileName.textContent = result.basename;

      const filePath = listItem.createEl("div", "file-path");
      filePath.textContent = result.path;

      if (result.excerpt) {
        const metadata = listItem.createEl("div", "file-metadata");
        metadata.textContent = result.excerpt.substring(0, 100) + "...";
      }
    }
  }

  private renderRegexMatches(contentEl: HTMLElement) {
    console.log(
      "renderRegexMatches called with",
      this.regexMatches.length,
      "matches",
    );
    console.log("Matches array:", this.regexMatches);

    const matchesHeader = contentEl.createEl("h4", {
      text: "Available Items",
      attr: { style: "margin: 15px 0 10px 0;" },
    });

    if (this.regexMatches.length === 0) {
      console.log("No regex matches to render");
      contentEl.createEl("p", {
        text: "No items found",
        attr: { style: "color: var(--text-muted); font-style: italic;" },
      });
      return;
    }

    console.log("Creating container for", this.regexMatches.length, "matches");

    // Create a div container for the matches content
    const matchesContainer = contentEl.createEl("div");
    matchesContainer.style.padding = "10px";
    matchesContainer.style.border =
      "1px solid var(--background-modifier-border)";
    matchesContainer.style.borderRadius = "5px";
    matchesContainer.style.backgroundColor = "var(--background-secondary)";
    matchesContainer.style.lineHeight = "1.5";

    // Render each match as a separate clickable line
    for (const match of this.regexMatches) {
      console.log("Processing match for rendering:", match);
      if (match.fullLine.trim()) {
        this.createClickableLine(matchesContainer, match);
        console.log("Created clickable line for:", match.fullLine.trim());
      }
    }

    console.log("Finished rendering regex matches");
  }

  private createClickableLine(
    container: HTMLElement,
    match: { fullLine: string; content: string; checkboxAndContent: string },
  ) {
    const lineElement = container.createEl("div");
    lineElement.style.margin = "0 0 8px 0";
    lineElement.style.cursor = "pointer";
    lineElement.style.padding = "4px";
    lineElement.style.borderRadius = "3px";
    lineElement.style.transition = "background-color 0.2s";

    // Check if this is a checkbox line and render with proper classes
    const checkboxMatch = match.fullLine.match(/^(\s*-\s*)\[(\S)\](.+)$/);
    if (checkboxMatch) {
      const [, prefix, checkboxChar, content] = checkboxMatch;

      // Create the structure for proper checkbox rendering
      const prefixSpan = lineElement.createEl("span");
      prefixSpan.textContent = prefix;

      const checkboxSpan = lineElement.createEl("span");
      checkboxSpan.className = "task-list-item-checkbox";
      checkboxSpan.setAttribute("data-task", checkboxChar);
      checkboxSpan.textContent = `[${checkboxChar}]`;

      const contentSpan = lineElement.createEl("span");
      contentSpan.textContent = content;

      // Add classes to the line element for proper styling
      lineElement.className = "HyperMD-task-line";
    } else {
      // Regular text line
      lineElement.textContent = match.fullLine;
    }

    // Add hover effect for individual lines
    lineElement.addEventListener("mouseenter", () => {
      lineElement.style.backgroundColor = "var(--background-modifier-hover)";
    });

    lineElement.addEventListener("mouseleave", () => {
      lineElement.style.backgroundColor = "";
    });

    // Add click handler for individual lines
    lineElement.addEventListener("click", (event) => {
      event.stopPropagation();
      event.preventDefault();

      // Insert this specific line at cursor position using stored editor
      this.insertTextInActiveEditor(match);
    });
  }

  private insertTextInActiveEditor(match: {
    fullLine: string;
    content: string;
    checkboxAndContent: string;
  }) {
    if (this.activeEditor) {
      const cursor = this.activeEditor.getCursor();
      const currentLine = this.activeEditor.getLine(cursor.line);
      const beforeCursor = currentLine.substring(0, cursor.ch);

      let textToInsert = "";

      // Check what's before the cursor
      if (cursor.ch === 0 || beforeCursor.match(/^\s*$/)) {
        // At beginning of line or only whitespace - insert full line
        textToInsert = match.fullLine;
      } else if (beforeCursor.match(/^\s*-\s*/)) {
        // Already on a list line - insert checkbox and content
        textToInsert = match.checkboxAndContent;
      } else {
        // Other text on line - insert only content
        textToInsert = match.content;
      }

      const textWithNewline = textToInsert + "\n";
      this.activeEditor.replaceRange(textWithNewline, cursor);

      // Move cursor to end of inserted text
      const newPos = {
        line: cursor.line,
        ch: cursor.ch + textWithNewline.length,
      };
      this.activeEditor.setCursor(newPos);
    } else {
      // Fallback to ClipboardUtils method - use full line
      const success = ClipboardUtils.insertTextAtCursor(
        this.app,
        match.fullLine + "\n",
      );
      if (!success) {
        console.warn("Could not insert task item - no active editor found");
      }
    }
  }
}
