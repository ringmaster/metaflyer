import { App, TFile, Notice, MarkdownView, Component } from 'obsidian';
import { RulesetManager, RuleEvaluation } from '../core/ruleset-manager';
import { ErrorHandler } from '../core/error-handler';

export class MetadataEnforcer extends Component {
  private app: App;
  private rulesetManager: RulesetManager;
  private alertElements = new Map<string, HTMLElement>();
  private enableWarnings: boolean;

  constructor(app: App, rulesetManager: RulesetManager, enableWarnings: boolean = true) {
    super();
    this.app = app;
    this.rulesetManager = rulesetManager;
    this.enableWarnings = enableWarnings;
  }

  updateSettings(enableWarnings: boolean) {
    this.enableWarnings = enableWarnings;

    // If warnings are disabled, clear all existing alerts
    if (!enableWarnings) {
      this.clearAllAlerts();
    }
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

        // Only auto-populate if required fields are completely missing (not just empty)
        // This prevents auto-population when fields exist but are empty (like attendees: [])
        const hasMissingRequiredFields = evaluation.ruleset.metadata.some(metaField =>
          metaField.required && !frontmatter.hasOwnProperty(metaField.name)
        );

        return hasMissingRequiredFields;
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

    // Skip showing alerts if warnings are disabled
    if (!this.enableWarnings) {
      return;
    }

    if (!evaluation.matches && !evaluation.ruleset) {
      this.showAlert(fileKey, '⚠️ Properties match no rulesets', 'warning');
    } else if (!evaluation.matches && evaluation.ruleset) {
      // Note has trigger fields but they're invalid/empty
      const invalidFieldsText = evaluation.missingFields.join(', ');
      const message = `⚠️ ${evaluation.ruleset.name} - Invalid trigger fields: • ${invalidFieldsText}`;
      this.showAlert(fileKey, message, 'warning');
    } else if (!evaluation.isComplete && evaluation.ruleset) {
      const missingFieldsText = evaluation.missingFields.join(', ');
      const message = `⚠️ ${evaluation.ruleset.name} - Missing Values: • ${missingFieldsText}`;
      this.showAlert(fileKey, message, 'warning');
    } else if (evaluation.isComplete && evaluation.ruleset) {
      // Only show organize alert if there's something to organize
      const hasAutoTitle = evaluation.ruleset.autoTitleMode !== 'never' && evaluation.ruleset.title;
      const hasAutoMove = evaluation.ruleset.enableAutoMove !== false && evaluation.ruleset.path;
      
      if (hasAutoTitle || hasAutoMove) {
        const { AutoOrganizer } = await import('../organization/auto-organizer');
        const autoOrganizer = new AutoOrganizer(this.app, this.rulesetManager);
        const isOrganized = await autoOrganizer.checkIfNoteIsOrganized(file);

        if (!isOrganized) {
          const message = `✅ ${evaluation.ruleset.name}`;
          this.showAlert(fileKey, message, 'success', file);
        }
      }
    }
  }

  private showAlert(fileKey: string, message: string, type: 'warning' | 'success', file?: TFile) {
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!activeView || activeView.file?.path !== fileKey) return;

    // Check if alert already exists to prevent duplicates
    if (this.alertElements.has(fileKey)) {
      const existingAlert = this.alertElements.get(fileKey);
      if (existingAlert && existingAlert.textContent === message) {
        return; // Same alert already exists
      }
    }

    const editor = activeView.editor;
    const editorElement = (editor as any).cm?.dom;
    if (!editorElement) return;

    const alertElement = document.createElement('div');
    alertElement.className = `metaflyer-alert metaflyer-alert-${type}`;

    if (type === 'success' && file) {
      // Create success alert with organize button
      const textSpan = document.createElement('span');
      textSpan.textContent = message;
      alertElement.appendChild(textSpan);

      const organizeButton = document.createElement('button');
      organizeButton.textContent = 'Organize';
      organizeButton.className = 'metaflyer-organize-button';
      organizeButton.addEventListener('click', async () => {
        const { AutoOrganizer } = await import('../organization/auto-organizer');
        const autoOrganizer = new AutoOrganizer(this.app, this.rulesetManager);
        await autoOrganizer.organizeNote(file);
      });

      alertElement.appendChild(organizeButton);
    } else {
      alertElement.textContent = message;
    }

    if (type === 'warning') {
      editorElement.style.border = '2px solid #ffa500';
    }

    const container = editorElement.closest('.workspace-leaf-content');
    if (container) {
      // Remove any existing metaflyer alerts first
      const existingAlerts = container.querySelectorAll('.metaflyer-alert');
      existingAlerts.forEach((alert: Element) => alert.remove());

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

    // Clear all metaflyer alerts in the current view
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (activeView && activeView.file?.path === fileKey) {
      const editor = activeView.editor;
      const editorElement = (editor as any).cm?.dom;
      if (editorElement) {
        editorElement.style.border = '';
        const container = editorElement.closest('.workspace-leaf-content');
        if (container) {
          const alerts = container.querySelectorAll('.metaflyer-alert');
          alerts.forEach((alert: Element) => alert.remove());
        }
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

  cleanup() {
    for (const [fileKey, alertElement] of this.alertElements) {
      alertElement.remove();
    }
    this.alertElements.clear();
  }

  private clearAllAlerts() {
    // Remove all alert elements
    for (const [fileKey, alertElement] of this.alertElements) {
      alertElement.remove();
    }
    this.alertElements.clear();

    // Clear all editor borders by checking all open markdown views
    const leaves = this.app.workspace.getLeavesOfType('markdown');
    for (const leaf of leaves) {
      const view = leaf.view as MarkdownView;
      if (view && view.editor) {
        const editorElement = (view.editor as any).cm?.dom;
        if (editorElement) {
          editorElement.style.border = '';
          const container = editorElement.closest('.workspace-leaf-content');
          if (container) {
            const alerts = container.querySelectorAll('.metaflyer-alert');
            alerts.forEach((alert: Element) => alert.remove());
          }
        }
      }
    }
  }
}
