import {
  App,
  Plugin,
  PluginSettingTab,
  WorkspaceLeaf,
  TFile,
  ItemView,
  ViewStateResult,
  Notice,
  Setting,
  MarkdownView,
  Menu,
} from "obsidian";
import * as pdfjsLib from "pdfjs-dist";

// Import PDF.js worker
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.entry";

const PDF_NOTES_VIEW_TYPE = "pdf-notes-view";

interface PDFNotesSettings {
  layout: "left" | "right" | "top" | "bottom";
  autoFitWidth: boolean;
  showPdf: boolean;
  showNotes: boolean;
  autoSaveOnClose: boolean;
  highlightColor: string;
  zoomLevel: number;
}

const DEFAULT_SETTINGS: PDFNotesSettings = {
  layout: "left",
  autoFitWidth: true,
  showPdf: true,
  showNotes: true,
  autoSaveOnClose: true,
  highlightColor: "#ffeb3b",
  zoomLevel: 1.0,
};

class PDFNotesView extends ItemView {
  private pdfContainer: HTMLElement;
  private notesContainer: HTMLElement;
  private currentPdf: any = null;
  private currentPage: number = 1;
  private currentPdfFile: TFile | null = null;
  private currentNotesFile: TFile | null = null;
  private currentScale: number = 1.0;
  private plugin: PDFNotesPlugin;
  private resizeHandle: HTMLElement;
  private canvas: HTMLCanvasElement | null = null;
  private pageNotes: Record<number, string> = {};
  private notesEditor: any = null;

  constructor(leaf: WorkspaceLeaf, plugin: PDFNotesPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return PDF_NOTES_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "PDF-Notes";
  }

  getIcon(): string {
    return "file-text";
  }

  async onOpen(): Promise<void> {
    // Initialize PDF.js worker
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

    const container = this.containerEl.children[1];
    container.empty();
    container.addClass("pdf-notes-container");

    // Create main layout
    this.createMainLayout(container);
    this.createResizeHandle();
    this.applyLayout();
    this.addStyles();

    // Show initial message
    this.showWelcomeMessage();
  }

  private createMainLayout(container: Element): void {
    // Create PDF container
    this.pdfContainer = container.createDiv({ cls: "pdf-notes-pdf-container" });
    
    // Create notes container
    this.notesContainer = container.createDiv({ cls: "pdf-notes-notes-container" });
  }

  private createResizeHandle(): void {
    this.resizeHandle = this.containerEl.createDiv({ cls: "pdf-notes-resize-handle" });
    this.setupResizeHandling();
  }

  private setupResizeHandling(): void {
    let isResizing = false;
    let startX = 0;
    let startY = 0;
    let startWidth = 0;
    let startHeight = 0;

    this.resizeHandle.addEventListener("mousedown", (e) => {
      isResizing = true;
      startX = e.clientX;
      startY = e.clientY;
      
      const pdfRect = this.pdfContainer.getBoundingClientRect();
      startWidth = pdfRect.width;
      startHeight = pdfRect.height;
      
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      e.preventDefault();
    });

    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;

      const isHorizontal = this.plugin.settings.layout === "left" || this.plugin.settings.layout === "right";
      
      if (isHorizontal) {
        const deltaX = e.clientX - startX;
        const newWidth = this.plugin.settings.layout === "left" ? 
          startWidth + deltaX : startWidth - deltaX;
        this.pdfContainer.style.width = Math.max(200, newWidth) + "px";
      } else {
        const deltaY = e.clientY - startY;
        const newHeight = this.plugin.settings.layout === "top" ? 
          startHeight + deltaY : startHeight - deltaY;
        this.pdfContainer.style.height = Math.max(200, newHeight) + "px";
      }
    };

    const handleMouseUp = () => {
      isResizing = false;
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }

