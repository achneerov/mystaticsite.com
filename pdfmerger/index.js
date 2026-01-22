// ===== DOM Elements =====
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const browseBtn = document.getElementById('browseBtn');
const fileListContainer = document.getElementById('fileListContainer');
const fileList = document.getElementById('fileList');
const fileCount = document.getElementById('fileCount');
const mergeBtn = document.getElementById('mergeBtn');
const clearBtn = document.getElementById('clearBtn');
const statusMessage = document.getElementById('statusMessage');

// ===== State =====
let pdfFiles = [];

// ===== Event Listeners =====
dropZone.addEventListener('click', () => fileInput.click());
browseBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    fileInput.click();
});

fileInput.addEventListener('change', handleFileSelect);

// Drag and drop
dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    handleFiles(e.dataTransfer.files);
});

mergeBtn.addEventListener('click', mergePDFs);
clearBtn.addEventListener('click', clearFiles);

// ===== File Handling =====
function handleFileSelect(e) {
    handleFiles(e.target.files);
    fileInput.value = ''; // Reset to allow selecting same files again
}

function handleFiles(files) {
    const newFiles = Array.from(files).filter(file => {
        if (file.type !== 'application/pdf') {
            showStatus(`"${file.name}" is not a PDF file`, 'error');
            return false;
        }
        // Check for duplicates
        if (pdfFiles.some(f => f.name === file.name && f.size === file.size)) {
            showStatus(`"${file.name}" is already added`, 'error');
            return false;
        }
        return true;
    });
    
    if (newFiles.length > 0) {
        pdfFiles = [...pdfFiles, ...newFiles];
        updateUI();
        hideStatus();
    }
}

function updateUI() {
    // Update file count
    const count = pdfFiles.length;
    fileCount.textContent = `${count} file${count !== 1 ? 's' : ''}`;
    
    // Show/hide file list
    fileListContainer.classList.toggle('visible', count > 0);
    
    // Enable/disable merge button
    mergeBtn.disabled = count < 2;
    
    // Render file list
    renderFileList();
}

function renderFileList() {
    fileList.innerHTML = pdfFiles.map((file, index) => `
        <li class="file-item" data-index="${index}">
            <div class="file-icon">
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M14 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V8L14 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M14 2V8H20" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            </div>
            <div class="file-info">
                <div class="file-name" title="${file.name}">${file.name}</div>
                <div class="file-size">${formatFileSize(file.size)}</div>
            </div>
            <div class="file-actions">
                <button class="file-action-btn" onclick="moveFile(${index}, -1)" ${index === 0 ? 'disabled' : ''} title="Move up">
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M18 15L12 9L6 15" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                </button>
                <button class="file-action-btn" onclick="moveFile(${index}, 1)" ${index === pdfFiles.length - 1 ? 'disabled' : ''} title="Move down">
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                </button>
                <button class="file-action-btn delete" onclick="removeFile(${index})" title="Remove">
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        <path d="M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                </button>
            </div>
        </li>
    `).join('');
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// ===== File Actions =====
function moveFile(index, direction) {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= pdfFiles.length) return;
    
    [pdfFiles[index], pdfFiles[newIndex]] = [pdfFiles[newIndex], pdfFiles[index]];
    updateUI();
}

function removeFile(index) {
    pdfFiles.splice(index, 1);
    updateUI();
    if (pdfFiles.length === 0) {
        hideStatus();
    }
}

function clearFiles() {
    pdfFiles = [];
    updateUI();
    hideStatus();
}

// ===== PDF Merging =====
async function mergePDFs() {
    if (pdfFiles.length < 2) {
        showStatus('Please add at least 2 PDF files', 'error');
        return;
    }
    
    showStatus('Merging PDFs...', 'loading');
    mergeBtn.disabled = true;
    
    try {
        const { PDFDocument } = PDFLib;
        const mergedPdf = await PDFDocument.create();
        
        for (const file of pdfFiles) {
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await PDFDocument.load(arrayBuffer);
            const pages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
            pages.forEach(page => mergedPdf.addPage(page));
        }
        
        const mergedPdfBytes = await mergedPdf.save();
        
        // Create download
        const blob = new Blob([mergedPdfBytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = generateFilename();
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        showStatus('✓ PDFs merged successfully! Download started.', 'success');
    } catch (error) {
        console.error('Error merging PDFs:', error);
        showStatus('Error merging PDFs. Please try again.', 'error');
    } finally {
        mergeBtn.disabled = pdfFiles.length < 2;
    }
}

function generateFilename() {
    const date = new Date();
    const timestamp = date.toISOString().slice(0, 10);
    return `merged-${timestamp}.pdf`;
}

// ===== Status Messages =====
function showStatus(message, type) {
    statusMessage.textContent = message;
    statusMessage.className = `status-message visible ${type}`;
}

function hideStatus() {
    statusMessage.className = 'status-message';
}
