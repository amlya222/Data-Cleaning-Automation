# Installation and Setup

## Prerequisites
- Python 3.8+
- pip (Python package manager)

## Setup Instructions

### 1. Install Dependencies
```bash
pip install -r requirements.txt
```

### 2. Run the Flask Backend
```bash
python app.py
```

The backend will start on `http://localhost:5000`

### 3. Open Frontend
Open `index.html` in your browser, or run a local HTTP server:

```bash
# Using Python 3
python -m http.server 8000

# Then open http://localhost:8000 in your browser
```

## API Endpoints

- `GET /api/health` - Health check
- `POST /api/upload` - Upload and parse file
- `POST /api/clean` - Clean uploaded data
- `POST /api/download` - Prepare cleaned data for download
- `POST /api/stats` - Get data statistics

## How It Works

1. Upload a CSV or JSON file through the frontend
2. The file is sent to the Flask backend via `/api/upload`
3. The backend parses and validates the data
4. Click "Clean File" to trigger data cleaning on the backend
5. Backend returns cleaned data with statistics
6. Download the cleaned file as CSV or JSON

## Features

### Data Cleaning Rules
- Trim whitespace from string values
- Remove empty rows
- Remove duplicate rows
- Normalize numeric values
- Detect and report anomalies

### Data Types Detected
- Integer
- Float
- String
- Boolean

## File Structure

```
.
├── index.html          # Frontend UI
├── styles.css          # Frontend styling
├── script_backend.js   # Frontend JavaScript (calls backend API)
├── app.py              # Flask backend
├── requirements.txt    # Python dependencies
├── uploads/            # Temporary upload storage
└── README.md           # This file
```
