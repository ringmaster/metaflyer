import { Plugin, TFile, Notice, MarkdownView } from 'obsidian';
import { MetaflyerSettings, DEFAULT_SETTINGS } from './core/settings';
import { MetaflyerSettingsTab } from './settings/settings-tab';
import { RulesetManager } from './core/ruleset-manager';
import { MetadataEnforcer } from './enforcement/metadata-enforcer';
import { AutoOrganizer } from './organization/auto-organizer';

export default class MetaflyerPlugin extends Plugin {
	settings: MetaflyerSettings;
	rulesetManager: RulesetManager;
	metadataEnforcer: MetadataEnforcer;
	autoOrganizer: AutoOrganizer;

	async onload() {
		await this.loadSettings();

		this.rulesetManager = new RulesetManager(this.settings);
		this.metadataEnforcer = new MetadataEnforcer(this.app, this.rulesetManager);
		this.autoOrganizer = new AutoOrganizer(this.app, this.rulesetManager);

		this.addSettingTab(new MetaflyerSettingsTab(this.app, this));

		this.addCommand({
			id: 'organize-note',
			name: 'Organize Note (Rename & Move)',
			hotkeys: [{ modifiers: ['Ctrl', 'Shift'], key: 'M' }],
			checkCallback: (checking: boolean) => {
				const activeFile = this.app.workspace.getActiveFile();
				if (activeFile) {
					if (!checking) {
						this.autoOrganizer.organizeNote(activeFile);
					}
					return true;
				}
				return false;
			}
		});

		this.registerEvent(
			this.app.metadataCache.on('changed', (file: TFile) => {
				this.metadataEnforcer.evaluateFile(file);
			})
		);

		this.registerEvent(
			this.app.vault.on('create', (file: TFile) => {
				if (file.extension === 'md') {
					setTimeout(() => {
						this.metadataEnforcer.evaluateFile(file);
					}, 100);
				}
			})
		);

		this.registerEvent(
			this.app.vault.on('rename', (file: TFile, oldPath: string) => {
				if (file.extension === 'md') {
					this.metadataEnforcer.evaluateFile(file);
				}
			})
		);

		this.registerEvent(
			this.app.workspace.on('active-leaf-change', () => {
				const activeFile = this.app.workspace.getActiveFile();
				if (activeFile && activeFile.extension === 'md') {
					setTimeout(() => {
						this.metadataEnforcer.evaluateFile(activeFile);
					}, 50);
				}
			})
		);

		this.app.workspace.onLayoutReady(() => {
			this.metadataEnforcer.evaluateAllFiles();
		});
	}

	onunload() {
		this.metadataEnforcer?.cleanup();
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
		this.rulesetManager.updateSettings(this.settings);
	}
}