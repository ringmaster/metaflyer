export class TemplateEngine {
  /**
   * Process a template with the given context data
   */
  static processTemplate(template: string, context: TemplateContext): string {
    if (!template) return '';

    // Debug logging
    console.log('Template Engine - Processing template:', template.substring(0, 100) + '...');
    console.log('Template Engine - Context keys:', Object.keys(context));
    console.log('Template Engine - Results array length:', context.results?.length || 0);

    let result = template;

    // Process {#each results as result} blocks first
    result = this.processEachBlocks(result, context);

    // Process simple variable substitutions
    result = this.processVariables(result, context);

    console.log('Template Engine - Final result:', result.substring(0, 200) + '...');
    return result;
  }

  /**
   * Process {#each} blocks in the template
   */
  private static processEachBlocks(template: string, context: TemplateContext): string {
    const eachRegex = /\{#each\s+(\w+)\s+as\s+(\w+)\}([\s\S]*?)\{\/each\}/g;
    
    return template.replace(eachRegex, (match, arrayName, itemName, blockContent) => {
      console.log(`Template Engine - Found each block: ${arrayName} as ${itemName}`);
      
      // Get the array from context
      const array = this.getNestedValue(context, arrayName);
      console.log(`Template Engine - Array for ${arrayName}:`, array);
      
      if (!Array.isArray(array) || array.length === 0) {
        console.log(`Template Engine - No array data for ${arrayName}, skipping`);
        return '';
      }

      console.log(`Template Engine - Processing ${array.length} items in ${arrayName}`);

      // Process each item in the array
      const processedItems = array.map((item, index) => {
        console.log(`Template Engine - Processing item ${index}:`, Object.keys(item));
        let itemContent = blockContent;
        
        // Replace references to the item variable (e.g., {result.title})
        const itemVarRegex = new RegExp(`\\{${itemName}\\.(\\w+)\\}`, 'g');
        itemContent = itemContent.replace(itemVarRegex, (itemMatch: string, property: string) => {
          const value = this.getNestedValue(item, property) || '';
          console.log(`Template Engine - Replaced {${itemName}.${property}} with:`, value);
          return value;
        });

        // Replace simple item reference (e.g., {result})
        const simpleItemRegex = new RegExp(`\\{${itemName}\\}`, 'g');
        itemContent = itemContent.replace(simpleItemRegex, String(item || ''));

        return itemContent;
      });

      const result = processedItems.join('');
      console.log(`Template Engine - Each block result length:`, result.length);
      return result;
    });
  }

  /**
   * Process simple variable substitutions like {current_file.title}
   */
  private static processVariables(template: string, context: TemplateContext): string {
    const variableRegex = /\{([^}]+)\}/g;
    
    return template.replace(variableRegex, (match, path) => {
      const value = this.getNestedValue(context, path);
      return String(value || '');
    });
  }

  /**
   * Get a nested property value from an object using dot notation
   */
  private static getNestedValue(obj: any, path: string): any {
    if (!obj || !path) return '';
    
    const keys = path.split('.');
    let current = obj;
    
    for (const key of keys) {
      if (current == null || typeof current !== 'object') {
        return '';
      }
      current = current[key];
    }
    
    return current;
  }

  /**
   * Test method for template processing
   */
  static testTemplate(): void {
    const testTemplate = `Meeting Analysis for {current_file.title}

Date: {current_file.metadata.date}
Type: {current_file.metadata.type}

Related Documents:
{#each results as result}
- **{result.title}** ({result.path})
  Summary: {result.excerpt}

{/each}

Based on the above information, suggest action items.`;

    const testContext: TemplateContext = {
      current_file: {
        title: "Weekly Team Meeting",
        path: "meetings/2024/team-weekly.md",
        content: "Meeting content here...",
        metadata: {
          date: "2024-01-15",
          type: "team-meeting",
          attendees: ["Alice", "Bob"]
        }
      },
      results: [
        {
          title: "Previous Team Meeting",
          path: "meetings/2024/team-previous.md",
          content: "Previous meeting content...",
          excerpt: "Discussed project timeline and deliverables"
        },
        {
          title: "Project Planning",
          path: "projects/planning.md",
          content: "Project details...",
          excerpt: "Initial project setup and requirements gathering"
        }
      ]
    };

    console.log('=== TEMPLATE ENGINE TEST ===');
    console.log('Template:', testTemplate);
    console.log('Context:', testContext);
    
    const result = this.processTemplate(testTemplate, testContext);
    
    console.log('=== FINAL RESULT ===');
    console.log(result);
    console.log('========================');
  }
}

export interface TemplateContext {
  current_file?: {
    title?: string;
    path?: string;
    content?: string;
    metadata?: Record<string, any>;
  };
  results?: Array<{
    title?: string;
    path?: string;
    content?: string;
    excerpt?: string;
    score?: number;
  }>;
  [key: string]: any;
}