# PDF Notes Plugin - Community Deployment Guide

## Pre-Deployment Checklist

### ✅ Required Files (All Present)
- [x] `manifest.json` - Updated with correct metadata
- [x] `main.js` - Built plugin file  
- [x] `LICENSE` - MIT License
- [x] `README.md` - Comprehensive documentation
- [x] `versions.json` - Version compatibility mapping

### ✅ Plugin Information
- **ID**: `pdf-notes`
- **Name**: `PDF-Notes`
- **Version**: `1.0.1`
- **Author**: `Adam`
- **Min Obsidian Version**: `0.15.0`

## Step 1: Create GitHub Release

1. **Tag the release** (ensure you're on the main branch):
   ```bash
   git tag 1.0.1
   git push origin 1.0.1
   ```

2. **Create release on GitHub**:
   - Go to your repository → Releases → New Release
   - **Tag**: `1.0.1` (no "v" prefix)
   - **Title**: `Release 1.0.1`
   - **Description**: Add release notes (see template below)

3. **Upload these files to the release**:
   - `manifest.json`
   - `main.js` 
   - `styles.css` (if you have one)

### Release Notes Template:
```markdown
# PDF Notes Plugin v1.0.1

## Features
- View PDFs with integrated note-taking in Obsidian
- Split-pane layout with customizable positioning
- Page-synchronized notes with auto-save
- Theme support (light/dark/system)
- Keyboard shortcuts for navigation
- Auto-open PDFs from file explorer

## Installation
Download the attached files and place them in `.obsidian/plugins/pdf-notes/` in your vault.

## Requirements
- Obsidian v0.15.0 or higher
- Desktop only (not mobile compatible)
```

## Step 2: Submit to Community Plugins

1. **Fork the obsidian-releases repository**:
   ```bash
   git clone https://github.com/obsidianmd/obsidian-releases.git
   cd obsidian-releases
   git checkout -b add-pdf-notes-plugin
   ```

2. **Add your plugin to `community-plugins.json`**:
   Add this entry to the END of the list:

```json
{
  "id": "pdf-notes",
  "name": "PDF-Notes", 
  "author": "Adam",
  "description": "A plugin for viewing PDFs with integrated note-taking in Obsidian.",
  "repo": "your-username/pdf_plugin"
}
```

3. **Create Pull Request**:
   ```bash
   git add community-plugins.json
   git commit -m "Add PDF-Notes plugin"
   git push origin add-pdf-notes-plugin
   ```

4. **Open PR on GitHub**:
   - Title: `Add PDF-Notes plugin`
   - Use GitHub's submission checklist
   - Include link to your release

## Step 3: Submission Checklist

Before submitting, verify:

- [ ] Plugin follows [naming conventions](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines#Plugin+name)
- [ ] `manifest.json` ID matches community-plugins.json entry
- [ ] README.md includes installation and usage instructions
- [ ] Release has exact version tag (no "v" prefix)
- [ ] All required files attached to GitHub release
- [ ] Plugin tested in Obsidian
- [ ] No hardcoded file paths or system-specific code
- [ ] Respects user's vault structure
- [ ] No network requests without user consent

## Important Notes

- **Repository Name**: Update `"repo"` field with your actual GitHub username/repo
- **Plugin ID**: Must match exactly between `manifest.json` and `community-plugins.json`
- **Version Tagging**: Use exact version number (1.0.1), not v1.0.1
- **Release Files**: Only attach the files listed above, not the entire source code
- **Merge Conflicts**: Maintainers will handle these, don't worry about them

## After Submission

1. **Monitor your PR** for any requested changes
2. **Respond promptly** to maintainer feedback
3. **Wait for approval** - this can take several days to weeks
4. **Once merged**, users can install via Community Plugins browser

## Future Updates

For subsequent releases:
1. Update version in `manifest.json` and `versions.json`
2. Create new GitHub release with same process
3. Plugin will auto-update for users (no PR needed)

---

Your plugin is now ready for Community Plugin submission! 🚀