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
  isLoadingAI: boolean = false;
  currentOllamaRequest: AbortController | null = null;
  activeEditor: any = null; // Store reference to active editor
  
  // Cache to prevent duplicate Ollama queries
  lastSearchCriteria: string = '';
  lastSearchResultsHash: string = '';
  lastOllamaQuery: string = '';
  lastFileHash: string = '';

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
    const activeView = this.app.workspace.getActiveViewOfType(this.constructor as any);
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
      this.aiSuggestions = [];
      this.isLoadingAI = false;
      
      // Reset cache when file changes
      this.resetCache();
      
      await this.performSearch();
    } else {
      this.currentFile = null;
      this.searchResults = [];
      this.aiSuggestions = [];
      this.isLoadingAI = false;
      this.resetCache();
      this.render();
    }
  }

  private resetCache() {
    this.lastSearchCriteria = '';
    this.lastSearchResultsHash = '';
    this.lastOllamaQuery = '';
    this.lastFileHash = '';
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
    const needsSearch = evaluation.ruleset?.search_criteria && 
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
        
        this.render();

        // After search completes, try AI generation if configured
        await this.generateAISuggestions(evaluation.ruleset, frontmatter);
      } catch (error) {
        console.error("Error performing search:", error);
        this.searchResults = [];
        this.render();
      }
    } else {
      this.searchResults = [];
      this.render();
      
      // Still try AI generation even without search
      await this.generateAISuggestions(evaluation.ruleset, frontmatter);
    }
  }

  private async generateAISuggestions(ruleset: any, frontmatter: any) {
    if (!ruleset?.ollama_query?.trim()) {
      return; // No AI query configured
    }

    // Don't query Ollama if there are no search results and the query uses results
    if (this.searchResults.length === 0 && ruleset.ollama_query.includes('results')) {
      return; // No search results to analyze
    }

    // Don't query Ollama if there's no search criteria and the query uses results
    if (!ruleset.search_criteria?.trim() && ruleset.ollama_query.includes('results')) {
      return; // No search configured but query expects results
    }

    // Check if we should use cached results
    if (await this.shouldUseCachedOllamaResults(ruleset, frontmatter)) {
      return; // Using cached results, no need to query again
    }

    this.isLoadingAI = true;
    this.render(); // Update UI to show loading state

    try {
      // Get current file content
      const currentFileContent = await this.app.vault.read(this.currentFile!);
      
      // Prepare template context with full file content for search results
      const resultsWithContent = await Promise.all(
        this.searchResults.map(async (result) => {
          let content = result.content || '';
          
          // If content is empty, try to read the file
          if (!content && result.path) {
            try {
              const file = this.app.vault.getAbstractFileByPath(result.path);
              if (file instanceof TFile) {
                content = await this.app.vault.read(file);
              }
            } catch (error) {
              console.warn(`Could not read content for ${result.path}:`, error);
              // Fall back to excerpt if available
              content = result.excerpt || '';
            }
          }
          
          return {
            title: result.basename || result.title || '',
            path: result.path || '',
            content: content,
            excerpt: result.excerpt || '',
            score: result.score || 0,
          };
        })
      );

      const context: TemplateContext = {
        current_file: {
          title: this.currentFile?.basename || '',
          path: this.currentFile?.path || '',
          content: currentFileContent,
          metadata: frontmatter || {},
        },
        results: resultsWithContent,
      };

      // Process the template
      const processedQuery = TemplateEngine.processTemplate(ruleset.ollama_query, context);

      // Make Ollama request
      const response = await OllamaClient.generateSuggestions(processedQuery);

      if (response.success) {
        this.aiSuggestions = response.suggestions;
        
        // Cache the successful result
        await this.cacheOllamaResults(ruleset, frontmatter, processedQuery);
      } else {
        console.error('Ollama error:', response.error);
        this.aiSuggestions = [];
      }
    } catch (error) {
      console.error('Error generating AI suggestions:', error);
      this.aiSuggestions = [];
    } finally {
      this.isLoadingAI = false;
      this.render();
    }
  }

  private async shouldUseCachedOllamaResults(ruleset: any, frontmatter: any): Promise<boolean> {
    if (!this.currentFile) return false;
    
    try {
      const currentFileContent = await this.app.vault.read(this.currentFile);
      const currentFileHash = this.hashString(currentFileContent);
      const currentSearchCriteria = ruleset.search_criteria || '';
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
        console.log('Using cached Ollama results');
        return true;
      }
    } catch (error) {
      console.warn('Error checking cache validity:', error);
    }
    
    return false;
  }

  private async cacheOllamaResults(ruleset: any, frontmatter: any, processedQuery: string) {
    if (!this.currentFile) return;
    
    try {
      const currentFileContent = await this.app.vault.read(this.currentFile);
      this.lastFileHash = this.hashString(currentFileContent);
      this.lastSearchCriteria = ruleset.search_criteria || '';
      this.lastSearchResultsHash = this.hashSearchResults();
      this.lastOllamaQuery = ruleset.ollama_query;
    } catch (error) {
      console.warn('Error caching Ollama results:', error);
    }
  }

  private hashString(str: string): string {
    // Simple hash function for caching purposes
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString();
  }

  private hashSearchResults(): string {
    // Create a hash of search results content
    const resultContent = this.searchResults.map(r => 
      `${r.path}|${r.title}|${r.excerpt}|${r.score}`
    ).join('||');
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
    this.renderRulesetInfo(contentEl as HTMLElement, evaluation.ruleset, frontmatter);

    // Show search results if configured
    // For backward compatibility, if search_result_count is undefined, default to showing results (like before)
    const shouldShowSearchResults = evaluation.ruleset?.search_criteria && 
      (evaluation.ruleset?.search_result_count === undefined || 
       (evaluation.ruleset?.search_result_count || 0) > 0);
    
    if (shouldShowSearchResults) {
      this.renderSearchResults(contentEl as HTMLElement);
    }

    // Show AI suggestions if configured
    if (evaluation.ruleset?.ollama_query?.trim()) {
      this.renderAISuggestions(contentEl as HTMLElement);
    }
  }

  private renderRulesetInfo(contentEl: HTMLElement, ruleset: any, frontmatter: any) {
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
      const processedCriteria = this.searchProcessor.processCriteriaPlaceholders(
        ruleset.search_criteria,
        frontmatter || {},
        this.currentFile,
      );

      rulesetInfo.createEl("p", {
        text: `Search: ${processedCriteria}`,
        attr: {
          style: "margin: 0; font-family: var(--font-monospace); font-size: 0.9em;",
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

  private renderAISuggestions(contentEl: HTMLElement) {
    const aiHeader = contentEl.createEl("h4", {
      text: "AI Suggestions",
      attr: { style: "margin: 15px 0 10px 0;" },
    });

    if (this.isLoadingAI) {
      contentEl.createEl("p", {
        text: "Generating suggestions...",
        attr: { style: "color: var(--text-muted); font-style: italic;" },
      });
      return;
    }

    if (this.aiSuggestions.length === 0) {
      contentEl.createEl("p", {
        text: "No suggestions available",
        attr: { style: "color: var(--text-muted); font-style: italic;" },
      });
      return;
    }

    // Create a div container for the suggestions content
    const suggestionsContainer = contentEl.createEl("div");
    suggestionsContainer.style.padding = "10px";
    suggestionsContainer.style.border = "1px solid var(--background-modifier-border)";
    suggestionsContainer.style.borderRadius = "5px";
    suggestionsContainer.style.backgroundColor = "var(--background-secondary)";
    suggestionsContainer.style.lineHeight = "1.5";

    // Render each suggestion as a separate clickable line
    for (const suggestion of this.aiSuggestions) {
      if (suggestion.trim()) {
        this.createClickableLine(suggestionsContainer, suggestion.trim());
      }
    }
  }

  private createClickableLine(container: HTMLElement, text: string) {
    const lineElement = container.createEl("div");
    lineElement.style.margin = "0 0 8px 0";
    lineElement.style.cursor = "pointer";
    lineElement.style.padding = "4px";
    lineElement.style.borderRadius = "3px";
    lineElement.style.transition = "background-color 0.2s";
    lineElement.textContent = text;

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
      this.insertTextInActiveEditor(text);
    });
  }

  private insertTextInActiveEditor(text: string) {
    // Add carriage return to prevent insertions running together
    const textWithNewline = text + '\n';
    
    if (this.activeEditor) {
      // Use the stored active editor directly
      const cursor = this.activeEditor.getCursor();
      this.activeEditor.replaceRange(textWithNewline, cursor);
      
      // Move cursor to end of inserted text
      const newPos = {
        line: cursor.line,
        ch: cursor.ch + textWithNewline.length
      };
      this.activeEditor.setCursor(newPos);
    } else {
      // Fallback to ClipboardUtils method
      const success = ClipboardUtils.insertTextAtCursor(this.app, textWithNewline);
      if (!success) {
        console.warn('Could not insert AI suggestion - no active editor found');
      }
    }
  }
}
