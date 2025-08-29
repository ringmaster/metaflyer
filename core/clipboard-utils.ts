import { Notice, MarkdownView } from "obsidian";
const TurndownService = require("turndown");
const { gfm } = require("turndown-plugin-gfm");

export class ClipboardUtils {
  /**
   * Reads rich text from clipboard and converts it to markdown
   */
  static async convertClipboardToMarkdown(): Promise<{
    content: string;
    wasConverted: boolean;
  } | null> {
    // Try modern clipboard API first
    try {
      if (navigator.clipboard && navigator.clipboard.read) {
        const clipboardItems = await navigator.clipboard.read();

        // Use for loop instead of for...of for ES2018 compatibility
        for (let i = 0; i < clipboardItems.length; i++) {
          const item = clipboardItems[i];
          // Try to get HTML content first
          if (item.types.includes("text/html")) {
            const htmlBlob = await item.getType("text/html");
            const htmlText = await htmlBlob.text();
            const markdown = this.htmlToMarkdown(htmlText);
            return { content: markdown, wasConverted: true };
          }
        }
      }

      // Fallback to readText if read() not available or no HTML
      if (navigator.clipboard && navigator.clipboard.readText) {
        const plainText = await navigator.clipboard.readText();
        return plainText ? { content: plainText, wasConverted: false } : null;
      }
    } catch (error) {
      console.error("Modern clipboard API failed:", error);
    }

    // Try legacy clipboard access as final fallback
    try {
      const legacyContent = this.tryLegacyClipboard();
      return legacyContent
        ? { content: legacyContent, wasConverted: false }
        : null;
    } catch (legacyError) {
      console.error("Legacy clipboard access failed:", legacyError);
      new Notice(
        "Unable to access clipboard. Try copying again or use Ctrl+V for regular paste.",
      );
      return null;
    }
  }

  /**
   * Legacy clipboard access method for older environments
   * Note: This method has limitations and may not work in all contexts
   */
  private static tryLegacyClipboard(): string | null {
    // Try to use document.execCommand as fallback (deprecated but more compatible)
    try {
      // Create a temporary textarea to paste into
      const tempTextArea = document.createElement("textarea");
      tempTextArea.style.position = "fixed";
      tempTextArea.style.left = "-9999px";
      tempTextArea.style.opacity = "0";
      document.body.appendChild(tempTextArea);

      tempTextArea.focus();
      tempTextArea.select();

      // Try to paste
      const successful = document.execCommand("paste");
      const content = tempTextArea.value;

      document.body.removeChild(tempTextArea);

      if (successful && content) {
        return content;
      }
    } catch (error) {
      console.error("execCommand paste failed:", error);
    }

    return null;
  }

  /**
   * Robust HTML to Markdown converter using Turndown.js with GFM support
   * Handles tables, strikethrough, task lists, and other GitHub Flavored Markdown features
   */
  private static htmlToMarkdown(html: string): string {
    // If the input doesn't look like HTML, return it as-is
    if (!html.includes("<") || (!html.includes("</") && !html.includes("/>"))) {
      return html.trim();
    }

    // Create Turndown service with Obsidian-friendly options
    const turndownService = new TurndownService({
      headingStyle: 'atx',
      hr: '---',
      bulletListMarker: '-',
      codeBlockStyle: 'fenced',
      fence: '```',
      emDelimiter: '*',
      strongDelimiter: '**',
      linkStyle: 'inlined'  // Changed from 'referenced' to 'inlined' for better Obsidian compatibility
    });

    // Use the GFM plugin for tables, strikethrough, and task lists
    turndownService.use(gfm);

    // Add custom rule for underline (not part of GFM, but useful for Obsidian)
    turndownService.addRule('underline', {
      filter: ['u'],
      replacement: function (content: string) {
        return '<u>' + content + '</u>';
      }
    });

    // Improve code blocks with language detection
    turndownService.addRule('codeBlocks', {
      filter: function (node: any) {
        return node.nodeName === 'PRE' && node.firstChild && node.firstChild.nodeName === 'CODE';
      },
      replacement: function (content: string, node: any) {
        const codeNode = node.firstChild;
        const className = codeNode.getAttribute('class') || '';
        const language = className.match(/(?:language-|lang-)(\S+)/) || className.match(/highlight-(\S+)/);
        const lang = language ? language[1] : '';
        
        return '\n\n```' + lang + '\n' + codeNode.textContent + '\n```\n\n';
      }
    });

    // Convert HTML to markdown
    let markdown = turndownService.turndown(html);

    // Clean up excessive whitespace while preserving intentional spacing
    markdown = markdown.replace(/\n{3,}/g, '\n\n'); // Max 2 consecutive line breaks
    markdown = markdown.replace(/^\s+$/gm, ''); // Remove whitespace-only lines
    markdown = markdown.trim();

    return markdown;
  }

