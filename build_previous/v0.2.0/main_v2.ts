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
  layout: "top" | "bottom" | "left" | "right";
  showNotes: boolean;
  showPdf: boolean;
}

const DEFAULT_SETTINGS: PdfNoteAlignerSettings = {
  defaultScale: 1.0,
  debug: false,
  layout: "left",
  showNotes: true,
  showPdf: true,
};

class PdfNoteView extends ItemView {
  private pdfContainer: HTMLElement | null = null;
  private noteContainer: HTMLElement | null = null;
  private currentPdf: any = null;
  private currentPage: number = 1;
  private currentPdfPath: string | null = null;
  private currentScale: number = 1.5;
  private plugin: PdfNoteAligner;
  private pageNotes: Map<number, string> = new Map();
  private currentNoteArea: HTMLTextAreaElement | null = null;

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

      // Create containers based on layout
      this.updateLayout(container);

      // Add file picker button
      this.createFilePickerButton();
      this.addStyles();

      // Create note area for page 1
      this.updateNoteSection(1);

    } catch (error) {
      console.error("Error in onOpen:", error);
      new Notice("Error initializing view: " + error.message);
    }
  }

  private updateLayout(container: Element): void {
    // Create containers
    this.pdfContainer = container.createDiv({ cls: "pdf-container" });
    this.noteContainer = container.createDiv({ cls: "note-container" });

    // Apply layout class
    container.removeClass("layout-left", "layout-right", "layout-top", "layout-bottom");
    container.addClass(`layout-${this.plugin.settings.layout}`);
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

  private updateNoteSection(pageNumber: number): void {
    if (!this.noteContainer) return;

    // Save current note if exists
    if (this.currentNoteArea && this.currentPage) {
      this.pageNotes.set(this.currentPage, this.currentNoteArea.value);
    }

    // Clear note container
    this.noteContainer.empty();

    // Create header
    const header = this.noteContainer.createDiv({ cls: "note-header" });
    header.createEl("h3", { text: `Notes for Page ${pageNumber}` });

    // Create textarea for this page
    const noteArea = this.noteContainer.createEl("textarea", {
      cls: "pdf-note-textarea",
      attr: {
        placeholder: `Take notes for page ${pageNumber}...`,
      },
    });

    // Load existing notes for this page
    const existingNotes = this.pageNotes.get(pageNumber) || "";
    noteArea.value = existingNotes;

    // Style the textarea
    noteArea.style.width = "100%";
    noteArea.style.height = "calc(100% - 50px)";
    noteArea.style.resize = "none";
    noteArea.style.border = "none";
    noteArea.style.outline = "none";
    noteArea.style.padding = "16px";
    noteArea.style.fontFamily = "var(--font-text)";
    noteArea.style.fontSize = "var(--font-text-size)";
    noteArea.style.lineHeight = "var(--line-height-normal)";
    noteArea.style.backgroundColor = "var(--background-primary)";
    noteArea.style.color = "var(--text-normal)";

    this.currentNoteArea = noteArea;
    this.currentPage = pageNumber;
  }

  private addStyles(): void {
    const existingStyle = document.querySelector("#pdf-note-viewer-styles");
    if (existingStyle) {
      existingStyle.remove();
    }

    const style = document.createElement("style");
    style.id = "pdf-note-viewer-styles";
    style.textContent = `
      .pdf-note-container {
        display: flex;
        height: 100%;
        width: 100%;
      }
      .pdf-note-container.layout-left {
        flex-direction: row;
      }
      .pdf-note-container.layout-right {
        flex-direction: row-reverse;
      }
      .pdf-note-container.layout-top {
        flex-direction: column;
      }
      .pdf-note-container.layout-bottom {
        flex-direction: column-reverse;
      }
      .pdf-container {
        flex: 1;
        display: flex;
        flex-direction: column;
        border-right: 1px solid var(--background-modifier-border);
        position: relative;
        overflow: auto;
      }
      .note-container {
        flex: 1;
        display: flex;
        flex-direction: column;
        padding: 0;
      }
      .note-header {
        padding: 12px 16px;
        border-bottom: 1px solid var(--background-modifier-border);
        background: var(--background-secondary);
      }
      .note-header h3 {
        margin: 0;
        color: var(--text-normal);
        font-size: var(--font-ui-medium);
      }
      .pdf-picker-container {
        display: flex;
        justify-content: center;
        align-items: center;
        height: 100%;
      }
      .pdf-canvas {
        max-width: 100%;
        max-height: calc(100vh - 120px);
        margin: 16px auto;
        display: block;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      }
      .pdf-controls {
        position: sticky;
        top: 0;
        background: var(--background-primary);
        border-bottom: 1px solid var(--background-modifier-border);
        padding: 8px 16px;
        display: flex;
        align-items: center;
        gap: 8px;
        z-index: 10;
      }
      .pdf-controls button {
        padding: 4px 8px;
        border: 1px solid var(--background-modifier-border);
        background: var(--background-primary);
        color: var(--text-normal);
        cursor: pointer;
        border-radius: 4px;
      }
      .pdf-controls button:hover {
        background: var(--background-modifier-hover);
      }
      .pdf-controls button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .page-info {
        color: var(--text-muted);
        font-size: var(--font-ui-small);
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
      this.updateNoteSection(1);
      
      new Notice(`Loaded PDF: ${file.name} (${pdf.numPages} pages)`);
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

      // Create controls
      const controls = this.pdfContainer.createDiv({ cls: "pdf-controls" });
      
      const prevBtn = controls.createEl("button", { text: "Previous" });
      const nextBtn = controls.createEl("button", { text: "Next" });
      const pageInfo = controls.createDiv({ cls: "page-info" });
      pageInfo.textContent = `Page ${pageNumber} of ${this.currentPdf.numPages}`;

      prevBtn.disabled = pageNumber <= 1;
      nextBtn.disabled = pageNumber >= this.currentPdf.numPages;

      prevBtn.onclick = () => {
        if (pageNumber > 1) {
          this.renderPage(pageNumber - 1);
          this.updateNoteSection(pageNumber - 1);
        }
      };

      nextBtn.onclick = () => {
        if (pageNumber < this.currentPdf.numPages) {
          this.renderPage(pageNumber + 1);
          this.updateNoteSection(pageNumber + 1);
        }
      };

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
    // Save current notes before closing
    if (this.currentNoteArea && this.currentPage) {
      this.pageNotes.set(this.currentPage, this.currentNoteArea.value);
    }

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
      .setName("Layout")
      .setDesc("Choose where the PDF appears relative to notes")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("left", "PDF Left, Notes Right")
          .addOption("right", "PDF Right, Notes Left")
          .addOption("top", "PDF Top, Notes Bottom")
          .addOption("bottom", "PDF Bottom, Notes Top")
          .setValue(this.plugin.settings.layout)
          .onChange(async (value: "top" | "bottom" | "left" | "right") => {
            this.plugin.settings.layout = value;
            await this.plugin.saveSettings();
            // Update all open views
            this.app.workspace
              .getLeavesOfType(PDF_NOTE_VIEW_TYPE)
              .forEach((leaf) => {
                const view = leaf.view as PdfNoteView;
                // Trigger layout update
                view.onOpen();
              });
          })
      );

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
      .setName("Show PDF")
      .setDesc("Show or hide the PDF viewer")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showPdf)
          .onChange(async (value) => {
            this.plugin.settings.showPdf = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Show Notes")
      .setDesc("Show or hide the notes section")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showNotes)
          .onChange(async (value) => {
            this.plugin.settings.showNotes = value;
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