import { App, TFile } from 'obsidian';
import { PlaceholderProcessor } from './placeholder-processor';

export class SearchCriteriaProcessor {
	private app: App;

	constructor(app: App) {
		this.app = app;
	}

	processCriteriaPlaceholders(searchCriteria: string, frontmatter: Record<string, any>, file?: TFile): string {
		if (!searchCriteria) return '';

		// Process placeholders in the search criteria using the PlaceholderProcessor
		return PlaceholderProcessor.processPlaceholders(searchCriteria, frontmatter, file);
	}

	async searchWithCriteria(searchCriteria: string, frontmatter: Record<string, any>, currentFile?: TFile): Promise<TFile[]> {
		if (!searchCriteria) return [];

		// Process placeholders in the search criteria
		const processedCriteria = this.processCriteriaPlaceholders(searchCriteria, frontmatter, currentFile);
		
		// Parse the processed criteria into search conditions
		const conditions = this.parseSearchCriteria(processedCriteria);
		
		if (conditions.length === 0) return [];

		// Search through all markdown files
		const allFiles = this.app.vault.getMarkdownFiles();
		const matchingFiles: TFile[] = [];

		for (const file of allFiles) {
			// Skip the current file
			if (currentFile && file.path === currentFile.path) continue;

			const cache = this.app.metadataCache.getFileCache(file);
			const fileFrontmatter = cache?.frontmatter;

			if (!fileFrontmatter) continue;

			// Check if file matches all conditions
			if (this.matchesAllConditions(fileFrontmatter, conditions)) {
				matchingFiles.push(file);
			}
		}

		// Sort by modification time (most recent first)
		matchingFiles.sort((a, b) => b.stat.mtime - a.stat.mtime);

		return matchingFiles;
	}

	private parseSearchCriteria(criteria: string): SearchCondition[] {
		const conditions: SearchCondition[] = [];
		
		// Parse pattern like ["type":"O3"]["attendees":"Alice, Bob"]
		// This regex matches ["key":"value"] patterns
		const conditionPattern = /\["([^"]+)":"([^"]+)"\]/g;
		let match;

		while ((match = conditionPattern.exec(criteria)) !== null) {
			const key = match[1];
			const value = match[2];
			
			conditions.push({
				field: key,
				value: value,
				operator: 'equals' // Default to equals, can be extended later
			});
		}

		return conditions;
	}

	private matchesAllConditions(frontmatter: Record<string, any>, conditions: SearchCondition[]): boolean {
		for (const condition of conditions) {
			if (!this.matchesCondition(frontmatter, condition)) {
				return false;
			}
		}
		return true;
	}

	private matchesCondition(frontmatter: Record<string, any>, condition: SearchCondition): boolean {
		const fieldValue = frontmatter[condition.field];
		
		if (fieldValue === undefined || fieldValue === null) {
			return false;
		}

		switch (condition.operator) {
			case 'equals':
				return this.matchesValue(fieldValue, condition.value);
			case 'contains':
				return this.containsValue(fieldValue, condition.value);
			case 'starts_with':
				return this.startsWithValue(fieldValue, condition.value);
			default:
				return this.matchesValue(fieldValue, condition.value);
		}
	}

	private matchesValue(fieldValue: any, searchValue: string): boolean {
		if (Array.isArray(fieldValue)) {
			// For arrays, check if any item matches (case-insensitive)
			const searchValues = searchValue.split(',').map(v => v.trim().toLowerCase());
			return fieldValue.some(item => {
				const itemStr = String(item).toLowerCase();
				return searchValues.some(searchVal => 
					itemStr.includes(searchVal) || searchVal.includes(itemStr)
				);
			});
		} else {
			// For single values, do case-insensitive comparison
			const fieldStr = String(fieldValue).toLowerCase();
			const searchStr = searchValue.toLowerCase();
			return fieldStr === searchStr || fieldStr.includes(searchStr) || searchStr.includes(fieldStr);
		}
	}

	private containsValue(fieldValue: any, searchValue: string): boolean {
		if (Array.isArray(fieldValue)) {
			return fieldValue.some(item => 
				String(item).toLowerCase().includes(searchValue.toLowerCase())
			);
		} else {
			return String(fieldValue).toLowerCase().includes(searchValue.toLowerCase());
		}
	}

	private startsWithValue(fieldValue: any, searchValue: string): boolean {
		if (Array.isArray(fieldValue)) {
			return fieldValue.some(item => 
				String(item).toLowerCase().startsWith(searchValue.toLowerCase())
			);
		} else {
			return String(fieldValue).toLowerCase().startsWith(searchValue.toLowerCase());
		}
	}
}

interface SearchCondition {
	field: string;
	value: string;
	operator: 'equals' | 'contains' | 'starts_with';
}