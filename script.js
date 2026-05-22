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

let uploadedFile = null;
let parsedData = null;
let fileType = null;
let cleanedData = null;
let summary = null;

fileInput.addEventListener('change', handleFileSelect);
dropZone.addEventListener('dragover', handleDragOver);
dropZone.addEventListener('dragleave', handleDragLeave);
dropZone.addEventListener('drop', handleDrop);
cleanBtn.addEventListener('click', cleanFile);
downloadBtn.addEventListener('click', downloadCleanedFile);

function handleFileSelect(event) {
  const file = event.target.files[0];
  if (!file) return;
  loadFile(file);
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
  loadFile(file);
}

function loadFile(file) {
  uploadedFile = file;
  fileType = getFileType(file.name);
  fileNameEl.textContent = file.name;
  previewArea.textContent = 'Parsing uploaded file...';
  cleanBtn.disabled = true;
  downloadBtn.disabled = true;

  const reader = new FileReader();
  reader.onload = async () => {
    try {
      parsedData = parseFile(reader.result, fileType);
      updateSummary(parsedData);
      previewArea.textContent = JSON.stringify(getPreview(parsedData), null, 2);
      cleanBtn.disabled = false;
    } catch (error) {
      previewArea.textContent = 'Unable to parse file. Make sure it is valid CSV or JSON.';
      parsedData = null;
      cleanBtn.disabled = true;
    }
  };
  reader.readAsText(file);
}

function getFileType(name) {
  const lower = name.toLowerCase();
  if (lower.endsWith('.json')) return 'json';
  if (lower.endsWith('.csv')) return 'csv';
  return 'unknown';
}

function parseFile(content, type) {
  if (type === 'json') {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) return parsed;
    if (typeof parsed === 'object' && parsed !== null) return [parsed];
    throw new Error('JSON must be an object or array of objects');
  }
  if (type === 'csv') {
    return parseCsv(content);
  }
  throw new Error('Unsupported file type');
}

function parseCsv(content) {
  const lines = content.split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return [];
  const headers = splitCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    const row = {};
    headers.forEach((header, index) => {
      row[header.trim()] = values[index] ?? '';
    });
    return row;
  });
}

function splitCsvLine(line) {
  const regex = /,(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)/g;
  return line.split(regex).map((value) => value.replace(/^\"|\"$/g, '').trim());
}

function getPreview(data) {
  if (!Array.isArray(data) || data.length === 0) return [];
  return data.slice(0, 5);
}

function cleanFile() {
  if (!parsedData) return;
  const start = performance.now();
  const cleaningResult = cleanData(parsedData);
  const duration = ((performance.now() - start) / 1000).toFixed(2);

  cleanedData = cleaningResult.cleaned;
  summary = cleaningResult.summary;
  updateStats(summary, duration);
  previewArea.textContent = JSON.stringify(getPreview(cleanedData), null, 2);
  downloadBtn.disabled = false;
}

function cleanData(rows) {
  const seen = new Set();
  const anomalies = [];
  let emptyCount = 0;
  let duplicateCount = 0;

  const normalizedRows = rows.map((row, rowIndex) => {
    const normalized = {};
    Object.entries(row).forEach(([key, value]) => {
      const trimmed = typeof value === 'string' ? value.trim() : value;
      if (trimmed === '' || trimmed == null) {
        normalized[key] = '';
        return;
      }
      const maybeNumber = Number(trimmed.replace(/,/g, ''));
      const castNumber = !Number.isNaN(maybeNumber) && trimmed !== '' ? maybeNumber : trimmed;
      normalized[key] = castNumber;
      if (typeof trimmed === 'string' && trimmed !== value) {
        anomalies.push({ row: rowIndex + 1, field: key, issue: 'Whitespace trimmed' });
      }
      if (trimmed === '') emptyCount += 1;
    });
    return normalized;
  });

  const cleaned = normalizedRows.filter((row) => {
    const values = Object.values(row);
    const isEmpty = values.every((cell) => cell === '' || cell == null);
    if (isEmpty) {
      anomalies.push({ issue: 'Empty row removed' });
      return false;
    }
    const fingerprint = JSON.stringify(row);
    if (seen.has(fingerprint)) {
      duplicateCount += 1;
      anomalies.push({ issue: 'Duplicate row removed' });
      return false;
    }
    seen.add(fingerprint);
    return true;
  });

  const accuracy = rows.length === 0 ? 100 : Math.round((cleaned.length / rows.length) * 100);
  return {
    cleaned,
    summary: {
      originalRows: rows.length,
      cleanedRows: cleaned.length,
      emptyCount,
      duplicateCount,
      anomalies: anomalies.length,
      accuracy,
    },
  };
}

function updateSummary(data) {
  if (!Array.isArray(data)) return;
  const rowCount = data.length;
  const emptyCount = countEmptyCells(data);
  const duplicateCount = countDuplicates(data);
  rowCountEl.textContent = rowCount;
  emptyCountEl.textContent = emptyCount;
  duplicateCountEl.textContent = duplicateCount;
  recordsProcessedEl.textContent = rowCount;
  dataAccuracyEl.textContent = '—';
  anomaliesDetectedEl.textContent = duplicateCount + ' empty rows';
}

function updateStats(summaryData, duration) {
  rowCountEl.textContent = summaryData.cleanedRows;
  emptyCountEl.textContent = summaryData.emptyCount;
  duplicateCountEl.textContent = summaryData.duplicateCount;
  recordsProcessedEl.textContent = summaryData.originalRows;
  dataAccuracyEl.textContent = `${summaryData.accuracy}%`;
  anomaliesDetectedEl.textContent = summaryData.anomalies;
  cleanTimeEl.textContent = `${duration}s`;
}

function countEmptyCells(data) {
  return data.reduce((count, row) => {
    Object.values(row).forEach((value) => {
      if (value === '' || value == null) count += 1;
    });
    return count;
  }, 0);
}

function countDuplicates(data) {
  const seen = new Set();
  let duplicates = 0;
  data.forEach((row) => {
    const key = JSON.stringify(row);
    if (seen.has(key)) duplicates += 1;
    else seen.add(key);
  });
  return duplicates;
}

function downloadCleanedFile() {
  if (!cleanedData || !uploadedFile) return;
  const filename = uploadedFile.name.replace(/\.(csv|json)$/i, '') + '-cleaned.' + fileType;
  const content = fileType === 'csv' ? toCsv(cleanedData) : JSON.stringify(cleanedData, null, 2);
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function toCsv(data) {
  if (!Array.isArray(data) || data.length === 0) return '';
  const headers = Object.keys(data[0]);
  const rows = data.map((row) =>
    headers
      .map((header) => {
        const value = row[header] == null ? '' : String(row[header]);
        if (value.includes(',') || value.includes('"') || value.includes('\n')) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      })
      .join(',')
  );
  return [headers.join(','), ...rows].join('\n');
}