  /**
   * Gets the current cursor position in the active markdown editor
   */
  static getCursorPosition(app: any): { line: number; ch: number } | null {
    const activeView = app.workspace.getActiveViewOfType(MarkdownView);

    if (!activeView || !activeView.editor) {
      return null;
    }

    return activeView.editor.getCursor();
  }

  /**
   * Replaces selected text or inserts at cursor position in the active editor
   * If text is selected, it will be replaced. Otherwise, text is inserted at cursor.
   */
  static insertTextAtCursor(app: any, text: string): boolean {
    const activeView = app.workspace.getActiveViewOfType(MarkdownView);

    if (!activeView || !activeView.editor) {
      return false;
    }

    // Check if there's a selection
    if (activeView.editor.somethingSelected()) {
      // Replace the selected text
      activeView.editor.replaceSelection(text);
    } else {
      // Insert at cursor position
      const cursor = activeView.editor.getCursor();
      activeView.editor.replaceRange(text, cursor);

      // Move cursor to end of inserted text
      const lines = text.split("\n");
      const newCursor = {
        line: cursor.line + lines.length - 1,
        ch:
          lines.length === 1
            ? cursor.ch + text.length
            : lines[lines.length - 1].length,
      };
      activeView.editor.setCursor(newCursor);
    }

    return true;
  }

  /**
   * Test method for HTML to markdown conversion with GFM features
   * Can be called from console for testing: app.plugins.plugins.metaflyer.testHtmlToMarkdown()
   */
  static testHtmlToMarkdown(): void {
    const testHtml = `
      <h1>GFM Test Document</h1>
      <p>This is a <strong>bold</strong> and <em>italic</em> text with a <a href="https://example.com">link</a>.</p>
      
      <h2>GitHub Flavored Markdown Features</h2>
      
      <h3>Strikethrough</h3>
      <p>Text with <del>strikethrough</del> and <s>another strikethrough</s>.</p>
      
      <h3>Tables</h3>
      <table>
        <thead>
          <tr>
            <th>Feature</th>
            <th>Supported</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Tables</td>
            <td>✅ Yes</td>
            <td>Full GFM table support</td>
          </tr>
          <tr>
            <td>Strikethrough</td>
            <td>✅ Yes</td>
            <td>~~text~~</td>
          </tr>
          <tr>
            <td>Task Lists</td>
            <td>✅ Yes</td>
            <td>[ ] and [x]</td>
          </tr>
        </tbody>
      </table>
      
      <h3>Task Lists</h3>
      <ul>
        <li><input type="checkbox" disabled> Unchecked task</li>
        <li><input type="checkbox" disabled checked> Checked task</li>
        <li>Regular list item</li>
      </ul>
      
      <h3>Code Blocks</h3>
      <pre><code class="language-javascript">function example() {
  console.log("Code blocks with syntax highlighting");
  return true;
}</code></pre>
      
      <h3>Mixed Formatting</h3>
      <p>Text with <u>underline</u>, <strong>bold</strong>, <em>italic</em>, and <del>strikethrough</del>.</p>
      
      <blockquote>
        <p>This is a blockquote with <strong>bold text</strong> and a <a href="https://example.com">link</a>.</p>
      </blockquote>
    `;

    const result = this.htmlToMarkdown(testHtml);
    console.log("HTML to Markdown conversion test (GFM features enabled):");
    console.log("Input HTML:", testHtml);
    console.log("Output Markdown:", result);

    new Notice("GFM HTML to Markdown test completed. Check console for enhanced table, strikethrough, and task list support!");
  }
}
