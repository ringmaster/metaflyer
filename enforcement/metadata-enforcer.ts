import { App, TFile, Notice, MarkdownView, Component } from 'obsidian';
import { RulesetManager, RuleEvaluation } from '../core/ruleset-manager';
import { ErrorHandler } from '../core/error-handler';

export class MetadataEnforcer extends Component {
	private app: App;
	private rulesetManager: RulesetManager;
	private alertElements = new Map<string, HTMLElement>();

	constructor(app: App, rulesetManager: RulesetManager) {
		super();
		this.app = app;
		this.rulesetManager = rulesetManager;
	}

	async evaluateFile(file: TFile) {
		try {
			if (!file || file.extension !== 'md') return;

			const cache = this.app.metadataCache.getFileCache(file);
			const frontmatter = cache?.frontmatter;

			if (cache?.frontmatterPosition && frontmatter === null) {
				this.showAlert(file.path, '⚠️ Invalid YAML frontmatter detected', 'warning');
				return;
			}

			const evaluation = this.rulesetManager.evaluateMetadata(frontmatter);
			
			if (this.shouldAutoPopulate(frontmatter, evaluation)) {
				await this.autoPopulateMetadata(file, evaluation);
				return;
			}

			await this.updateVisualFeedback(file, evaluation);
		} catch (error) {
			ErrorHandler.handleError(error as Error, `evaluating file ${file.path}`, false);
		}
	}

	private shouldAutoPopulate(frontmatter: any, evaluation: RuleEvaluation): boolean {
		if (!evaluation.matches || !evaluation.ruleset) return false;

		const triggerFields = Object.keys(evaluation.ruleset.metadata_match);
		
		for (const field of triggerFields) {
			if (frontmatter && frontmatter.hasOwnProperty(field) && 
				frontmatter[field] === evaluation.ruleset.metadata_match[field]) {
				
				const hasEmptyRequiredFields = evaluation.ruleset.metadata.some(metaField => 
					metaField.required && 
					(!frontmatter.hasOwnProperty(metaField.name) || 
					 this.isFieldEmpty(frontmatter[metaField.name], metaField.type))
				);

				return hasEmptyRequiredFields;
			}
		}

		return false;
	}

	private async autoPopulateMetadata(file: TFile, evaluation: RuleEvaluation) {
		if (!evaluation.ruleset) return;

		const cache = this.app.metadataCache.getFileCache(file);
		const currentFrontmatter = cache?.frontmatter || {};

		const populatedMetadata = this.rulesetManager.autoPopulateMetadata(
			currentFrontmatter, 
			evaluation.ruleset
		);

		await this.updateFileFrontmatter(file, populatedMetadata);
	}

	private async updateFileFrontmatter(file: TFile, frontmatter: Record<string, any>) {
		const content = await this.app.vault.read(file);
		const lines = content.split('\n');

		let frontmatterStart = -1;
		let frontmatterEnd = -1;

		for (let i = 0; i < lines.length; i++) {
			if (lines[i].trim() === '---') {
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
			const beforeFrontmatter = lines.slice(0, frontmatterStart);
			const afterFrontmatter = lines.slice(frontmatterEnd + 1);
			newContent = [
				...beforeFrontmatter,
				'---',
				yamlContent,
				'---',
				...afterFrontmatter
			].join('\n');
		} else {
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
		
		return lines.join('\n');
	}

	private escapeYamlValue(value: any): string {
		if (typeof value === 'string') {
			if (value.includes(':') || value.includes('"') || value.includes("'") || 
				value.includes('\n') || value.includes('#')) {
				return `"${value.replace(/"/g, '\\"')}"`;
			}
		}
		return String(value);
	}

	private async updateVisualFeedback(file: TFile, evaluation: RuleEvaluation) {
		const fileKey = file.path;
		
		this.clearAlert(fileKey);

		if (!evaluation.matches) {
			this.showAlert(fileKey, '⚠️ Metadata is missing', 'warning');
		} else if (!evaluation.isComplete && evaluation.ruleset) {
			const missingFieldsText = evaluation.missingFields.join(', ');
			const message = `⚠️ ${evaluation.ruleset.name} - Missing Values: • ${missingFieldsText}`;
			this.showAlert(fileKey, message, 'warning');
		} else if (evaluation.isComplete && evaluation.ruleset) {
			const autoOrganizer = new (await import('../organization/auto-organizer')).AutoOrganizer(this.app, this.rulesetManager);
			const isOrganized = await autoOrganizer.checkIfNoteIsOrganized(file);
			
			if (!isOrganized) {
				const message = `✅ ${evaluation.ruleset.name} Complete - Ready to Organize [Rename & Move] (Ctrl+Shift+M)`;
				this.showAlert(fileKey, message, 'success');
			}
		}
	}

	private showAlert(fileKey: string, message: string, type: 'warning' | 'success') {
		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!activeView || activeView.file?.path !== fileKey) return;

		const editor = activeView.editor;
		const editorElement = (editor as any).cm?.dom;
		if (!editorElement) return;

		const alertElement = document.createElement('div');
		alertElement.className = `metaflyer-alert metaflyer-alert-${type}`;
		alertElement.textContent = message;

		if (type === 'warning') {
			editorElement.style.border = '2px solid #ffa500';
		}

		const container = editorElement.closest('.workspace-leaf-content');
		if (container) {
			container.insertBefore(alertElement, container.firstChild);
			this.alertElements.set(fileKey, alertElement);
		}
	}

	private clearAlert(fileKey: string) {
		const existingAlert = this.alertElements.get(fileKey);
		if (existingAlert) {
			existingAlert.remove();
			this.alertElements.delete(fileKey);
		}

		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (activeView && activeView.file?.path === fileKey) {
			const editor = activeView.editor;
			const editorElement = (editor as any).cm?.dom;
			if (editorElement) {
				editorElement.style.border = '';
			}
		}
	}

	async evaluateAllFiles() {
		const files = this.app.vault.getMarkdownFiles();
		for (const file of files) {
			await this.evaluateFile(file);
		}
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

	cleanup() {
		for (const [fileKey, alertElement] of this.alertElements) {
			alertElement.remove();
		}
		this.alertElements.clear();
	}
}