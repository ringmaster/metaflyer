import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import MetaflyerPlugin from '../main';
import { Ruleset, MetadataField } from '../core/settings';

export class MetaflyerSettingsTab extends PluginSettingTab {
	plugin: MetaflyerPlugin;

	constructor(app: App, plugin: MetaflyerPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: 'Metaflyer Settings' });

		this.createRulesetsSection();
		this.createTestingSection();
	}

	private createRulesetsSection() {
		const { containerEl } = this;

		containerEl.createEl('h3', { text: 'Rulesets' });

		const rulesets = this.plugin.settings.rulesets;

		for (let i = 0; i < rulesets.length; i++) {
			this.createRulesetEditor(rulesets[i], i);
		}

		new Setting(containerEl)
			.setName('Add New Ruleset')
			.setDesc('Create a new metadata ruleset')
			.addButton(button => {
				button.setButtonText('Add Ruleset')
					.onClick(() => {
						const newRuleset: Ruleset = {
							name: 'New Ruleset',
							metadata_match: {},
							metadata: [],
							title: '',
							path: '',
							behaviors: {}
						};
						this.plugin.settings.rulesets.push(newRuleset);
						this.plugin.saveSettings();
						this.display();
					});
			});
	}

	private createRulesetEditor(ruleset: Ruleset, index: number) {
		const { containerEl } = this;

		const rulesetContainer = containerEl.createDiv('metaflyer-ruleset-container');
		rulesetContainer.style.border = '1px solid var(--background-modifier-border)';
		rulesetContainer.style.padding = '15px';
		rulesetContainer.style.marginBottom = '15px';
		rulesetContainer.style.borderRadius = '5px';

		rulesetContainer.createEl('h4', { text: `Ruleset: ${ruleset.name}` });

		new Setting(rulesetContainer)
			.setName('Name')
			.setDesc('Name for this ruleset')
			.addText(text => {
				text.setValue(ruleset.name)
					.onChange(async (value) => {
						ruleset.name = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(rulesetContainer)
			.setName('Metadata Match')
			.setDesc('JSON object defining when this ruleset applies (e.g., {"type": "O3"})')
			.addTextArea(text => {
				text.setValue(JSON.stringify(ruleset.metadata_match, null, 2))
					.onChange(async (value) => {
						try {
							ruleset.metadata_match = JSON.parse(value);
							await this.plugin.saveSettings();
						} catch (e) {
							console.error('Invalid JSON in metadata match:', e);
						}
					});
				text.inputEl.rows = 3;
			});

		new Setting(rulesetContainer)
			.setName('Title Template')
			.setDesc('Template for auto-generated titles (use {fieldName} placeholders)')
			.addText(text => {
				text.setValue(ruleset.title || '')
					.onChange(async (value) => {
						ruleset.title = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(rulesetContainer)
			.setName('Path Template')
			.setDesc('Template for auto-organization path (use {fieldName} placeholders)')
			.addText(text => {
				text.setValue(ruleset.path || '')
					.onChange(async (value) => {
						ruleset.path = value;
						await this.plugin.saveSettings();
					});
			});

		const metadataContainer = rulesetContainer.createDiv();
		metadataContainer.createEl('h5', { text: 'Required Metadata Fields' });

		for (let i = 0; i < ruleset.metadata.length; i++) {
			this.createMetadataFieldEditor(metadataContainer, ruleset.metadata[i], i, ruleset);
		}

		new Setting(metadataContainer)
			.setName('Add Metadata Field')
			.addButton(button => {
				button.setButtonText('Add Field')
					.onClick(() => {
						const newField: MetadataField = {
							name: 'new_field',
							type: 'string',
							required: true
						};
						ruleset.metadata.push(newField);
						this.plugin.saveSettings();
						this.display();
					});
			});

		new Setting(rulesetContainer)
			.setName('Delete Ruleset')
			.setDesc('Remove this ruleset permanently')
			.addButton(button => {
				button.setButtonText('Delete')
					.setWarning()
					.onClick(() => {
						this.plugin.settings.rulesets.splice(index, 1);
						this.plugin.saveSettings();
						this.display();
					});
			});
	}

	private createMetadataFieldEditor(container: HTMLElement, field: MetadataField, fieldIndex: number, ruleset: Ruleset) {
		const fieldContainer = container.createDiv();
		fieldContainer.style.border = '1px solid var(--background-modifier-border-focus)';
		fieldContainer.style.padding = '10px';
		fieldContainer.style.marginBottom = '10px';
		fieldContainer.style.borderRadius = '3px';

		new Setting(fieldContainer)
			.setName('Field Name')
			.addText(text => {
				text.setValue(field.name)
					.onChange(async (value) => {
						field.name = value;
						await this.plugin.saveSettings();
					});
			})
			.addDropdown(dropdown => {
				dropdown.addOption('string', 'String')
					.addOption('array', 'Array')
					.addOption('date', 'Date')
					.addOption('number', 'Number')
					.addOption('boolean', 'Boolean')
					.setValue(field.type)
					.onChange(async (value: any) => {
						field.type = value;
						await this.plugin.saveSettings();
					});
			})
			.addToggle(toggle => {
				toggle.setValue(field.required)
					.setTooltip('Required field')
					.onChange(async (value) => {
						field.required = value;
						await this.plugin.saveSettings();
					});
			})
			.addButton(button => {
				button.setButtonText('Remove')
					.setWarning()
					.onClick(() => {
						ruleset.metadata.splice(fieldIndex, 1);
						this.plugin.saveSettings();
						this.display();
					});
			});

		if (field.type === 'date') {
			new Setting(fieldContainer)
				.setName('Date Format')
				.setDesc('Format string (e.g., YYYY-MM-DD, YYYY-MM-DD hh:mma)')
				.addText(text => {
					text.setValue(field.format || '')
						.onChange(async (value) => {
							field.format = value;
							await this.plugin.saveSettings();
						});
				});
		}
	}

	private createTestingSection() {
		const { containerEl } = this;

		containerEl.createEl('h3', { text: 'Testing' });

		const testContainer = containerEl.createDiv();
		testContainer.style.border = '1px solid var(--background-modifier-border)';
		testContainer.style.padding = '15px';
		testContainer.style.borderRadius = '5px';

		let testFrontmatter = '';
		let testResults = testContainer.createDiv();

		new Setting(testContainer)
			.setName('Test Frontmatter')
			.setDesc('Enter YAML frontmatter to test against your rulesets')
			.addTextArea(text => {
				text.setPlaceholder('type: O3\nattendees: []\ndate: 2024-01-01')
					.onChange((value) => {
						testFrontmatter = value;
					});
				text.inputEl.rows = 5;
			});

		new Setting(testContainer)
			.setName('Test Rules')
			.addButton(button => {
				button.setButtonText('Test')
					.onClick(() => {
						this.runRulesetTest(testFrontmatter, testResults);
					});
			});
	}

	private runRulesetTest(frontmatterText: string, resultsContainer: HTMLElement) {
		resultsContainer.empty();

		try {
			let frontmatter: any;
			if (frontmatterText.trim()) {
				const yaml = require('yaml');
				frontmatter = yaml.parse(frontmatterText);
			} else {
				frontmatter = {};
			}

			const evaluation = this.plugin.rulesetManager.evaluateMetadata(frontmatter);

			resultsContainer.createEl('h4', { text: 'Test Results' });

			const resultsList = resultsContainer.createEl('ul');

			if (!evaluation.matches) {
				resultsList.createEl('li', { text: '❌ No matching ruleset found' });
			} else if (evaluation.ruleset) {
				resultsList.createEl('li', { text: `✅ Matches ruleset: ${evaluation.ruleset.name}` });
				
				if (evaluation.isComplete) {
					resultsList.createEl('li', { text: '✅ All required fields present' });
				} else {
					resultsList.createEl('li', { text: `❌ Missing fields: ${evaluation.missingFields.join(', ')}` });
				}

				if (evaluation.ruleset.title) {
					const generatedTitle = this.plugin.rulesetManager.autoPopulateMetadata(frontmatter, evaluation.ruleset);
					// Process title with populated metadata
					const titleResult = evaluation.ruleset.title.replace(/\{([^}]+)\}/g, (match, field) => {
						return generatedTitle[field] || match;
					});
					resultsList.createEl('li', { text: `📝 Generated title: "${titleResult}"` });
				}

				if (evaluation.ruleset.path) {
					const generatedMeta = this.plugin.rulesetManager.autoPopulateMetadata(frontmatter, evaluation.ruleset);
					const pathResult = evaluation.ruleset.path.replace(/\{([^}]+)\}/g, (match, field) => {
						return generatedMeta[field] || match;
					});
					resultsList.createEl('li', { text: `📁 Generated path: "${pathResult}"` });
				}
			}

		} catch (error) {
			resultsContainer.createEl('p', { 
				text: `Error parsing YAML: ${error.message}`,
				attr: { style: 'color: var(--text-error);' }
			});
		}
	}
}