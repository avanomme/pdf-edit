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
import { EditorView, keymap } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { basicSetup } from "@codemirror/basic-setup";
import { indentWithTab } from "@codemirror/commands";

// Import PDF.js worker
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.entry";

const PDF_NOTE_VIEW_TYPE = "a-pdf-note-viewer";

interface PdfNoteAlignerSettings {
  defaultScale: number;
  debug: boolean;
  layout: "top" | "bottom" | "left" | "right";
  fitMode: "width" | "height" | "page";
  showNotes: boolean;
  showPdf: boolean;
  theme: "light" | "dark" | "system";
}

const DEFAULT_SETTINGS: PdfNoteAlignerSettings = {
  defaultScale: 1.0,
  debug: false,
  layout: "top",
  fitMode: "page",
  showNotes: true,
  showPdf: true,
  theme: "system",
};

interface PdfHighlight {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  text?: string;
  id: string;
}

class PdfNoteView extends ItemView {
  private pdfContainer: HTMLElement | null = null;
  private noteContainer: HTMLElement | null = null;
  private currentPdf: any = null;
  private currentPage: number = 1;
  private currentPdfPath: string | null = null;
  private pdfScrollTimeout: NodeJS.Timeout | null = null;
  private isScrolling: boolean = false;
  private isDarkMode: boolean = false;
  private currentScale: number = 1.5;
  private textLayer: HTMLElement | null = null;
  private highlights: Map<number, PdfHighlight[]> = new Map();
  private isPdfCollapsed: boolean = false;
  private selectedHighlightColor: string = "#ffeb3b";
  private isHighlightDeleteMode: boolean = false;
  private plugin: PdfNoteAligner;
  private fitToWidthScale: number = 1.0;
  private currentSaveFolder: string | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: PdfNoteAligner) {
    super(leaf);
    this.plugin = plugin;
    this.isDarkMode = document.body.classList.contains("theme-dark");
  }

  getViewType(): string {
    return PDF_NOTE_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "A PDF Note Viewer";
  }

  async onOpen(): Promise<void> {
    try {
      // Initialize PDF.js worker using local worker file
      pdfjsLib.GlobalWorkerOptions.workerSrc = "pdf.worker.min.js";

      // Initialize the container
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

      // Add styles
      this.addStyles();

      // Set initial layout
      this.updateLayout();

      // Register theme change listener
      this.registerEvent(
        this.app.workspace.on("css-change", () => {
          const newDarkMode = document.body.classList.contains("theme-dark");
          if (this.isDarkMode !== newDarkMode) {
            this.isDarkMode = newDarkMode;
            if (this.currentPdf) {
              this.renderPage(this.currentPage, false).catch(console.error);
            }
          }
        })
      );

      // Set initial visibility
      this.updateVisibility();
    } catch (error) {
      console.error("Error in onOpen:", error);
      new Notice("Error initializing view: " + error.message);
    }
  }

  updateLayout(): void {
    const container = this.containerEl?.children[1];
    if (!container) return;

    // Remove all layout classes
    container.removeClass(
      "layout-top",
      "layout-bottom",
      "layout-left",
      "layout-right"
    );
    // Add current layout class
    container.addClass(`layout-${this.plugin.settings.layout}`);

    // Reset flex properties
    if (this.pdfContainer && this.noteContainer) {
      this.pdfContainer.style.flex = "1";
      this.pdfContainer.style.width = "";
      this.pdfContainer.style.height = "";
      this.noteContainer.style.flex = "1";
      this.noteContainer.style.width = "";
      this.noteContainer.style.height = "";
    }

    // Setup resizer
    this.setupResizer();
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

  private addStyles(): void {
    const style = document.createElement("style");
    style.textContent = `
      .pdf-note-container {
        display: flex;
        height: 100%;
        width: 100%;
        position: relative;
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
        overflow: auto;
        padding: 20px;
        position: relative;
        min-height: 200px;
        min-width: 200px;
      }
      .note-container {
        flex: 1;
        overflow: auto;
        padding: 20px;
        border: 1px solid var(--background-modifier-border);
        min-height: 200px;
        min-width: 200px;
      }
      .resizer {
        position: absolute;
        z-index: 100;
        background: var(--background-modifier-border);
        opacity: 0.6;
        transition: opacity 0.2s;
      }
      .resizer:hover {
        opacity: 1;
      }
      .resizer.vertical {
        cursor: col-resize;
        width: 4px;
        height: 100%;
      }
      .resizer.horizontal {
        cursor: row-resize;
        height: 4px;
        width: 100%;
      }
      .note-navigation {
        display: flex;
        justify-content: space-between;
        margin-bottom: 1em;
        padding-bottom: 0.5em;
        border-bottom: 1px solid var(--background-modifier-border);
      }
      .note-navigation a {
        color: var(--text-accent);
        cursor: pointer;
      }
      .note-navigation a:hover {
        text-decoration: underline;
      }
      .pdf-page-container {
        margin-bottom: 20px;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
      }
      .pdf-canvas-container {
        position: relative;
      }
      .pdf-loading {
        padding: 20px;
        text-align: center;
      }
      .pdf-error {
        padding: 20px;
        color: var(--text-error);
        text-align: center;
      }
      .pdf-picker-container {
        text-align: center;
        padding: 20px;
      }
      .pdf-controls {
        display: flex;
        flex-wrap: wrap;
        justify-content: space-between;
        gap: 10px;
        padding: 10px;
        background: var(--background-secondary);
        border-radius: 4px;
        margin-bottom: 10px;
        width: 100%;
        box-sizing: border-box;
      }
      .pdf-controls-group {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
      }
      .pdf-zoom-button {
        min-width: 30px;
        height: 30px;
        padding: 0 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 4px;
        background: var(--interactive-normal);
        color: var(--text-normal);
        font-size: 14px;
        cursor: pointer;
        white-space: nowrap;
      }
      .pdf-zoom-button:hover {
        background: var(--interactive-hover);
      }
      .pdf-zoom-display {
        min-width: 60px;
        text-align: center;
      }
      .pdf-page-number input {
        width: 50px;
        text-align: center;
      }
      .theme-dark .pdf-canvas-container canvas {
        filter: invert(1) hue-rotate(180deg);
      }
      .pdf-page-number {
        display: flex;
        align-items: center;
        gap: 5px;
      }
      .note-page-header {
        font-size: 1.5em;
        margin-bottom: 1em;
        border-bottom: 1px solid var(--background-modifier-border);
        padding-bottom: 0.5em;
      }
      .note-content {
        width: 100%;
        height: calc(100% - 4em);
        resize: none;
        border: none;
        background: transparent;
        font-family: inherit;
        padding: 1em;
      }
      .pdf-layout-select,
      .pdf-fit-mode {
        min-width: 100px;
        max-width: 150px;
      }
      @media (max-width: 800px) {
        .pdf-controls {
          flex-direction: column;
          align-items: stretch;
        }
        
        .pdf-controls-group {
          justify-content: center;
        }
      }
      .pdf-toggle-button {
        padding: 4px 8px;
        border-radius: 4px;
        background: var(--interactive-normal);
        color: var(--text-normal);
        font-size: 12px;
        cursor: pointer;
        white-space: nowrap;
      }
      .pdf-toggle-button:hover {
        background: var(--interactive-hover);
      }
      .pdf-controls {
        position: sticky;
        top: 0;
        z-index: 100;
        background: var(--background-secondary);
      }
    `;
    document.head.appendChild(style);
  }

  private setupResizer(): void {
    const container = this.containerEl.children[1] as HTMLElement;
    if (!container || !this.pdfContainer || !this.noteContainer) return;

    // Remove existing resizer if any
    const existingResizer = container.querySelector(".resizer");
    if (existingResizer) existingResizer.remove();

    const resizer = container.createDiv({ cls: "resizer" });
    const isHorizontal = ["top", "bottom"].includes(
      this.plugin.settings.layout
    );
    resizer.addClass(isHorizontal ? "horizontal" : "vertical");

    // Position the resizer
    if (
      this.plugin.settings.layout === "left" ||
      this.plugin.settings.layout === "right"
    ) {
      resizer.style.left = "50%";
      resizer.style.transform = "translateX(-50%)";
    } else {
      resizer.style.top = "50%";
      resizer.style.transform = "translateY(-50%)";
    }

    let startPos = 0;
    let startSize = 0;

    const startResize = (e: MouseEvent) => {
      if (!this.pdfContainer || !this.noteContainer) return;

      startPos = isHorizontal ? e.clientY : e.clientX;
      startSize = isHorizontal
        ? this.pdfContainer.getBoundingClientRect().height
        : this.pdfContainer.getBoundingClientRect().width;
      document.addEventListener("mousemove", resize);
      document.addEventListener("mouseup", stopResize);
    };

    const resize = (e: MouseEvent) => {
      if (!this.pdfContainer || !this.noteContainer) return;

      const currentPos = isHorizontal ? e.clientY : e.clientX;
      const diff = currentPos - startPos;

      const newSize =
        startSize +
        (this.plugin.settings.layout === "right" ||
        this.plugin.settings.layout === "bottom"
          ? -diff
          : diff);

      const containerSize = isHorizontal
        ? container.clientHeight
        : container.clientWidth;
      const minSize = 200;
      const maxSize = containerSize - minSize;

      const clampedSize = Math.min(Math.max(newSize, minSize), maxSize);

      if (isHorizontal) {
        this.pdfContainer.style.flex = "none";
        this.pdfContainer.style.height = `${clampedSize}px`;
        this.noteContainer.style.flex = "1";
      } else {
        this.pdfContainer.style.flex = "none";
        this.pdfContainer.style.width = `${clampedSize}px`;
        this.noteContainer.style.flex = "1";
      }
    };

    const stopResize = () => {
      document.removeEventListener("mousemove", resize);
      document.removeEventListener("mouseup", stopResize);
    };

    resizer.addEventListener("mousedown", startResize);
  }

  private async selectAndLoadPdf() {
    const pdfFiles = this.app.vault
      .getFiles()
      .filter((file) => file.extension === "pdf");

    if (pdfFiles.length === 0) {
      new Notice("No PDF files found in the vault");
      return;
    }

    const modal = new PdfFileSelectionModal(
      this.app,
      pdfFiles,
      async (file) => {
        await this.loadPdfFromVault(file);
      }
    );

    modal.open();
  }

  public async loadPdfFromVault(file: TFile) {
    try {
      this.currentPdfPath = file.path;
      const arrayBuffer = await this.app.vault.readBinary(file);
      await this.loadPdf(arrayBuffer);
    } catch (error) {
      console.error("Error loading PDF from vault:", error);
      new Notice("Error loading PDF file: " + error.message);
    }
  }

  private async loadPdf(file: ArrayBuffer) {
    try {
      if (!this.pdfContainer) return;

      // Clear previous content and PDF
      this.pdfContainer.empty();
      this.currentPdf = null;

      // Create loading indicator
      const loadingEl = this.pdfContainer.createDiv("pdf-loading");
      loadingEl.setText("Loading PDF...");

      // Load the PDF
      const loadingTask = pdfjsLib.getDocument(file);
      this.currentPdf = await loadingTask.promise;

      // Remove loading indicator
      loadingEl.remove();

      // Load first page
      if (this.currentPdf) {
        await this.renderPage(1);
      }
    } catch (error) {
      console.error("Error loading PDF:", error);
      new Notice("Error loading PDF: " + error.message);

      // Clear the failed PDF
      this.currentPdf = null;
      if (this.pdfContainer) {
        this.pdfContainer.empty();
        const errorEl = this.pdfContainer.createDiv("pdf-error");
        errorEl.setText("Failed to load PDF. Please try again.");
      }
    }
  }

  public async renderPage(pageNumber: number, scrollToTop: boolean = true) {
    if (!this.currentPdf || !this.pdfContainer) {
      console.error("No PDF loaded or container not found");
      return;
    }

    try {
      const page = await this.currentPdf.getPage(pageNumber);
      if (!page) {
        throw new Error("Failed to get page");
      }

      // Calculate fit scale on first render
      if (pageNumber === 1) {
        this.currentScale = this.calculateFitScale(page);
      }

      const viewport = page.getViewport({ scale: this.currentScale });

      // Clear previous content
      this.pdfContainer.empty();

      // Add controls
      this.createPdfControls();

      const pageContainer = document.createElement("div");
      pageContainer.className = "pdf-page-container";
      pageContainer.style.width = `${viewport.width}px`;
      pageContainer.style.height = `${viewport.height}px`;

      const canvasContainer = document.createElement("div");
      canvasContainer.className = "pdf-canvas-container";
      canvasContainer.setAttribute("data-page", pageNumber.toString());

      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");

      if (!context) {
        throw new Error("Could not get canvas context");
      }

      canvas.height = viewport.height;
      canvas.width = viewport.width;

      // Apply dark mode background
      if (this.isDarkMode) {
        context.fillStyle = getComputedStyle(document.body).getPropertyValue(
          "--background-primary"
        );
        context.fillRect(0, 0, canvas.width, canvas.height);
      }

      const renderContext = {
        canvasContext: context,
        viewport: viewport,
      };

      // Render the page
      await page.render(renderContext).promise;

      // Add the canvas to the container
      canvasContainer.appendChild(canvas);
      pageContainer.appendChild(canvasContainer);
      this.pdfContainer.appendChild(pageContainer);

      // Update current page
      this.currentPage = pageNumber;

      // Update notes for this page
      this.updateNoteSection(pageNumber);

      if (scrollToTop) {
        this.pdfContainer.scrollTo(0, 0);
      }

      // Apply dark mode filter to the canvas if needed
      if (this.isDarkMode) {
        canvas.style.filter = "invert(1) hue-rotate(180deg)";
      }
    } catch (error) {
      console.error("Error rendering page:", error);
      new Notice("Error rendering page: " + error.message);
    }
  }

  private createPdfControls(): void {
    if (!this.pdfContainer || !this.currentPdf) return;

    const controls = this.pdfContainer.createDiv({ cls: "pdf-controls" });

    // Add visibility toggle group first
    const visibilityGroup = controls.createDiv({ cls: "pdf-controls-group" });
    const togglePdfBtn = visibilityGroup.createEl("button", {
      cls: "pdf-toggle-button",
      text: this.plugin.settings.showPdf ? "Hide PDF" : "Show PDF",
    });
    const toggleNotesBtn = visibilityGroup.createEl("button", {
      cls: "pdf-toggle-button",
      text: this.plugin.settings.showNotes ? "Hide Notes" : "Show Notes",
    });

    // Add save button
    const saveBtn = visibilityGroup.createEl("button", {
      cls: "pdf-toggle-button",
      text: "Save PDF + Notes",
    });

    saveBtn.onclick = async () => {
      if (!this.currentPdf || !this.currentPdfPath) {
        new Notice("No PDF loaded to save");
        return;
      }
      const defaultName = this.currentPdfPath.replace(/\.pdf$/, "-copy");
      await this.savePdfWithNotes(defaultName);
    };

    togglePdfBtn.onclick = async () => {
      // Prevent hiding PDF if notes are already hidden
      if (!this.plugin.settings.showPdf && !this.plugin.settings.showNotes) {
        new Notice("At least one section must remain visible");
        return;
      }
      this.plugin.settings.showPdf = !this.plugin.settings.showPdf;
      togglePdfBtn.textContent = this.plugin.settings.showPdf
        ? "Hide PDF"
        : "Show PDF";
      await this.plugin.saveSettings();
      this.updateVisibility();
    };

    toggleNotesBtn.onclick = async () => {
      // Prevent hiding notes if PDF is already hidden
      if (!this.plugin.settings.showNotes && !this.plugin.settings.showPdf) {
        new Notice("At least one section must remain visible");
        return;
      }
      this.plugin.settings.showNotes = !this.plugin.settings.showNotes;
      toggleNotesBtn.textContent = this.plugin.settings.showNotes
        ? "Hide Notes"
        : "Show Notes";
      await this.plugin.saveSettings();
      this.updateVisibility();
    };

    // Navigation controls group
    const navControls = controls.createDiv("pdf-controls-group");

    // Previous page button
    const prevButton = navControls.createEl("button", {
      text: "← Previous",
      cls: "mod-cta",
    });
    prevButton.onclick = () => {
      if (this.currentPage > 1) {
        this.renderPage(this.currentPage - 1);
      }
    };

    // Page number display
    const pageInfo = navControls.createDiv("pdf-page-number");
    pageInfo.createSpan({ text: "Page " });
    const pageInput = pageInfo.createEl("input", {
      type: "number",
      value: this.currentPage.toString(),
      attr: {
        min: "1",
        max: this.currentPdf.numPages.toString(),
      },
    });
    pageInfo.createSpan({ text: ` of ${this.currentPdf.numPages}` });

    pageInput.onchange = () => {
      const newPage = parseInt(pageInput.value);
      if (newPage >= 1 && newPage <= this.currentPdf.numPages) {
        this.renderPage(newPage);
      }
    };

    // Next page button
    const nextButton = navControls.createEl("button", {
      text: "Next →",
      cls: "mod-cta",
    });
    nextButton.onclick = () => {
      if (this.currentPage < this.currentPdf.numPages) {
        this.renderPage(this.currentPage + 1);
      }
    };

    // Zoom controls group
    const zoomControls = controls.createDiv("pdf-controls-group");

    // Zoom out button
    const zoomOutButton = zoomControls.createEl("button", {
      text: "−",
      cls: "pdf-zoom-button",
      attr: { title: "Zoom Out" },
    });
    zoomOutButton.onclick = () => {
      this.currentScale = Math.max(0.5, this.currentScale - 0.2);
      this.renderPage(this.currentPage, false);
    };

    // Zoom display
    const zoomDisplay = zoomControls.createSpan({
      cls: "pdf-zoom-display",
      text: `${Math.round(this.currentScale * 100)}%`,
    });

    // Zoom in button
    const zoomInButton = zoomControls.createEl("button", {
      text: "+",
      cls: "pdf-zoom-button",
      attr: { title: "Zoom In" },
    });
    zoomInButton.onclick = () => {
      this.currentScale = Math.min(3, this.currentScale + 0.2);
      this.renderPage(this.currentPage, false);
    };

    // Fit mode dropdown
    const fitModeSelect = zoomControls.createEl("select", {
      cls: "pdf-fit-mode",
    });

    const fitModes = [
      { value: "width", label: "Fit Width" },
      { value: "height", label: "Fit Height" },
      { value: "page", label: "Fit Page" },
    ];

    fitModes.forEach((mode) => {
      const option = fitModeSelect.createEl("option", {
        value: mode.value,
        text: mode.label,
      });
      if (mode.value === this.plugin.settings.fitMode) {
        option.selected = true;
      }
    });

    fitModeSelect.onchange = async () => {
      this.plugin.settings.fitMode = fitModeSelect.value as
        | "width"
        | "height"
        | "page";
      await this.plugin.saveSettings();
      this.currentScale = this.calculateFitScale(
        await this.currentPdf.getPage(this.currentPage)
      );
      this.renderPage(this.currentPage, false);
    };

    // Add load saved button
    const loadButton = controls.createEl("button", {
      text: "Load Saved",
      cls: "mod-cta",
    });
    loadButton.onclick = async () => {
      await this.loadSavedPdf();
    };

    // Layout controls group
    const layoutControls = controls.createDiv("pdf-controls-group");

    // Layout dropdown
    const layoutSelect = layoutControls.createEl("select", {
      cls: "pdf-layout-select",
    });

    const layouts = [
      { value: "top", label: "PDF on Top" },
      { value: "bottom", label: "PDF on Bottom" },
      { value: "left", label: "PDF on Left" },
      { value: "right", label: "PDF on Right" },
    ];

    layouts.forEach((layout) => {
      const option = layoutSelect.createEl("option", {
        value: layout.value,
        text: layout.label,
      });
      if (layout.value === this.plugin.settings.layout) {
        option.selected = true;
      }
    });

    layoutSelect.onchange = async () => {
      this.plugin.settings.layout = layoutSelect.value as
        | "top"
        | "bottom"
        | "left"
        | "right";
      await this.plugin.saveSettings();
      this.updateLayout();
    };

    // Register keyboard shortcuts
    this.registerDomEvent(document, "keydown", (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement) return;

      if (e.key === "+" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        zoomInButton.click();
      } else if (e.key === "-" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        zoomOutButton.click();
      } else if (e.key === "0" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        fitModeSelect.click();
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        prevButton.click();
      } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        nextButton.click();
      }
    });
  }

  private calculateFitScale(page: any): number {
    if (!this.pdfContainer) return 1.0;

    const viewport = page.getViewport({ scale: 1.0 });
    const containerWidth = this.pdfContainer.clientWidth - 40; // Account for padding
    const containerHeight = this.pdfContainer.clientHeight - 100; // Account for controls and padding

    let scale = 1.0;
    switch (this.plugin.settings.fitMode) {
      case "width":
        scale = containerWidth / viewport.width;
        break;
      case "height":
        scale = containerHeight / viewport.height;
        break;
      case "page":
        scale = Math.min(
          containerWidth / viewport.width,
          containerHeight / viewport.height
        );
        break;
    }
    return scale;
  }

  private async updateNoteSection(pageNumber: number): Promise<void> {
    if (!this.noteContainer || !this.currentPdfPath) return;

    this.noteContainer.empty();

    // Add navigation and controls
    const nav = this.noteContainer.createDiv("note-navigation");

    // Previous page link
    if (pageNumber > 1) {
      const prevLink = nav.createEl("a", { text: "← Previous Page" });
      prevLink.onclick = () => this.renderPage(pageNumber - 1);
    }

    // View all notes link
    const viewAllLink = nav.createEl("a", { text: "View All Notes" });
    viewAllLink.onclick = () => this.showAllNotes();

    // Next page link
    if (this.currentPdf && pageNumber < this.currentPdf.numPages) {
      const nextLink = nav.createEl("a", { text: "Next Page →" });
      nextLink.onclick = () => this.renderPage(pageNumber + 1);
    }

    // Add PDF visibility toggle
    const togglePdfBtn = nav.createEl("button", {
      cls: "pdf-toggle-button",
      text: this.plugin.settings.showPdf ? "Hide PDF" : "Show PDF",
    });

    togglePdfBtn.onclick = async () => {
      if (!this.plugin.settings.showPdf && !this.plugin.settings.showNotes) {
        new Notice("At least one section must remain visible");
        return;
      }
      this.plugin.settings.showPdf = !this.plugin.settings.showPdf;
      togglePdfBtn.textContent = this.plugin.settings.showPdf
        ? "Hide PDF"
        : "Show PDF";
      await this.plugin.saveSettings();
      this.updateVisibility();
    };

    // Create header
    const header = this.noteContainer.createEl("h2", {
      text: `Notes for Page ${pageNumber}`,
      cls: "note-page-header",
    });

    // Create note textarea
    const noteArea = this.noteContainer.createEl("textarea", {
      cls: "note-content",
      attr: {
        placeholder: "Enter your notes for this page...",
      },
    });

    // Load existing notes
    const notes = await this.loadNotes(pageNumber);
    if (notes) {
      noteArea.value = notes;
    }

    // Save notes when changed
    noteArea.onblur = async () => {
      await this.saveNotes(pageNumber, noteArea.value);
    };
  }

  private async loadNotes(pageNumber: number): Promise<string | null> {
    if (!this.currentPdfPath) return null;

    const notesFile = `${this.currentPdfPath}-notes.md`;
    try {
      const content = await this.app.vault.adapter.read(notesFile);
      const pageMatch = content.match(
        new RegExp(`## Page ${pageNumber}\\n([\\s\\S]*?)(?=## Page|$)`)
      );
      return pageMatch ? pageMatch[1].trim() : null;
    } catch (error) {
      // If file doesn't exist, return null
      return null;
    }
  }

  private async saveNotes(pageNumber: number, notes: string): Promise<void> {
    if (!this.currentPdfPath) return;

    const notesFile = `${this.currentPdfPath}-notes.md`;
    try {
      let content = "";
      try {
        content = await this.app.vault.adapter.read(notesFile);
      } catch {
        // File doesn't exist yet
        content = "# PDF Notes\n\n";
      }

      const pageHeader = `## Page ${pageNumber}`;
      const pageRegex = new RegExp(`${pageHeader}\\n[\\s\\S]*?(?=## Page|$)`);
      const newPageContent = `${pageHeader}\n${notes}\n\n`;

      if (pageRegex.test(content)) {
        content = content.replace(pageRegex, newPageContent.trim());
      } else {
        content += newPageContent;
      }

      await this.app.vault.adapter.write(notesFile, content);
    } catch (error) {
      console.error("Error saving notes:", error);
      new Notice("Error saving notes");
    }
  }

  private async savePdfWithNotes(saveName: string): Promise<void> {
    if (!this.currentPdfPath) {
      new Notice("No PDF is currently open");
      return;
    }

    try {
      // Get the directory of the current PDF
      const currentDir = this.currentPdfPath.substring(
        0,
        this.currentPdfPath.lastIndexOf("/")
      );

      // Ensure saveName is a valid filename
      saveName = saveName.replace(/[\\/:*?"<>|]/g, "-");

      // Create the new file paths
      const newPdfPath = `${currentDir}/${saveName}.pdf`;
      const newNotesPath = `${currentDir}/${saveName}.md`;

      // Save both files
      const pdfContent = await this.app.vault.adapter.readBinary(
        this.currentPdfPath
      );
      await this.app.vault.adapter.writeBinary(newPdfPath, pdfContent);

      // Save notes with metadata
      const notesFile = `${this.currentPdfPath}-notes.md`;
      try {
        let notesContent = await this.app.vault.adapter.read(notesFile);
        // Add metadata to notes
        const metadata = `---
pdf: "${saveName}.pdf"
type: pdf-notes
created: ${new Date().toISOString()}
---

`;
        notesContent = metadata + notesContent;
        await this.app.vault.adapter.write(newNotesPath, notesContent);
        new Notice(`Saved as ${saveName}`);
      } catch (error) {
        console.error("Error saving notes:", error);
        new Notice(`Only PDF saved as ${saveName} (no notes found)`);
      }

      // Update current paths
      this.currentPdfPath = newPdfPath;
    } catch (error) {
      console.error("Error saving:", error);
      new Notice("Error saving: " + error.message);
    }
  }

  public getCurrentPage(): number {
    return this.currentPage;
  }

  // ... rest of the existing code ...

  private async loadSavedPdf(): Promise<void> {
    try {
      // Get all folders that contain PDF files
      const files = this.app.vault.getFiles();
      const pdfFolders = new Set<string>();

      files.forEach((file) => {
        if (file.extension === "pdf" && file.parent?.path !== "/") {
          pdfFolders.add(file.parent?.path || "");
        }
      });

      if (pdfFolders.size === 0) {
        new Notice("No saved PDF combinations found");
        return;
      }

      new LoadSavedPdfModal(
        this.app,
        Array.from(pdfFolders).filter((path) => path !== ""),
        async (folder) => {
          await this.loadFromSaveFolder(folder);
        }
      ).open();
    } catch (error) {
      console.error("Error loading saved PDF:", error);
      new Notice("Error loading saved PDF: " + error.message);
    }
  }

  private async loadFromSaveFolder(folder: string): Promise<void> {
    try {
      // Find the PDF file in the folder
      const files = this.app.vault.getFiles();
      const pdfFile = files.find(
        (file) => file.parent?.path === folder && file.extension === "pdf"
      );

      if (!pdfFile) {
        throw new Error("No PDF file found in selected folder");
      }

      // Load the PDF
      this.currentSaveFolder = folder;
      await this.loadPdfFromVault(pdfFile);

      // Try to load associated notes
      const notesFile = this.app.vault
        .getFiles()
        .find(
          (file) => file.parent?.path === folder && file.extension === "md"
        );

      if (notesFile) {
        // Load notes content
        const notesContent = await this.app.vault.read(notesFile);
        // Update notes in the UI
        this.updateNoteSection(this.currentPage);
      }

      new Notice(`Loaded PDF from ${folder}`);
    } catch (error) {
      console.error("Error loading from save folder:", error);
      new Notice("Error loading saved PDF: " + error.message);
    }
  }

  public updateVisibility(): void {
    if (!this.pdfContainer || !this.noteContainer) return;

    // Ensure at least one section is visible
    if (!this.plugin.settings.showPdf && !this.plugin.settings.showNotes) {
      this.plugin.settings.showPdf = true;
      this.plugin.settings.showNotes = true;
      this.plugin.saveSettings();
    }

    this.pdfContainer.style.display = this.plugin.settings.showPdf
      ? "block"
      : "none";
    this.noteContainer.style.display = this.plugin.settings.showNotes
      ? "block"
      : "none";

    // Update the container layout class based on visibility
    const container = this.containerEl?.children[1] as HTMLElement;
    if (container) {
      container.style.display = "flex"; // Always keep flex display
    }
  }

  private async showAllNotes(): Promise<void> {
    if (!this.currentPdf || !this.currentPdfPath) return;

    const modal = new Modal(this.app);
    modal.titleEl.setText("All Notes");

    const content = modal.contentEl.createDiv();
    content.addClass("all-notes-view");

    // Add styles for the modal
    content.createEl("style", {
      text: `
        .all-notes-view {
          max-height: 80vh;
          overflow-y: auto;
          padding: 1em;
        }
        .page-notes {
          margin-bottom: 2em;
          padding-bottom: 1em;
          border-bottom: 1px solid var(--background-modifier-border);
        }
        .page-notes:last-child {
          border-bottom: none;
        }
      `,
    });

    // Load all notes
    for (let i = 1; i <= this.currentPdf.numPages; i++) {
      const notes = await this.loadNotes(i);
      if (notes) {
        const pageSection = content.createDiv("page-notes");
        pageSection.createEl("h3", { text: `Page ${i}` });
        pageSection.createEl("p", { text: notes });
      }
    }

    modal.open();
  }

  updateTheme() {
    const isDark =
      this.plugin.settings.theme === "dark" ||
      (this.plugin.settings.theme === "system" &&
        document.body.classList.contains("theme-dark"));

    if (this.containerEl) {
      this.containerEl.toggleClass("pdf-dark-theme", isDark);
      this.containerEl.toggleClass("pdf-light-theme", !isDark);
    }

    // Update PDF rendering if it exists
    if (this.currentPage && this.currentPdf) {
      this.renderPage(this.currentPage);
    }
  }

  // Add theme-specific styles
  onload() {
    // ... existing onload code ...

    // Add theme-specific styles
    this.containerEl.createEl("style", {
      text: `
        .pdf-dark-theme .pdf-container {
          background-color: var(--background-primary);
          color: var(--text-normal);
        }
        
        .pdf-dark-theme canvas {
          filter: invert(0.9) hue-rotate(180deg);
        }
        
        .pdf-light-theme .pdf-container {
          background-color: #ffffff;
          color: #000000;
        }
        
        .pdf-light-theme canvas {
          filter: none;
        }
        
        .pdf-dark-theme .pdf-controls,
        .pdf-dark-theme .note-controls {
          background-color: var(--background-secondary);
          border-bottom: 1px solid var(--background-modifier-border);
        }
        
        .pdf-light-theme .pdf-controls,
        .pdf-light-theme .note-controls {
          background-color: #f5f5f5;
          border-bottom: 1px solid #ddd;
        }
      `,
    });
    this.updateTheme();
  }

  // Update theme when the view is revealed
  onunload() {
    // ... existing unload code ...
  }
}

class PdfFileSelectionModal extends Modal {
  private files: TFile[];
  private onSelect: (file: TFile) => void;

  constructor(app: App, files: TFile[], onSelect: (file: TFile) => void) {
    super(app);
    this.files = files;
    this.onSelect = onSelect;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Select PDF File" });

    const fileList = contentEl.createDiv("pdf-file-list");
    this.files.forEach((file) => {
      const item = fileList.createDiv("pdf-file-item");
      item.createEl("span", { text: file.path });
      item.onclick = () => {
        this.onSelect(file);
        this.close();
      };
    });
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

class SaveNameModal extends Modal {
  private name: string;
  private onSubmit: (name: string) => void;

  constructor(app: App, defaultName: string, onSubmit: (name: string) => void) {
    super(app);
    this.name = defaultName || "untitled";
    this.onSubmit = onSubmit;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Save PDF and Notes" });

    // Add name input
    new Setting(contentEl)
      .setName("Save Name")
      .setDesc("Enter a name for this save")
      .addText((text) => {
        text.setValue(this.name);
        text.onChange((value) => {
          this.name = value || "untitled";
        });
      });

    // Add save/cancel buttons
    new Setting(contentEl)
      .addButton((btn) =>
        btn
          .setButtonText("Save")
          .setCta()
          .onClick(() => {
            if (!this.name) {
              new Notice("Please enter a name");
              return;
            }
            this.onSubmit(this.name);
            this.close();
          })
      )
      .addButton((btn) =>
        btn.setButtonText("Cancel").onClick(() => {
          this.close();
        })
      );
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

class LoadSavedPdfModal extends Modal {
  private onSelect: (folder: string) => void;
  private folders: string[];

  constructor(app: App, folders: string[], onSelect: (folder: string) => void) {
    super(app);
    this.folders = folders;
    this.onSelect = onSelect;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Load Saved PDF and Notes" });

    const list = contentEl.createDiv("saved-pdf-list");
    this.folders.forEach((folder) => {
      const item = list.createDiv("saved-pdf-item");
      item.createEl("span", { text: folder });
      item.onclick = () => {
        this.onSelect(folder);
        this.close();
      };
    });

    if (this.folders.length === 0) {
      list.createEl("p", { text: "No saved PDF combinations found." });
    }
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
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

    // Add file menu event handler for PDFs
    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file) => {
        if (file instanceof TFile && file.extension === "pdf") {
          menu.addItem((item) => {
            item
              .setTitle("Open in PDF Note Viewer")
              .setIcon("document")
              .onClick(async () => {
                const leaf = await this.activateView();
                if (leaf) {
                  const view = leaf.view as PdfNoteView;
                  await view.loadPdfFromVault(file);
                }
              });
          });
        }
      })
    );

    // Add settings tab
    this.addSettingTab(new PdfNoteAlignerSettingTab(this.app, this));
  }

  async onunload() {
    this.app.workspace.detachLeavesOfType(PDF_NOTE_VIEW_TYPE);
  }

  async activateView() {
    const { workspace } = this.app;

    // Check if view is already open
    let leaf = workspace.getLeavesOfType(PDF_NOTE_VIEW_TYPE)[0];

    if (!leaf) {
      // Open in main workspace area
      leaf = workspace.getLeaf("tab");
      await leaf.setViewState({
        type: PDF_NOTE_VIEW_TYPE,
        active: true,
      });
    }

    // Reveal the leaf in the workspace
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
      .setName("Default Layout")
      .setDesc("Choose where the PDF should appear relative to the notes")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("top", "Top")
          .addOption("bottom", "Bottom")
          .addOption("left", "Left")
          .addOption("right", "Right")
          .setValue(this.plugin.settings.layout)
          .onChange(async (value: "top" | "bottom" | "left" | "right") => {
            this.plugin.settings.layout = value;
            await this.plugin.saveSettings();
            // Update all open views
            this.app.workspace
              .getLeavesOfType(PDF_NOTE_VIEW_TYPE)
              .forEach((leaf) => {
                const view = leaf.view as PdfNoteView;
                view.updateLayout();
              });
          })
      );

    new Setting(containerEl)
      .setName("Default Fit Mode")
      .setDesc("Choose how PDFs should fit in the viewer by default")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("width", "Fit to Width")
          .addOption("height", "Fit to Height")
          .addOption("page", "Fit to Page")
          .setValue(this.plugin.settings.fitMode)
          .onChange(async (value: "width" | "height" | "page") => {
            this.plugin.settings.fitMode = value;
            await this.plugin.saveSettings();
            // Update all open views
            this.app.workspace
              .getLeavesOfType(PDF_NOTE_VIEW_TYPE)
              .forEach((leaf) => {
                const view = leaf.view as PdfNoteView;
                view.renderPage(view.getCurrentPage(), false);
              });
          })
      );

    new Setting(containerEl)
      .setName("Show PDF by Default")
      .setDesc("Show the PDF viewer when opening files")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showPdf)
          .onChange(async (value) => {
            this.plugin.settings.showPdf = value;
            await this.plugin.saveSettings();
            // Update all open views
            this.app.workspace
              .getLeavesOfType(PDF_NOTE_VIEW_TYPE)
              .forEach((leaf) => {
                const view = leaf.view as PdfNoteView;
                view.updateVisibility();
              });
          })
      );

    new Setting(containerEl)
      .setName("Show Notes by Default")
      .setDesc("Show the notes panel when opening files")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showNotes)
          .onChange(async (value) => {
            this.plugin.settings.showNotes = value;
            await this.plugin.saveSettings();
            // Update all open views
            this.app.workspace
              .getLeavesOfType(PDF_NOTE_VIEW_TYPE)
              .forEach((leaf) => {
                const view = leaf.view as PdfNoteView;
                view.updateVisibility();
              });
          })
      );

    new Setting(containerEl)
      .setName("Theme")
      .setDesc("Choose the theme for the PDF viewer")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("system", "Follow System Theme")
          .addOption("light", "Light Theme")
          .addOption("dark", "Dark Theme")
          .setValue(this.plugin.settings.theme)
          .onChange(async (value) => {
            this.plugin.settings.theme = value as "light" | "dark" | "system";
            await this.plugin.saveSettings();
            // Update theme for all open views
            this.app.workspace.iterateAllLeaves((leaf) => {
              if (leaf.view instanceof PdfNoteView) {
                leaf.view.updateTheme();
              }
            });
          })
      );

    // Add reset button
    new Setting(containerEl)
      .setName("Reset View Settings")
      .setDesc(
        "Reset PDF Note Viewer visibility and layout settings to default"
      )
      .addButton((button) => {
        button.setButtonText("Reset to Default").onClick(async () => {
          this.plugin.settings.showPdf = true;
          this.plugin.settings.showNotes = true;
          this.plugin.settings.layout = "top";
          await this.plugin.saveSettings();
          // Update any open views
          this.app.workspace.iterateAllLeaves((leaf) => {
            if (leaf.view instanceof PdfNoteView) {
              leaf.view.updateVisibility();
              leaf.view.updateLayout();
            }
          });
          new Notice("PDF Note Viewer settings reset to default");
        });
      });
  }
}
