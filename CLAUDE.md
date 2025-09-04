# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Recent Fixes Applied

1. **PDF.js Worker Issue** - Fixed worker initialization to use bundled worker module instead of external file path
2. **Default Fit Mode** - Changed default from "page" to "width" as per requirements  
3. **Removed Duplicate Code** - Cleaned up unused onload/onunload methods in PdfNoteView class
4. **Notes Storage** - Notes are saved as single file per PDF (`{pdf-name}-notes.md`) to avoid vault clutter
5. **Sticky Controls Bar** - Fixed PDF controls to have solid background without PDF content showing through
6. **Auto-Open PDFs** - PDFs automatically open in viewer when clicked in file explorer
7. **Linked Notes System** - Notes include metadata linking back to PDF for auto-opening
8. **Custom Icon** - Added distinctive sidebar icon (grid layout with "P" indicator) for easy identification

## Development Commands

### Building the Plugin
```bash
# Development build with source maps
npm run dev

# Production build (minified, no source maps)
npm run build

# Install to Obsidian vault (uses build.sh script)
./build.sh
```

### TypeScript Checking
```bash
# Type check without emitting files
npx tsc -noEmit -skipLibCheck
```

## Architecture Overview

This is an Obsidian plugin for viewing PDFs with synchronized note-taking capabilities. The architecture centers around:

### Core Components

1. **PdfNoteView** (`main.ts:55-1235`) - Main view class extending Obsidian's ItemView
   - Manages dual-pane layout with PDF viewer and note editor
   - Handles PDF rendering via PDF.js library
   - Implements resizable split view with multiple layout options (top/bottom/left/right)
   - Manages per-page note synchronization

2. **PdfNoteAligner Plugin** (`main.ts:1359-1431`) - Main plugin class
   - Registers the custom PDF view type
   - Manages plugin settings and persistence
   - Provides ribbon icon and file menu integration

3. **PDF Rendering Pipeline**
   - Uses PDF.js library with web worker for performance
   - Worker file (`pdf.worker.min.js`) is copied during build via esbuild plugin
   - Implements dark/light theme support with CSS filters
   - Handles zoom controls and fit-to-width/height/page modes

4. **Note Management**
   - Notes stored as Markdown files with pattern: `{pdf-name}-notes.md`
   - Page-specific notes with `## Page N` headers
   - Save/load functionality for PDF + notes combinations

### Build System

- **esbuild** for bundling with custom plugin to copy PDF.js worker
- External dependencies: Obsidian API, CodeMirror packages
- Target: ES2018, CommonJS format
- Development mode includes inline source maps

### Key Design Patterns

- **View State Management**: Uses Obsidian's ViewStateResult for persistence
- **Event-Driven Updates**: Settings changes propagate to all open views
- **Modal Dialogs**: Custom modals for file selection and save operations
- **Resizable Panels**: Mouse-driven resizing with min/max constraints

### File Organization

- `main.ts` - All plugin code in single file
- `esbuild.config.mjs` - Build configuration with PDF worker copy plugin
- `build.sh` - Deployment script to Obsidian vault
- Output: `main.js` (bundled), `pdf.worker.min.js` (copied)