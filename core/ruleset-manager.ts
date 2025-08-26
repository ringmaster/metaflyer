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

		const matchingRuleset = this.findMatchingRuleset(frontmatter);
		
		if (!matchingRuleset) {
			return {
				ruleset: null,
				matches: false,
				missingFields: [],
				isComplete: false
			};
		}

		const missingFields = this.getMissingFields(frontmatter, matchingRuleset);
		const isComplete = missingFields.length === 0;

		return {
			ruleset: matchingRuleset,
			matches: true,
			missingFields,
			isComplete
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
				return !Array.isArray(value) || value.length === 0;
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
}