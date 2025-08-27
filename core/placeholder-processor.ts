export class PlaceholderProcessor {
	static processPlaceholders(template: string, frontmatter: Record<string, any>, file?: any): string {
		if (!template) return '';

		let result = template;

		result = result.replace(/\{([^}]+)\}/g, (match, placeholder) => {
			const parts = placeholder.split(':');
			const fieldName = parts[0].trim();
			const modifier = parts[1]?.trim();

			// Handle special placeholders that don't come from frontmatter
			if (fieldName === 'created') {
				if (file) {
					const createdDate = new Date(file.stat.ctime);
					if (modifier) {
						return this.formatDateValue(createdDate, modifier);
					} else {
						// Default format for created date
						return this.formatDateValue(createdDate, 'YYYY-MM-DD');
					}
				} else {
					// Fallback if no file provided
					return match;
				}
			}

			if (!frontmatter.hasOwnProperty(fieldName)) {
				return match;
			}

			const value = frontmatter[fieldName];
			
			// Handle date formatting (takes precedence over other modifiers)
			if (fieldName === 'date' && modifier && modifier !== 'strip') {
				return this.formatDateValue(value, modifier);
			}

			// Process the value based on type
			let processedValue: string;
			if (Array.isArray(value)) {
				const processedArray = value.map(item => {
					const stringValue = String(item);
					return modifier === 'strip' ? this.stripSymbols(stringValue) : stringValue;
				});
				processedValue = processedArray.join(', ');
			} else {
				const stringValue = String(value);
				processedValue = modifier === 'strip' ? this.stripSymbols(stringValue) : stringValue;
			}

			return processedValue;
		});

		return result;
	}

	private static formatDateValue(value: any, format: string): string {
		let date: Date;

		if (value instanceof Date) {
			date = value;
		} else if (typeof value === 'string') {
			date = new Date(value);
			if (isNaN(date.getTime())) {
				return String(value);
			}
		} else {
			return String(value);
		}

		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const day = String(date.getDate()).padStart(2, '0');
		const hours = date.getHours();
		const minutes = String(date.getMinutes()).padStart(2, '0');
		const ampm = hours >= 12 ? 'PM' : 'AM';
		const hours12 = hours % 12 || 12;

		return format
			.replace('YYYY', String(year))
			.replace('MM', month)
			.replace('DD', day)
			.replace('hh', String(hours12).padStart(2, '0'))
			.replace('mm', minutes)
			.replace('a', ampm.toLowerCase());
	}

	static sanitizeForFilename(text: string): string {
		return text
			.replace(/[<>:"/\\|?*]/g, '')
			.replace(/\s+/g, ' ')
			.trim();
	}

	static sanitizeForPath(path: string): string {
		return path
			.split('/')
			.map(segment => this.sanitizeForFilename(segment))
			.filter(segment => segment.length > 0)
			.join('/');
	}

	private static stripSymbols(text: string): string {
		// Remove common symbols and markdown formatting
		// This handles: [[]], [], (), {}, @, #, *, _, ~, `, |, \, /, etc.
		return text
			.replace(/\[\[([^\]]+)\]\]/g, '$1')  // [[text]] -> text
			.replace(/\[([^\]]+)\]/g, '$1')     // [text] -> text
			.replace(/\(([^)]+)\)/g, '$1')     // (text) -> text
			.replace(/\{([^}]+)\}/g, '$1')     // {text} -> text
			.replace(/[@#*_~`|\\\/]/g, '')     // Remove common symbols
			.replace(/\s+/g, ' ')              // Normalize whitespace
			.trim();                           // Remove leading/trailing spaces
	}
}