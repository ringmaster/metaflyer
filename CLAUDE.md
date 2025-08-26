# Obsidian Plugin Requirements: Metadata Enforcer with Auto-Organization

## Core Requirements
- **Simple, maintainable code**: Avoid complex frameworks, minimize dependencies, use standard Obsidian API patterns
- **Distribution-ready**: Follow Obsidian plugin guidelines, include proper manifest and release structure
- **GUI configuration panel**: Settings tab for defining rulesets

## Technical Specifications

### Ruleset Configuration Structure
```yaml
ruleset: O3
  metadata_match:
    type: "O3"
  metadata:
    attendees: [array]
    date: {date:YYYY-MM-DD}
  title: "{attendees} O3 - {date:YYYY-MM-DD hh:mma}"
  path: Areas/Work/O3s/{attendees}
  behaviors:  # Future extensibility
    pull_forward: true
    create_tasks: true
```

### Automatic Metadata Population
- When user sets `type` to match a ruleset, plugin **immediately** auto-populates all required metadata fields
- Date fields auto-fill with current date/time using specified format
- Array fields (like `attendees`) are created empty but structured correctly
- No manual "auto-fill" buttons - population is instant and automatic

### Visual Feedback System
- **No Matching Ruleset**: Yellow editor border + "⚠️ Metadata is missing"
- **Incomplete Ruleset**: Yellow editor border + "⚠️ [Ruleset Name] - Missing Values: • attendees"
- **Ready State**: Green alert + "✅ [Ruleset Name] Complete - Ready to Organize [Rename & Move] (Ctrl+Shift+M)"
- **Complete & In Correct Location**: No visual changes or messages
- **Non-dismissible alerts**: Only clear when frontmatter satisfies all applicable rules
- **Always active**: Triggers on any note vault-wide, regardless of age or location

### Auto-Organization Features
- **Automatic Title Generation**: Use template patterns with smart placeholders ({attendees}, {date}, {project}, etc.)
- **Automatic File Movement**: Move to specified path once metadata is complete
- **Path Creation**: Create destination directories if they don't exist
- **Collision Handling**: Append incremental numbers for duplicate filenames
- **Manual Trigger**: Button click or hotkey (Ctrl+Shift+M) to execute rename/move

### Settings Interface
- **Rulesets Tab**: Create/edit/delete named rule collections with full configuration (metadata requirements, titles, paths, behaviors)
- **Testing Tab**: Preview how rules apply to sample frontmatter
- **Configuration Storage**: Settings sync across Obsidian instances

### Global Rule Application
- All rulesets are evaluated against every note in the vault
- Rules trigger based on `metadata_match` criteria regardless of file location
- No directory-specific rule assignments

### Smart Placeholders for Titles and Paths
- `{date}` with flexible formatting options
- `{attendees}` - converts arrays to comma-separated strings
- `{project}` and other frontmatter field references
- `{counter}` for sequential numbering if needed

## Implementation Considerations

### Triggering Logic
- Monitor frontmatter changes in real-time via Obsidian's metadata cache
- Re-evaluate rules when files are moved between directories
- Check rules on plugin load for all existing files
- Instant metadata population when `meeting-type` or other trigger fields are set

### User Experience Requirements
- **Alert Persistence**: Alerts stay visible until requirements met - no dismissing without fixing
- **Instant Feedback**: Metadata auto-population happens immediately upon trigger
- **Clear Progression**: Visual states clearly show progress from incomplete → complete → organized
- **Hotkey Support**: Key workflow actions accessible via keyboard shortcuts
- **Graceful Degradation**: Plugin failures shouldn't break note editing

### Edge Cases to Handle
- Rules that conflict with each other
- Malformed frontmatter YAML
- Plugin disabled/re-enabled state management
- Templates that pre-populate frontmatter (rules should still apply after template application)
- Deletion of required frontmatter from existing notes (alerts should reappear)
- Multiple valid destinations suggested by metadata
- Destination folders that don't exist yet

### Future Extensibility Hooks
- Plugin structured to easily add pull-forward and dashboard features later
- Behavior system in rulesets allows for workflow automation expansion
- Consider how rule definitions might expand (date-based rules, content-based triggers, etc.)

### Modular Internal Architecture
Structure as one plugin with feature modules:
```
metadata-enforcer/
├── core/           # Shared utilities, settings management
├── enforcement/    # Visual alerts, rule validation
├── organization/   # Auto-titling, file moving
├── settings/       # Unified configuration UI
└── behaviors/      # Future workflow features (pull-forward, etc.)
```

## Key Behavioral Requirements
- **No friction for routine meetings**: User creates note, sets meeting-type, plugin handles everything else
- **Consistent enforcement**: Rules apply to ALL notes vault-wide, new and existing
- **Zero-maintenance organization**: Proper metadata automatically leads to proper file organization
- **Extensible foundation**: Architecture supports future workflow automation features
- **Clean completion state**: Notes with complete metadata in correct locations show no alerts or visual changes
