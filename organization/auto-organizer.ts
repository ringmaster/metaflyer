import { App, TFile, Notice, TFolder } from 'obsidian';
import { RulesetManager } from '../core/ruleset-manager';
import { PlaceholderProcessor } from '../core/placeholder-processor';
import { ErrorHandler } from '../core/error-handler';

export class AutoOrganizer {
	private app: App;
	private rulesetManager: RulesetManager;

	constructor(app: App, rulesetManager: RulesetManager) {
		this.app = app;
		this.rulesetManager = rulesetManager;
	}

	async organizeNote(file: TFile): Promise<boolean> {
		try {
			const cache = this.app.metadataCache.getFileCache(file);
			const frontmatter = cache?.frontmatter;

			if (!frontmatter) {
				new Notice('No frontmatter found in this note');
				return false;
			}

			const evaluation = this.rulesetManager.evaluateMetadata(frontmatter);

			if (!evaluation.matches || !evaluation.ruleset) {
				new Notice('No matching ruleset found for this note');
				return false;
			}

			if (!evaluation.isComplete) {
				const missingFields = evaluation.missingFields.join(', ');
				new Notice(`Cannot organize: Missing required fields: ${missingFields}`);
				return false;
			}

			let newTitle = file.basename;
			let newPath = file.parent?.path || '';

			if (evaluation.ruleset.title) {
				newTitle = PlaceholderProcessor.processPlaceholders(
					evaluation.ruleset.title, 
					frontmatter
				);
				newTitle = PlaceholderProcessor.sanitizeForFilename(newTitle);
			}

			if (evaluation.ruleset.path) {
				newPath = PlaceholderProcessor.processPlaceholders(
					evaluation.ruleset.path, 
					frontmatter
				);
				newPath = PlaceholderProcessor.sanitizeForPath(newPath);
			}

			const fullNewPath = `${newPath}/${newTitle}.md`;

			if (file.path === fullNewPath) {
				new Notice('Note is already in the correct location with the correct title');
				return true;
			}

			await this.ensurePathExists(newPath);

			const finalPath = await this.handleCollisions(fullNewPath);
			
			await this.app.vault.rename(file, finalPath);
			
			new Notice(`Note organized: ${finalPath}`);
			return true;

		} catch (error) {
			ErrorHandler.handleError(error as Error, 'organizing note');
			return false;
		}
	}

	private async ensurePathExists(path: string): Promise<void> {
		if (!path || path === '/' || path === '') return;

		const normalizedPath = path.replace(/^\/+|\/+$/g, '');
		
		if (!normalizedPath) return;

		const segments = normalizedPath.split('/');
		let currentPath = '';

		for (const segment of segments) {
			currentPath = currentPath ? `${currentPath}/${segment}` : segment;
			
			const folder = this.app.vault.getAbstractFileByPath(currentPath);
			
			if (!folder) {
				await this.app.vault.createFolder(currentPath);
			} else if (!(folder instanceof TFolder)) {
				throw new Error(`Path conflict: ${currentPath} exists but is not a folder`);
			}
		}
	}

	private async handleCollisions(desiredPath: string): Promise<string> {
		let finalPath = desiredPath;
		let counter = 1;

		while (this.app.vault.getAbstractFileByPath(finalPath)) {
			const pathParts = desiredPath.split('/');
			const filename = pathParts.pop() || '';
			const directory = pathParts.join('/');
			
			const nameWithoutExt = filename.replace(/\.md$/, '');
			const numberedName = `${nameWithoutExt} ${counter}.md`;
			
			finalPath = directory ? `${directory}/${numberedName}` : numberedName;
			counter++;
		}

		return finalPath;
	}

	async checkIfNoteIsOrganized(file: TFile): Promise<boolean> {
		const cache = this.app.metadataCache.getFileCache(file);
		const frontmatter = cache?.frontmatter;

		if (!frontmatter) return false;

		const evaluation = this.rulesetManager.evaluateMetadata(frontmatter);

		if (!evaluation.matches || !evaluation.ruleset || !evaluation.isComplete) {
			return false;
		}

		let expectedTitle = file.basename;
		let expectedPath = file.parent?.path || '';

		if (evaluation.ruleset.title) {
			expectedTitle = PlaceholderProcessor.processPlaceholders(
				evaluation.ruleset.title, 
				frontmatter
			);
			expectedTitle = PlaceholderProcessor.sanitizeForFilename(expectedTitle);
		}

		if (evaluation.ruleset.path) {
			expectedPath = PlaceholderProcessor.processPlaceholders(
				evaluation.ruleset.path, 
				frontmatter
			);
			expectedPath = PlaceholderProcessor.sanitizeForPath(expectedPath);
		}

		const expectedFullPath = `${expectedPath}/${expectedTitle}.md`;
		
		return file.path === expectedFullPath;
	}
}