  private applyLayout(): void {
    const container = this.containerEl.children[1];
    
    // Remove all layout classes
    container.removeClass("layout-left", "layout-right", "layout-top", "layout-bottom");
    
    // Add current layout class
    container.addClass(`layout-${this.plugin.settings.layout}`);

    // Position resize handle
    this.resizeHandle.removeClass("horizontal", "vertical");
    if (this.plugin.settings.layout === "left" || this.plugin.settings.layout === "right") {
      this.resizeHandle.addClass("vertical");
    } else {
      this.resizeHandle.addClass("horizontal");
    }

    // Update visibility
    this.updateVisibility();
  }

  private updateVisibility(): void {
    this.pdfContainer.style.display = this.plugin.settings.showPdf ? "flex" : "none";
    this.notesContainer.style.display = this.plugin.settings.showNotes ? "flex" : "none";
    this.resizeHandle.style.display = 
      (this.plugin.settings.showPdf && this.plugin.settings.showNotes) ? "block" : "none";
  }

  private showWelcomeMessage(): void {
    this.pdfContainer.createDiv({ 
      cls: "pdf-notes-welcome",
      text: "Right-click a PDF in your vault and select 'Open with PDF-Notes' to get started."
    });
  }

  async loadPDF(file: TFile): Promise<void> {
    try {
      this.currentPdfFile = file;
      
      // Clear containers
      this.pdfContainer.empty();
      this.notesContainer.empty();

      // Load PDF
      const arrayBuffer = await this.app.vault.readBinary(file);
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      this.currentPdf = pdf;
      this.currentPage = 1;

      // Create PDF controls
      this.createPDFControls();

      // Render first page
      await this.renderPage(1);

      // Create or load notes file
      await this.createNotesFile();

      new Notice(`Loaded PDF: ${file.name} (${pdf.numPages} pages)`);

    } catch (error) {
      console.error("Error loading PDF:", error);
      new Notice("Error loading PDF: " + error.message);
    }
  }

  private createPDFControls(): void {
    const controls = this.pdfContainer.createDiv({ cls: "pdf-notes-controls" });

    // Page navigation
    const prevBtn = controls.createEl("button", { text: "◀", cls: "pdf-notes-btn" });
    const pageInfo = controls.createEl("span", { cls: "pdf-notes-page-info" });
    const nextBtn = controls.createEl("button", { text: "▶", cls: "pdf-notes-btn" });

    // Zoom controls
    const zoomOut = controls.createEl("button", { text: "−", cls: "pdf-notes-btn" });
    const zoomInfo = controls.createEl("span", { cls: "pdf-notes-zoom-info" });
    const zoomIn = controls.createEl("button", { text: "+", cls: "pdf-notes-btn" });
    const fitWidth = controls.createEl("button", { text: "Fit Width", cls: "pdf-notes-btn" });
    const fitHeight = controls.createEl("button", { text: "Fit Height", cls: "pdf-notes-btn" });

    // Layout controls
    const layoutBtns = controls.createDiv({ cls: "pdf-notes-layout-controls" });
    layoutBtns.createEl("button", { text: "←|", cls: "pdf-notes-btn", title: "PDF Left" })
      .addEventListener("click", () => this.changeLayout("left"));
    layoutBtns.createEl("button", { text: "|→", cls: "pdf-notes-btn", title: "PDF Right" })
      .addEventListener("click", () => this.changeLayout("right"));
    layoutBtns.createEl("button", { text: "⎺", cls: "pdf-notes-btn", title: "PDF Top" })
      .addEventListener("click", () => this.changeLayout("top"));
    layoutBtns.createEl("button", { text: "⎽", cls: "pdf-notes-btn", title: "PDF Bottom" })
      .addEventListener("click", () => this.changeLayout("bottom"));

    // Visibility toggles
    const toggles = controls.createDiv({ cls: "pdf-notes-toggles" });
    const pdfToggle = toggles.createEl("button", { 
      text: "📄", 
      cls: "pdf-notes-btn", 
      title: "Toggle PDF" 
    });
    const notesToggle = toggles.createEl("button", { 
      text: "📝", 
      cls: "pdf-notes-btn", 
      title: "Toggle Notes" 
    });

    this.updateControls(prevBtn, nextBtn, pageInfo, zoomInfo, pdfToggle, notesToggle);
    this.setupControlHandlers(prevBtn, nextBtn, zoomOut, zoomIn, fitWidth, fitHeight, pdfToggle, notesToggle);
  }

