// PDF.js Configuration
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// Application State
const state = {
  pdfDoc: null,
  pages: [],
  selectedPages: new Set(),
  isDragging: false,
  draggedElement: null,
  draggedIndex: -1
};

// DOM Elements Cache
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
  closeHelpBtnFooter: document.getElementById('closeHelpBtnFooter'),
  loadingOverlay: document.getElementById('loadingOverlay'),
  notificationToast: document.getElementById('notificationToast'),
  dropZone: document.getElementById('dropZone'),
  dragTooltip: document.getElementById('dragTooltip'),
  tooltipPosition: document.getElementById('tooltipPosition')
};

// Initialize Application
function init() {
  attachEventListeners();
  initTheme();
  setupDropZone();
}

// Event Listeners
function attachEventListeners() {
  elements.uploadBtn.addEventListener('click', () => elements.pdfInput.click());
  elements.pdfInput.addEventListener('change', handleFileSelect);
  elements.selectAllBtn.addEventListener('click', selectAllPages);
  elements.deselectAllBtn.addEventListener('click', deselectAllPages);
  elements.deleteSelectedBtn.addEventListener('click', deleteSelectedPages);
  elements.exportBtn.addEventListener('click', exportPDF);
  elements.themeToggle.addEventListener('click', toggleTheme);
  elements.helpBtn.addEventListener('click', openHelpModal);
  elements.closeHelpBtn.addEventListener('click', closeHelpModal);
  elements.closeHelpBtnFooter.addEventListener('click', closeHelpModal);

  // Close modal on backdrop click
  elements.helpModal.addEventListener('click', (e) => {
    if (e.target === elements.helpModal) closeHelpModal();
  });

  // Keyboard accessibility for modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && elements.helpModal.open) {
      closeHelpModal();
    }
  });
}

// Theme Management
function initTheme() {
  const savedTheme = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
  updateThemeIcon(savedTheme);
}

function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme');
  const newTheme = currentTheme === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
  updateThemeIcon(newTheme);
  showNotification(`Switched to ${newTheme} mode`, 'success');
}

function updateThemeIcon(theme) {
  elements.themeToggle.textContent = theme === 'light' ? '🌙' : '☀️';
  elements.themeToggle.setAttribute('aria-label', `Switch to ${theme === 'light' ? 'dark' : 'light'} mode`);
}

// Drop Zone Setup
function setupDropZone() {
  const dropZone = elements.dropZone;

  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, preventDefaults, false);
  });

  ['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, () => dropZone.classList.add('dragover'), false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, () => dropZone.classList.remove('dragover'), false);
  });

  dropZone.addEventListener('drop', handleDrop, false);
}

function preventDefaults(e) {
  e.preventDefault();
  e.stopPropagation();
}

function handleDrop(e) {
  const dt = e.dataTransfer;
  const files = dt.files;

  if (files.length > 0) {
    const file = files[0];
    if (file.type === 'application/pdf') {
      elements.pdfInput.files = files;
      handleFileSelect({ target: { files: files } });
    } else {
      showNotification('Please drop a valid PDF file', 'error');
    }
  }
}

// File Selection and PDF Loading
async function handleFileSelect(event) {
  const file = event.target.files[0];

  if (!file) return;

  if (file.type !== 'application/pdf') {
    showNotification('Please select a valid PDF file', 'error');
    return;
  }

  try {
    showLoading(true);
    await loadPDF(file);
    showNotification('PDF loaded successfully', 'success');
    elements.uploadSection.style.display = 'none';
    elements.pagesSection.style.display = 'block';
  } catch (error) {
    console.error('Error loading PDF:', error);
    showNotification('Failed to load PDF. Please try again.', 'error');
  } finally {
    showLoading(false);
  }
}

async function loadPDF(file) {
  const arrayBuffer = await file.arrayBuffer();
  state.pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  await loadAllPages();
  renderPages();
}

async function loadAllPages() {
  state.pages = [];
  const numPages = state.pdfDoc.numPages;

  for (let i = 1; i <= numPages; i++) {
    const page = await state.pdfDoc.getPage(i);
    state.pages.push({
      pageNumber: i,
      page: page,
      rotation: 0,
      originalIndex: i - 1
    });
  }
}

// Page Rendering
function renderPages() {
  elements.pagesGrid.innerHTML = '';

  state.pages.forEach((pageData, index) => {
    const pageCard = createPageCard(pageData, index);
    elements.pagesGrid.appendChild(pageCard);
  });

  // Render canvases after DOM insertion
  state.pages.forEach((pageData, index) => {
    renderPageCanvas(pageData, index);
  });
}

