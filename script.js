// PDF.js Configuration
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// Application State
const state = {
    pdfDoc: null,
    pages: [],
    selectedPages: new Set(),
    isDragging: false,
    draggedElement: null
};

// DOM Elements
const elements = {
    uploadSection: document.getElementById('uploadSection'),
    pagesSection: document.getElementById('pagesSection'),
    pagesGrid: document.getElementById('pagesGrid'),
    uploadBtn: document.getElementById('uploadBtn'),
    pdfInput: document.getElementById('pdfInput'),
    selectAllBtn: document.getElementById('selectAllBtn'),
    deselectAllBtn: document.getElementById('deselectAllBtn'),
    deleteSelectedBtn: document.getElementById('deleteSelectedBtn'),
    exportBtn: document.getElementById('exportBtn'),
    themeToggle: document.getElementById('themeToggle'),
    helpBtn: document.getElementById('helpBtn'),
    helpModal: document.getElementById('helpModal'),
    closeHelpBtn: document.getElementById('closeHelpBtn'),
    loadingOverlay: document.getElementById('loadingOverlay')
};

// Initialize Application
function init() {
    setupEventListeners();
    loadTheme();
}

// Event Listeners Setup
function setupEventListeners() {
    elements.uploadBtn.addEventListener('click', () => elements.pdfInput.click());
    elements.pdfInput.addEventListener('change', handleFileSelect);
    elements.selectAllBtn.addEventListener('click', selectAllPages);
    elements.deselectAllBtn.addEventListener('click', deselectAllPages);
    elements.deleteSelectedBtn.addEventListener('click', deleteSelectedPages);
    elements.exportBtn.addEventListener('click', exportPDF);
    elements.themeToggle.addEventListener('click', toggleTheme);
    elements.helpBtn.addEventListener('click', () => elements.helpModal.classList.remove('hidden'));
    elements.closeHelpBtn.addEventListener('click', () => elements.helpModal.classList.add('hidden'));
    elements.helpModal.addEventListener('click', (e) => {
        if (e.target === elements.helpModal) {
            elements.helpModal.classList.add('hidden');
        }
    });
}

// Theme Management
function loadTheme() {
    const theme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', theme);
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
}

// File Handling
async function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file || file.type !== 'application/pdf') {
        showNotification('Please select a valid PDF file', 'error');
        return;
    }

    showLoading(true);

    try {
        const arrayBuffer = await file.arrayBuffer();
        state.pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        await loadAllPages();

        elements.uploadSection.classList.add('hidden');
        elements.pagesSection.classList.remove('hidden');

        showLoading(false);
        showNotification(`Loaded ${state.pages.length} pages successfully`, 'success');
    } catch (error) {
        console.error('Error loading PDF:', error);
        showNotification('Failed to load PDF. Please try again.', 'error');
        showLoading(false);
    }
}

// Load All Pages
async function loadAllPages() {
    state.pages = [];
    const numPages = state.pdfDoc.numPages;

    for (let i = 1; i <= numPages; i++) {
        const page = await state.pdfDoc.getPage(i);
        state.pages.push({
            pageNum: i,
            page: page,
            rotation: 0,
            originalIndex: i - 1
        });
    }

    renderPages();
}

// Render Pages
function renderPages() {
    elements.pagesGrid.innerHTML = '';

    state.pages.forEach((pageData, index) => {
        const card = createPageCard(pageData, index);
        elements.pagesGrid.appendChild(card);
    });

    // Render canvases after DOM insertion
    state.pages.forEach((pageData, index) => {
        renderPageCanvas(pageData, index);
    });
}

// Create Page Card
function createPageCard(pageData, index) {
    const card = document.createElement('div');
    card.className = 'page-card';
    card.draggable = true;
    card.dataset.index = index;

    card.innerHTML = `
        <div class="page-checkbox-wrapper">
            <input type="checkbox" class="page-checkbox" data-index="${index}" aria-label="Select page ${index + 1}">
        </div>
        <div class="page-number">Page ${index + 1}</div>
        <div class="page-canvas-wrapper">
            <canvas class="page-canvas" id="canvas-${index}"></canvas>
        </div>
        <div class="page-actions">
            <button class="page-btn" data-action="rotate" data-index="${index}" aria-label="Rotate page ${index + 1}">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                Rotate
            </button>
        </div>
    `;

    // Drag events
    card.addEventListener('dragstart', handleDragStart);
    card.addEventListener('dragend', handleDragEnd);
    card.addEventListener('dragover', handleDragOver);
    card.addEventListener('drop', handleDrop);

    // Checkbox event
    const checkbox = card.querySelector('.page-checkbox');
    checkbox.addEventListener('change', handleCheckboxChange);

    // Rotate button event
    const rotateBtn = card.querySelector('[data-action="rotate"]');
    rotateBtn.addEventListener('click', () => rotatePage(index));

    return card;
}

// Render Page Canvas
async function renderPageCanvas(pageData, index) {
    const canvas = document.getElementById(`canvas-${index}`);
    if (!canvas) return;

    const context = canvas.getContext('2d');
    const viewport = pageData.page.getViewport({ scale: 1, rotation: pageData.rotation });

    const scale = 200 / viewport.width;
    const scaledViewport = pageData.page.getViewport({ scale: scale, rotation: pageData.rotation });

    canvas.width = scaledViewport.width;
    canvas.height = scaledViewport.height;

    const renderContext = {
        canvasContext: context,
        viewport: scaledViewport
    };

    await pageData.page.render(renderContext).promise;
}

