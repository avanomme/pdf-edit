# Publishing A PDF Note Viewer to Obsidian Community Plugins

This guide walks you through publishing this plugin to the official Obsidian Community Plugins directory.

## Step 1: Prepare Your Repository

### 1.1 Create a GitHub Repository
1. Go to [GitHub.com](https://github.com) and create a new public repository
2. Name it something like `obsidian-pdf-note-viewer` 
3. **Important**: Repository must be public for community plugin submission
4. Add a description: "Split-view PDF viewer with synchronized note-taking for Obsidian"

### 1.2 Upload Your Code
```bash
# Initialize git in your project folder
cd /Users/adam/projects/pdf_plugin
git init

# Add all files
git add .

# Make initial commit
git commit -m "Initial release v1.0.0 - PDF Note Viewer plugin"

# Add your GitHub repository as origin
git remote add origin https://github.com/yourusername/obsidian-pdf-note-viewer.git

# Push to GitHub
git push -u origin main
```

### 1.3 Update Personal Information
Before publishing, update these files with your actual information:
- `manifest.json`: Change "Your Name" and "yourusername" to your real details
- `README.md`: Update GitHub URLs to point to your repository
- `package.json`: Update author field

## Step 2: Create a GitHub Release

### 2.1 Build for Release
```bash
# Ensure everything is built
npm run build

# Verify required files exist:
# - main.js (bundled plugin)
# - manifest.json 
# - versions.json
ls -la main.js manifest.json versions.json
```

### 2.2 Create Release on GitHub
1. Go to your GitHub repository
2. Click "Releases" → "Create a new release"
3. Tag version: `1.0.0`
4. Release title: `A PDF Note Viewer v1.0.0`
5. Description:
```markdown
## Features
- Split-view PDF viewing with synchronized notes
- Auto-save functionality
- Flexible layouts (PDF left/right/top/bottom)
- Keyboard shortcuts for navigation
- Export notes to Markdown/HTML
- Auto-open PDFs from file explorer
- Linked notes with metadata

## Installation
Download and install from Obsidian Community Plugins, or manually install the files below.

## Files
- `main.js` - Main plugin file
- `manifest.json` - Plugin manifest
- `versions.json` - Version compatibility
```

6. **Attach these files to the release**:
   - `main.js`
   - `manifest.json` 
   - `versions.json`

7. Click "Publish release"

## Step 3: Submit to Obsidian Community Plugins

### 3.1 Fork the Community Plugins Repository
1. Go to [obsidianmd/obsidian-releases](https://github.com/obsidianmd/obsidian-releases)
2. Click "Fork" to create your own copy

### 3.2 Add Your Plugin
1. In your fork, go to the `community-plugins.json` file
2. Click "Edit this file" (pencil icon)
3. Add your plugin to the JSON array (alphabetically by ID):

```json
{
  "id": "a-pdf-note-viewer",
  "name": "A PDF Note Viewer", 
  "author": "Your Name",
  "description": "Split-view PDF viewer with synchronized note-taking, auto-save, and flexible layouts for enhanced document study.",
  "repo": "yourusername/obsidian-pdf-note-viewer"
}
```

### 3.3 Create Pull Request
1. Commit your changes with message: "Add A PDF Note Viewer plugin"
2. Click "Propose changes"
3. Click "Create pull request"
4. Title: "Add plugin: A PDF Note Viewer"
5. Description:
```markdown
## Plugin Information
- **Plugin ID**: a-pdf-note-viewer
- **Plugin Name**: A PDF Note Viewer
- **Repository**: https://github.com/yourusername/obsidian-pdf-note-viewer
- **Latest Release**: v1.0.0

## Description
Split-view PDF viewer with synchronized note-taking, auto-save, and flexible layouts for enhanced document study. Allows users to view PDFs and take page-specific notes in a resizable split-pane interface.

## Checklist
- [x] Plugin follows community plugin guidelines
- [x] Repository is public
- [x] Release includes required files (main.js, manifest.json, versions.json)
- [x] README.md includes installation and usage instructions
- [x] Plugin is desktop-only (requires PDF.js)
- [x] No external API calls or data collection
- [x] Plugin tested and working
```

## Step 4: Review Process

### What Happens Next
1. **Automated Checks**: GitHub Actions will verify your plugin structure
2. **Community Review**: Obsidian team and community members review your plugin
3. **Feedback**: You may receive requests for changes or improvements
4. **Approval**: Once approved, your plugin appears in the community plugins directory

### Timeline
- Initial review: 1-2 weeks
- Community feedback: 1-4 weeks total
- Approval and publication: 2-6 weeks typically

### Common Issues to Avoid
- Missing or incorrect `versions.json`
- Non-minified `main.js` file
- Security issues (external API calls without disclosure)
- Copyright violations
- Plugins that don't work on all desktop platforms

## Step 5: After Approval

### Updates
For future updates:
1. Update `manifest.json` version
2. Add new version to `versions.json`  
3. Create new GitHub release
4. Plugin updates automatically in Obsidian

### Support
- Monitor GitHub issues for bug reports
- Update README.md with new features
- Respond to community feedback

## Required Files Summary

Your repository must include:
- ✅ `main.js` - Bundled plugin code
- ✅ `manifest.json` - Plugin metadata
- ✅ `versions.json` - Version compatibility
- ✅ `README.md` - Documentation and usage
- ✅ `LICENSE` - Open source license
- ✅ Source code (`main.ts`, `package.json`, etc.)

## Tips for Approval
- Test thoroughly on different operating systems
- Follow Obsidian's plugin guidelines exactly
- Write clear documentation
- Respond quickly to review feedback
- Be patient - the review process takes time
- Engage positively with the community

Good luck with your plugin submission! 🚀