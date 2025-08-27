import { MetaflyerSettings, Ruleset } from './settings';
import { parseYaml } from 'obsidian';

export interface RuleEvaluation {
	ruleset: Ruleset | null;
	matches: boolean;
	missingFields: string[];
	isComplete: boolean;
}

export class RulesetManager {
	private settings: MetaflyerSettings;

	constructor(settings: MetaflyerSettings) {
		this.settings = settings;
	}

	updateSettings(settings: MetaflyerSettings) {
		this.settings = settings;
	}

	evaluateMetadata(frontmatter: any): RuleEvaluation {
		if (!frontmatter) {
			return {
				ruleset: null,
				matches: false,
				missingFields: [],
				isComplete: false
			};
		}

		// Find a ruleset that matches ALL properties in metadata_match
		const matchingRuleset = this.findMatchingRuleset(frontmatter);
		
		if (matchingRuleset) {
			// Check if the trigger fields are still valid (not empty)
			const hasValidTriggerFields = this.hasValidTriggerFields(frontmatter, matchingRuleset);
			
			if (!hasValidTriggerFields) {
				// Ruleset matches but trigger fields became invalid/empty
				const invalidFields = this.getInvalidTriggerFields(frontmatter, matchingRuleset);
				return {
					ruleset: matchingRuleset,
					matches: false,
					missingFields: invalidFields,
					isComplete: false
				};
			}

			// Trigger fields are valid, now check for missing required fields
			const missingFields = this.getMissingFields(frontmatter, matchingRuleset);
			const isComplete = missingFields.length === 0;

			return {
				ruleset: matchingRuleset,
				matches: true,
				missingFields,
				isComplete
			};
		}

		// No ruleset matches at all
		return {
			ruleset: null,
			matches: false,
			missingFields: [],
			isComplete: false
		};
	}

	private findMatchingRuleset(frontmatter: any): Ruleset | null {
		for (const ruleset of this.settings.rulesets) {
			if (this.matchesMetadataConditions(frontmatter, ruleset.metadata_match)) {
				return ruleset;
			}
		}
		return null;
	}


	private matchesMetadataConditions(frontmatter: any, conditions: Record<string, any>): boolean {
		for (const [key, value] of Object.entries(conditions)) {
			if (frontmatter[key] !== value) {
				return false;
			}
		}
		return true;
	}

	private getMissingFields(frontmatter: any, ruleset: Ruleset): string[] {
		const missing: string[] = [];

		for (const field of ruleset.metadata) {
			if (field.required) {
				const value = frontmatter[field.name];
				if (this.isFieldEmpty(value, field.type)) {
					missing.push(field.name);
				}
			}
		}

		return missing;
	}

	private isFieldEmpty(value: any, type: string): boolean {
		if (value === undefined || value === null) {
			return true;
		}

		switch (type) {
			case 'string':
				return typeof value !== 'string' || value.trim() === '';
			case 'array':
				// Array must exist, be an array, and have at least one non-empty value
				if (!Array.isArray(value) || value.length === 0) {
					return true;
				}
				// Check if all values in array are empty/null/undefined
				return value.every(item => item === null || item === undefined || 
					(typeof item === 'string' && item.trim() === ''));
			case 'date':
				return typeof value !== 'string' || value.trim() === '';
			case 'number':
				return typeof value !== 'number' && (typeof value !== 'string' || isNaN(Number(value)));
			case 'boolean':
				return typeof value !== 'boolean';
			default:
				return false;
		}
	}

	autoPopulateMetadata(frontmatter: any, ruleset: Ruleset): Record<string, any> {
		const populated = { ...frontmatter };

		for (const field of ruleset.metadata) {
			if (!populated.hasOwnProperty(field.name) || this.isFieldEmpty(populated[field.name], field.type)) {
				populated[field.name] = this.getDefaultValue(field);
			}
		}

		return populated;
	}

	private getDefaultValue(field: any): any {
		switch (field.type) {
			case 'string':
				return '';
			case 'array':
				return [];
			case 'date':
				if (field.format) {
					return this.formatDate(new Date(), field.format);
				}
				return new Date().toISOString().split('T')[0];
			case 'number':
				return 0;
			case 'boolean':
				return false;
			default:
				return '';
		}
	}

	private formatDate(date: Date, format: string): string {
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const day = String(date.getDate()).padStart(2, '0');
		const hours = date.getHours();
		const minutes = String(date.getMinutes()).padStart(2, '0');
		const ampm = hours >= 12 ? 'PM' : 'AM';
		const hours12 = hours % 12 || 12;

		return format
			.replace('YYYY', String(year))
			.replace('MM', month)
			.replace('DD', day)
			.replace('hh', String(hours12).padStart(2, '0'))
			.replace('mm', minutes)
			.replace('a', ampm.toLowerCase());
	}

	getRulesets(): Ruleset[] {
		return this.settings.rulesets;
	}

	addRuleset(ruleset: Ruleset): void {
		this.settings.rulesets.push(ruleset);
	}

	updateRuleset(index: number, ruleset: Ruleset): void {
		if (index >= 0 && index < this.settings.rulesets.length) {
			this.settings.rulesets[index] = ruleset;
		}
	}

	deleteRuleset(index: number): void {
		if (index >= 0 && index < this.settings.rulesets.length) {
			this.settings.rulesets.splice(index, 1);
		}
	}

	private hasValidTriggerFields(frontmatter: any, ruleset: Ruleset): boolean {
		// Check if all trigger fields (metadata_match conditions) are valid
		for (const [key, expectedValue] of Object.entries(ruleset.metadata_match)) {
			const actualValue = frontmatter[key];
			
			// Field must exist and not be empty
			if (actualValue === undefined || actualValue === null) {
				return false;
			}
			
			// For strings, check if empty or just whitespace
			if (typeof expectedValue === 'string' && 
				(typeof actualValue !== 'string' || actualValue.trim() === '')) {
				return false;
			}
			
			// For arrays, must have at least one non-empty value
			if (Array.isArray(expectedValue) && 
				(!Array.isArray(actualValue) || actualValue.length === 0 ||
				 actualValue.every(item => item === null || item === undefined || 
					(typeof item === 'string' && item.trim() === '')))) {
				return false;
			}
		}
		
		return true;
	}

	private getInvalidTriggerFields(frontmatter: any, ruleset: Ruleset): string[] {
		const invalidFields: string[] = [];
		
		for (const [key, expectedValue] of Object.entries(ruleset.metadata_match)) {
			const actualValue = frontmatter[key];
			
			// Check if field is missing or empty
			if (actualValue === undefined || actualValue === null) {
				invalidFields.push(key);
				continue;
			}
			
			// For strings, check if empty
			if (typeof expectedValue === 'string' && 
				(typeof actualValue !== 'string' || actualValue.trim() === '')) {
				invalidFields.push(key);
				continue;
			}
			
			// For arrays, check if empty or all values are empty
			if (Array.isArray(expectedValue) && 
				(!Array.isArray(actualValue) || actualValue.length === 0 ||
				 actualValue.every(item => item === null || item === undefined || 
					(typeof item === 'string' && item.trim() === '')))) {
				invalidFields.push(key);
			}
		}
		
		return invalidFields;
	}
}