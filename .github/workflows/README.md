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

### 2. Build and Release (`build.yml`)
**Triggers:** Push to `main`/`develop` branches, Pull requests to `main`, Manual dispatch

**Purpose:** Creates downloadable build artifacts and automatic releases

**Jobs:**
- **build**: Creates build artifacts (runs for all triggers)
- **release**: Creates automatic releases (only for pushes to `main`)

**Output:**
- `metaflyer-obsidian-plugin`: Complete build directory + zip file (30-day retention)
- `metaflyer-plugin-zip`: Ready-to-install zip file (90-day retention)
- **Automatic Release**: Creates a prerelease on every push to `main`

**Artifacts include:**
- `main.js` - Compiled plugin code
- `manifest.json` - Plugin manifest
- `styles.css` - Plugin styles
- `metaflyer-plugin.zip` - Installation-ready archive

### 3. Manual Release (`release.yml`)
**Triggers:** Manual workflow dispatch with version input

**Purpose:** Creates official stable releases with proper versioning

**What it does:**
- Updates `manifest.json` and `package.json` versions
- Builds the plugin with the specified version
- Creates a Git tag and commits version changes
- Creates a GitHub release (stable or prerelease based on input)
- Uploads versioned zip file and individual assets

## Usage

### For Development
- **Push/PR to main**: Triggers CI checks, build artifacts, and **automatic release**
- **Push/PR to develop**: Triggers CI checks and build artifact creation
- **Automatic releases**: Every push to `main` creates a timestamped prerelease

### For Stable Releases
1. Navigate to Actions tab in GitHub
2. Select "Manual Release" workflow
3. Click "Run workflow" button
4. Enter the version number (e.g., "1.0.0")
5. Choose whether it's a prerelease or stable release
6. The workflow will update versions, create tags, and publish the release

### Manual Builds
- Navigate to Actions tab in GitHub
- Select "Build and Release" workflow
- Click "Run workflow" button

## Release Types

### Automatic Releases (Prereleases)
- **Created**: Every push to `main` branch
- **Format**: `{version}-build-{timestamp}` (e.g., `1.0.0-build-20231215-143022`)
- **Marked as**: Prerelease
- **Purpose**: Latest development builds for testing
- **Version Source**: Reads current version from `manifest.json` in the repository

### Manual Releases (Stable)
- **Created**: Via workflow dispatch
- **Format**: `{version}` (e.g., `1.0.0`)
- **Marked as**: Stable release or prerelease (based on input)
- **Purpose**: Official releases for distribution
- **Version Source**: User-specified version that updates `manifest.json` and `package.json`

## Version System

### How Versions Work
- **Automatic builds**: Use the current version from `manifest.json` + build timestamp
- **Manual releases**: User specifies version, which updates both `manifest.json` and `package.json`
- **Tag format**: No "v" prefix - uses semantic version directly (e.g., `1.0.0` not `v1.0.0`)

### Updating the Version
To change the version for automatic builds:
1. Edit `manifest.json` and update the `"version"` field
2. Push to main - next build will use the new version

## Downloading Artifacts

### From Automatic Builds
1. Go to the Actions tab
2. Click on a completed "Build and Release" workflow run
3. Scroll to "Artifacts" section
4. Download `metaflyer-plugin-zip` for installation

### From Releases Page
1. Go to Releases page
2. **For latest development**: Download from the newest prerelease
3. **For stable versions**: Download from releases without "prerelease" label
4. **Download options**: Either the complete zip file OR individual files (`main.js`, `manifest.json`, `styles.css`)
5. Extract/copy to `.obsidian/plugins/metaflyer/` in your vault

## Installation Instructions
When distributing the plugin, include these instructions:

### For Stable Releases
1. Download the latest `metaflyer-v{version}.zip` from the Releases page
2. Choose a stable release (not marked as "prerelease")

### For Development Testing
1. Download `metaflyer-plugin.zip` from the latest prerelease
2. Or download individual files (`main.js`, `manifest.json`, `styles.css`) directly from the release
3. Or download from Actions artifacts for the very latest build

### Installation Steps
1. Extract the downloaded zip file
2. Copy contents to your Obsidian vault's `.obsidian/plugins/metaflyer/` directory
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
