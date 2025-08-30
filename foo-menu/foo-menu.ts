import { App, MarkdownView, Editor, EditorPosition, Notice } from 'obsidian';
import { RulesetManager } from '../core/ruleset-manager';
import MetaflyerPlugin from '../main';

export interface FooMenuItem {
  icon: string;
  label: string;
  key: string;
  checkbox: string;
}

export const FOO_MENU_ITEMS: FooMenuItem[] = [
  { icon: '[t]', label: 'Follow-up', key: 't', checkbox: 't' },
  { icon: '[?]', label: 'Question', key: '?', checkbox: '?' },
  { icon: '[i]', label: 'Insight', key: 'i', checkbox: 'i' },
  { icon: '[I]', label: 'Information', key: 'I', checkbox: 'I' },
  { icon: '[r]', label: 'Award', key: 'r', checkbox: 'r' }
];

export class FooMenu {
  private app: App;
  private plugin: MetaflyerPlugin;
  private rulesetManager: RulesetManager;
  private menuEl: HTMLElement | null = null;
  private currentEditor: Editor | null = null;
  private currentLine: number = -1;
  private isMenuOpen = false;
  private keydownHandler: (event: KeyboardEvent) => void;

  constructor(app: App, plugin: MetaflyerPlugin, rulesetManager: RulesetManager) {
    this.app = app;
    this.plugin = plugin;
    this.rulesetManager = rulesetManager;

    // Bind the keydown handler
    this.keydownHandler = this.handleKeydown.bind(this);
  }

  /**
   * Show the Foo Menu at the current cursor position
   */
  showMenu(): void {
    console.log('FooMenu: showMenu called');
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view || !view.editor) {
      console.log('FooMenu: No active markdown editor found');
      new Notice('No active markdown editor found');
      return;
    }

    // Check if the current note matches a ruleset with Foo Menu enabled
    const currentFile = view.file;
    if (!currentFile) {
      console.log('FooMenu: No current file');
      return;
    }

    const cache = this.app.metadataCache.getFileCache(currentFile);
    const frontmatter = cache?.frontmatter;
    console.log('FooMenu: showMenu frontmatter:', frontmatter);

    const evaluation = this.rulesetManager.evaluateMetadata(frontmatter);
    console.log('FooMenu: showMenu evaluation:', evaluation);

    if (!evaluation.matches || !evaluation.ruleset?.enableFooMenu) {
      console.log('FooMenu: Foo Menu not enabled for this note type');
      new Notice('Foo Menu not enabled for this note type');
      return;
    }

    if (this.isMenuOpen) {
      console.log('FooMenu: Menu already open, hiding it');
      this.hideMenu();
      return;
    }

    console.log('FooMenu: Creating menu');
    this.currentEditor = view.editor;
    this.currentLine = this.currentEditor.getCursor().line;

    this.createMenu();
    this.isMenuOpen = true;

