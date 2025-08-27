# Metaflyer

A powerful Obsidian plugin that enforces properties rules and automatically organizes your notes based on defined rulesets.

## Features

- **Automatic Properties Population**: When you set a trigger field (like `type: O3`), the plugin instantly populates all required properties fields
- **Visual Feedback System**: Clear alerts show you when properties are missing, incomplete, or ready for organization
- **Smart Auto-Organization**: Automatically rename and move notes to the correct location using customizable templates
- **Flexible Rulesets**: Define custom rules for different note types with properties requirements, title templates, and organization paths
- **Real-time Monitoring**: Works on all notes vault-wide, regardless of age or location
- **Smart Placeholders**: Use `{fieldName}` placeholders in titles and paths that automatically populate with properties values

## Quick Start

1. Install the plugin
2. Go to Settings → Metaflyer
3. Configure your rulesets (an O3 meeting example is included by default)
4. Create a new note and add frontmatter like:
   ```yaml
   ---
   type: O3
   ---
   ```
5. Watch as the plugin automatically populates required fields and guides you through organization

## Default Ruleset Example

The plugin comes with a built-in O3 meeting ruleset:

```yaml
type: O3
attendees: []
date: 2024-01-01
```

When complete, notes are automatically titled as `{attendees} O3 - {date}` and moved to `Areas/Work/O3s/{attendees}/`.

## Commands

- **Organize Note (Rename & Move)**: Available in Command Palette when note is complete and matches a ruleset (hotkey customizable in Obsidian settings)

## Settings

### Rulesets Tab
Create and manage your properties rulesets with:
- **Properties Match**: Conditions that trigger the ruleset (e.g., `type: O3`)
- **Required Fields**: Define field types (string, array, date, number, boolean)
- **Title Template**: Auto-generate titles using `{fieldName}` placeholders
- **Path Template**: Define organization paths using `{fieldName}` placeholders

### Testing Tab
Test your rulesets with sample properties to see how they'll behave.

## Visual States

- **Yellow Border + ⚠️**: Missing properties or incomplete ruleset
- **Green Alert + ☑️**: Complete properties, ready to organize
- **No Visual Changes**: Note is complete and in the correct location

## Smart Placeholders

Use these placeholders in title and path templates:
- `{fieldName}`: Insert any properties field value
- `{date:YYYY-MM-DD}`: Format dates with custom patterns
- `{attendees}`: Arrays become comma-separated strings

## Development

To build the plugin:

```bash
npm install
npm run dev
```

To build for production:
```bash
npm run build
```

## License

MIT