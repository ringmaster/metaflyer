export interface MetadataField {
	name: string;
	type: 'string' | 'array' | 'date' | 'number' | 'boolean';
	format?: string;
	required: boolean;
}

export type AutoTitleMode = 'never' | 'if_unset' | 'always';

export interface Ruleset {
	name: string;
	metadata_match: Record<string, any>;
	metadata: MetadataField[];
	title?: string;
	path?: string;
	autoTitleMode?: AutoTitleMode;
	enableAutoMove?: boolean;
	behaviors?: {
		pull_forward?: boolean;
		create_tasks?: boolean;
	};
}

export interface MetaflyerSettings {
	rulesets: Ruleset[];
	enableWarnings: boolean;
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
			autoTitleMode: 'always',
			enableAutoMove: true,
			behaviors: {
				pull_forward: true,
				create_tasks: true
			}
		}
	],
	enableWarnings: true
};