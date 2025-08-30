export class OllamaClient {
  private static readonly BASE_URL = 'http://localhost:11434';
  private static readonly TIMEOUT_MS = 30000;

  /**
   * Generate AI suggestions using the local Ollama instance
   */
  static async generateSuggestions(
    query: string,
    model: string = 'llama2'
  ): Promise<OllamaResponse> {
    const enhancedPrompt = `${query}

Please respond with a bulleted or numbered list of suggestions.`;

    const requestBody = {
      model,
      prompt: enhancedPrompt,
      stream: false,
      options: {
        temperature: 0.7,
        top_p: 0.9,
      }
    };

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.TIMEOUT_MS);

      const response = await fetch(`${this.BASE_URL}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      return {
        success: true,
        response: data.response || '',
        suggestions: this.parseListFromResponse(data.response || ''),
      };
    } catch (error) {
      console.error('Ollama API error:', error);
      
      if (error.name === 'AbortError') {
        return {
          success: false,
          error: 'Request timed out (30s). Ollama may be busy or unavailable.',
          suggestions: [],
        };
      }
      
      if (error.message.includes('Failed to fetch')) {
        return {
          success: false,
          error: 'Ollama not available. Make sure Ollama is running on localhost:11434.',
          suggestions: [],
        };
      }

      return {
        success: false,
        error: `Ollama error: ${error.message}`,
        suggestions: [],
      };
    }
  }

  /**
   * Parse list items from the AI response
   */
  private static parseListFromResponse(response: string): string[] {
    if (!response.trim()) return [];

    const suggestions: string[] = [];
    const lines = response.split('\n');

    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // Match numbered lists (1. item, 2. item, etc.)
      const numberedMatch = trimmedLine.match(/^\d+\.\s*(.+)$/);
      if (numberedMatch) {
        suggestions.push(numberedMatch[1].trim());
        continue;
      }

      // Match bulleted lists (- item, * item, • item, etc.)
      const bulletedMatch = trimmedLine.match(/^[-*•]\s*(.+)$/);
      if (bulletedMatch) {
        suggestions.push(bulletedMatch[1].trim());
        continue;
      }

      // If it's not empty and doesn't look like a continuation, 
      // treat it as a standalone suggestion
      if (trimmedLine && !trimmedLine.startsWith(' ') && trimmedLine.length > 3) {
        // Skip common non-suggestion lines
        if (!this.isLikelyNonSuggestion(trimmedLine)) {
          suggestions.push(trimmedLine);
        }
      }
    }

    return suggestions.filter(s => s.length > 0);
  }

  /**
   * Check if a line is likely not a suggestion
   */
  private static isLikelyNonSuggestion(line: string): boolean {
    const nonSuggestionPatterns = [
      /^(here|based|the following|suggestions|recommendations):/i,
      /^(note:|disclaimer:|warning:)/i,
      /^\w+:$/,  // Single word followed by colon
    ];

    return nonSuggestionPatterns.some(pattern => pattern.test(line));
  }

  /**
   * Check if Ollama is available
   */
  static async isAvailable(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${this.BASE_URL}/api/tags`, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get list of available models from Ollama
   */
  static async getModels(): Promise<OllamaModel[]> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(`${this.BASE_URL}/api/tags`, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data.models || [];
    } catch (error) {
      console.error('Error fetching Ollama models:', error);
      return [];
    }
  }
}

export interface OllamaResponse {
  success: boolean;
  response?: string;
  suggestions: string[];
  error?: string;
}

export interface OllamaModel {
  name: string;
  model: string;
  size: number;
  digest: string;
  details: {
    format: string;
    family: string;
    families: string[];
    parameter_size: string;
    quantization_level: string;
  };
  expires_at: string;
  size_vram: number;
}