  private updateControls(
    prevBtn: HTMLElement, 
    nextBtn: HTMLElement, 
    pageInfo: HTMLElement, 
    zoomInfo: HTMLElement,
    pdfToggle: HTMLElement,
    notesToggle: HTMLElement
  ): void {
    if (!this.currentPdf) return;

    prevBtn.toggleClass("disabled", this.currentPage <= 1);
    nextBtn.toggleClass("disabled", this.currentPage >= this.currentPdf.numPages);
    pageInfo.textContent = `${this.currentPage} / ${this.currentPdf.numPages}`;
    zoomInfo.textContent = `${Math.round(this.currentScale * 100)}%`;
    
    pdfToggle.toggleClass("active", this.plugin.settings.showPdf);
    notesToggle.toggleClass("active", this.plugin.settings.showNotes);
  }

  private setupControlHandlers(
    prevBtn: HTMLElement, 
    nextBtn: HTMLElement, 
    zoomOut: HTMLElement, 
    zoomIn: HTMLElement, 
    fitWidth: HTMLElement, 
    fitHeight: HTMLElement,
    pdfToggle: HTMLElement,
    notesToggle: HTMLElement
  ): void {
    prevBtn.addEventListener("click", async () => {
      if (this.currentPage > 1) {
        this.currentPage--;
        this.renderPage(this.currentPage);
        await this.updateNotesForPage();
      }
    });

    nextBtn.addEventListener("click", async () => {
      if (this.currentPage < this.currentPdf.numPages) {
        this.currentPage++;
        this.renderPage(this.currentPage);
        await this.updateNotesForPage();
      }
    });

    zoomOut.addEventListener("click", () => {
      this.currentScale = Math.max(0.5, this.currentScale - 0.25);
      this.renderPage(this.currentPage);
    });

    zoomIn.addEventListener("click", () => {
      this.currentScale = Math.min(3.0, this.currentScale + 0.25);
      this.renderPage(this.currentPage);
    });

    fitWidth.addEventListener("click", () => this.fitToWidth());
    fitHeight.addEventListener("click", () => this.fitToHeight());

    pdfToggle.addEventListener("click", () => {
      this.plugin.settings.showPdf = !this.plugin.settings.showPdf;
      this.plugin.saveSettings();
      this.updateVisibility();
    });

    notesToggle.addEventListener("click", () => {
      this.plugin.settings.showNotes = !this.plugin.settings.showNotes;
      this.plugin.saveSettings();
      this.updateVisibility();
    });
  }

  private async renderPage(pageNumber: number): Promise<void> {
    if (!this.currentPdf) return;

    try {
      const page = await this.currentPdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: this.currentScale });

      // Remove existing canvas
      const existingCanvas = this.pdfContainer.querySelector("canvas");
      if (existingCanvas) {
        existingCanvas.remove();
      }

      // Create new canvas
      this.canvas = this.pdfContainer.createEl("canvas", { cls: "pdf-notes-canvas" });
      this.canvas.width = viewport.width;
      this.canvas.height = viewport.height;

      const context = this.canvas.getContext("2d");
      if (!context) return;

      // Render PDF page
      await page.render({
        canvasContext: context,
        viewport: viewport,
      }).promise;

      this.currentPage = pageNumber;

