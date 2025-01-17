#!/bin/bash

# Define the plugin directory
PLUGIN_DIR="$HOME/Library/Mobile Documents/iCloud~md~obsidian/Documents/CS/.obsidian/plugins/a-pdf-note-viewer"

# First build in the source directory
echo "Building in source directory..."
npm run build

# Create plugin directory if it doesn't exist
if [ ! -d "$PLUGIN_DIR" ]; then
    echo "Creating plugin directory..."
    mkdir -p "$PLUGIN_DIR"
    echo "Installing dependencies..."
    cp package.json "$PLUGIN_DIR/"
    cd "$PLUGIN_DIR"
    npm install --no-package-lock
    cd -
fi

# Copy only the source files, preserving node_modules
echo "Copying updated files to Obsidian plugins directory..."
cp main.ts manifest.json tsconfig.json esbuild.config.mjs main.js "$PLUGIN_DIR/"

# Build plugin in Obsidian directory
echo "Building plugin in Obsidian directory..."
cd "$PLUGIN_DIR"
export NODE_OPTIONS="--no-warnings"
npx --no-install tsc -noEmit -skipLibCheck && node esbuild.config.mjs production

echo "Done! Plugin has been built and installed." 

