import { App, TFile } from "obsidian";
import { PlaceholderProcessor } from "./placeholder-processor";

export class SearchCriteriaProcessor {
  private app: App;

  constructor(app: App) {
    this.app = app;
  }

  processCriteriaPlaceholders(
    searchCriteria: string,
    frontmatter: Record<string, any>,
    file?: TFile,
  ): string {
    if (!searchCriteria) return "";

    return PlaceholderProcessor.processPlaceholders(
      searchCriteria,
      frontmatter,
      file,
    );
  }

  async searchWithCriteria(
    searchCriteria: string,
    frontmatter: Record<string, any>,
    currentFile?: TFile,
  ): Promise<any[]> {
    if (!searchCriteria) {
      return [];
    }

    // Process placeholders in the search criteria
    const processedCriteria = this.processCriteriaPlaceholders(
      searchCriteria,
      frontmatter,
      currentFile,
    );

    if (!processedCriteria.trim()) {
      return [];
    }

    // Use Omnisearch API
    const omnisearchPlugin = (this.app as any).plugins.plugins.omnisearch;
    if (!omnisearchPlugin) {
      console.warn("Omnisearch plugin not found, falling back to basic search");
      return [];
    }

    const searchPromise = omnisearchPlugin.api.search(processedCriteria);
    const omnisearchResults = await searchPromise;

    // Filter out current file if specified
    const filteredResults = omnisearchResults.filter((result: any) => {
      return currentFile ? result.path !== currentFile.path : true;
    });

    return filteredResults;
  }
}
