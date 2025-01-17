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
} from "obsidian";
import * as pdfjsLib from "pdfjs-dist";

const PDF_NOTE_VIEW_TYPE = "pdf-note-view";

interface PdfNoteAlignerSettings {
  defaultScale: number;
}

const DEFAULT_SETTINGS: PdfNoteAlignerSettings = {
  defaultScale: 1.0,
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
  private pdfContainer: HTMLElement;
  private noteContainer: HTMLElement;
  private currentPdf: any;
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

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
    this.currentPage = 1;
    // Check initial theme
    this.isDarkMode = document.body.classList.contains("theme-dark");

    // Listen for theme changes
    this.registerEvent(
      this.app.workspace.on("css-change", () => {
        const newDarkMode = document.body.classList.contains("theme-dark");
        if (this.isDarkMode !== newDarkMode) {
          this.isDarkMode = newDarkMode;
          if (this.currentPage && this.currentPdf) {
            this.renderPage(this.currentPage, false);
          }
        }
      })
    );
  }

  getViewType(): string {
    return PDF_NOTE_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "PDF Note View";
  }

  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass("pdf-note-container");

    // Create split view containers
    this.pdfContainer = container.createDiv("pdf-container");
    this.noteContainer = container.createDiv("note-container");

    // Add toolbar with collapse button
    this.createToolbar();

    // Add file picker button
    this.createFilePickerButton();

    // Add styles
    this.addStyles();
  }

  private addStyles() {
    const style = document.createElement("style");
    style.textContent = `
      .pdf-note-container {
        display: flex;
        height: 100%;
      }
      .pdf-container {
        flex: 1;
        border-right: 1px solid var(--background-modifier-border);
        overflow-y: auto;
        padding: 10px;
        display: flex;
        flex-direction: column;
      }
      .note-container {
        flex: 1;
        overflow-y: auto;
        padding: 10px;
      }
      .pdf-picker-container {
        margin-bottom: 10px;
        text-align: center;
      }
      .pdf-controls {
        display: flex;
        gap: 20px;
        align-items: center;
        justify-content: space-between;
        margin: 10px 0;
        padding: 10px;
        border-bottom: 1px solid var(--background-modifier-border);
      }
      .pdf-nav-controls, .pdf-zoom-controls {
        display: flex;
        gap: 10px;
        align-items: center;
      }
      .pdf-zoom-button {
        min-width: 30px;
        height: 30px;
        padding: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 4px;
        background-color: var(--interactive-normal);
        color: var(--text-normal);
        cursor: pointer;
        transition: background-color 0.2s ease;
      }
      .pdf-zoom-button:hover {
        background-color: var(--interactive-hover);
      }
      .pdf-file-list {
        max-height: 400px;
        overflow-y: auto;
      }
      .pdf-file-item {
        padding: 8px;
        margin: 4px 0;
        border-radius: 4px;
        cursor: pointer;
        transition: background-color 0.2s ease;
      }
      .pdf-file-item:hover {
        background-color: var(--background-modifier-hover);
      }
      .pdf-canvas-container {
        display: flex;
        justify-content: center;
        align-items: flex-start;
        min-height: 0;
        overflow-y: auto;
        background-color: var(--background-primary);
      }
      .theme-dark .pdf-canvas-container {
        background-color: var(--background-primary);
      }
      .theme-dark .pdf-canvas-container canvas {
        filter: invert(1) hue-rotate(180deg);
      }
      canvas {
        max-width: 100%;
        height: auto;
        transition: filter 0.2s ease;
      }
      textarea {
        font-family: var(--font-text);
        border: 1px solid var(--background-modifier-border);
        border-radius: 4px;
        padding: 8px;
        background-color: var(--background-primary);
        color: var(--text-normal);
      }
      textarea:focus {
        outline: none;
        border-color: var(--interactive-accent);
      }
      .pdf-text-layer {
        position: absolute;
        left: 0;
        top: 0;
        right: 0;
        bottom: 0;
        overflow: hidden;
        opacity: 0.2;
        line-height: 1.0;
        user-select: text;
      }
      
      .pdf-text-layer > span {
        color: transparent;
        position: absolute;
        white-space: pre;
        cursor: text;
        transform-origin: 0% 0%;
      }

      .pdf-highlight {
        position: absolute;
        background-color: rgba(255, 255, 0, 0.3);
        border-radius: 3px;
        pointer-events: none;
      }

      .theme-dark .pdf-highlight {
        background-color: rgba(255, 255, 0, 0.2);
        mix-blend-mode: difference;
      }

      .pdf-page-container {
        position: relative;
        margin-bottom: 20px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        background: var(--background-primary);
      }

      .pdf-toolbar {
        display: flex;
        gap: 10px;
        padding: 5px;
        background: var(--background-secondary);
        border-radius: 4px;
        margin-bottom: 10px;
      }

      .pdf-collapse-button {
        position: absolute;
        right: -15px;
        top: 50%;
        transform: translateY(-50%);
        z-index: 100;
        background: var(--background-secondary);
        border: 1px solid var(--background-modifier-border);
        border-radius: 50%;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: background-color 0.2s ease;
      }

      .pdf-container.collapsed {
        width: 0;
        padding: 0;
        margin: 0;
        opacity: 0;
      }

      .pdf-container.collapsed + .note-container {
        flex: 1;
      }

      .note-container {
        transition: flex 0.3s ease;
      }

      .highlight-controls {
        display: flex;
        gap: 10px;
        align-items: center;
      }

      .color-picker {
        width: 30px;
        height: 30px;
        padding: 0;
        border: none;
        border-radius: 4px;
        cursor: pointer;
      }

      .pdf-highlight {
        position: absolute;
        border-radius: 3px;
        cursor: pointer;
        transition: opacity 0.2s ease;
      }

      .pdf-highlight:hover {
        opacity: 0.8;
      }

      .pdf-highlight.deletable {
        cursor: not-allowed;
        opacity: 0.5;
      }

      .pdf-highlight.deletable:hover {
        opacity: 0.8;
        background-color: rgba(255, 0, 0, 0.3) !important;
      }

      .highlight-summary {
        position: fixed;
        right: 20px;
        bottom: 20px;
        width: 300px;
        max-height: 400px;
        background: var(--background-primary);
        border: 1px solid var(--background-modifier-border);
        border-radius: 8px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        z-index: 1000;
        overflow: hidden;
        display: none;
      }

      .highlight-summary.visible {
        display: block;
      }

      .highlight-summary-header {
        padding: 10px;
        background: var(--background-secondary);
        border-bottom: 1px solid var(--background-modifier-border);
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .highlight-summary-content {
        padding: 10px;
        max-height: 350px;
        overflow-y: auto;
      }

      .highlight-item {
        margin-bottom: 10px;
        padding: 8px;
        border-radius: 4px;
        background: var(--background-secondary);
        cursor: pointer;
      }

      .highlight-item:hover {
        background: var(--background-modifier-hover);
      }

      .highlight-page {
        font-size: 0.8em;
        color: var(--text-muted);
      }

      .highlight-text {
        margin-top: 4px;
      }
    `;
    document.head.appendChild(style);
  }

  async loadPdf(file: ArrayBuffer) {
    try {
      // Load the PDF
      const loadingTask = pdfjsLib.getDocument(file);
      this.currentPdf = await loadingTask.promise;

      // Clear previous content
      this.pdfContainer.empty();

      // Create toolbar with controls
      this.createToolbar();

      // Load first page
      await this.renderPage(1);
    } catch (error) {
      console.error("Error loading PDF:", error);
    }
  }

  private async renderPage(pageNumber: number, scrollToTop: boolean = true) {
    try {
      const page = await this.currentPdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: this.currentScale });

      const pageContainer = document.createElement("div");
      pageContainer.className = "pdf-page-container";
      pageContainer.style.width = `${viewport.width}px`;
      pageContainer.style.height = `${viewport.height}px`;

      const canvasContainer = document.createElement("div");
      canvasContainer.className = "pdf-canvas-container";
      canvasContainer.setAttribute("data-page", pageNumber.toString());

      // Add scroll event listener for PDF container
      canvasContainer.addEventListener("scroll", () =>
        this.handlePdfScroll(canvasContainer)
      );

      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");

      if (!context) {
        throw new Error("Could not get canvas context");
      }

      canvas.height = viewport.height;
      canvas.width = viewport.width;

      // Set background color for dark mode
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

      // Create text layer
      const textLayerDiv = document.createElement("div");
      textLayerDiv.className = "pdf-text-layer";
      textLayerDiv.style.width = `${viewport.width}px`;
      textLayerDiv.style.height = `${viewport.height}px`;
      this.textLayer = textLayerDiv;

      // Render text layer
      const textContent = await page.getTextContent();
      const renderTask = await pdfjsLib.renderTextLayer({
        container: textLayerDiv,
        viewport: viewport,
        textDivs: [],
        textContentSource: textContent,
      });
      await renderTask.promise;

      // Add highlight container
      const highlightContainer = document.createElement("div");
      highlightContainer.className = "pdf-highlight-container";
      highlightContainer.style.position = "absolute";
      highlightContainer.style.left = "0";
      highlightContainer.style.top = "0";
      highlightContainer.style.right = "0";
      highlightContainer.style.bottom = "0";
      highlightContainer.style.pointerEvents = "none";

      // Render existing highlights
      this.renderHighlights(pageNumber, highlightContainer, viewport);

      // Handle text selection
      textLayerDiv.addEventListener("mouseup", (e) =>
        this.handleTextSelection(e, pageNumber, viewport)
      );

      await page.render(renderContext).promise;

      // Clear container and add new elements
      this.pdfContainer.querySelector(".pdf-page-container")?.remove();
      pageContainer.appendChild(canvas);
      pageContainer.appendChild(textLayerDiv);
      pageContainer.appendChild(highlightContainer);

      canvasContainer.appendChild(pageContainer);
      this.pdfContainer.appendChild(canvasContainer);

      // Update current page
      this.currentPage = pageNumber;

      // Update or create corresponding note
      await this.updateNote(pageNumber);

      if (scrollToTop) {
        canvasContainer.scrollTo(0, 0);
      }
    } catch (error) {
      console.error("Error rendering page:", error);
      new Notice("Error rendering PDF page");
    }
  }

  private handleTextSelection(
    e: MouseEvent,
    pageNumber: number,
    viewport: any
  ) {
    if (this.isHighlightDeleteMode) return;

    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;

    const range = selection.getRangeAt(0);
    const rects = range.getClientRects();
    const selectedText = selection.toString().trim();

    if (!this.highlights.has(pageNumber)) {
      this.highlights.set(pageNumber, []);
    }

    const container = (e.target as HTMLElement).closest(".pdf-page-container");
    if (!container) return;

    const containerRect = container.getBoundingClientRect();

    for (const rect of Array.from(rects)) {
      const highlight: PdfHighlight = {
        x: (rect.left - containerRect.left) / this.currentScale,
        y: (rect.top - containerRect.top) / this.currentScale,
        width: rect.width / this.currentScale,
        height: rect.height / this.currentScale,
        color: this.selectedHighlightColor,
        text: selectedText,
        id: crypto.randomUUID(),
      };

      this.highlights.get(pageNumber)?.push(highlight);
    }

    // Save highlights
    this.saveHighlights();

    // Re-render highlights
    const highlightContainer = container.querySelector(
      ".pdf-highlight-container"
    );
    if (highlightContainer) {
      this.renderHighlights(
        pageNumber,
        highlightContainer as HTMLElement,
        viewport
      );
    }

    // Clear selection
    selection.removeAllRanges();
  }

  private renderHighlights(
    pageNumber: number,
    container: HTMLElement,
    viewport: any
  ) {
    container.innerHTML = "";
    const pageHighlights = this.highlights.get(pageNumber) || [];

    for (const highlight of pageHighlights) {
      const highlightEl = document.createElement("div");
      highlightEl.className = "pdf-highlight";
      highlightEl.dataset.id = highlight.id;
      highlightEl.style.left = `${highlight.x * this.currentScale}px`;
      highlightEl.style.top = `${highlight.y * this.currentScale}px`;
      highlightEl.style.width = `${highlight.width * this.currentScale}px`;
      highlightEl.style.height = `${highlight.height * this.currentScale}px`;
      highlightEl.style.backgroundColor = highlight.color + "4D"; // Add 30% opacity

      if (this.isHighlightDeleteMode) {
        highlightEl.addClass("deletable");
        highlightEl.onclick = () =>
          this.deleteHighlight(pageNumber, highlight.id);
      }

      container.appendChild(highlightEl);
    }
  }

  private deleteHighlight(pageNumber: number, highlightId: string) {
    const pageHighlights = this.highlights.get(pageNumber);
    if (!pageHighlights) return;

    const index = pageHighlights.findIndex((h) => h.id === highlightId);
    if (index === -1) return;

    pageHighlights.splice(index, 1);
    this.saveHighlights();

    // Re-render highlights
    const container = this.pdfContainer.querySelector(
      ".pdf-highlight-container"
    );
    if (container) {
      this.renderHighlights(pageNumber, container as HTMLElement, null);
    }

    // Update summary if visible
    this.updateHighlightSummary();
  }

  private createHighlightSummary() {
    const summary = document.createElement("div");
    summary.className = "highlight-summary";

    const header = summary.createDiv("highlight-summary-header");
    header.createEl("h3", { text: "Highlights" });
    const closeButton = header.createEl("button", {
      text: "×",
      cls: "pdf-zoom-button",
    });
    closeButton.onclick = () => this.toggleHighlightSummary();

    const content = summary.createDiv("highlight-summary-content");

    document.body.appendChild(summary);
    return summary;
  }

  private toggleHighlightSummary() {
    let summary = document.querySelector(".highlight-summary");
    if (!summary) {
      summary = this.createHighlightSummary();
    }

    const isVisible = summary.classList.toggle("visible");
    if (isVisible) {
      this.updateHighlightSummary();
    }
  }

  private updateHighlightSummary() {
    const summary = document.querySelector(".highlight-summary");
    if (!summary || !summary.classList.contains("visible")) return;

    const content = summary.querySelector(".highlight-summary-content");
    if (!content) return;

    content.empty();

    // Group highlights by page
    for (const [pageNum, highlights] of this.highlights.entries()) {
      if (highlights.length === 0) continue;

      const pageGroup = content.createDiv("highlight-page-group");
      pageGroup.createEl("h4", { text: `Page ${pageNum}` });

      for (const highlight of highlights) {
        const item = pageGroup.createDiv("highlight-item");
        item.style.borderLeft = `4px solid ${highlight.color}`;

        const pageInfo = item.createDiv("highlight-page");
        pageInfo.textContent = `Page ${pageNum}`;

        if (highlight.text) {
          const text = item.createDiv("highlight-text");
          text.textContent = highlight.text;
        }

        item.onclick = async () => {
          await this.renderPage(pageNum);
          const highlightEl = this.pdfContainer.querySelector(
            `[data-id="${highlight.id}"]`
          );
          highlightEl?.scrollIntoView({ behavior: "smooth", block: "center" });
        };
      }
    }
  }

  private async saveHighlights() {
    if (!this.currentPdfPath) return;

    const highlightsFile = `${this.currentPdfPath}.highlights.json`;
    const highlightsData = JSON.stringify(
      Array.from(this.highlights.entries())
    );

    try {
      await this.app.vault.adapter.write(highlightsFile, highlightsData);
    } catch (error) {
      console.error("Error saving highlights:", error);
      new Notice("Error saving highlights");
    }
  }

  private async loadHighlights() {
    if (!this.currentPdfPath) return;

    const highlightsFile = `${this.currentPdfPath}.highlights.json`;

    try {
      const highlightsData = await this.app.vault.adapter.read(highlightsFile);
      this.highlights = new Map(JSON.parse(highlightsData));
    } catch (error) {
      // If file doesn't exist, start with empty highlights
      this.highlights = new Map();
    }
  }

  private createToolbar() {
    const toolbar = this.pdfContainer.createDiv("pdf-toolbar");

    // Navigation controls
    const navControls = toolbar.createDiv("pdf-nav-controls");
    const prevButton = navControls.createEl("button", {
      text: "← Previous",
      cls: "mod-cta",
    });
    const pageInfo = navControls.createSpan();
    const nextButton = navControls.createEl("button", {
      text: "Next →",
      cls: "mod-cta",
    });

    // Zoom controls
    const zoomControls = toolbar.createDiv("pdf-zoom-controls");
    const zoomOutButton = zoomControls.createEl("button", {
      text: "−",
      cls: "pdf-zoom-button",
      attr: { title: "Zoom Out" },
    });
    const zoomInfo = zoomControls.createSpan();
    const zoomInButton = zoomControls.createEl("button", {
      text: "+",
      cls: "pdf-zoom-button",
      attr: { title: "Zoom In" },
    });
    const resetZoomButton = zoomControls.createEl("button", {
      text: "Reset",
      cls: "pdf-zoom-button",
      attr: { title: "Reset Zoom" },
    });

    const updatePageInfo = () => {
      pageInfo.textContent = ` Page ${this.currentPage} of ${this.currentPdf.numPages} `;
      zoomInfo.textContent = ` ${Math.round(this.currentScale * 100)}% `;
    };

    prevButton.onclick = async () => {
      if (this.currentPage > 1) {
        await this.renderPage(this.currentPage - 1);
        updatePageInfo();
      }
    };

    nextButton.onclick = async () => {
      if (this.currentPage < this.currentPdf.numPages) {
        await this.renderPage(this.currentPage + 1);
        updatePageInfo();
      }
    };

    zoomInButton.onclick = async () => {
      this.currentScale = Math.min(this.currentScale + 0.25, 3);
      await this.renderPage(this.currentPage, false);
      updatePageInfo();
    };

    zoomOutButton.onclick = async () => {
      this.currentScale = Math.max(this.currentScale - 0.25, 0.5);
      await this.renderPage(this.currentPage, false);
      updatePageInfo();
    };

    resetZoomButton.onclick = async () => {
      this.currentScale = 1.5;
      await this.renderPage(this.currentPage, false);
      updatePageInfo();
    };

    // Add keyboard navigation and zoom
    this.registerDomEvent(document, "keydown", async (evt: KeyboardEvent) => {
      if (evt.target instanceof HTMLTextAreaElement) return;

      if (evt.key === "ArrowLeft" || evt.key === "ArrowUp") {
        if (this.currentPage > 1) {
          await this.renderPage(this.currentPage - 1);
          updatePageInfo();
        }
      } else if (evt.key === "ArrowRight" || evt.key === "ArrowDown") {
        if (this.currentPage < this.currentPdf.numPages) {
          await this.renderPage(this.currentPage + 1);
          updatePageInfo();
        }
      } else if (evt.key === "+" && (evt.ctrlKey || evt.metaKey)) {
        evt.preventDefault();
        this.currentScale = Math.min(this.currentScale + 0.25, 3);
        await this.renderPage(this.currentPage, false);
        updatePageInfo();
      } else if (evt.key === "-" && (evt.ctrlKey || evt.metaKey)) {
        evt.preventDefault();
        this.currentScale = Math.max(this.currentScale - 0.25, 0.5);
        await this.renderPage(this.currentPage, false);
        updatePageInfo();
      } else if (evt.key === "0" && (evt.ctrlKey || evt.metaKey)) {
        evt.preventDefault();
        this.currentScale = 1.5;
        await this.renderPage(this.currentPage, false);
        updatePageInfo();
      }
    });

    updatePageInfo();

    // Add collapse button
    const collapseButton = this.pdfContainer.createDiv("pdf-collapse-button");
    collapseButton.innerHTML = "◀";
    collapseButton.onclick = () => this.togglePdfCollapse();

    // Highlight controls
    const highlightControls = toolbar.createDiv("highlight-controls");

    // Color picker
    const colorPicker = highlightControls.createEl("input", {
      type: "color",
      cls: "color-picker",
      value: this.selectedHighlightColor,
    });
    colorPicker.addEventListener("input", (e) => {
      this.selectedHighlightColor = (e.target as HTMLInputElement).value;
    });

    // Delete mode toggle
    const deleteButton = highlightControls.createEl("button", {
      text: "🗑️",
      cls: "pdf-zoom-button",
      attr: { title: "Toggle Delete Mode" },
    });
    deleteButton.onclick = () => {
      this.isHighlightDeleteMode = !this.isHighlightDeleteMode;
      deleteButton.toggleClass("active", this.isHighlightDeleteMode);
      this.pdfContainer.toggleClass("delete-mode", this.isHighlightDeleteMode);
    };

    // Summary toggle
    const summaryButton = highlightControls.createEl("button", {
      text: "📋",
      cls: "pdf-zoom-button",
      attr: { title: "Show Highlights Summary" },
    });
    summaryButton.onclick = () => this.toggleHighlightSummary();
  }

  private togglePdfCollapse() {
    this.isPdfCollapsed = !this.isPdfCollapsed;
    this.pdfContainer.toggleClass("collapsed", this.isPdfCollapsed);

    const collapseButton = this.pdfContainer.querySelector(
      ".pdf-collapse-button"
    );
    if (collapseButton) {
      collapseButton.innerHTML = this.isPdfCollapsed ? "▶" : "◀";
    }
  }

  private createFilePickerButton() {
    const buttonContainer = this.pdfContainer.createDiv("pdf-picker-container");
    const button = buttonContainer.createEl("button", {
      text: "Select PDF",
      cls: "mod-cta",
    });

    button.onclick = async () => {
      await this.selectAndLoadPdf();
    };
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
      async (file: TFile) => {
        await this.loadPdfFromVault(file);
      }
    );

    modal.open();
  }

  private async loadPdfFromVault(file: TFile) {
    try {
      const adapter = this.app.vault.adapter as FileSystemAdapter;
      const pdfPath = adapter.getFullPath(file.path);
      this.currentPdfPath = file.path;

      const arrayBuffer = await this.app.vault.readBinary(file);

      // Load highlights before loading PDF
      await this.loadHighlights();

      await this.loadPdf(arrayBuffer);

      // Create or update the notes file
      await this.initializeNotesFile(file);
    } catch (error) {
      console.error("Error loading PDF from vault:", error);
      new Notice("Error loading PDF file");
    }
  }

  private async initializeNotesFile(pdfFile: TFile) {
    const notesFileName = `${pdfFile.basename} - Notes.md`;
    const notesFilePath = `${pdfFile.parent?.path || ""}/${notesFileName}`;

    try {
      let notesFile = this.app.vault.getAbstractFileByPath(notesFilePath);

      if (!notesFile) {
        // Create new notes file if it doesn't exist
        const initialContent = `# Notes for ${pdfFile.basename}\n\n## Page 1\n\n`;
        notesFile = await this.app.vault.create(notesFilePath, initialContent);
      }
    } catch (error) {
      console.error("Error creating notes file:", error);
      new Notice("Error creating notes file");
    }
  }

  private async updateNote(pageNumber: number) {
    if (!this.currentPdfPath) return;

    this.noteContainer.empty();
    const noteHeader = this.noteContainer.createEl("h2", {
      text: `Notes for Page ${pageNumber}`,
    });

    const noteArea = this.noteContainer.createEl("textarea", {
      attr: {
        placeholder: "Enter your notes for this page...",
        style: "width: 100%; height: 80%; resize: none;",
      },
    });

    // Add scroll event listener for notes container
    this.noteContainer.addEventListener("scroll", () =>
      this.handleNoteScroll()
    );

    // Load existing notes
    const pdfFile = this.app.vault.getAbstractFileByPath(
      this.currentPdfPath
    ) as TFile;
    if (pdfFile) {
      const notesFileName = `${pdfFile.basename} - Notes.md`;
      const notesFilePath = `${pdfFile.parent?.path || ""}/${notesFileName}`;
      const notesFile = this.app.vault.getAbstractFileByPath(
        notesFilePath
      ) as TFile;

      if (notesFile) {
        const content = await this.app.vault.read(notesFile);
        const pageSection = this.extractPageNotes(content, pageNumber);
        noteArea.value = pageSection || "";
      }
    }

    // Save notes when changed
    noteArea.addEventListener("blur", async () => {
      await this.saveNotes(pageNumber, noteArea.value);
    });
  }

  private handleNoteScroll() {
    if (this.pdfScrollTimeout) {
      clearTimeout(this.pdfScrollTimeout);
    }

    if (this.isScrolling) return;

    this.pdfScrollTimeout = setTimeout(() => {
      const scrollTop = this.noteContainer.scrollTop;
      const containerHeight = this.noteContainer.clientHeight;
      const scrollHeight = this.noteContainer.scrollHeight;
      const scrollPercentage =
        (scrollTop / (scrollHeight - containerHeight)) * 100;

      // Sync PDF container scroll position
      const pdfContainer = this.pdfContainer.querySelector(
        ".pdf-canvas-container"
      );
      if (pdfContainer) {
        const pdfScrollHeight =
          pdfContainer.scrollHeight - pdfContainer.clientHeight;
        const pdfScrollTop = (scrollPercentage / 100) * pdfScrollHeight;

        this.isScrolling = true;
        pdfContainer.scrollTo({
          top: pdfScrollTop,
          behavior: "smooth",
        });

        setTimeout(() => {
          this.isScrolling = false;
        }, 150);
      }
    }, 50);
  }

  private extractPageNotes(content: string, pageNumber: number): string {
    const pageHeader = `## Page ${pageNumber}`;
    const lines = content.split("\n");
    const pageStart = lines.findIndex((line) => line.trim() === pageHeader);

    if (pageStart === -1) return "";

    let pageEnd = lines
      .slice(pageStart + 1)
      .findIndex((line) => line.startsWith("## Page"));
    if (pageEnd === -1) pageEnd = lines.length;
    else pageEnd = pageStart + 1 + pageEnd;

    return lines
      .slice(pageStart + 1, pageEnd)
      .join("\n")
      .trim();
  }

  private async saveNotes(pageNumber: number, notes: string) {
    if (!this.currentPdfPath) return;

    const pdfFile = this.app.vault.getAbstractFileByPath(
      this.currentPdfPath
    ) as TFile;
    if (!pdfFile) return;

    const notesFileName = `${pdfFile.basename} - Notes.md`;
    const notesFilePath = `${pdfFile.parent?.path || ""}/${notesFileName}`;
    const notesFile = this.app.vault.getAbstractFileByPath(
      notesFilePath
    ) as TFile;

    if (notesFile) {
      const content = await this.app.vault.read(notesFile);
      const updatedContent = this.updatePageNotes(content, pageNumber, notes);
      await this.app.vault.modify(notesFile, updatedContent);
    }
  }

  private updatePageNotes(
    content: string,
    pageNumber: number,
    newNotes: string
  ): string {
    const pageHeader = `## Page ${pageNumber}`;
    const lines = content.split("\n");
    const pageStart = lines.findIndex((line) => line.trim() === pageHeader);

    if (pageStart === -1) {
      // Add new page section at the end
      return `${content.trim()}\n\n${pageHeader}\n\n${newNotes}`;
    }

    let pageEnd = lines
      .slice(pageStart + 1)
      .findIndex((line) => line.startsWith("## Page"));
    if (pageEnd === -1) pageEnd = lines.length;
    else pageEnd = pageStart + 1 + pageEnd;

    const beforePage = lines.slice(0, pageStart);
    const afterPage = lines.slice(pageEnd);

    return [...beforePage, pageHeader, "", newNotes, ...afterPage].join("\n");
  }

  private handlePdfScroll(container: HTMLElement) {
    if (this.pdfScrollTimeout) {
      clearTimeout(this.pdfScrollTimeout);
    }

    if (this.isScrolling) return;

    this.pdfScrollTimeout = setTimeout(async () => {
      const scrollTop = container.scrollTop;
      const containerHeight = container.clientHeight;
      const scrollHeight = container.scrollHeight;
      const scrollPercentage =
        (scrollTop / (scrollHeight - containerHeight)) * 100;

      // Sync note container scroll position
      const noteScrollHeight =
        this.noteContainer.scrollHeight - this.noteContainer.clientHeight;
      const noteScrollTop = (scrollPercentage / 100) * noteScrollHeight;

      this.isScrolling = true;
      this.noteContainer.scrollTo({
        top: noteScrollTop,
        behavior: "smooth",
      });

      setTimeout(() => {
        this.isScrolling = false;
      }, 150);
    }, 50);
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

export default class PdfNoteAligner extends Plugin {
  settings: PdfNoteAlignerSettings;
  pdfWorker: any;

  async onload() {
    await this.loadSettings();

    // Initialize PDF.js worker
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

    // Register custom view
    this.registerView(
      PDF_NOTE_VIEW_TYPE,
      (leaf: WorkspaceLeaf) => new PdfNoteView(leaf)
    );

    // Add ribbon icon
    this.addRibbonIcon("document", "Create PDF Note View", async () => {
      await this.activatePdfNoteView();
    });

    // Add settings tab
    this.addSettingTab(new PdfNoteAlignerSettingTab(this.app, this));
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async activatePdfNoteView() {
    const { workspace } = this.app;

    // Check if view already exists
    let leaf = workspace.getLeavesOfType(PDF_NOTE_VIEW_TYPE)[0];

    if (!leaf) {
      // Create new leaf in split view
      const newLeaf = workspace.getRightLeaf(false);
      if (!newLeaf) {
        console.error("Failed to create new leaf");
        return;
      }
      leaf = newLeaf;
      await leaf.setViewState({ type: PDF_NOTE_VIEW_TYPE });
    }

    // Reveal the leaf
    workspace.revealLeaf(leaf);

    // Get the view instance
    const view = leaf.view as PdfNoteView;

    // TODO: Implement file picker for PDF selection
    // For now, we'll wait for the loadPdf method to be called with actual PDF data
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
    containerEl.createEl("h2", { text: "PDF Note Aligner Settings" });

    // Add settings UI here
  }
}