// Page Operations
function rotatePage(index) {
    state.pages[index].rotation = (state.pages[index].rotation + 90) % 360;
    renderPageCanvas(state.pages[index], index);
}

function selectAllPages() {
    const checkboxes = document.querySelectorAll('.page-checkbox');
    checkboxes.forEach(cb => {
        cb.checked = true;
        state.selectedPages.add(parseInt(cb.dataset.index));
    });
    updateSelectedCards();
}

function deselectAllPages() {
    const checkboxes = document.querySelectorAll('.page-checkbox');
    checkboxes.forEach(cb => {
        cb.checked = false;
    });
    state.selectedPages.clear();
    updateSelectedCards();
}

function handleCheckboxChange(event) {
    const index = parseInt(event.target.dataset.index);
    if (event.target.checked) {
        state.selectedPages.add(index);
    } else {
        state.selectedPages.delete(index);
    }
    updateSelectedCards();
}

function updateSelectedCards() {
    const cards = document.querySelectorAll('.page-card');
    cards.forEach(card => {
        const index = parseInt(card.dataset.index);
        if (state.selectedPages.has(index)) {
            card.classList.add('selected');
        } else {
            card.classList.remove('selected');
        }
    });
}

function deleteSelectedPages() {
    if (state.selectedPages.size === 0) {
        showNotification('No pages selected', 'error');
        return;
    }

    if (state.pages.length === state.selectedPages.size) {
        showNotification('Cannot delete all pages', 'error');
        return;
    }

    const sortedIndices = Array.from(state.selectedPages).sort((a, b) => b - a);
    sortedIndices.forEach(index => {
        state.pages.splice(index, 1);
    });

    state.selectedPages.clear();
    renderPages();
    showNotification(`Deleted ${sortedIndices.length} page(s)`, 'success');
}

// Drag and Drop
function handleDragStart(event) {
    state.isDragging = true;
    state.draggedElement = event.currentTarget;
    event.currentTarget.classList.add('dragging');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/html', event.currentTarget.innerHTML);
}

function handleDragEnd(event) {
    state.isDragging = false;
    event.currentTarget.classList.remove('dragging');
}

function handleDragOver(event) {
    if (!state.isDragging) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';

    const afterElement = getDragAfterElement(elements.pagesGrid, event.clientY);
    const draggable = state.draggedElement;

    if (afterElement == null) {
        elements.pagesGrid.appendChild(draggable);
    } else {
        elements.pagesGrid.insertBefore(draggable, afterElement);
    }
}

function handleDrop(event) {
    event.preventDefault();

    // Update state.pages based on new DOM order
    const cards = Array.from(elements.pagesGrid.querySelectorAll('.page-card'));
    const newPages = [];

    cards.forEach((card, newIndex) => {
        const oldIndex = parseInt(card.dataset.index);
        newPages.push(state.pages[oldIndex]);
        card.dataset.index = newIndex;
    });

    state.pages = newPages;
    renderPages();
}

function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.page-card:not(.dragging)')];

    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;

        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

// Export PDF
async function exportPDF() {
    if (!state.pdfDoc || state.pages.length === 0) {
        showNotification('No pages to export', 'error');
        return;
    }

    showLoading(true);

    try {
        // Load PDF-lib
        const { PDFDocument, degrees } = await import('https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/+esm');

        const pdfDoc = await PDFDocument.create();

        // Load original PDF
        const originalPdfBytes = await state.pdfDoc.getData();
        const originalPdf = await PDFDocument.load(originalPdfBytes);

        // Copy pages in new order with rotation
        for (const pageData of state.pages) {
            const [copiedPage] = await pdfDoc.copyPages(originalPdf, [pageData.originalIndex]);
            copiedPage.setRotation(degrees(pageData.rotation));
            pdfDoc.addPage(copiedPage);
        }

        const pdfBytes = await pdfDoc.save();

        // Download
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `modified-${Date.now()}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showLoading(false);
        showNotification('PDF exported successfully', 'success');
    } catch (error) {
        console.error('Error exporting PDF:', error);
        showNotification('Failed to export PDF. Please try again.', 'error');
        showLoading(false);
    }
}

// UI Helpers
function showLoading(show) {
    if (show) {
        elements.loadingOverlay.classList.remove('hidden');
    } else {
        elements.loadingOverlay.classList.add('hidden');
    }
}

function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background-color: ${type === 'error' ? '#FF4D4F' : type === 'success' ? '#52C41A' : '#1890FF'};
        color: white;
        padding: 16px 24px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        z-index: 3000;
        font-size: 14px;
        max-width: 300px;
        animation: slideIn 0.3s ease;
    `;
    notification.textContent = message;

    // Add animation
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideIn {
            from {
                transform: translateX(400px);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }
    `;
    document.head.appendChild(style);

    document.body.appendChild(notification);

    // Remove after 3 seconds
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Initialize on load
document.addEventListener('DOMContentLoaded', init);