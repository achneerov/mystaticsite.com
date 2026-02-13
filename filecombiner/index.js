// ===== DOM Elements =====
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const browseBtn = document.getElementById('browseBtn');
const fileListContainer = document.getElementById('fileListContainer');
const fileList = document.getElementById('fileList');
const fileCount = document.getElementById('fileCount');
const combineBtn = document.getElementById('combineBtn');
const clearBtn = document.getElementById('clearBtn');
const statusMessage = document.getElementById('statusMessage');

// ===== Accepted types =====
const ACCEPTED_TYPES = {
    'application/pdf': 'pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'image/png': 'png',
    'image/jpeg': 'jpg',
};

const ACCEPTED_EXTENSIONS = ['.pdf', '.docx', '.png', '.jpg', '.jpeg'];

// ===== State =====
let uploadedFiles = [];

// ===== Event Listeners =====
dropZone.addEventListener('click', () => fileInput.click());
browseBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    fileInput.click();
});

fileInput.addEventListener('change', handleFileSelect);

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

combineBtn.addEventListener('click', combineFiles);
clearBtn.addEventListener('click', clearFiles);

// ===== Helpers =====
function getFileExtension(filename) {
    return filename.slice(filename.lastIndexOf('.')).toLowerCase();
}

function getFileType(file) {
    if (ACCEPTED_TYPES[file.type]) return ACCEPTED_TYPES[file.type];
    const ext = getFileExtension(file.name);
    if (ext === '.pdf') return 'pdf';
    if (ext === '.docx') return 'docx';
    if (ext === '.png') return 'png';
    if (ext === '.jpg' || ext === '.jpeg') return 'jpg';
    return null;
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// ===== File Handling =====
function handleFileSelect(e) {
    handleFiles(e.target.files);
    fileInput.value = '';
}

function handleFiles(files) {
    const newFiles = Array.from(files).filter(file => {
        const type = getFileType(file);
        if (!type) {
            showStatus(`"${file.name}" is not a supported file type. Use PDF, DOCX, PNG, or JPG.`, 'error');
            return false;
        }
        if (uploadedFiles.some(f => f.name === file.name && f.size === file.size)) {
            showStatus(`"${file.name}" is already added`, 'error');
            return false;
        }
        return true;
    });

    if (newFiles.length > 0) {
        uploadedFiles = [...uploadedFiles, ...newFiles];
        updateUI();
        hideStatus();
    }
}

function updateUI() {
    const count = uploadedFiles.length;
    fileCount.textContent = `${count} file${count !== 1 ? 's' : ''}`;
    fileListContainer.classList.toggle('visible', count > 0);
    combineBtn.disabled = count < 1;
    renderFileList();
}

function renderFileList() {
    fileList.innerHTML = uploadedFiles.map((file, index) => {
        const type = getFileType(file) || 'unknown';
        const typeLabel = type.toUpperCase();
        return `
        <li class="file-item" data-index="${index}">
            <div class="file-icon ${type}">
                ${typeLabel}
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
                <button class="file-action-btn" onclick="moveFile(${index}, 1)" ${index === uploadedFiles.length - 1 ? 'disabled' : ''} title="Move down">
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
    `;
    }).join('');
}

// ===== File Actions =====
function moveFile(index, direction) {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= uploadedFiles.length) return;
    [uploadedFiles[index], uploadedFiles[newIndex]] = [uploadedFiles[newIndex], uploadedFiles[index]];
    updateUI();
}

function removeFile(index) {
    uploadedFiles.splice(index, 1);
    updateUI();
    if (uploadedFiles.length === 0) hideStatus();
}

function clearFiles() {
    uploadedFiles = [];
    updateUI();
    hideStatus();
}

// ===== Combining Logic =====
async function combineFiles() {
    if (uploadedFiles.length < 1) {
        showStatus('Please add at least one file', 'error');
        return;
    }

    const types = uploadedFiles.map(f => getFileType(f));
    const uniqueTypes = [...new Set(types)];
    const allSameType = uniqueTypes.length === 1;

    // If all PDFs, just merge them
    if (allSameType && uniqueTypes[0] === 'pdf') {
        await mergePDFs();
        return;
    }

    // Otherwise, convert everything to PDF and merge
    await convertAndMergeToPDF();
}

async function mergePDFs() {
    showStatus('Merging PDFs...', 'loading');
    combineBtn.disabled = true;

    try {
        const { PDFDocument } = PDFLib;
        const mergedPdf = await PDFDocument.create();

        for (let i = 0; i < uploadedFiles.length; i++) {
            showStatus(`Processing file ${i + 1} of ${uploadedFiles.length}...`, 'loading');
            const arrayBuffer = await uploadedFiles[i].arrayBuffer();
            const pdf = await PDFDocument.load(arrayBuffer);
            const pages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
            pages.forEach(page => mergedPdf.addPage(page));
        }

        const mergedPdfBytes = await mergedPdf.save();
        downloadBlob(new Blob([mergedPdfBytes], { type: 'application/pdf' }), `combined-${getTimestamp()}.pdf`);
        showStatus('✓ PDFs merged successfully! Download started.', 'success');
    } catch (error) {
        console.error('Error merging PDFs:', error);
        showStatus('Error merging PDFs. Please try again.', 'error');
    } finally {
        combineBtn.disabled = uploadedFiles.length < 1;
    }
}

