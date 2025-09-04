# A PDF Note Viewer - Obsidian Plugin

A powerful Obsidian plugin that allows you to view PDFs and take synchronized notes side-by-side. Perfect for studying, research, and document annotation.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Obsidian](https://img.shields.io/badge/Obsidian-v0.15.0+-purple.svg)

## Features

### 📚 Core Features
- **Split View PDF & Notes**: View PDFs and take notes simultaneously in a customizable split-pane layout
- **Flexible Layouts**: Choose from 4 layout options (PDF left/right/top/bottom)
- **Page-Synchronized Notes**: Each PDF page has its own note section
- **Auto-Save**: Notes are automatically saved as you type (configurable interval)
- **Single File Storage**: All notes for a PDF are stored in one markdown file to avoid vault clutter
- **Auto-Open PDFs**: Click any PDF in file explorer to automatically open in the viewer
- **Linked Notes**: Notes automatically link to their source PDF with metadata

### 🎨 Customization
- **Theme Support**: Light, dark, or system theme following
- **Adjustable Font Size**: Customize note-taking font size (10-24px)
- **Note Templates**: Set default templates for new note pages
- **Resizable Panes**: Drag to resize PDF and note sections
- **Hide/Show Panels**: Toggle visibility of PDF or notes for more space

### 🔍 PDF Viewing
- **Multiple Zoom Options**: Fit to width, height, or page
- **Zoom Controls**: Zoom in/out with buttons or keyboard shortcuts
- **Page Navigation**: Jump to any page quickly
- **Remember Last Page**: Optionally restore last viewed page when reopening
- **Text Selection**: Select and copy text from PDFs (optional)
- **Highlighting**: Highlight important text (optional)

### ⌨️ Keyboard Shortcuts
- `→/←` - Navigate pages
- `Ctrl/⌘ + Home/End` - Jump to first/last page
- `Ctrl/⌘ + G` - Go to specific page
- `Ctrl/⌘ + +/-` - Zoom in/out
- `Ctrl/⌘ + 0` - Reset zoom
- `Alt + P` - Toggle PDF visibility
- `Alt + N` - Toggle Notes visibility
- `Ctrl/⌘ + Shift + S` - Quick save PDF + Notes

## Installation

### From Obsidian Community Plugins (Coming Soon)
1. Open Obsidian Settings
2. Navigate to Community Plugins
3. Search for "A PDF Note Viewer"
4. Click Install, then Enable

### Manual Installation
1. Download the latest release from [GitHub Releases](https://github.com/yourusername/a-pdf-note-viewer/releases)
2. Extract the files to your vault's `.obsidian/plugins/a-pdf-note-viewer/` folder
3. Reload Obsidian
4. Enable the plugin in Settings → Community Plugins

### Building from Source
```bash
# Clone the repository
git clone https://github.com/yourusername/a-pdf-note-viewer.git
cd a-pdf-note-viewer

# Install dependencies
npm install

# Build the plugin
npm run build

# For development with hot reload
npm run dev
```

## Usage

### Opening a PDF
1. **Direct Click**: Simply click any PDF file in the file explorer - it automatically opens in the viewer
2. **Via Ribbon Icon**: Click the document icon in the left sidebar
3. **Via Command Palette**: Use `Ctrl/⌘ + P` and search for "Open A PDF Note Viewer"
4. **Via File Menu**: Right-click any PDF file and select "Open in PDF Note Viewer"
5. **From Links**: Click any PDF link in your notes to open it in the viewer

### Taking Notes
1. Open a PDF using any method above
2. Click "Select PDF" and choose your file
3. Notes are automatically created for each page
4. Navigate between pages using arrows or keyboard shortcuts
5. Your notes are saved automatically

### Saving PDF with Notes
1. Click "Save PDF + Notes" button
2. Enter a name for your saved combination
3. Both PDF and notes will be saved together
4. Load saved combinations using "Load Saved" button

### Customizing Layout
1. Open plugin settings (Settings → A PDF Note Viewer)
2. Choose your preferred layout (PDF position)
3. Adjust font size, themes, and other preferences
4. Enable/disable features like highlighting and text selection

## Settings

### Layout & Display
- **Default Layout**: Choose PDF position (left/right/top/bottom)
- **Default Fit Mode**: How PDFs fit in viewer (width/height/page)
- **Show PDF/Notes by Default**: Toggle default visibility
- **Theme**: Light, dark, or follow system

### Note Taking
- **Auto-Save Interval**: Seconds before auto-saving (0 to disable)
- **Note Font Size**: Adjust text size (10-24px)
- **Default Note Template**: Template for new pages
- **Remember Last Page**: Restore position when reopening

### PDF Viewing
- **Enable Text Selection**: Allow copying from PDFs
- **Enable Highlighting**: Allow text highlighting
- **Highlight Color**: Default highlight color

### Keyboard Shortcuts
- **Enable Shortcuts**: Toggle keyboard navigation
- View shortcut reference in settings

### Export
- **Export Format**: Choose between Markdown, PDF, or HTML

## File Structure

Notes are saved in the same directory as your PDF with the naming pattern:
- PDF: `your-document.pdf`
- Notes: `your-document.pdf-notes.md` (with metadata linking back to PDF)

Note files include metadata:
```yaml
---
pdf-file: "your-document.pdf"
type: pdf-notes
created: 2024-01-01T00:00:00.000Z
last-modified: 2024-01-01T00:00:00.000Z
---
```

Saved combinations create:
- PDF copy: `your-save-name.pdf`
- Notes with metadata: `your-save-name.md`

### Auto-Linking
- When you open a PDF, its notes are automatically loaded
- When you open a notes file with PDF metadata, the linked PDF opens automatically
- Notes remember the last page viewed (if enabled in settings)

## Troubleshooting

### PDF Not Loading
- Ensure the PDF file is not corrupted
- Check file permissions
- Try reloading Obsidian

### Notes Not Saving
- Check auto-save interval in settings
- Ensure you have write permissions
- Manually trigger save with blur (clicking outside)

### Performance Issues
- Large PDFs may take time to load
- Reduce zoom level for better performance
- Close other resource-intensive applications

### Keyboard Shortcuts Not Working
- Ensure shortcuts are enabled in settings
- Check for conflicts with other plugins
- Some shortcuts may not work in text areas

## Development

### Project Structure
```
a-pdf-note-viewer/
├── main.ts           # Main plugin code
├── manifest.json     # Plugin manifest
├── package.json      # Dependencies
├── tsconfig.json     # TypeScript config
├── esbuild.config.mjs # Build configuration
└── README.md         # This file
```

### Technologies Used
- TypeScript
- Obsidian API
- PDF.js for PDF rendering
- CodeMirror for text editing
- esbuild for bundling

### Contributing
Contributions are welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

## Support

- **Bug Reports**: [GitHub Issues](https://github.com/yourusername/a-pdf-note-viewer/issues)
- **Feature Requests**: [GitHub Discussions](https://github.com/yourusername/a-pdf-note-viewer/discussions)
- **Documentation**: [Wiki](https://github.com/yourusername/a-pdf-note-viewer/wiki)

## License

MIT License - see [LICENSE](LICENSE) file for details

## Acknowledgments

- Obsidian team for the amazing platform
- PDF.js contributors for PDF rendering
- Community testers and contributors

## Changelog

### Version 1.0.0 (Current)
- Initial release
- Core PDF viewing and note-taking functionality
- Multiple layout options
- Auto-save feature
- Keyboard shortcuts
- Theme support
- Settings page with extensive customization

### Roadmap
- [ ] Export notes with annotations
- [ ] PDF search functionality
- [ ] Handwriting support
- [ ] Multi-language support
- [ ] Cloud sync for notes
- [ ] Collaborative note-taking
- [ ] OCR for scanned PDFs
- [ ] Integration with other note-taking tools

---

Made with ❤️ for the Obsidian community