function createPageCard(pageData, index) {
  const card = document.createElement('div');
  card.className = 'page-card';
  card.setAttribute('draggable', 'true');
  card.setAttribute('data-index', index);
  card.setAttribute('role', 'article');
  card.setAttribute('aria-label', `Page ${index + 1}`);

  // Checkbox
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'page-checkbox';
  checkbox.checked = state.selectedPages.has(index);
  checkbox.setAttribute('aria-label', `Select page ${index + 1}`);
  checkbox.addEventListener('change', (e) => togglePageSelection(index, e.target.checked));

  // Canvas wrapper
  const canvasWrap = document.createElement('div');
  canvasWrap.className = 'page-canvas-wrap';

  const canvas = document.createElement('canvas');
  canvas.id = `canvas-${index}`;
  canvas.className = 'page-canvas';
  canvasWrap.appendChild(canvas);

  // Page label
  const label = document.createElement('div');
  label.className = 'page-label';
  label.textContent = `Page ${index + 1}`;

  // Action buttons
  const actions = document.createElement('div');
  actions.className = 'page-actions';

  const rotateBtn = document.createElement('button');
  rotateBtn.className = 'page-btn rotate';
  rotateBtn.textContent = '🔄';
  rotateBtn.setAttribute('aria-label', `Rotate page ${index + 1}`);
  rotateBtn.addEventListener('click', () => rotatePage(index));

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'page-btn delete';
  deleteBtn.textContent = '🗑️';
  deleteBtn.setAttribute('aria-label', `Delete page ${index + 1}`);
  deleteBtn.addEventListener('click', () => deletePage(index));

  actions.appendChild(rotateBtn);
  actions.appendChild(deleteBtn);

  // Assemble card
  card.appendChild(checkbox);
  card.appendChild(canvasWrap);
  card.appendChild(label);
  card.appendChild(actions);

  // Drag events
  card.addEventListener('dragstart', handleDragStart);
  card.addEventListener('dragover', handleDragOver);
  card.addEventListener('drop', handlePageDrop);
  card.addEventListener('dragend', handleDragEnd);
  card.addEventListener('dragleave', handleDragLeave);

  return card;
}

async function renderPageCanvas(pageData, index) {
  const canvas = document.getElementById(`canvas-${index}`);
  if (!canvas) return;

  const context = canvas.getContext('2d');
  const viewport = pageData.page.getViewport({ 
    scale: 1.0, 
    rotation: pageData.rotation 
  });

  // Calculate scale to fit canvas width
  const desiredWidth = 160;
  const scale = desiredWidth / viewport.width;
  const scaledViewport = pageData.page.getViewport({ 
    scale: scale, 
    rotation: pageData.rotation 
  });

  canvas.width = scaledViewport.width;
  canvas.height = scaledViewport.height;

  const renderContext = {
    canvasContext: context,
    viewport: scaledViewport
  };

  try {
    await pageData.page.render(renderContext).promise;
  } catch (error) {
    console.error(`Error rendering page ${index + 1}:`, error);
  }
}

// Drag and Drop Handlers with Position Tooltip
function handleDragStart(e) {
  state.isDragging = true;
  state.draggedElement = e.currentTarget;
  state.draggedIndex = parseInt(e.currentTarget.getAttribute('data-index'));

  e.currentTarget.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/html', e.currentTarget.innerHTML);

  // Show tooltip
  elements.dragTooltip.classList.add('active');
  elements.tooltipPosition.textContent = state.draggedIndex + 1;
}

function handleDragOver(e) {
  if (e.preventDefault) {
    e.preventDefault();
  }

  e.dataTransfer.dropEffect = 'move';

  const targetCard = e.currentTarget;
  const targetIndex = parseInt(targetCard.getAttribute('data-index'));

  if (targetCard !== state.draggedElement) {
    targetCard.classList.add('drop-target');

    // Update tooltip with target position
    elements.tooltipPosition.textContent = targetIndex + 1;
  }

  return false;
}

function handleDragLeave(e) {
  e.currentTarget.classList.remove('drop-target');
}

function handlePageDrop(e) {
  if (e.stopPropagation) {
    e.stopPropagation();
  }

  const targetCard = e.currentTarget;
  const targetIndex = parseInt(targetCard.getAttribute('data-index'));

  if (state.draggedElement !== targetCard && state.draggedIndex !== -1) {
    // Reorder pages array
    const draggedPage = state.pages[state.draggedIndex];
    state.pages.splice(state.draggedIndex, 1);
    state.pages.splice(targetIndex, 0, draggedPage);

    // Update selected pages indices
    const newSelectedPages = new Set();
    state.selectedPages.forEach(oldIndex => {
      let newIndex = oldIndex;

      if (oldIndex === state.draggedIndex) {
        newIndex = targetIndex;
      } else if (state.draggedIndex < targetIndex) {
        if (oldIndex > state.draggedIndex && oldIndex <= targetIndex) {
          newIndex = oldIndex - 1;
        }
      } else {
        if (oldIndex >= targetIndex && oldIndex < state.draggedIndex) {
          newIndex = oldIndex + 1;
        }
      }

      newSelectedPages.add(newIndex);
    });

    state.selectedPages = newSelectedPages;
    renderPages();
    showNotification(`Moved page to position ${targetIndex + 1}`, 'success');
  }

  targetCard.classList.remove('drop-target');
  return false;
}