      // Update controls if they exist
      const pageInfo = this.pdfContainer.querySelector(".pdf-notes-page-info") as HTMLElement;
      const zoomInfo = this.pdfContainer.querySelector(".pdf-notes-zoom-info") as HTMLElement;
      if (pageInfo) pageInfo.textContent = `${this.currentPage} / ${this.currentPdf.numPages}`;
      if (zoomInfo) zoomInfo.textContent = `${Math.round(this.currentScale * 100)}%`;

    } catch (error) {
      console.error("Error rendering page:", error);
      new Notice("Error rendering page: " + error.message);
    }
  }

  private fitToWidth(): void {
    if (!this.canvas) return;
    
    const containerWidth = this.pdfContainer.clientWidth - 40; // Account for padding
    const canvasWidth = this.canvas.width / this.currentScale;
    this.currentScale = containerWidth / canvasWidth;
    this.renderPage(this.currentPage);
  }

  private fitToHeight(): void {
    if (!this.canvas) return;
    
    const containerHeight = this.pdfContainer.clientHeight - 100; // Account for controls
    const canvasHeight = this.canvas.height / this.currentScale;
    this.currentScale = containerHeight / canvasHeight;
    this.renderPage(this.currentPage);
  }

  private changeLayout(layout: "left" | "right" | "top" | "bottom"): void {
    this.plugin.settings.layout = layout;
    this.plugin.saveSettings();
    this.applyLayout();
  }

  private async createNotesFile(): Promise<void> {
    if (!this.currentPdfFile) return;

    const baseName = this.currentPdfFile.basename;
    const notesFileName = `${baseName}_notes.md`;
    const folder = this.currentPdfFile.parent;
    const notesPath = folder ? `${folder.path}/${notesFileName}` : notesFileName;

    try {
      // Check if notes file already exists
      const existingFile = this.app.vault.getAbstractFileByPath(notesPath);
      
      if (existingFile instanceof TFile) {
        this.currentNotesFile = existingFile;
      } else {
        // Create new notes file with template
        const initialContent = this.createNotesTemplate();
        this.currentNotesFile = await this.app.vault.create(notesPath, initialContent);
      }

      // Load notes into the notes container
      await this.loadNotesEditor();

    } catch (error) {
      console.error("Error creating notes file:", error);
      new Notice("Error creating notes file: " + error.message);
    }
  }

  private createNotesTemplate(): string {
    const pdfName = this.currentPdfFile?.basename || "PDF";
    const totalPages = this.currentPdf?.numPages || 0;
    
    let template = `# ${pdfName} - Notes\n\n`;
    template += `**PDF:** [[${this.currentPdfFile?.name}]]\n`;
    template += `**Total Pages:** ${totalPages}\n\n`;
    template += `---\n\n`;
    
    // Create sections for each page
    for (let i = 1; i <= totalPages; i++) {
      template += `## Page ${i}\n\n`;
      template += `### Key Points\n- \n\n`;
      template += `### Questions\n- \n\n`;
      template += `### Summary\n\n\n`;
      template += `---\n\n`;
    }

    return template;
  }

  private async loadNotesEditor(): Promise<void> {
    if (!this.currentNotesFile) return;

    this.notesContainer.empty();
    
    // Add page label
    const pageLabel = this.notesContainer.createEl("div", {
      cls: "pdf-notes-page-label",
      text: `Page ${this.currentPage} Notes`
    });
    
    // Parse existing notes file and populate pageNotes
    const content = await this.app.vault.read(this.currentNotesFile);
    this.parseExistingNotes(content);
    
    // Create editor container
    const editorContainer = this.notesContainer.createEl("div", {
      cls: "pdf-notes-editor-container"
    });

    // Create a temporary file for the current page content
    const currentPageContent = this.pageNotes[this.currentPage] || '';
    
    // Create a temporary markdown view for this page
    await this.createMarkdownEditor(editorContainer, currentPageContent);

    // Navigate to current page section
    await this.updateNotesForPage();
  }

  private async updateNotesForPage(): Promise<void> {
    const pageLabel = this.notesContainer.querySelector(".pdf-notes-page-label") as HTMLElement;
    
    if (!this.currentNotesFile) return;

    // Update page label
    if (pageLabel) {
      pageLabel.textContent = `Page ${this.currentPage} Notes`;
    }

    // Save current content before switching pages
    this.saveCurrentPageNotes();

    // Load notes for the current page
    await this.loadNotesForCurrentPage();
  }

  private saveCurrentPageNotes(): void {
    if (this.notesEditor) {
      const currentContent = this.notesEditor.state.doc.toString();
      if (!this.pageNotes) this.pageNotes = {};
      
      // Save the current page's notes
      this.pageNotes[this.currentPage] = currentContent;
    }
  }

  private async loadNotesForCurrentPage(): Promise<void> {
    if (!this.notesEditor) return;

    // Load notes for current page (empty if no notes exist)
    const pageContent = this.pageNotes?.[this.currentPage] || '';
    
    // Update the editor content
    this.notesEditor.dispatch({
      changes: {
        from: 0,
        to: this.notesEditor.state.doc.length,
        insert: pageContent
      }
    });
    
    // Focus the editor
    this.notesEditor.focus();
  }

  private async saveAllNotesToFile(): Promise<void> {
    if (!this.currentNotesFile) return;

    // Save current page before saving all
    this.saveCurrentPageNotes();

    // Compile all pages into one document
    const pdfName = this.currentPdfFile?.basename || "PDF";
    let fullContent = `# ${pdfName} - Notes\n\n`;
    fullContent += `**PDF:** [[${this.currentPdfFile?.name}]]\n`;
    fullContent += `**Total Pages:** ${this.currentPdf?.numPages || 0}\n\n`;

    // Add each page's notes
    for (let page = 1; page <= (this.currentPdf?.numPages || 0); page++) {
      fullContent += `## Page ${page}\n\n`;
      if (this.pageNotes?.[page]) {
        fullContent += this.pageNotes[page] + '\n\n';
      } else {
        fullContent += '_No notes for this page_\n\n';
      }
    }

    await this.app.vault.modify(this.currentNotesFile, fullContent);
  }

  private parseExistingNotes(content: string): void {
    this.pageNotes = {};
    
    // Split content by page headers
    const pageHeaders = content.split(/^## Page (\d+)$/gm);
    
    // First element is content before any page header (skip it)
    for (let i = 1; i < pageHeaders.length; i += 2) {
      const pageNumber = parseInt(pageHeaders[i]);
      const pageContent = pageHeaders[i + 1]?.trim() || '';
      
      // Remove any "_No notes for this page_" placeholder text
      if (pageContent !== '_No notes for this page_') {
        this.pageNotes[pageNumber] = pageContent;
      }
    }
  }

  private async createMarkdownEditor(container: HTMLElement, content: string): Promise<void> {
    // Create a temporary file in memory for editing
    const tempPath = `temp-page-${this.currentPage}.md`;
    
    // Create CodeMirror editor with Obsidian integration
    const { EditorView, keymap } = await import('@codemirror/view');
    const { EditorState } = await import('@codemirror/state');
    const { basicSetup } = await import('@codemirror/basic-setup');
    const { defaultKeymap, history, historyKeymap } = await import('@codemirror/commands');
    
    // Create editor state with basic editing support
    const state = EditorState.create({
      doc: content,
      extensions: [
        basicSetup,
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            // Save current page content when changed
            this.pageNotes[this.currentPage] = update.state.doc.toString();
            
            // Debounced save to file
            this.debouncedSave();
          }
        }),
      ],
    });

    // Create editor view
    this.notesEditor = new EditorView({
      state,
      parent: container,
    });

    // Style the editor to integrate with Obsidian
    container.querySelector('.cm-editor')?.addClass('pdf-notes-codemirror');
  }

  private debouncedSave = (() => {
    let timeout: NodeJS.Timeout;
    return () => {
      clearTimeout(timeout);
      timeout = setTimeout(async () => {
        await this.saveAllNotesToFile();
      }, 1000);
    };
  })();

  private addStyles(): void {
    const styleId = "pdf-notes-styles";
    const existingStyle = document.getElementById(styleId);
    if (existingStyle) existingStyle.remove();

    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      .pdf-notes-container {
        display: flex;
        height: 100%;
        width: 100%;
        position: relative;
      }

      .pdf-notes-container.layout-left {
        flex-direction: row;
      }
      .pdf-notes-container.layout-right {
        flex-direction: row-reverse;
      }
      .pdf-notes-container.layout-top {
        flex-direction: column;
      }
      .pdf-notes-container.layout-bottom {
        flex-direction: column-reverse;
      }

      .pdf-notes-pdf-container {
        flex: 1;
        display: flex;
        flex-direction: column;
        border: 1px solid var(--background-modifier-border);
        background: var(--background-primary);
        position: relative;
        overflow: auto;
      }

      .pdf-notes-notes-container {
        flex: 1;
        display: flex;
        flex-direction: column;
        border: 1px solid var(--background-modifier-border);
        background: var(--background-primary);
        position: relative;
      }

      .pdf-notes-resize-handle {
        position: absolute;
        background: var(--background-modifier-border);
        z-index: 10;
        cursor: col-resize;
      }

      .pdf-notes-resize-handle.vertical {
        width: 4px;
        height: 100%;
        top: 0;
        cursor: col-resize;
      }

      .pdf-notes-resize-handle.horizontal {
        height: 4px;
        width: 100%;
        left: 0;
        cursor: row-resize;
      }

      .layout-left .pdf-notes-resize-handle.vertical {
        right: -2px;
      }
      .layout-right .pdf-notes-resize-handle.vertical {
        left: -2px;
      }
      .layout-top .pdf-notes-resize-handle.horizontal {
        bottom: -2px;
      }
      .layout-bottom .pdf-notes-resize-handle.horizontal {
        top: -2px;
      }

      .pdf-notes-controls {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px;
        background: var(--background-secondary);
        border-bottom: 1px solid var(--background-modifier-border);
        flex-wrap: wrap;
      }

      .pdf-notes-btn {
        padding: 4px 8px;
        border: 1px solid var(--background-modifier-border);
        background: var(--background-primary);
        color: var(--text-normal);
        cursor: pointer;
        border-radius: 4px;
        font-size: 12px;
      }

      .pdf-notes-btn:hover {
        background: var(--background-modifier-hover);
      }

      .pdf-notes-btn:active,
      .pdf-notes-btn.active {
        background: var(--background-modifier-active-hover);
      }

      .pdf-notes-btn.disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .pdf-notes-page-info,
      .pdf-notes-zoom-info {
        font-size: 12px;
        color: var(--text-muted);
        min-width: 60px;
        text-align: center;
      }

      .pdf-notes-layout-controls,
      .pdf-notes-toggles {
        display: flex;
        gap: 2px;
        margin-left: 8px;
        padding-left: 8px;
        border-left: 1px solid var(--background-modifier-border);
      }

      .pdf-notes-canvas {
        max-width: 100%;
        max-height: 100%;
        margin: auto;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      }

      .pdf-notes-welcome {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100%;
        color: var(--text-muted);
        text-align: center;
        padding: 20px;
        font-style: italic;
      }

      .pdf-notes-page-label {
        background: var(--background-secondary);
        color: var(--text-normal);
        font-weight: 600;
        font-size: 14px;
        padding: 8px 16px;
        border-bottom: 1px solid var(--background-modifier-border);
        text-align: center;
        min-height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .pdf-notes-editor {
        width: 100%;
        flex: 1;
        border: none;
        outline: none;
        resize: none;
        padding: 16px;
        font-family: var(--font-text);
        font-size: var(--font-text-size);
        line-height: var(--line-height-normal);
        background: var(--background-primary);
        color: var(--text-normal);
      }

      .pdf-notes-editor-container {
        flex: 1;
        display: flex;
        flex-direction: column;
        position: relative;
      }

      .pdf-notes-codemirror {
        height: 100%;
        font-family: var(--font-text);
        font-size: var(--font-text-size);
      }

      .pdf-notes-codemirror .cm-editor {
        height: 100%;
        background: var(--background-primary);
      }

      .pdf-notes-codemirror .cm-content {
        padding: 16px;
        color: var(--text-normal);
        line-height: var(--line-height-normal);
      }

      .pdf-notes-codemirror .cm-focused {
        outline: none;
      }
    `;
    
    document.head.appendChild(style);
  }

  async onClose(): Promise<void> {
    // Auto-save notes if enabled
    if (this.plugin.settings.autoSaveOnClose && this.currentNotesFile) {
      // Save current page notes before closing
      this.saveCurrentPageNotes();
      await this.saveAllNotesToFile();
    }

    // Cleanup
    if (this.currentPdf) {
      this.currentPdf = null;
    }
    
    if (this.notesEditor) {
      this.notesEditor.destroy();
      this.notesEditor = null;
    }
  }
}

export default class PDFNotesPlugin extends Plugin {
  settings: PDFNotesSettings;

  async onload() {
    await this.loadSettings();

    // Register view type
    this.registerView(
      PDF_NOTES_VIEW_TYPE,
      (leaf) => new PDFNotesView(leaf, this)
    );

    // Add ribbon icon
    this.addRibbonIcon("file-text", "Open PDF-Notes", async () => {
      await this.activateView();
    });

    // Add file menu context for PDFs
    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file) => {
        if (file instanceof TFile && file.extension === "pdf") {
          menu.addItem((item) => {
            item
              .setTitle("Open with PDF-Notes")
              .setIcon("file-text")
              .onClick(async () => {
                const leaf = await this.activateView();
                if (leaf) {
                  const view = leaf.view as PDFNotesView;
                  await view.loadPDF(file);
                }
              });
          });
        }
      })
    );

    // Add settings tab
    this.addSettingTab(new PDFNotesSettingTab(this.app, this));
  }

  async activateView(): Promise<WorkspaceLeaf | null> {
    const { workspace } = this.app;

    let leaf: WorkspaceLeaf | null = null;
    const leaves = workspace.getLeavesOfType(PDF_NOTES_VIEW_TYPE);

    if (leaves.length > 0) {
      leaf = leaves[0];
    } else {
      leaf = workspace.getLeaf(false);
      await leaf.setViewState({
        type: PDF_NOTES_VIEW_TYPE,
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

class PDFNotesSettingTab extends PluginSettingTab {
  plugin: PDFNotesPlugin;

  constructor(app: App, plugin: PDFNotesPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "PDF-Notes Settings" });

    new Setting(containerEl)
      .setName("Default Layout")
      .setDesc("Choose where the PDF appears relative to notes")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("left", "PDF Left, Notes Right")
          .addOption("right", "PDF Right, Notes Left")
          .addOption("top", "PDF Top, Notes Bottom")
          .addOption("bottom", "PDF Bottom, Notes Top")
          .setValue(this.plugin.settings.layout)
          .onChange(async (value: "left" | "right" | "top" | "bottom") => {
            this.plugin.settings.layout = value;
            await this.plugin.saveSettings();
            // Update all open views
            this.app.workspace
              .getLeavesOfType(PDF_NOTES_VIEW_TYPE)
              .forEach((leaf) => {
                const view = leaf.view as PDFNotesView;
                (view as any).applyLayout();
              });
          })
      );

    new Setting(containerEl)
      .setName("Auto-fit Width")
      .setDesc("Automatically fit PDF to container width")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.autoFitWidth)
          .onChange(async (value) => {
            this.plugin.settings.autoFitWidth = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Auto-save on Close")
      .setDesc("Automatically save notes when closing the view")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.autoSaveOnClose)
          .onChange(async (value) => {
            this.plugin.settings.autoSaveOnClose = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Highlight Color")
      .setDesc("Default color for PDF highlights")
      .addColorPicker((colorPicker) =>
        colorPicker
          .setValue(this.plugin.settings.highlightColor)
          .onChange(async (value) => {
            this.plugin.settings.highlightColor = value;
            await this.plugin.saveSettings();
          })
      );
  }
}