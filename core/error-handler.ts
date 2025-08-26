import { Notice } from 'obsidian';

export class ErrorHandler {
	static handleError(error: Error, context: string, showNotice: boolean = true): void {
		console.error(`Metaflyer Error in ${context}:`, error);
		
		if (showNotice) {
			new Notice(`Metaflyer: ${context} failed. Check console for details.`);
		}
	}

	static handleYamlError(error: Error, content?: string): boolean {
		console.warn('Metaflyer: Invalid YAML in frontmatter:', error);
		
		if (content) {
			console.warn('Problematic content:', content);
		}
		
		return false;
	}

	static handleFileError(error: Error, filePath: string, operation: string): void {
		console.error(`Metaflyer: ${operation} failed for ${filePath}:`, error);
		new Notice(`Failed to ${operation} file: ${filePath}`);
	}

	static validateRuleset(ruleset: any): string[] {
		const errors: string[] = [];

		if (!ruleset.name || typeof ruleset.name !== 'string') {
			errors.push('Ruleset name is required and must be a string');
		}

		if (!ruleset.metadata_match || typeof ruleset.metadata_match !== 'object') {
			errors.push('metadata_match is required and must be an object');
		}

		if (!Array.isArray(ruleset.metadata)) {
			errors.push('metadata must be an array');
		} else {
			for (let i = 0; i < ruleset.metadata.length; i++) {
				const field = ruleset.metadata[i];
				if (!field.name || typeof field.name !== 'string') {
					errors.push(`Metadata field at index ${i} must have a name`);
				}
				if (!field.type || !['string', 'array', 'date', 'number', 'boolean'].includes(field.type)) {
					errors.push(`Metadata field '${field.name}' has invalid type`);
				}
			}
		}

		return errors;
	}

	static sanitizeInput(input: string): string {
		return input
			.replace(/[<>:"/\\|?*]/g, '')
			.replace(/\s+/g, ' ')
			.trim();
	}
}