import { App, Plugin, PluginSettingTab, Setting, Notice } from 'obsidian';
import * as pdfjsLib from "pdfjs-dist";

// Define plugin settings interface and defaults
interface PDFNoteSyncSettings {
	autoGenerateNoteStructure: boolean;
}

const DEFAULT_SETTINGS: PDFNoteSyncSettings = {
	autoGenerateNoteStructure: true,
};

export default class PDFNoteSyncPlugin extends Plugin {
	settings: PDFNoteSyncSettings;

	async onload() {
		console.log("Loading PDF Note Sync Plugin");

		// Load plugin settings
		await this.loadSettings();

		// Add command: Generate note structure for PDF
		this.addCommand({
			id: "generate-note-structure",
			name: "Generate Note Structure for PDF",
			callback: () => this.generateNoteStructure(),
		});

		// Add settings tab
		this.addSettingTab(new PDFNoteSyncSettingTab(this.app, this));

		// Ribbon Icon
		const ribbonIconEl = this.addRibbonIcon('documents', 'PDF Note Sync', () => {
			new Notice('PDF Note Sync Plugin is active!');
		});
		ribbonIconEl.addClass('pdf-note-sync-ribbon');
	}

	async onunload() {
		console.log("Unloading PDF Note Sync Plugin");
	}

	// Load and save settings
	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	// Command to generate note structure
	generateNoteStructure() {
		// Example: Generate note structure with placeholders for each PDF page
		const numPages = 10; // Replace with actual page count from PDF.js
		let noteContent = "# PDF Notes\n\n";
		for (let i = 1; i <= numPages; i++) {
			noteContent += `## Page ${i}\n\n\n`;
		}

		// Create a new note in Obsidian
		this.app.vault.create('PDF Notes.md', noteContent)
			.then(() => {
				new Notice("Note structure generated for PDF!");
			})
			.catch(err => {
				console.error("Failed to create note:", err);
			});
	}
}

// Settings Tab for configuring the plugin
class PDFNoteSyncSettingTab extends PluginSettingTab {
	plugin: PDFNoteSyncPlugin;

	constructor(app: App, plugin: PDFNoteSyncPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();
		containerEl.createEl('h2', { text: 'PDF Note Sync Settings' });

		new Setting(containerEl)
			.setName('Auto-Generate Note Structure')
			.setDesc('Automatically generate a note structure for PDFs when opened.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoGenerateNoteStructure)
				.onChange(async (value) => {
					this.plugin.settings.autoGenerateNoteStructure = value;
					await this.plugin.saveSettings();
				}));
	}
}