    // Add global keydown listener with high priority (capture phase)
    document.addEventListener('keydown', this.keydownHandler, true);
  }

  /**
   * Hide the menu
   */
  hideMenu(): void {
    if (this.menuEl) {
      this.menuEl.remove();
      this.menuEl = null;
    }

    this.isMenuOpen = false;
    this.currentEditor = null;
    this.currentLine = -1;

    // Remove global keydown listener (capture phase)
    document.removeEventListener('keydown', this.keydownHandler, true);
  }

  /**
   * Create and display the menu
   */
  private createMenu(): void {
    console.log('FooMenu: createMenu called');
    if (!this.currentEditor) {
      console.log('FooMenu: No current editor');
      return;
    }

    // Get cursor position for menu placement
    const cursor = this.currentEditor.getCursor();
    console.log('FooMenu: Cursor position:', cursor);

    // Try multiple methods to get cursor coordinates
    let coords = null;

    // @ts-ignore - access CodeMirror instance
    const cm = this.currentEditor.cm;
    console.log('FooMenu: CodeMirror instance:', cm);

    // Method 1: Try CodeMirror 6 coordsAtPos
    if (cm?.coordsAtPos) {
      try {
        // Convert cursor position to offset
        const line = this.currentEditor.getLine(cursor.line);
        let offset = 0;
        for (let i = 0; i < cursor.line; i++) {
          offset += this.currentEditor.getLine(i).length + 1; // +1 for newline
        }
        offset += cursor.ch;
        coords = cm.coordsAtPos(offset);
        console.log('FooMenu: CM6 coordsAtPos with offset', offset, ':', coords);
      } catch (e) {
        console.log('FooMenu: CM6 coordsAtPos failed:', e);
      }
    }

    // Method 2: Try getting coordinates from cursor element
    if (!coords) {
      try {
        // @ts-ignore
        const cursorCoords = cm?.coordsChar?.(cursor);
        coords = cursorCoords;
        console.log('FooMenu: CM coordsChar:', coords);
      } catch (e) {
        console.log('FooMenu: coordsChar failed:', e);
      }
    }

    // Method 3: Calculate position manually using editor and line height
    if (!coords) {
      console.log('FooMenu: Using manual coordinate calculation');
      const editorEl = document.querySelector('.markdown-source-view.mod-cm6 .cm-content');
      if (editorEl) {
        const rect = editorEl.getBoundingClientRect();
        const lineHeight = 24; // Approximate line height
        const charWidth = 8; // Approximate character width

        coords = {
          top: rect.top + (cursor.line * lineHeight),
          left: rect.left + (cursor.ch * charWidth),
          bottom: rect.top + ((cursor.line + 1) * lineHeight),
          right: rect.left + ((cursor.ch + 1) * charWidth)
        };
        console.log('FooMenu: Manual coordinates:', coords);
      }
    }

    if (!coords) {
      console.log('FooMenu: All coordinate methods failed, using fallback position');
      // Fallback: position near the top-left of the editor
      const editorEl = document.querySelector('.markdown-source-view.mod-cm6');
      if (!editorEl) {
        console.log('FooMenu: No editor element found');
        return;
      }
      const rect = editorEl.getBoundingClientRect();
      const fallbackCoords = {
        top: rect.top + 100,
        left: rect.left + 100
      };
      console.log('FooMenu: Using fallback coordinates:', fallbackCoords);
      this.createMenuAt(fallbackCoords);
      return;
    }

    this.createMenuAt(coords);
  }

  /**
   * Create the menu at specific coordinates
   */
  private createMenuAt(coords: { top: number; left: number }): void {
    console.log('FooMenu: Creating menu at coordinates:', coords);

    // Create menu container with proper S-Checkboxes context
    this.menuEl = document.createElement('div');
    this.menuEl.className = 'foo-menu-container markdown-source-view mod-cm6';
    // Ensure we're not in the excluded alt-chkbx-off mode
    document.body.classList.remove('alt-chkbx-off');
    this.menuEl.style.cssText = `
      position: fixed;
      top: ${Math.max(60, coords.top - 60)}px;
      left: ${Math.max(10, coords.left)}px;
      background: var(--background-primary, #ffffff);
      border: 1px solid var(--background-modifier-border, #cccccc);
      border-radius: 8px;
      padding: 8px 12px;
      box-shadow: var(--shadow-l, 0 4px 8px rgba(0,0,0,0.2));
      z-index: 10000;
      display: flex;
      gap: 12px;
      align-items: center;
      font-size: 14px;
      color: var(--text-normal, #000000);
      min-width: 200px;
      max-width: 400px;
    `;

    console.log('FooMenu: Menu element created with styles:', this.menuEl.style.cssText);

    // Add menu items
    FOO_MENU_ITEMS.forEach((item) => {
      const itemEl = document.createElement('div');
      itemEl.className = 'foo-menu-item';
      itemEl.style.cssText = `
        display: flex;
        flex-direction: column;
        align-items: center;
        cursor: pointer;
        padding: 4px 6px;
        border-radius: 4px;
        transition: background-color 0.2s ease;
        min-width: 24px;
      `;

      // Create the proper structure for S-Checkboxes styling
      // The CSS targets: .markdown-source-view.mod-cm6 .task-list-item-checkbox[data-task=X]::after
      const iconEl = document.createElement('input');
      iconEl.type = 'checkbox';
      iconEl.className = 'task-list-item-checkbox';
      iconEl.checked = true; // Show as checked to display the style
      iconEl.readOnly = true; // Prevent actual checking/unchecking
      iconEl.setAttribute('data-task', item.checkbox);
      iconEl.style.cssText = `
        margin-bottom: 2px;
        cursor: pointer;
        pointer-events: none;
      `;

      // Create wrapper that matches the S-Checkboxes selector structure
      const checkboxWrapper = document.createElement('div');
      checkboxWrapper.className = 'HyperMD-list-line HyperMD-list-line-2 HyperMD-task-line cm-line';
      checkboxWrapper.setAttribute('data-task', item.checkbox);
      checkboxWrapper.style.cssText = `
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        align-items: center;
        justify-content: center;
      `;
      // Wrap checkbox in label to match working DOM structure
      const labelEl = document.createElement('label');
      labelEl.className = 'task-list-label';
      labelEl.appendChild(iconEl);
      checkboxWrapper.appendChild(labelEl);

      // Key label
      const keyEl = document.createElement('div');
      keyEl.textContent = item.key;
      keyEl.style.cssText = `
        font-size: 10px;
        color: var(--text-muted);
        font-family: var(--font-monospace);
      `;

      itemEl.appendChild(checkboxWrapper);
      itemEl.appendChild(keyEl);

      // Hover effects
      itemEl.addEventListener('mouseenter', () => {
        itemEl.style.backgroundColor = 'var(--background-modifier-hover)';
      });
      itemEl.addEventListener('mouseleave', () => {
        itemEl.style.backgroundColor = 'transparent';
      });

      // Click handler
      itemEl.addEventListener('click', () => {
        this.applyCheckbox(item.checkbox);
      });

      this.menuEl!.appendChild(itemEl);
    });

    // Add Clear option
    const clearEl = document.createElement('div');
    clearEl.className = 'foo-menu-item foo-menu-clear';
    clearEl.style.cssText = `
      display: flex;
      flex-direction: column;
      align-items: center;
      cursor: pointer;
      padding: 4px 6px;
      border-radius: 4px;
      transition: background-color 0.2s ease;
      border-left: 1px solid var(--background-modifier-border);
      padding-left: 12px;
      margin-left: 4px;
    `;

    // Clear Checkbox Icon (unchecked)
    const clearIconEl = document.createElement('input');
    clearIconEl.type = 'checkbox';
    clearIconEl.className = 'task-list-item-checkbox';
    clearIconEl.checked = false; // Show as unchecked for "clear" option
    clearIconEl.readOnly = true; // Prevent actual checking/unchecking
    clearIconEl.style.cssText = `
      margin-bottom: 2px;
      cursor: pointer;
      pointer-events: none;
    `;

    // Wrap clear checkbox with proper structure for S-Checkboxes styling
    const clearCheckboxWrapper = document.createElement('div');
    clearCheckboxWrapper.className = 'HyperMD-list-line HyperMD-list-line-2 HyperMD-task-line cm-line';
    clearCheckboxWrapper.setAttribute('data-task', ' ');
    clearCheckboxWrapper.style.cssText = `
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      align-items: center;
      justify-content: center;
    `;
    // Wrap clear checkbox in label to match working DOM structure
    const clearLabelEl = document.createElement('label');
    clearLabelEl.className = 'task-list-label';
    clearLabelEl.appendChild(clearIconEl);
    clearCheckboxWrapper.appendChild(clearLabelEl);

    const clearKeyEl = document.createElement('div');
    clearKeyEl.textContent = 'Clear';
    clearKeyEl.style.cssText = `
      font-size: 10px;
      color: var(--text-muted);
    `;

    clearEl.appendChild(clearCheckboxWrapper);
    clearEl.appendChild(clearKeyEl);

    clearEl.addEventListener('mouseenter', () => {
      clearEl.style.backgroundColor = 'var(--background-modifier-hover)';
    });
    clearEl.addEventListener('mouseleave', () => {
      clearEl.style.backgroundColor = 'transparent';
    });

    clearEl.addEventListener('click', () => {
      this.clearCheckbox();
    });

    this.menuEl.appendChild(clearEl);

    // Add to document
    document.body.appendChild(this.menuEl);
    console.log('FooMenu: Menu element added to DOM:', this.menuEl);
    console.log('FooMenu: Menu is now visible in DOM:', document.body.contains(this.menuEl));
  }

  /**
   * Handle keyboard input while menu is open
   */
  private handleKeydown(event: KeyboardEvent): void {
    if (!this.isMenuOpen) return;

    console.log('FooMenu: Key pressed while menu open:', event.key);

    // Always prevent default and stop propagation for any key when menu is open
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    // Handle Escape key
    if (event.key === 'Escape') {
      this.hideMenu();
      return;
    }

    // Handle menu item selection
    const item = FOO_MENU_ITEMS.find(item => item.key === event.key);
    if (item) {
      console.log('FooMenu: Applying checkbox:', item.checkbox);
      this.applyCheckbox(item.checkbox);
      return;
    }

    // Handle clear (Backspace or Delete)
    if (event.key === 'Backspace' || event.key === 'Delete') {
      console.log('FooMenu: Clearing checkbox');
      this.clearCheckbox();
      return;
    }

    // For any other key, just consume the event (already prevented above)
    console.log('FooMenu: Consumed key:', event.key);
  }

  /**
   * Apply a checkbox to the current line
   */
  private applyCheckbox(checkbox: string): void {
    if (!this.currentEditor) return;

    const lineText = this.currentEditor.getLine(this.currentLine);
    const newText = this.transformLine(lineText, checkbox);

    this.currentEditor.setLine(this.currentLine, newText);
    this.hideMenu();
  }

  /**
   * Clear checkbox from the current line
   */
  private clearCheckbox(): void {
    if (!this.currentEditor) return;

    const lineText = this.currentEditor.getLine(this.currentLine);
    const newText = this.clearCheckboxFromLine(lineText);

    this.currentEditor.setLine(this.currentLine, newText);
    this.hideMenu();
  }

  /**
   * Transform a line of text to include the specified checkbox
   */
  private transformLine(lineText: string, checkbox: string): string {
    const trimmed = lineText.trim();
    const leadingWhitespace = lineText.match(/^(\s*)/)?.[1] || '';

    console.log('FooMenu: transformLine input:', { lineText, trimmed, checkbox });

    // Case 1: Existing checkbox anywhere in line (- [x] text, 1. [x] text, [x] text, etc.)
    const existingCheckboxMatch = trimmed.match(/^(.*?)\[[^\]]*\]\s*(.*?)$/);
    if (existingCheckboxMatch) {
      console.log('FooMenu: Found existing checkbox, replacing');
      const before = existingCheckboxMatch[1];
      const after = existingCheckboxMatch[2];
      const result = `${leadingWhitespace}${before}[${checkbox}] ${after}`;
      console.log('FooMenu: Checkbox replacement result:', result);
      return result;
    }

    // Case 2: Unordered list without checkbox (- text, * text, + text)
    const unorderedMatch = trimmed.match(/^([-*+]\s*)(.*)/);
    if (unorderedMatch) {
      console.log('FooMenu: Adding checkbox to unordered list');
      const result = `${leadingWhitespace}${unorderedMatch[1]}[${checkbox}] ${unorderedMatch[2]}`;
      console.log('FooMenu: Unordered list result:', result);
      return result;
    }

    // Case 3: Numbered list without checkbox (1. text)
    const numberedMatch = trimmed.match(/^(\d+\.\s*)(.*)/);
    if (numberedMatch) {
      console.log('FooMenu: Adding checkbox to numbered list');
      const result = `${leadingWhitespace}${numberedMatch[1]}[${checkbox}] ${numberedMatch[2]}`;
      console.log('FooMenu: Numbered list result:', result);
      return result;
    }

    // Case 4: Plain text line
    console.log('FooMenu: Adding checkbox to plain text');
    const result = `${leadingWhitespace}- [${checkbox}] ${trimmed}`;
    console.log('FooMenu: Plain text result:', result);
    return result;
  }

  /**
   * Remove checkbox formatting from a line
   */
  private clearCheckboxFromLine(lineText: string): string {
    const trimmed = lineText.trim();
    const leadingWhitespace = lineText.match(/^(\s*)/)?.[1] || '';

    // Remove checkbox from list items
    const checkboxMatch = trimmed.match(/^(([-*+]|\d+\.)\s*)\[[^\]]*\]\s*(.*)/);
    if (checkboxMatch) {
      return `${leadingWhitespace}${checkboxMatch[1]}${checkboxMatch[3]}`;
    }

    // If it's a checkbox but not a list item, convert to plain text
    const standaloneCheckboxMatch = trimmed.match(/^\[[^\]]*\]\s*(.*)/);
    if (standaloneCheckboxMatch) {
      return `${leadingWhitespace}${standaloneCheckboxMatch[1]}`;
    }

    // No checkbox found, return as-is
    return lineText;
  }


  /**
   * Clean up event listeners and DOM elements
   */
  destroy(): void {
    this.hideMenu();
    document.removeEventListener('keydown', this.keydownHandler, true);
  }
}