function handleDragEnd(e) {
  e.currentTarget.classList.remove('dragging');

  // Remove drop-target class from all cards
  document.querySelectorAll('.page-card').forEach(card => {
    card.classList.remove('drop-target');
  });

  // Hide tooltip
  elements.dragTooltip.classList.remove('active');

  state.isDragging = false;
  state.draggedElement = null;
  state.draggedIndex = -1;
}

// Page Selection
function togglePageSelection(index, isChecked) {
  if (isChecked) {
    state.selectedPages.add(index);
  } else {
    state.selectedPages.delete(index);
  }

  const card = document.querySelector(`[data-index="${index}"]`);
  if (card) {
    card.classList.toggle('selected', isChecked);
    card.setAttribute('aria-selected', isChecked);
  }
}

function selectAllPages() {
  state.selectedPages.clear();
  state.pages.forEach((_, index) => {
    state.selectedPages.add(index);
  });
  renderPages();
  showNotification('All pages selected', 'success');
}

function deselectAllPages() {
  state.selectedPages.clear();
  renderPages();
  showNotification('All pages deselected', 'success');
}

// Page Operations
function rotatePage(index) {
  state.pages[index].rotation = (state.pages[index].rotation + 90) % 360;
  renderPageCanvas(state.pages[index], index);
  showNotification(`Page ${index + 1} rotated`, 'success');
}

function deletePage(index) {
  if (state.pages.length === 1) {
    showNotification('Cannot delete the last page', 'error');
    return;
  }

  state.pages.splice(index, 1);

  // Update selected pages
  const newSelectedPages = new Set();
  state.selectedPages.forEach(selectedIndex => {
    if (selectedIndex < index) {
      newSelectedPages.add(selectedIndex);
    } else if (selectedIndex > index) {
      newSelectedPages.add(selectedIndex - 1);
    }
  });
  state.selectedPages = newSelectedPages;

  renderPages();
  showNotification(`Page ${index + 1} deleted`, 'success');
}

function deleteSelectedPages() {
  if (state.selectedPages.size === 0) {
    showNotification('No pages selected', 'error');
    return;
  }

  if (state.selectedPages.size === state.pages.length) {
    showNotification('Cannot delete all pages', 'error');
    return;
  }

  const indicesToDelete = Array.from(state.selectedPages).sort((a, b) => b - a);

  indicesToDelete.forEach(index => {
    state.pages.splice(index, 1);
  });

  state.selectedPages.clear();
  renderPages();
  showNotification(`${indicesToDelete.length} page(s) deleted`, 'success');
}

// PDF Export
async function exportPDF() {
  if (state.pages.length === 0) {
    showNotification('No pages to export', 'error');
    return;
  }

  try {
    showLoading(true);

    const pdfDoc = await PDFLib.PDFDocument.create();
    const srcArrayBuffer = await state.pdfDoc.getData();
    const srcDoc = await PDFLib.PDFDocument.load(srcArrayBuffer);

    for (const pageData of state.pages) {
      const [copiedPage] = await pdfDoc.copyPages(srcDoc, [pageData.originalIndex]);

      if (pageData.rotation !== 0) {
        copiedPage.setRotation(PDFLib.degrees(pageData.rotation));
      }

      pdfDoc.addPage(copiedPage);
    }

    const pdfBytes = await pdfDoc.save();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `modified-pdf-${Date.now()}.pdf`;
    link.click();

    URL.revokeObjectURL(url);
    showNotification('PDF exported successfully', 'success');
  } catch (error) {
    console.error('Error exporting PDF:', error);
    showNotification('Failed to export PDF. Please try again.', 'error');
  } finally {
    showLoading(false);
  }
}

// Modal Management
function openHelpModal() {
  elements.helpModal.showModal();
  elements.helpModal.setAttribute('aria-hidden', 'false');
}

function closeHelpModal() {
  elements.helpModal.close();
  elements.helpModal.setAttribute('aria-hidden', 'true');
}

// UI Feedback
function showLoading(show) {
  if (show) {
    elements.loadingOverlay.classList.add('active');
    elements.loadingOverlay.setAttribute('aria-busy', 'true');
  } else {
    elements.loadingOverlay.classList.remove('active');
    elements.loadingOverlay.setAttribute('aria-busy', 'false');
  }
}

function showNotification(message, type = 'success') {
  elements.notificationToast.textContent = message;
  elements.notificationToast.style.background = type === 'success' ? '#43B97F' : '#FF4656';
  elements.notificationToast.classList.add('active');

  setTimeout(() => {
    elements.notificationToast.classList.remove('active');
  }, 3000);
}

// Initialize on DOM load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
