import { Notice, MarkdownView } from "obsidian";

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
   * Simple HTML to Markdown converter
   * Handles common formatting elements
   */
  private static htmlToMarkdown(html: string): string {
    // Clean up the HTML first
    let markdown = html;

    // If the input doesn't look like HTML, return it as-is
    if (!html.includes("<") || (!html.includes("</") && !html.includes("/>"))) {
      return html.trim();
    }

    // Remove DOCTYPE, html, head, body tags and their content except body content
    markdown = markdown.replace(/<!DOCTYPE[^>]*>/gi, "");
    markdown = markdown.replace(/<html[^>]*>/gi, "");
    markdown = markdown.replace(/<\/html>/gi, "");

    // Handle head tag with content - using multiline regex
    const headRegex = /<head[^>]*>[\s\S]*?<\/head>/gi;
    markdown = markdown.replace(headRegex, "");

    markdown = markdown.replace(/<body[^>]*>/gi, "");
    markdown = markdown.replace(/<\/body>/gi, "");

    // Handle line breaks first
    markdown = markdown.replace(/<br\s*\/?>/gi, "\n");
    markdown = markdown.replace(/<\/p>/gi, "\n\n");
    markdown = markdown.replace(/<p[^>]*>/gi, "");

    // Handle headers
    markdown = markdown.replace(/<h1[^>]*>(.*?)<\/h1>/gi, "# $1\n");
    markdown = markdown.replace(/<h2[^>]*>(.*?)<\/h2>/gi, "## $1\n");
    markdown = markdown.replace(/<h3[^>]*>(.*?)<\/h3>/gi, "### $1\n");
    markdown = markdown.replace(/<h4[^>]*>(.*?)<\/h4>/gi, "#### $1\n");
    markdown = markdown.replace(/<h5[^>]*>(.*?)<\/h5>/gi, "##### $1\n");
    markdown = markdown.replace(/<h6[^>]*>(.*?)<\/h6>/gi, "###### $1\n");

    // Handle text formatting
    markdown = markdown.replace(/<strong[^>]*>(.*?)<\/strong>/gi, "**$1**");
    markdown = markdown.replace(/<b[^>]*>(.*?)<\/b>/gi, "**$1**");
    markdown = markdown.replace(/<em[^>]*>(.*?)<\/em>/gi, "*$1*");
    markdown = markdown.replace(/<i[^>]*>(.*?)<\/i>/gi, "*$1*");
    markdown = markdown.replace(/<u[^>]*>(.*?)<\/u>/gi, "<u>$1</u>"); // Keep underline as HTML
    markdown = markdown.replace(/<strike[^>]*>(.*?)<\/strike>/gi, "~~$1~~");
    markdown = markdown.replace(/<del[^>]*>(.*?)<\/del>/gi, "~~$1~~");
    markdown = markdown.replace(/<s[^>]*>(.*?)<\/s>/gi, "~~$1~~");
    markdown = markdown.replace(/<code[^>]*>(.*?)<\/code>/gi, "`$1`");

    // Handle links
    markdown = markdown.replace(
      /<a[^>]*href=["']([^"']*)["'][^>]*>(.*?)<\/a>/gi,
      "[$2]($1)",
    );

    // Handle images
    markdown = markdown.replace(
      /<img[^>]*src=["']([^"']*)["'][^>]*alt=["']([^"']*)["'][^>]*>/gi,
      "![$2]($1)",
    );
    markdown = markdown.replace(
      /<img[^>]*alt=["']([^"']*)["'][^>]*src=["']([^"']*)["'][^>]*>/gi,
      "![$1]($2)",
    );
    markdown = markdown.replace(
      /<img[^>]*src=["']([^"']*)["'][^>]*>/gi,
      "![]($1)",
    );

    // Handle lists
    markdown = markdown.replace(/<ul[^>]*>/gi, "");
    markdown = markdown.replace(/<\/ul>/gi, "\n");
    markdown = markdown.replace(/<ol[^>]*>/gi, "");
    markdown = markdown.replace(/<\/ol>/gi, "\n");
    markdown = markdown.replace(/<li[^>]*>(.*?)<\/li>/gi, "- $1\n");

    // Handle blockquotes with multiline content
    const blockquoteRegex = /<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi;
    markdown = markdown.replace(blockquoteRegex, function (match, content) {
      const lines = content.split("\n");
      const quotedLines = [];
      for (let i = 0; i < lines.length; i++) {
        quotedLines.push("> " + lines[i].trim());
      }
      return quotedLines.join("\n") + "\n";
    });

    // Handle pre/code blocks with multiline content
    const preCodeRegex = /<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi;
    markdown = markdown.replace(preCodeRegex, "```\n$1\n```\n");

    const preRegex = /<pre[^>]*>([\s\S]*?)<\/pre>/gi;
    markdown = markdown.replace(preRegex, "```\n$1\n```\n");

    // Handle div and span (just remove tags, keep content)
    markdown = markdown.replace(/<div[^>]*>/gi, "");
    markdown = markdown.replace(/<\/div>/gi, "\n");
    markdown = markdown.replace(/<span[^>]*>/gi, "");
    markdown = markdown.replace(/<\/span>/gi, "");

    // Handle tables (basic support)
    markdown = markdown.replace(/<table[^>]*>/gi, "");
    markdown = markdown.replace(/<\/table>/gi, "\n");
    markdown = markdown.replace(/<thead[^>]*>/gi, "");
    markdown = markdown.replace(/<\/thead>/gi, "");
    markdown = markdown.replace(/<tbody[^>]*>/gi, "");
    markdown = markdown.replace(/<\/tbody>/gi, "");
    markdown = markdown.replace(/<tr[^>]*>/gi, "|");
    markdown = markdown.replace(/<\/tr>/gi, "|\n");
    markdown = markdown.replace(/<th[^>]*>(.*?)<\/th>/gi, " $1 |");
    markdown = markdown.replace(/<td[^>]*>(.*?)<\/td>/gi, " $1 |");

    // Clean up any remaining HTML tags
    markdown = markdown.replace(/<[^>]*>/g, "");

    // Decode HTML entities
    markdown = markdown.replace(/&nbsp;/g, " ");
    markdown = markdown.replace(/&amp;/g, "&");
    markdown = markdown.replace(/&lt;/g, "<");
    markdown = markdown.replace(/&gt;/g, ">");
    markdown = markdown.replace(/&quot;/g, '"');
    markdown = markdown.replace(/&#39;/g, "'");
    markdown = markdown.replace(/&apos;/g, "'");

    // Clean up whitespace
    markdown = markdown.replace(/\n\s*\n\s*\n/g, "\n\n"); // Remove excessive line breaks
    markdown = markdown.replace(/^\s+/gm, ""); // Remove leading whitespace on lines
    markdown = markdown.replace(/\s+$/gm, ""); // Remove trailing whitespace on lines
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
   * Inserts text at the current cursor position in the active editor
   */
  static insertTextAtCursor(app: any, text: string): boolean {
    const activeView = app.workspace.getActiveViewOfType(MarkdownView);

    if (!activeView || !activeView.editor) {
      return false;
    }

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

    return true;
  }

  /**
   * Test method for HTML to markdown conversion
   * Can be called from console for testing: app.plugins.plugins.metaflyer.testHtmlToMarkdown()
   */
  static testHtmlToMarkdown(): void {
    const testHtml = `
      <h1>Test Document</h1>
      <p>This is a <strong>bold</strong> and <em>italic</em> text with a <a href="https://example.com">link</a>.</p>
      <h2>Features</h2>
      <ul>
        <li>Item 1</li>
        <li>Item 2 with <code>inline code</code></li>
      </ul>
      <blockquote>This is a quote</blockquote>
      <pre><code>function test() {
  console.log("Hello World");
}</code></pre>
    `;

    const result = this.htmlToMarkdown(testHtml);
    console.log("HTML to Markdown conversion test:");
    console.log("Input HTML:", testHtml);
    console.log("Output Markdown:", result);

    new Notice("HTML to Markdown test completed. Check console for results.");
  }
}
