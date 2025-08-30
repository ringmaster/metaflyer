import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import MetaflyerPlugin from '../main';
import { Ruleset, MetadataField } from '../core/settings';
import { PlaceholderProcessor } from '../core/placeholder-processor';
import { OllamaClient, OllamaModel } from '../core/ollama-client';

export class MetaflyerSettingsTab extends PluginSettingTab {
  plugin: MetaflyerPlugin;
  private errorNotice: HTMLElement | null = null;

  constructor(app: App, plugin: MetaflyerPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'Metaflyer Settings' });

    this.createGeneralSettings();
    this.createRulesetsSection();
    this.createTestingSection();
  }

  private createGeneralSettings() {
    const { containerEl } = this;

    containerEl.createEl('h3', { text: 'General Settings' });

    new Setting(containerEl)
      .setName('Enable Warning Visibility')
      .setDesc('Show visual warnings and alerts for incomplete or missing properties')
      .addToggle(toggle => {
        toggle.setValue(this.plugin.settings.enableWarnings)
          .onChange(async (value) => {
            this.plugin.settings.enableWarnings = value;
            await this.plugin.saveSettings();
          });
      });

    this.createOllamaModelSetting(containerEl);
  }

  private async createOllamaModelSetting(containerEl: HTMLElement) {
    let dropdown: any;
    let errorNotice: HTMLElement | null = null;
    let refreshButton: HTMLButtonElement;

    const setting = new Setting(containerEl)
      .setName('Ollama Model')
      .setDesc('Select the Ollama model to use for AI suggestions')
      .addDropdown(drop => {
        dropdown = drop;
        dropdown.addOption('llama2', 'llama2 (default)')
          .setValue(this.plugin.settings.ollamaModel)
          .onChange(async (value: string) => {
            this.plugin.settings.ollamaModel = value;
            await this.plugin.saveSettings();
          });
      })
      .addButton(button => {
        refreshButton = button.buttonEl;
        button.setButtonText('↻')
          .setTooltip('Refresh model list')
          .onClick(async () => {
            await this.refreshOllamaModels(dropdown, button.buttonEl);
          });
        button.buttonEl.style.marginLeft = '8px';
        button.buttonEl.style.minWidth = '30px';
        button.buttonEl.style.padding = '4px 8px';
      });

    // Initial load of models
    await this.refreshOllamaModels(dropdown, refreshButton);
  }

  private async refreshOllamaModels(dropdown: any, refreshButton: HTMLButtonElement) {
    // Show loading state
    refreshButton.textContent = '⟳';
    refreshButton.disabled = true;

    try {
      // Check if Ollama is available first
      const isAvailable = await OllamaClient.isAvailable();

      if (!isAvailable) {
        this.showOllamaError(dropdown, refreshButton, 'Ollama not available. Make sure Ollama is running on localhost:11434.');
        return;
      }

      // Fetch models
      const models = await OllamaClient.getModels();

      if (models.length === 0) {
        this.showOllamaError(dropdown, refreshButton, 'No models found in Ollama. Install models using: ollama pull <model-name>');
        return;
      }

      // Clear existing options and add models
      dropdown.selectEl.innerHTML = '';

      models.forEach((model: OllamaModel) => {
        const option = dropdown.selectEl.createEl('option');
        option.value = model.name;
        option.text = model.name;
        if (model.name === this.plugin.settings.ollamaModel) {
          option.selected = true;
        }
      });

      // If current setting is not in the list, add it and select it
      const currentModel = this.plugin.settings.ollamaModel;
      const hasCurrentModel = models.some(m => m.name === currentModel);

      if (!hasCurrentModel && currentModel) {
        const option = dropdown.selectEl.createEl('option');
        option.value = currentModel;
        option.text = `${currentModel} (unavailable)`;
        option.selected = true;
      }

      // Enable dropdown and hide error
      dropdown.selectEl.disabled = false;
      this.hideOllamaError();

    } catch (error) {
      console.error('Error refreshing Ollama models:', error);
      this.showOllamaError(dropdown, refreshButton, 'Failed to connect to Ollama');
    } finally {
      // Restore button state
      refreshButton.textContent = '↻';
      refreshButton.disabled = false;
    }
  }

  private showOllamaError(dropdown: any, refreshButton: HTMLElement, message: string) {
    // Disable dropdown
    dropdown.selectEl.disabled = true;

    // Show error notice if not already shown
    if (!this.errorNotice) {
      const setting = refreshButton.closest('.setting-item');
      if (setting) {
        this.errorNotice = setting.createDiv();
        this.errorNotice.style.color = 'var(--text-error)';
        this.errorNotice.style.fontSize = '12px';
        this.errorNotice.style.marginTop = '4px';
      }
    }

    if (this.errorNotice) {
      this.errorNotice.textContent = `⚠️ ${message}`;
    }
  }

  private hideOllamaError() {
    if (this.errorNotice) {
      this.errorNotice.remove();
      this.errorNotice = null;
    }
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
              autoTitleMode: 'always',
              enableAutoMove: true,
              search_criteria: '',
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
    rulesetContainer.style.marginBottom = '15px';
    rulesetContainer.style.borderRadius = '5px';

    // Create collapsible header
    const headerContainer = rulesetContainer.createDiv('metaflyer-ruleset-header');
    headerContainer.style.padding = '15px';
    headerContainer.style.cursor = 'pointer';
    headerContainer.style.display = 'flex';
    headerContainer.style.alignItems = 'center';
    headerContainer.style.borderBottom = '1px solid var(--background-modifier-border)';

    const toggleIcon = headerContainer.createSpan('metaflyer-toggle-icon');
    toggleIcon.textContent = '▶';
    toggleIcon.style.marginRight = '8px';
    toggleIcon.style.fontSize = '12px';
    toggleIcon.style.transition = 'transform 0.2s ease';

    const titleEl = headerContainer.createEl('h4', { text: `${ruleset.name}` });
    titleEl.style.margin = '0';
    titleEl.style.flexGrow = '1';

    // Create content container (collapsed by default)
    const contentContainer = rulesetContainer.createDiv('metaflyer-ruleset-content');
    contentContainer.style.display = 'none';
    contentContainer.style.padding = '15px';

    // Toggle functionality
    let isExpanded = false;
    headerContainer.onclick = () => {
      isExpanded = !isExpanded;
      contentContainer.style.display = isExpanded ? 'block' : 'none';
      toggleIcon.style.transform = isExpanded ? 'rotate(90deg)' : 'rotate(0deg)';
    };

    new Setting(contentContainer)
      .setName('Name')
      .setDesc('Name for this ruleset')
      .addText(text => {
        text.setValue(ruleset.name)
          .onChange(async (value) => {
            ruleset.name = value;
            titleEl.textContent = value; // Update header title
            await this.plugin.saveSettings();
          });
      });

    new Setting(contentContainer)
      .setName('Properties Match')
      .setDesc('YAML object defining when this ruleset applies (e.g., type: O3)')
      .addTextArea(text => {
        // Convert to YAML for display
        const yamlValue = this.objectToYaml(ruleset.metadata_match);
        text.setValue(yamlValue)
          .onChange(async (value) => {
            try {
              ruleset.metadata_match = this.yamlToObject(value);
              await this.plugin.saveSettings();
            } catch (e) {
              console.error('Invalid YAML in properties match:', e);
            }
          });
        text.inputEl.rows = 3;
      });

    new Setting(contentContainer)
      .setName('Title Template')
      .setDesc('Template for auto-generated titles (use {fieldName} placeholders)')
      .addText(text => {
        text.setValue(ruleset.title || '')
          .onChange(async (value) => {
            ruleset.title = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(contentContainer)
      .setName('Path Template')
      .setDesc('Template for auto-organization path (use {fieldName} placeholders)')
      .addText(text => {
        text.setValue(ruleset.path || '')
          .onChange(async (value) => {
            ruleset.path = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(contentContainer)
      .setName('Search Criteria')
      .setDesc('Search pattern with placeholders (e.g., ["type":"{type}"]["attendees":"{attendees}"])')
      .addText(text => {
        text.setValue(ruleset.search_criteria || '')
          .onChange(async (value) => {
            ruleset.search_criteria = value;
            await this.plugin.saveSettings();
          });
        text.inputEl.style.width = '100%';
      });

    new Setting(contentContainer)
      .setName('Auto Title Mode')
      .setDesc('When to change note titles using the title template')
      .addDropdown(dropdown => {
        dropdown.addOption('never', 'Do not change')
          .addOption('if_unset', 'Change if unset')
          .addOption('always', 'Always change')
          .setValue(ruleset.autoTitleMode || 'always')
          .onChange(async (value: any) => {
            ruleset.autoTitleMode = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(contentContainer)
      .setName('Enable Auto Move')
      .setDesc('Automatically move notes to path location when organizing')
      .addToggle(toggle => {
        toggle.setValue(ruleset.enableAutoMove !== false)
          .onChange(async (value) => {
            ruleset.enableAutoMove = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(contentContainer)
      .setName('Search Result Count')
      .setDesc('Number of search results to show in sidebar (0 = disabled)')
      .addText(text => {
        text.setValue((ruleset.search_result_count || 0).toString())
          .onChange(async (value) => {
            const num = parseInt(value);
            ruleset.search_result_count = isNaN(num) ? 0 : Math.max(0, num);
            await this.plugin.saveSettings();
          });
        text.inputEl.type = 'number';
        text.inputEl.min = '0';
      });

    new Setting(contentContainer)
      .setName('Ollama Query Template')
      .setDesc('Template for AI suggestions (supports {current_file.*} and {#each results} syntax)')
      .addTextArea(text => {
        text.setValue(ruleset.ollama_query || '')
          .onChange(async (value) => {
            ruleset.ollama_query = value;
            await this.plugin.saveSettings();
          });
        text.inputEl.rows = 8;
        text.inputEl.style.width = '100%';
        text.inputEl.style.fontFamily = 'var(--font-monospace)';
      });

    const metadataContainer = contentContainer.createDiv();
    metadataContainer.createEl('h5', { text: 'Required Properties Fields' });

    for (let i = 0; i < ruleset.metadata.length; i++) {
      this.createMetadataFieldEditor(metadataContainer, ruleset.metadata[i], i, ruleset);
    }

    new Setting(metadataContainer)
      .setName('Add Properties Field')
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

    new Setting(contentContainer)
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

    // Create a container for the date format setting that we can show/hide
    const dateFormatContainer = fieldContainer.createDiv();

    const updateDateFormatVisibility = (fieldType: string) => {
      if (fieldType === 'date') {
        dateFormatContainer.style.display = 'block';
        if (dateFormatContainer.children.length === 0) {
          new Setting(dateFormatContainer)
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
      } else {
        dateFormatContainer.style.display = 'none';
        // Clear the format when not a date field
        if (field.format) {
          field.format = undefined;
          this.plugin.saveSettings();
        }
      }
    };

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
            updateDateFormatVisibility(value);
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

    // Initialize the date format visibility based on current field type
    updateDateFormatVisibility(field.type);
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
      .setName('Test Properties')
      .setDesc('Enter YAML properties to test against your rulesets')
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
        // Use the same YAML parser we use in the settings interface
        frontmatter = this.yamlToObject(frontmatterText);
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
          // Create a mock file object for testing
          const mockFile = {
            stat: {
              ctime: Date.now() // Use current time as creation time for testing
            }
          };
          // Process title with populated metadata using PlaceholderProcessor
          const titleResult = this.processPlaceholdersForTesting(evaluation.ruleset.title, generatedTitle, mockFile);
          resultsList.createEl('li', { text: `📝 Generated title: "${titleResult}"` });
        }

        if (evaluation.ruleset.path) {
          const generatedMeta = this.plugin.rulesetManager.autoPopulateMetadata(frontmatter, evaluation.ruleset);
          // Create a mock file object for testing
          const mockFile = {
            stat: {
              ctime: Date.now() // Use current time as creation time for testing
            }
          };
          const pathResult = this.processPlaceholdersForTesting(evaluation.ruleset.path, generatedMeta, mockFile);
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

  private objectToYaml(obj: Record<string, any>): string {
    if (!obj || Object.keys(obj).length === 0) {
      return '';
    }

    const lines: string[] = [];
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        // Quote strings that might need it
        if (value.includes(':') || value.includes('"') || value.includes("'") ||
          value.includes('\n') || value.includes('#') || /^\s/.test(value) || /\s$/.test(value)) {
          lines.push(`${key}: "${value.replace(/"/g, '\\"')}"`);
        } else {
          lines.push(`${key}: ${value}`);
        }
      } else if (Array.isArray(value)) {
        if (value.length === 0) {
          lines.push(`${key}: []`);
        } else {
          lines.push(`${key}:`);
          for (const item of value) {
            lines.push(`  - ${this.escapeYamlValue(item)}`);
          }
        }
      } else {
        lines.push(`${key}: ${value}`);
      }
    }
    return lines.join('\n');
  }

  private yamlToObject(yamlString: string): Record<string, any> {
    if (!yamlString.trim()) {
      return {};
    }

    // Simple YAML parser for basic key-value pairs
    const lines = yamlString.split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('#'));
    const result: Record<string, any> = {};

    let currentKey = '';
    let currentArray: any[] = [];
    let inArray = false;

    for (const line of lines) {
      if (line.startsWith('- ')) {
        // Array item
        if (inArray) {
          const value = line.substring(2).trim();
          currentArray.push(this.parseYamlValue(value));
        }
      } else if (line.includes(':')) {
        // Key-value pair
        if (inArray && currentKey) {
          result[currentKey] = currentArray;
          currentArray = [];
          inArray = false;
        }

        const colonIndex = line.indexOf(':');
        const key = line.substring(0, colonIndex).trim();
        const value = line.substring(colonIndex + 1).trim();

        if (value === '') {
          // Might be start of array
          currentKey = key;
          inArray = true;
          currentArray = [];
        } else if (value === '[]') {
          result[key] = [];
        } else {
          result[key] = this.parseYamlValue(value);
        }
      }
    }

    // Handle final array
    if (inArray && currentKey) {
      result[currentKey] = currentArray;
    }

    return result;
  }

  private parseYamlValue(value: string): any {
    // Remove quotes if present
    if ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))) {
      return value.slice(1, -1).replace(/\\"/g, '"');
    }

    // Try to parse as number
    if (!isNaN(Number(value))) {
      return Number(value);
    }

    // Parse booleans
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (value === 'null') return null;

    return value;
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

  private processPlaceholdersForTesting(template: string, frontmatter: Record<string, any>, mockFile: any): string {
    return PlaceholderProcessor.processPlaceholders(template, frontmatter, mockFile);
  }
}
