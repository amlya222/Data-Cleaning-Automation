import os
import re
import json
import pandas as pd
from io import StringIO, BytesIO
from flask import Flask, request, jsonify, send_from_directory, abort
from flask_cors import CORS
from werkzeug.utils import secure_filename
from datetime import datetime

app = Flask(__name__)
CORS(app)

UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), 'uploads')
ALLOWED_EXTENSIONS = {'csv', 'json'}
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB

os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = MAX_FILE_SIZE


def allowed_file(filename):
    """Check if file extension is allowed."""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def sanitize_json(content):
    """Convert non-standard JSON tokens like NaN/Infinity to null."""
    return re.sub(r'(?<![\w\"\-])(-?Infinity|NaN)(?![\w\"])', 'null', content)


def json_compatible_value(value):
    """Convert pandas/numpy values to JSON-friendly native Python values."""
    if pd.isna(value):
        return None
    if hasattr(value, 'item'):
        try:
            return value.item()
        except Exception:
            pass
    if hasattr(value, 'isoformat') and not isinstance(value, str):
        try:
            return value.isoformat()
        except Exception:
            pass
    return value


def normalize_rows(rows):
    normalized_rows = []
    for row in rows:
        if isinstance(row, dict):
            normalized = {key: json_compatible_value(value) for key, value in row.items()}
            normalized_rows.append(normalized)
        else:
            normalized_rows.append(row)
    return normalized_rows


def parse_file(file_content, file_type):
    """Parse file content based on file type."""
    try:
        if file_type == 'csv':
            df = pd.read_csv(StringIO(file_content))
            parsed = df.to_dict(orient='records')
            return normalize_rows(parsed)
        elif file_type == 'json':
            sanitized = sanitize_json(file_content)
            parsed = json.loads(sanitized)
            if isinstance(parsed, list):
                return normalize_rows(parsed)
            elif isinstance(parsed, dict):
                return normalize_rows([parsed])
            else:
                raise ValueError('JSON must be an object or array of objects')
        else:
            raise ValueError('Unsupported file type')
    except Exception as e:
        raise ValueError(f'Error parsing file: {str(e)}')


def clean_data(rows):
    """Apply data cleaning rules to rows."""
    if not rows:
        return {
            'cleaned': [],
            'summary': {
                'originalRows': 0,
                'cleanedRows': 0,
                'emptyCount': 0,
                'duplicateCount': 0,
                'anomalies': 0,
                'accuracy': 0,
            }
        }
    
    anomalies = []
    empty_count = 0
    duplicate_count = 0
    
    # Normalize data
    normalized_rows = []
    for row_idx, row in enumerate(rows):
        normalized = {}
        for key, value in row.items():
            if isinstance(value, str):
                trimmed = value.strip()
            else:
                trimmed = value if value is not None else ''
            
            if trimmed == '' or trimmed is None:
                normalized[key] = ''
                empty_count += 1
            else:
                # Try to convert to number
                if isinstance(trimmed, str):
                    try:
                        # Remove commas and try float conversion
                        num_val = float(trimmed.replace(',', ''))
                        # Check if it's actually an integer
                        if num_val == int(num_val):
                            normalized[key] = int(num_val)
                        else:
                            normalized[key] = num_val
                    except (ValueError, AttributeError):
                        normalized[key] = trimmed
                else:
                    normalized[key] = trimmed
                
                if isinstance(value, str) and value != trimmed:
                    anomalies.append({
                        'row': row_idx + 1,
                        'field': key,
                        'issue': 'Whitespace trimmed'
                    })
        
        normalized_rows.append(normalized)
    
    # Remove empty rows and duplicates
    seen = set()
    cleaned_rows = []
    
    for row in normalized_rows:
        # Check if row is completely empty
        is_empty = all(cell == '' or cell is None for cell in row.values())
        if is_empty:
            anomalies.append({'issue': 'Empty row removed'})
            continue
        
        # Check for duplicates
        row_str = json.dumps(row, sort_keys=True, default=str)
        if row_str in seen:
            duplicate_count += 1
            anomalies.append({'issue': 'Duplicate row removed'})
            continue
        
        seen.add(row_str)
        cleaned_rows.append(row)
    
    # Calculate accuracy
    original_count = len(rows)
    cleaned_count = len(cleaned_rows)
    accuracy = round((cleaned_count / original_count * 100)) if original_count > 0 else 100
    
    return {
        'cleaned': cleaned_rows,
        'summary': {
            'originalRows': original_count,
            'cleanedRows': cleaned_count,
            'emptyCount': empty_count,
            'duplicateCount': duplicate_count,
            'anomalies': len(anomalies),
            'accuracy': accuracy,
        }
    }


@app.route('/')
def index():
    """Serve the frontend homepage."""
    return send_from_directory(os.path.dirname(__file__), 'index.html')


@app.route('/<path:filename>')
def serve_static(filename):
    """Serve static frontend assets."""
    if filename.startswith('api/'):
        abort(404)
    return send_from_directory(os.path.dirname(__file__), filename)


@app.route('/api/health', methods=['GET'])
def health():
    """Health check endpoint."""
    return jsonify({'status': 'ok', 'timestamp': datetime.now().isoformat()})


