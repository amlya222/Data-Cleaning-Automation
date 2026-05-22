const API_BASE = 'http://localhost:5000/api';
const fileInput = document.getElementById('fileInput');
const dropZone = document.getElementById('dropZone');
const cleanBtn = document.getElementById('cleanBtn');
const downloadBtn = document.getElementById('downloadBtn');
const previewArea = document.getElementById('previewArea');
const fileNameEl = document.getElementById('fileName');
const rowCountEl = document.getElementById('rowCount');
const emptyCountEl = document.getElementById('emptyCount');
const duplicateCountEl = document.getElementById('duplicateCount');
const recordsProcessedEl = document.getElementById('recordsProcessed');
const dataAccuracyEl = document.getElementById('dataAccuracy');
const anomaliesDetectedEl = document.getElementById('anomaliesDetected');
const cleanTimeEl = document.getElementById('cleanTime');
const statusMessage = document.getElementById('statusMessage');

let uploadedFile = null;
let uploadedData = null;
let fileType = null;
let cleanedData = null;
let summary = null;
let filename = null;

fileInput.addEventListener('change', handleFileSelect);
dropZone.addEventListener('dragover', handleDragOver);
dropZone.addEventListener('dragleave', handleDragLeave);
dropZone.addEventListener('drop', handleDrop);
cleanBtn.addEventListener('click', cleanFile);
downloadBtn.addEventListener('click', downloadCleanedFile);

function handleFileSelect(event) {
  const file = event.target.files[0];
  if (!file) return;
  uploadFile(file);
}

function handleDragOver(event) {
  event.preventDefault();
  dropZone.classList.add('dragover');
}

function handleDragLeave() {
  dropZone.classList.remove('dragover');
}

function handleDrop(event) {
  event.preventDefault();
  dropZone.classList.remove('dragover');
  const file = event.dataTransfer.files[0];
  if (!file) return;
  uploadFile(file);
}

function renderPreviewTable(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    previewArea.innerHTML = '<div class="no-preview">No preview available for this dataset.</div>';
    return;
  }

  const columns = Array.from(rows.reduce((set, row) => {
    Object.keys(row).forEach((key) => set.add(key));
    return set;
  }, new Set()));

  const visibleRows = rows.slice(0, 20);
  const headerHtml = columns.map((col) => `<th>${escapeHtml(col)}</th>`).join('');
  const bodyHtml = visibleRows
    .map((row) => {
      const rowHtml = columns
        .map((col) => {
          const value = row[col] === null || row[col] === undefined ? '' : row[col];
          return `<td>${escapeHtml(String(value))}</td>`;
        })
        .join('');
      return `<tr>${rowHtml}</tr>`;
    })
    .join('');

  previewArea.innerHTML = `
    <div class="preview-count">Showing ${visibleRows.length} of ${rows.length} rows</div>
    <table>
      <thead><tr>${headerHtml}</tr></thead>
      <tbody>${bodyHtml}</tbody>
    </table>
  `;
}

function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function uploadFile(file) {
  uploadedFile = file;
  filename = file.name;
  fileNameEl.textContent = file.name;
  previewArea.textContent = 'Uploading and parsing file...';
  cleanBtn.disabled = true;
  downloadBtn.disabled = true;

  const formData = new FormData();
  formData.append('file', file);

  try {
    const response = await fetch(`${API_BASE}/upload`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      let errorText = 'Upload failed';
      try {
        const error = await response.json();
        errorText = error.error || JSON.stringify(error);
      } catch (_) {
        errorText = await response.text();
      }
      previewArea.textContent = errorText;
      statusMessage.textContent = errorText;
      statusMessage.className = 'status-text error';
      cleanBtn.disabled = true;
      return;
    }

    const result = await response.json();
    uploadedData = result.data;
    fileType = result.fileType;
    
    // Update summary
    rowCountEl.textContent = result.totalRows;
    emptyCountEl.textContent = result.summary.emptyCount;
    duplicateCountEl.textContent = result.summary.duplicateCount;
    recordsProcessedEl.textContent = result.totalRows;
    dataAccuracyEl.textContent = '—';
    anomaliesDetectedEl.textContent = result.summary.duplicateCount + ' duplicate(s)';

    // Show preview
    renderPreviewTable(uploadedData);
    statusMessage.textContent = 'File uploaded successfully.';
    statusMessage.className = 'status-text success';
    cleanBtn.disabled = false;
  } catch (error) {
    const message = `Error uploading file: ${error.message}`;
    previewArea.textContent = message;
    statusMessage.textContent = message;
    statusMessage.className = 'status-text error';
    cleanBtn.disabled = true;
  }
}

async function cleanFile() {
  if (!uploadedData) {
    statusMessage.textContent = 'Upload a file before cleaning.';
    statusMessage.className = 'status-text error';
    return;
  }
  
  cleanBtn.textContent = 'Cleaning...';
  cleanBtn.disabled = true;
  const start = performance.now();

  try {
    const response = await fetch(`${API_BASE}/clean`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: uploadedData }),
    });

    if (!response.ok) {
      const error = await response.json();
      previewArea.textContent = `Cleaning failed: ${error.error}`;
      cleanBtn.textContent = 'Clean File';
      cleanBtn.disabled = false;
      return;
    }

    const result = await response.json();
    cleanedData = result.allCleaned;
    summary = result.summary;
    statusMessage.textContent = 'File cleaned successfully.';
    statusMessage.className = 'status-text success';
    
    const duration = ((performance.now() - start) / 1000).toFixed(2);

    // Update stats
    rowCountEl.textContent = summary.cleanedRows;
    emptyCountEl.textContent = summary.emptyCount;
    duplicateCountEl.textContent = summary.duplicateCount;
    recordsProcessedEl.textContent = summary.originalRows;
    dataAccuracyEl.textContent = `${summary.accuracy}%`;
    anomaliesDetectedEl.textContent = summary.anomalies;
    cleanTimeEl.textContent = `${duration}s`;

    // Show preview
    renderPreviewTable(result.cleaned);
    downloadBtn.disabled = false;
  } catch (error) {
    previewArea.textContent = `Error cleaning data: ${error.message}`;
  } finally {
    cleanBtn.textContent = 'Clean File';
    cleanBtn.disabled = false;
  }
}

async function downloadCleanedFile() {
  if (!cleanedData || !filename) return;

  downloadBtn.textContent = 'Preparing...';
  downloadBtn.disabled = true;

  try {
    const response = await fetch(`${API_BASE}/download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: cleanedData,
        filename: filename,
        fileType: fileType,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      alert(`Download failed: ${error.error}`);
      downloadBtn.textContent = 'Download Cleaned File';
      downloadBtn.disabled = false;
      return;
    }

    const result = await response.json();
    const blob = new Blob([result.content], {
      type: fileType === 'csv' ? 'text/csv' : 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = result.filename;
    anchor.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    alert(`Error downloading file: ${error.message}`);
  } finally {
    downloadBtn.textContent = 'Download Cleaned File';
    downloadBtn.disabled = false;
  }
}
