export class PlaceholderProcessor {
	static processPlaceholders(template: string, frontmatter: Record<string, any>): string {
		if (!template) return '';

		let result = template;

		result = result.replace(/\{([^}]+)\}/g, (match, placeholder) => {
			const parts = placeholder.split(':');
			const fieldName = parts[0].trim();
			const format = parts[1]?.trim();

			if (!frontmatter.hasOwnProperty(fieldName)) {
				return match;
			}

			const value = frontmatter[fieldName];
			
			if (fieldName === 'date' && format) {
				return this.formatDateValue(value, format);
			}

			if (Array.isArray(value)) {
				return value.join(', ');
			}

			return String(value);
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
}