async function convertAndMergeToPDF() {
    showStatus('Converting and combining files...', 'loading');
    combineBtn.disabled = true;

    try {
        const { PDFDocument, rgb, StandardFonts } = PDFLib;
        const mergedPdf = await PDFDocument.create();
        const font = await mergedPdf.embedFont(StandardFonts.Helvetica);
        const boldFont = await mergedPdf.embedFont(StandardFonts.HelveticaBold);

        for (let i = 0; i < uploadedFiles.length; i++) {
            const file = uploadedFiles[i];
            const type = getFileType(file);
            showStatus(`Processing "${file.name}" (${i + 1}/${uploadedFiles.length})...`, 'loading');

            if (type === 'pdf') {
                const arrayBuffer = await file.arrayBuffer();
                const pdf = await PDFDocument.load(arrayBuffer);
                const pages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
                pages.forEach(page => mergedPdf.addPage(page));
            } else if (type === 'png' || type === 'jpg') {
                await convertImageToPdfPage(file, type, mergedPdf);
            } else if (type === 'docx') {
                await convertDocxToPdfPages(file, mergedPdf, font, boldFont);
            }
        }

        const mergedPdfBytes = await mergedPdf.save();
        downloadBlob(new Blob([mergedPdfBytes], { type: 'application/pdf' }), `combined-${getTimestamp()}.pdf`);
        showStatus('✓ Files combined successfully! Download started.', 'success');
    } catch (error) {
        console.error('Error combining files:', error);
        showStatus('Error combining files. Please try again.', 'error');
    } finally {
        combineBtn.disabled = uploadedFiles.length < 1;
    }
}

// ===== Image → PDF =====
async function convertImageToPdfPage(file, type, pdfDoc) {
    const arrayBuffer = await file.arrayBuffer();
    let image;
    if (type === 'png') {
        image = await pdfDoc.embedPng(arrayBuffer);
    } else {
        image = await pdfDoc.embedJpg(arrayBuffer);
    }

    const { width, height } = image.scale(1);
    // Fit to A4 if larger, otherwise use native dimensions
    const maxW = 595.28;
    const maxH = 841.89;
    let scale = 1;
    if (width > maxW || height > maxH) {
        scale = Math.min(maxW / width, maxH / height);
    }
    const finalW = width * scale;
    const finalH = height * scale;

    const page = pdfDoc.addPage([finalW, finalH]);
    page.drawImage(image, {
        x: 0,
        y: 0,
        width: finalW,
        height: finalH,
    });
}

// ===== DOCX → PDF =====
async function convertDocxToPdfPages(file, pdfDoc, font, boldFont) {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    const text = result.value;

    const pageWidth = 595.28;  // A4
    const pageHeight = 841.89;
    const margin = 50;
    const fontSize = 11;
    const lineHeight = fontSize * 1.5;
    const maxWidth = pageWidth - margin * 2;

    const lines = wrapText(text, font, fontSize, maxWidth);

    let y = pageHeight - margin;
    let page = pdfDoc.addPage([pageWidth, pageHeight]);

    for (const line of lines) {
        if (y < margin + lineHeight) {
            page = pdfDoc.addPage([pageWidth, pageHeight]);
            y = pageHeight - margin;
        }
        page.drawText(line, {
            x: margin,
            y: y,
            size: fontSize,
            font: font,
            color: PDFLib.rgb(0.12, 0.16, 0.22),
        });
        y -= lineHeight;
    }
}


// ===== Text wrapping helper =====
function wrapText(text, font, fontSize, maxWidth) {
    const paragraphs = text.split('\n');
    const allLines = [];

    for (const para of paragraphs) {
        if (para.trim() === '') {
            allLines.push('');
            continue;
        }

        const words = para.split(/\s+/);
        let currentLine = '';

        for (const word of words) {
            const testLine = currentLine ? currentLine + ' ' + word : word;
            let width;
            try {
                width = font.widthOfTextAtSize(testLine, fontSize);
            } catch {
                width = testLine.length * fontSize * 0.5;
            }

            if (width > maxWidth && currentLine) {
                allLines.push(currentLine);
                currentLine = word;
            } else {
                currentLine = testLine;
            }
        }

        if (currentLine) {
            allLines.push(currentLine);
        }
    }

    return allLines;
}

// ===== Download helper =====
function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function getTimestamp() {
    return new Date().toISOString().slice(0, 10);
}

// ===== Status Messages =====
function showStatus(message, type) {
    statusMessage.textContent = message;
    statusMessage.className = `status-message visible ${type}`;
}

function hideStatus() {
    statusMessage.className = 'status-message';
}
