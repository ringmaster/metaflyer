# GitHub Actions Workflows

This directory contains GitHub Actions workflows for automated building, testing, and releasing of the Metaflyer Obsidian plugin.

## Workflows

### 1. Continuous Integration (`ci.yml`)
**Triggers:** Push to `main`/`develop` branches, Pull requests to `main`

**Purpose:** Ensures code quality and build integrity

**Jobs:**
- **lint-and-typecheck**: Runs TypeScript compilation checks and ESLint
- **build-test**: Builds the plugin and validates all required artifacts

**What it checks:**
- TypeScript compilation without errors
- ESLint compliance (with warnings allowed)
- Successful plugin build
- Presence of required files (`main.js`, `manifest.json`, `styles.css`)
- Valid JavaScript syntax in compiled output
- Valid JSON structure in manifest with required fields

### 2. Build and Create Artifact (`build.yml`)
**Triggers:** Push to `main`/`develop` branches, Pull requests to `main`, Manual dispatch

**Purpose:** Creates downloadable build artifacts

**Output:**
- `metaflyer-obsidian-plugin`: Complete build directory + zip file (30-day retention)
- `metaflyer-plugin-zip`: Ready-to-install zip file (90-day retention)

**Artifacts include:**
- `main.js` - Compiled plugin code
- `manifest.json` - Plugin manifest
- `styles.css` - Plugin styles
- `metaflyer-plugin.zip` - Installation-ready archive

### 3. Release (`release.yml`)
**Triggers:** Push of Git tags (e.g., `v1.0.0`, `1.2.3`)

**Purpose:** Creates GitHub releases with downloadable assets

**What it does:**
- Builds the plugin
- Creates a versioned zip file (`metaflyer-{version}.zip`)
- Creates a GitHub release with automatic release notes
- Uploads individual files (`main.js`, `manifest.json`, `styles.css`)
- Uploads the complete plugin zip

## Usage

### For Development
- **Push/PR to main**: Triggers CI checks and build artifact creation
- **Push/PR to develop**: Triggers CI checks and build artifact creation
- All workflows run automatically - no manual intervention needed

### For Releases
1. Update version in `manifest.json` and `package.json`
2. Commit and push changes
3. Create and push a git tag: `git tag v1.0.0 && git push origin v1.0.0`
4. The release workflow will automatically create a GitHub release

### Manual Builds
- Navigate to Actions tab in GitHub
- Select "Build and Create Artifact" workflow
- Click "Run workflow" button

## Downloading Artifacts

### From Workflow Runs
1. Go to the Actions tab
2. Click on a completed workflow run
3. Scroll to "Artifacts" section
4. Download `metaflyer-plugin-zip` for installation

### From Releases
1. Go to Releases page
2. Download the versioned zip file
3. Extract to `.obsidian/plugins/metaflyer/` in your vault

## Installation Instructions
When distributing the plugin, include these instructions:

1. Download the latest `metaflyer-{version}.zip` from the Releases page
2. Extract the contents to your Obsidian vault's `.obsidian/plugins/metaflyer/` directory
3. Ensure the directory structure looks like:
   ```
   .obsidian/plugins/metaflyer/
   ├── main.js
   ├── manifest.json
   └── styles.css
   ```
4. Restart Obsidian or refresh plugins
5. Enable "Metaflyer" in Settings > Community Plugins

## Troubleshooting

### Build Failures
- Check TypeScript compilation errors in CI logs
- Ensure all dependencies are properly declared in `package.json`
- Verify build scripts work locally with `npm run build`

### Release Issues
- Ensure you have the `GITHUB_TOKEN` secret (automatically provided)
- Check that the git tag follows semantic versioning
- Verify `manifest.json` has all required fields

### Artifact Missing Files
The workflows verify these required files exist:
- `main.js` (compiled plugin code)
- `manifest.json` (plugin metadata)
- `styles.css` (plugin styles)

If any are missing, check the build process and `build-script.mjs`.
