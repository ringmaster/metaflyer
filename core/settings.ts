export interface MetadataField {
	name: string;
	type: 'string' | 'array' | 'date' | 'number' | 'boolean';
	format?: string;
	required: boolean;
}

export interface Ruleset {
	name: string;
	metadata_match: Record<string, any>;
	metadata: MetadataField[];
	title?: string;
	path?: string;
	behaviors?: {
		pull_forward?: boolean;
		create_tasks?: boolean;
	};
}

export interface MetaflyerSettings {
	rulesets: Ruleset[];
}

export const DEFAULT_SETTINGS: MetaflyerSettings = {
	rulesets: [
		{
			name: "O3",
			metadata_match: {
				type: "O3"
			},
			metadata: [
				{
					name: "attendees",
					type: "array",
					required: true
				},
				{
					name: "date",
					type: "date",
					format: "YYYY-MM-DD",
					required: true
				}
			],
			title: "{attendees} O3 - {date:YYYY-MM-DD hh:mma}",
			path: "Areas/Work/O3s/{attendees}",
			behaviors: {
				pull_forward: true,
				create_tasks: true
			}
		}
	]
};