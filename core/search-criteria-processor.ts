import { App, TFile, MetadataCache, CachedMetadata } from "obsidian";
import { PlaceholderProcessor } from "./placeholder-processor";

interface SearchTerm {
  type:
    | "text"
    | "tag"
    | "file"
    | "path"
    | "content"
    | "line"
    | "block"
    | "section"
    | "task"
    | "meta";
  value: string;
  negate: boolean;
  regex: boolean;
  matchCase: boolean;
  metaField?: string; // For meta: searches
}

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

  private parseSearchCriteria(criteria: string): SearchTerm[] {
    const terms: SearchTerm[] = [];
    const tokens = this.tokenizeSearchCriteria(criteria);

    for (const token of tokens) {
      const term = this.parseToken(token);
      if (term) {
        terms.push(term);
      }
    }

    return terms;
  }

  private tokenizeSearchCriteria(criteria: string): string[] {
    const tokens: string[] = [];
    let current = "";
    let inQuotes = false;
    let quoteChar = "";

    for (let i = 0; i < criteria.length; i++) {
      const char = criteria[i];

      if ((char === '"' || char === "'") && !inQuotes) {
        inQuotes = true;
        quoteChar = char;
        current += char;
      } else if (char === quoteChar && inQuotes) {
        inQuotes = false;
        quoteChar = "";
        current += char;
      } else if (char === " " && !inQuotes) {
        if (current.trim()) {
          tokens.push(current.trim());
          current = "";
        }
      } else {
        current += char;
      }
    }

    if (current.trim()) {
      tokens.push(current.trim());
    }

    return tokens;
  }

  private parseToken(token: string): SearchTerm | null {
    let negate = false;
    let regex = false;
    let matchCase = false;
    let cleanToken = token;

    // Handle negation
    if (cleanToken.startsWith("-")) {
      negate = true;
      cleanToken = cleanToken.substring(1);
    }

    // Handle regex
    if (cleanToken.startsWith("/") && cleanToken.endsWith("/")) {
      regex = true;
      cleanToken = cleanToken.slice(1, -1);
      return {
        type: "content",
        value: cleanToken,
        negate,
        regex,
        matchCase: true,
      };
    }

    // Handle quotes (remove them but preserve exact matching)
    if (
      (cleanToken.startsWith('"') && cleanToken.endsWith('"')) ||
      (cleanToken.startsWith("'") && cleanToken.endsWith("'"))
    ) {
      matchCase = true;
      cleanToken = cleanToken.slice(1, -1);
      return { type: "content", value: cleanToken, negate, regex, matchCase };
    }

    // Handle specific operators
    if (cleanToken.startsWith("tag:")) {
      return {
        type: "tag",
        value: cleanToken.substring(4),
        negate,
        regex,
        matchCase,
      };
    }
    if (cleanToken.startsWith("file:")) {
      return {
        type: "file",
        value: cleanToken.substring(5),
        negate,
        regex,
        matchCase,
      };
    }
    if (cleanToken.startsWith("path:")) {
      return {
        type: "path",
        value: cleanToken.substring(5),
        negate,
        regex,
        matchCase,
      };
    }
    if (cleanToken.startsWith("content:")) {
      return {
        type: "content",
        value: cleanToken.substring(8),
        negate,
        regex,
        matchCase,
      };
    }
    if (cleanToken.startsWith("line:")) {
      return {
        type: "line",
        value: cleanToken.substring(5),
        negate,
        regex,
        matchCase,
      };
    }
    if (cleanToken.startsWith("block:")) {
      return {
        type: "block",
        value: cleanToken.substring(6),
        negate,
        regex,
        matchCase,
      };
    }
    if (cleanToken.startsWith("section:")) {
      return {
        type: "section",
        value: cleanToken.substring(8),
        negate,
        regex,
        matchCase,
      };
    }
    if (
      cleanToken.startsWith("task:") ||
      cleanToken.startsWith("task-todo:") ||
      cleanToken.startsWith("task-done:")
    ) {
      return { type: "task", value: cleanToken, negate, regex, matchCase };
    }
    if (cleanToken.startsWith("meta:")) {
      const metaPart = cleanToken.substring(5);
      const colonIndex = metaPart.indexOf(":");
      if (colonIndex > 0) {
        const field = metaPart.substring(0, colonIndex);
        const value = metaPart.substring(colonIndex + 1);
        // Handle quoted values in meta search
        let processedValue = value;
        let processedMatchCase = matchCase;
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          processedMatchCase = true;
          processedValue = value.slice(1, -1);
        }

        return {
          type: "meta",
          value: processedValue,
          metaField: field,
          negate,
          regex,
          matchCase: processedMatchCase,
        };
      }
    }

    // Default to text search
    return { type: "text", value: cleanToken, negate, regex, matchCase };
  }

  private async matchesTerm(
    file: TFile,
    term: SearchTerm,
    fileContent?: string,
  ): Promise<boolean> {
    const cache = this.app.metadataCache.getFileCache(file);

    if (!fileContent) {
      try {
        fileContent = await this.app.vault.cachedRead(file);
      } catch (error) {
        return false;
      }
    }

    let matches = false;

    switch (term.type) {
      case "tag":
        matches = this.matchesTag(
          cache,
          term.value,
          term.regex,
          term.matchCase,
        );
        break;
      case "file":
        matches = this.matchesFileName(
          file.basename,
          term.value,
          term.regex,
          term.matchCase,
        );
        break;
      case "path":
        matches = this.matchesPath(
          file.path,
          term.value,
          term.regex,
          term.matchCase,
        );
        break;
      case "content":
      case "text":
        matches = this.matchesContent(
          fileContent,
          term.value,
          term.regex,
          term.matchCase,
        );
        break;
      case "line":
        matches = this.matchesLine(
          fileContent,
          term.value,
          term.regex,
          term.matchCase,
        );
        break;
      case "task":
        matches = this.matchesTask(
          fileContent,
          term.value,
          term.regex,
          term.matchCase,
        );
        break;
      case "section":
        matches = this.matchesSection(
          fileContent,
          cache,
          term.value,
          term.regex,
          term.matchCase,
        );
        break;
      case "block":
        matches = this.matchesBlock(
          fileContent,
          term.value,
          term.regex,
          term.matchCase,
        );
        break;
      case "meta":
        matches = this.matchesMeta(
          cache,
          term.metaField!,
          term.value,
          term.regex,
          term.matchCase,
        );
        break;
      default:
        matches = this.matchesContent(
          fileContent,
          term.value,
          term.regex,
          term.matchCase,
        );
    }

    return term.negate ? !matches : matches;
  }

  private matchesTag(
    cache: CachedMetadata | null,
    tagValue: string,
    regex: boolean,
    matchCase: boolean,
  ): boolean {
    if (!cache?.tags) return false;

    const searchValue = matchCase ? tagValue : tagValue.toLowerCase();

    return cache.tags.some((tagCache) => {
      const tag = tagCache.tag.replace("#", "");
      const compareTag = matchCase ? tag : tag.toLowerCase();

      if (regex) {
        try {
          const regExp = new RegExp(searchValue, matchCase ? "" : "i");
          return regExp.test(compareTag);
        } catch {
          return false;
        }
      }

      return compareTag.includes(searchValue);
    });
  }

  private matchesFileName(
    fileName: string,
    searchValue: string,
    regex: boolean,
    matchCase: boolean,
  ): boolean {
    const compareFileName = matchCase ? fileName : fileName.toLowerCase();
    const compareSearch = matchCase ? searchValue : searchValue.toLowerCase();

    if (regex) {
      try {
        const regExp = new RegExp(compareSearch, matchCase ? "" : "i");
        return regExp.test(compareFileName);
      } catch {
        return false;
      }
    }

    return compareFileName.includes(compareSearch);
  }

  private matchesPath(
    filePath: string,
    searchValue: string,
    regex: boolean,
    matchCase: boolean,
  ): boolean {
    const comparePath = matchCase ? filePath : filePath.toLowerCase();
    const compareSearch = matchCase ? searchValue : searchValue.toLowerCase();

    if (regex) {
      try {
        const regExp = new RegExp(compareSearch, matchCase ? "" : "i");
        return regExp.test(comparePath);
      } catch {
        return false;
      }
    }

    return comparePath.includes(compareSearch);
  }

  private matchesContent(
    content: string,
    searchValue: string,
    regex: boolean,
    matchCase: boolean,
  ): boolean {
    const compareContent = matchCase ? content : content.toLowerCase();
    const compareSearch = matchCase ? searchValue : searchValue.toLowerCase();

    if (regex) {
      try {
        const regExp = new RegExp(compareSearch, matchCase ? "" : "i");
        return regExp.test(compareContent);
      } catch {
        return false;
      }
    }

    return compareContent.includes(compareSearch);
  }

  private matchesLine(
    content: string,
    searchValue: string,
    regex: boolean,
    matchCase: boolean,
  ): boolean {
    const lines = content.split("\n");
    const compareSearch = matchCase ? searchValue : searchValue.toLowerCase();

    return lines.some((line) => {
      const compareLine = matchCase ? line : line.toLowerCase();

      if (regex) {
        try {
          const regExp = new RegExp(compareSearch, matchCase ? "" : "i");
          return regExp.test(compareLine);
        } catch {
          return false;
        }
      }

      return compareLine.includes(compareSearch);
    });
  }

  private matchesTask(
    content: string,
    taskQuery: string,
    regex: boolean,
    matchCase: boolean,
  ): boolean {
    const lines = content.split("\n");

    // Handle different task queries
    if (taskQuery === "task:" || taskQuery === "task") {
      // Any task
      return lines.some((line) => /^\s*[-*+]\s*\[.\]\s/.test(line));
    } else if (taskQuery === "task-todo:" || taskQuery === "task-todo") {
      // Incomplete tasks
      return lines.some((line) => /^\s*[-*+]\s*\[ \]\s/.test(line));
    } else if (taskQuery === "task-done:" || taskQuery === "task-done") {
      // Completed tasks
      return lines.some((line) => /^\s*[-*+]\s*\[x\]\s/i.test(line));
    } else {
      // Task with specific content
      const searchValue = taskQuery.replace(/^task(-todo|-done)?:/, "");
      return lines.some((line) => {
        if (!/^\s*[-*+]\s*\[.\]\s/.test(line)) return false;

        const taskContent = line.replace(/^\s*[-*+]\s*\[.\]\s*/, "");
        const compareContent = matchCase
          ? taskContent
          : taskContent.toLowerCase();
        const compareSearch = matchCase
          ? searchValue
          : searchValue.toLowerCase();

        if (regex) {
          try {
            const regExp = new RegExp(compareSearch, matchCase ? "" : "i");
            return regExp.test(compareContent);
          } catch {
            return false;
          }
        }

        return compareContent.includes(compareSearch);
      });
    }
  }

  private matchesSection(
    content: string,
    cache: CachedMetadata | null,
    searchValue: string,
    regex: boolean,
    matchCase: boolean,
  ): boolean {
    if (!cache?.sections) return false;

    const compareSearch = matchCase ? searchValue : searchValue.toLowerCase();

    return cache.sections.some((section) => {
      if (section.type !== "heading") return false;

      const headingText = content.substring(
        section.position.start.offset,
        section.position.end.offset,
      );
      const cleanHeading = headingText.replace(/^#+\s*/, "");
      const compareHeading = matchCase
        ? cleanHeading
        : cleanHeading.toLowerCase();

      if (regex) {
        try {
          const regExp = new RegExp(compareSearch, matchCase ? "" : "i");
          return regExp.test(compareHeading);
        } catch {
          return false;
        }
      }

      return compareHeading.includes(compareSearch);
    });
  }

  private matchesBlock(
    content: string,
    searchValue: string,
    regex: boolean,
    matchCase: boolean,
  ): boolean {
    // Look for block references ^blockid
    const blockPattern = /\^([a-zA-Z0-9-_]+)/g;
    let match;

    while ((match = blockPattern.exec(content)) !== null) {
      const blockId = match[1];
      const compareBlockId = matchCase ? blockId : blockId.toLowerCase();
      const compareSearch = matchCase ? searchValue : searchValue.toLowerCase();

      if (regex) {
        try {
          const regExp = new RegExp(compareSearch, matchCase ? "" : "i");
          if (regExp.test(compareBlockId)) return true;
        } catch {
          continue;
        }
      } else {
        if (compareBlockId.includes(compareSearch)) return true;
      }
    }

    return false;
  }

  private matchesMeta(
    cache: CachedMetadata | null,
    field: string,
    searchValue: string,
    regex: boolean,
    matchCase: boolean,
  ): boolean {
    if (!cache?.frontmatter) return false;

    const frontmatter = cache.frontmatter;
    const fieldValue = frontmatter[field];

    if (fieldValue === undefined || fieldValue === null) return false;

    // Convert field value to searchable string
    let searchableValue = "";
    if (Array.isArray(fieldValue)) {
      // Handle arrays (like attendees)
      searchableValue = fieldValue.join(" ");
    } else if (typeof fieldValue === "object") {
      // Handle objects
      searchableValue = JSON.stringify(fieldValue);
    } else {
      // Handle primitives
      searchableValue = String(fieldValue);
    }

    const compareValue = matchCase
      ? searchableValue
      : searchableValue.toLowerCase();
    const compareSearch = matchCase ? searchValue : searchValue.toLowerCase();

    if (regex) {
      try {
        const regExp = new RegExp(compareSearch, matchCase ? "" : "i");
        return regExp.test(compareValue);
      } catch {
        return false;
      }
    }

    return compareValue.includes(compareSearch);
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

    // Parse the search criteria into terms
    const searchTerms = this.parseSearchCriteria(processedCriteria);

    if (searchTerms.length === 0) {
      return [];
    }

    console.log("Parsed search terms:", searchTerms);

    // Search through all files in the vault
    const allFiles = this.app.vault.getMarkdownFiles();
    const searchPromises = allFiles.map(async (file: TFile) => {
      // Skip current file if specified
      if (currentFile && file.path === currentFile.path) {
        return null;
      }

      try {
        // Read file content once for all term matching
        const fileContent = await this.app.vault.cachedRead(file);

        // Check if file matches all search terms (AND logic)
        let matchesAll = true;
        for (const term of searchTerms) {
          if (!(await this.matchesTerm(file, term, fileContent))) {
            matchesAll = false;
            break;
          }
        }

        if (matchesAll) {
          return {
            file,
            score: 1, // All matching files have equal score
            path: file.path,
            basename: file.basename,
            content: fileContent,
          };
        }
      } catch (error) {
        console.warn(`Error processing file ${file.path}:`, error);
      }

      return null;
    });

    const searchResults = (await Promise.all(searchPromises))
      .filter((result): result is NonNullable<typeof result> => result !== null)
      .sort((a, b) => b.file.stat.mtime - a.file.stat.mtime) // Sort by date descending (newest first)
      .slice(0, 10); // Take top 10 results

    console.log("Obsidian search results:", searchResults);

    return searchResults;
  }
}