@app.route('/api/upload', methods=['POST'])
def upload():
    """Handle file upload and parsing."""
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400
        
        file = request.files['file']
        
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        if not allowed_file(file.filename):
            return jsonify({'error': 'Only CSV and JSON files are allowed'}), 400
        
        # Get file type
        file_ext = file.filename.rsplit('.', 1)[1].lower()
        
        # Read file content
        file_content = file.read().decode('utf-8', errors='replace')
        
        # Parse file
        parsed_data = parse_file(file_content, file_ext)
        
        # Calculate initial summary
        empty_count = 0
        for row in parsed_data:
            for value in row.values():
                if value == '' or value is None:
                    empty_count += 1
        
        # Count duplicates
        seen = set()
        duplicate_count = 0
        for row in parsed_data:
            row_str = json.dumps(row, sort_keys=True, default=str)
            if row_str in seen:
                duplicate_count += 1
            else:
                seen.add(row_str)
        
        return jsonify({
            'success': True,
            'filename': secure_filename(file.filename),
            'fileType': file_ext,
            'data': parsed_data[:100],  # Return first 100 rows for preview
            'totalRows': len(parsed_data),
            'summary': {
                'rowCount': len(parsed_data),
                'emptyCount': empty_count,
                'duplicateCount': duplicate_count,
                'columns': list(parsed_data[0].keys()) if parsed_data else []
            }
        }), 200
    
    except Exception as e:
        return jsonify({'error': f'Upload failed: {str(e)}'}), 500


@app.route('/api/clean', methods=['POST'])
def clean_endpoint():
    """Clean uploaded data using backend processing."""
    try:
        data = request.get_json()
        
        if not data or 'data' not in data:
            return jsonify({'error': 'No data provided'}), 400
        
        rows = data['data']
        
        if not isinstance(rows, list):
            return jsonify({'error': 'Data must be an array of objects'}), 400
        
        # Clean data
        result = clean_data(rows)
        
        return jsonify({
            'success': True,
            'cleaned': result['cleaned'][:100],  # Preview
            'totalCleaned': len(result['cleaned']),
            'summary': result['summary'],
            'allCleaned': result['cleaned']  # Full cleaned data for download
        }), 200
    
    except Exception as e:
        return jsonify({'error': f'Cleaning failed: {str(e)}'}), 500


@app.route('/api/download', methods=['POST'])
def download_data():
    """Prepare data for download (CSV or JSON)."""
    try:
        data = request.get_json()
        
        if not data or 'data' not in data:
            return jsonify({'error': 'No data provided'}), 400
        
        rows = data['data']
        file_type = data.get('fileType', 'json').lower()
        original_filename = data.get('filename', 'cleaned_data')
        
        if file_type == 'csv':
            df = pd.DataFrame(rows)
            csv_content = df.to_csv(index=False)
            filename = original_filename.replace('.csv', '') + '-cleaned.csv'
            return jsonify({
                'success': True,
                'content': csv_content,
                'filename': filename,
                'type': 'csv'
            }), 200
        
        elif file_type == 'json':
            json_content = json.dumps(rows, indent=2)
            filename = original_filename.replace('.json', '') + '-cleaned.json'
            return jsonify({
                'success': True,
                'content': json_content,
                'filename': filename,
                'type': 'json'
            }), 200
        
        else:
            return jsonify({'error': 'Unsupported file type'}), 400
    
    except Exception as e:
        return jsonify({'error': f'Download preparation failed: {str(e)}'}), 500


@app.route('/api/stats', methods=['POST'])
def get_stats():
    """Get detailed statistics about the data."""
    try:
        data = request.get_json()
        
        if not data or 'data' not in data:
            return jsonify({'error': 'No data provided'}), 400
        
        rows = data['data']
        
        if not rows:
            return jsonify({
                'totalRows': 0,
                'columns': [],
                'stats': {}
            }), 200
        
        # Build statistics
        stats = {}
        columns = list(rows[0].keys())
        
        for col in columns:
            values = [row.get(col) for row in rows if col in row]
            non_empty = [v for v in values if v != '' and v is not None]
            
            stats[col] = {
                'total': len(values),
                'filled': len(non_empty),
                'empty': len(values) - len(non_empty),
                'type': detect_type(non_empty)
            }
        
        return jsonify({
            'totalRows': len(rows),
            'columns': columns,
            'stats': stats
        }), 200
    
    except Exception as e:
        return jsonify({'error': f'Stats calculation failed: {str(e)}'}), 500


def detect_type(values):
    """Detect the data type of a column."""
    if not values:
        return 'unknown'
    
    all_numeric = True
    all_integer = True
    
    for val in values:
        if isinstance(val, bool):
            all_numeric = False
            all_integer = False
            break
        
        if isinstance(val, (int, float)):
            if not isinstance(val, int):
                all_integer = False
        else:
            all_numeric = False
            all_integer = False
    
    if all_integer:
        return 'integer'
    if all_numeric:
        return 'float'
    if all(isinstance(v, bool) for v in values):
        return 'boolean'
    
    return 'string'


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
