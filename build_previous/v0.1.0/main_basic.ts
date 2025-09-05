import {
  App,
  Plugin,
  PluginSettingTab,
  WorkspaceLeaf,
  TFile,
  ItemView,
  ViewStateResult,
  Notice,
  FileSystemAdapter,
  Modal,
  Setting,
} from "obsidian";
import * as pdfjsLib from "pdfjs-dist";

// Import PDF.js worker
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.entry";

const PDF_NOTE_VIEW_TYPE = "a-pdf-note-viewer";

interface PdfNoteAlignerSettings {
  defaultScale: number;
  debug: boolean;
}

const DEFAULT_SETTINGS: PdfNoteAlignerSettings = {
  defaultScale: 1.0,
  debug: false,
};

class PdfNoteView extends ItemView {
  private pdfContainer: HTMLElement | null = null;
  private noteContainer: HTMLElement | null = null;
  private currentPdf: any = null;
  private currentPage: number = 1;
  private currentPdfPath: string | null = null;
  private currentScale: number = 1.5;
  private plugin: PdfNoteAligner;

  constructor(leaf: WorkspaceLeaf, plugin: PdfNoteAligner) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return PDF_NOTE_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "A PDF Note Viewer";
  }

  async onOpen(): Promise<void> {
    try {
      // Initialize PDF.js worker
      pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

      const container = this.containerEl.children[1];
      if (!container) {
        throw new Error("Container element not found");
      }

      container.empty();
      container.addClass("pdf-note-container");

      // Create containers
      this.pdfContainer = container.createDiv({ cls: "pdf-container" });
      this.noteContainer = container.createDiv({ cls: "note-container" });

      // Add file picker button
      this.createFilePickerButton();
      this.addStyles();

      // Create simple note area
      this.createNoteArea();

    } catch (error) {
      console.error("Error in onOpen:", error);
      new Notice("Error initializing view: " + error.message);
    }
  }

  private createFilePickerButton(): void {
    if (!this.pdfContainer) return;

    const buttonContainer = this.pdfContainer.createDiv({
      cls: "pdf-picker-container",
    });
    const button = buttonContainer.createEl("button", {
      text: "Select PDF",
      cls: "mod-cta",
    });

    button.onclick = async () => {
      await this.selectAndLoadPdf();
    };
  }

  private createNoteArea(): void {
    if (!this.noteContainer) return;

    const noteArea = this.noteContainer.createEl("textarea", {
      cls: "pdf-note-textarea",
      attr: {
        placeholder: "Take notes here...",
      },
    });

    noteArea.style.width = "100%";
    noteArea.style.height = "100%";
    noteArea.style.resize = "none";
    noteArea.style.border = "none";
    noteArea.style.outline = "none";
    noteArea.style.padding = "16px";
    noteArea.style.fontFamily = "var(--font-text)";
    noteArea.style.fontSize = "var(--font-text-size)";
    noteArea.style.lineHeight = "var(--line-height-normal)";
    noteArea.style.backgroundColor = "var(--background-primary)";
    noteArea.style.color = "var(--text-normal)";
  }

  private addStyles(): void {
    const style = document.createElement("style");
    style.textContent = `
      .pdf-note-container {
        display: flex;
        height: 100%;
        width: 100%;
        flex-direction: row;
      }
      .pdf-container {
        flex: 1;
        display: flex;
        flex-direction: column;
        border-right: 1px solid var(--background-modifier-border);
      }
      .note-container {
        flex: 1;
        display: flex;
        flex-direction: column;
      }
      .pdf-picker-container {
        display: flex;
        justify-content: center;
        align-items: center;
        height: 100%;
      }
      .pdf-canvas {
        max-width: 100%;
        max-height: 100%;
        margin: auto;
        display: block;
      }
    `;
    document.head.appendChild(style);
  }

  async selectAndLoadPdf(): Promise<void> {
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = ".pdf";
    
    fileInput.onchange = async (event) => {
      const target = event.target as HTMLInputElement;
      const file = target.files?.[0];
      if (file) {
        await this.loadPdfFile(file);
      }
    };
    
    fileInput.click();
  }

  async loadPdfFile(file: File): Promise<void> {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      
      this.currentPdf = pdf;
      this.currentPage = 1;
      this.currentPdfPath = file.name;
      
      await this.renderPage(1);
      
      new Notice(`Loaded PDF: ${file.name}`);
    } catch (error) {
      console.error("Error loading PDF:", error);
      new Notice("Error loading PDF: " + error.message);
    }
  }

  async renderPage(pageNumber: number): Promise<void> {
    if (!this.currentPdf || !this.pdfContainer) return;

    try {
      const page = await this.currentPdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: this.currentScale });

      // Clear previous content
      this.pdfContainer.empty();

      // Create canvas
      const canvas = this.pdfContainer.createEl("canvas", { cls: "pdf-canvas" });
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      const context = canvas.getContext("2d");
      if (!context) return;

      // Render PDF page
      await page.render({
        canvasContext: context,
        viewport: viewport,
      }).promise;

      this.currentPage = pageNumber;

    } catch (error) {
      console.error("Error rendering page:", error);
      new Notice("Error rendering page: " + error.message);
    }
  }

  async onClose(): Promise<void> {
    // Cleanup
    if (this.currentPdf) {
      this.currentPdf = null;
    }
  }
}

export default class PdfNoteAligner extends Plugin {
  settings: PdfNoteAlignerSettings;

  async onload() {
    await this.loadSettings();

    // Register view type
    this.registerView(
      PDF_NOTE_VIEW_TYPE,
      (leaf) => new PdfNoteView(leaf, this)
    );

    // Add ribbon icon
    this.addRibbonIcon("document", "Open A PDF Note Viewer", async () => {
      await this.activateView();
    });

    this.addSettingTab(new PdfNoteAlignerSettingTab(this.app, this));
  }

  async activateView(): Promise<WorkspaceLeaf | null> {
    const { workspace } = this.app;

    let leaf: WorkspaceLeaf | null = null;
    const leaves = workspace.getLeavesOfType(PDF_NOTE_VIEW_TYPE);

    if (leaves.length > 0) {
      leaf = leaves[0];
    } else {
      leaf = workspace.getLeaf(false);
      await leaf.setViewState({
        type: PDF_NOTE_VIEW_TYPE,
        active: true,
      });
    }

    workspace.revealLeaf(leaf);
    return leaf;
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

class PdfNoteAlignerSettingTab extends PluginSettingTab {
  plugin: PdfNoteAligner;

  constructor(app: App, plugin: PdfNoteAligner) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "A PDF Note Viewer Settings" });

    new Setting(containerEl)
      .setName("Default Scale")
      .setDesc("Default zoom level for PDFs")
      .addSlider((slider) =>
        slider
          .setLimits(0.5, 3.0, 0.1)
          .setValue(this.plugin.settings.defaultScale)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.defaultScale = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Debug Mode")
      .setDesc("Enable debug logging")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.debug)
          .onChange(async (value) => {
            this.plugin.settings.debug = value;
            await this.plugin.saveSettings();
          })
      );
  }
}