// NIFTI Metadata Management
let currentMetadata = null;

// Load NIFTI metadata when section is expanded
document.addEventListener('DOMContentLoaded', function() {
    const metadataCollapse = document.getElementById('niftiMetadataCollapse');
    if (metadataCollapse) {
        metadataCollapse.addEventListener('shown.bs.collapse', function() {
            loadNiftiMetadata();
        });
    }
});

function loadNiftiMetadata() {
    const scanId = JSON.parse(document.getElementById('django-data').textContent).scanId;
    const contentDiv = document.getElementById('niftiMetadataContent');
    const displayDiv = document.getElementById('niftiMetadataDisplay');
    const errorDiv = document.getElementById('niftiMetadataError');
    
    // Show loading
    contentDiv.innerHTML = '<div class="text-center p-3"><i class="fas fa-spinner fa-spin"></i> Loading metadata...</div>';
    displayDiv.style.display = 'none';
    errorDiv.style.display = 'none';
    
    fetch(`/api/scan/${scanId}/nifti-metadata/`)
        .then(response => response.json())
        .then(data => {
            console.log('NIFTI metadata response:', data); // Debug logging
            
            if (data.error) {
                showNiftiError(data.error);
                return;
            }
            
            // Validate data structure
            if (!data || typeof data !== 'object') {
                showNiftiError('Invalid metadata response format');
                return;
            }
            
            currentMetadata = data;
            displayMetadata(data);
            
            // Show display div and hide loading
            contentDiv.innerHTML = '';
            displayDiv.style.display = 'block';
        })
        .catch(error => {
            console.error('NIFTI metadata fetch error:', error); // Debug logging
            showNiftiError('Failed to load NIFTI metadata: ' + error.message);
        });
}

function displayMetadata(metadata) {
    // Basic info with defensive programming
    document.getElementById('niftiOrientation').textContent = metadata.orientation || 'Unknown';
    document.getElementById('niftiDataType').textContent = metadata.data_type || 'Unknown';
    
    // Handle shape array safely
    if (metadata.shape && Array.isArray(metadata.shape)) {
        document.getElementById('niftiShape').textContent = metadata.shape.join(' × ');
    } else {
        document.getElementById('niftiShape').textContent = 'Unknown';
    }
    
    // Handle voxel dimensions safely
    if (metadata.voxel_dimensions && Array.isArray(metadata.voxel_dimensions)) {
        document.getElementById('niftiVoxelDims').textContent = 
            metadata.voxel_dimensions.map(d => d.toFixed(3)).join(' × ') + ' mm';
    } else {
        document.getElementById('niftiVoxelDims').textContent = 'Unknown';
    }
    
    // Affine matrix with improved formatting and defensive programming
    const affineTable = document.getElementById('affineTable');
    affineTable.innerHTML = '';
    
    const rowLabels = ['X-axis', 'Y-axis', 'Z-axis', 'Origin'];
    
    // Check if affine matrix exists and is valid
    if (!metadata.affine || !Array.isArray(metadata.affine) || metadata.affine.length !== 4) {
        // Show error in table
        const row = affineTable.insertRow();
        const cell = row.insertCell();
        cell.colSpan = 5;
        cell.textContent = 'Affine matrix data not available';
        cell.className = 'text-center text-muted';
        return;
    }
    
    for (let i = 0; i < 4; i++) {
        const row = affineTable.insertRow();
        
        // Add row label
        const labelCell = row.insertCell();
        labelCell.textContent = rowLabels[i];
        labelCell.className = 'fw-bold';
        
        // Add matrix values with defensive programming
        for (let j = 0; j < 4; j++) {
            const cell = row.insertCell();
            
            // Check if the row and value exist
            if (!metadata.affine[i] || !Array.isArray(metadata.affine[i]) || metadata.affine[i].length <= j) {
                cell.textContent = 'N/A';
                cell.className = 'text-muted';
                continue;
            }
            
            const value = metadata.affine[i][j];
            
            // Check if value is valid
            if (typeof value !== 'number' || isNaN(value)) {
                cell.textContent = 'N/A';
                cell.className = 'text-muted';
                continue;
            }
            
            // Format the value
            if (Math.abs(value) < 0.000001) {
                cell.textContent = '0.000000';
            } else {
                cell.textContent = value.toFixed(6);
            }
            
            // Highlight translation column (last column)
            if (j === 3) {
                cell.className = 'translation-column';
            }
        }
    }
}

function showNiftiError(message) {
    const contentDiv = document.getElementById('niftiMetadataContent');
    const errorDiv = document.getElementById('niftiMetadataError');
    const errorMessage = document.getElementById('niftiErrorMessage');
    
    contentDiv.innerHTML = '';
    errorMessage.textContent = message;
    errorDiv.style.display = 'block';
}

// Affine matrix editing functions
function editAffine() {
    if (!currentMetadata) return;
    
    document.getElementById('affineDisplay').style.display = 'none';
    document.getElementById('affineEdit').style.display = 'block';
    
    const editTable = document.getElementById('affineEditTable');
    editTable.innerHTML = '';
    
    const rowLabels = ['X-axis', 'Y-axis', 'Z-axis', 'Origin'];
    
    // Create edit table
    const table = document.createElement('table');
    table.className = 'affine-matrix-table';
    
    // Create header
    const thead = document.createElement('thead');
    const headerRow = thead.insertRow();
    headerRow.insertCell().textContent = '';
    headerRow.insertCell().textContent = 'X';
    headerRow.insertCell().textContent = 'Y';
    headerRow.insertCell().textContent = 'Z';
    headerRow.insertCell().textContent = 'Translation';
    table.appendChild(thead);
    
    // Create body
    const tbody = document.createElement('tbody');
    for (let i = 0; i < 4; i++) {
        const row = tbody.insertRow();
        
        // Add row label
        const labelCell = row.insertCell();
        labelCell.textContent = rowLabels[i];
        labelCell.className = 'fw-bold';
        
        // Add input cells
        for (let j = 0; j < 4; j++) {
            const cell = row.insertCell();
            const input = document.createElement('input');
            input.type = 'number';
            input.className = 'affine-input';
            input.step = '0.000001';
            input.value = currentMetadata.affine[i][j];
            input.dataset.row = i;
            input.dataset.col = j;
            
            if (j === 3) {
                cell.className = 'translation-column';
            }
            
            cell.appendChild(input);
        }
    }
    table.appendChild(tbody);
    editTable.appendChild(table);
}

function cancelAffineEdit() {
    document.getElementById('affineDisplay').style.display = 'block';
    document.getElementById('affineEdit').style.display = 'none';
}

function saveAffine() {
    const scanId = JSON.parse(document.getElementById('django-data').textContent).scanId;
    const newAffine = [];
    
    // Collect values from input fields
    for (let i = 0; i < 4; i++) {
        newAffine[i] = [];
        for (let j = 0; j < 4; j++) {
            const input = document.querySelector(`input[data-row="${i}"][data-col="${j}"]`);
            newAffine[i][j] = parseFloat(input.value);
        }
    }
    
    // Validate affine matrix
    if (!isValidAffineMatrix(newAffine)) {
        showNiftiError('Invalid affine matrix. Please check your values.');
        return;
    }
    
    // Send update request
    fetch(`/api/scan/${scanId}/nifti-metadata/`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': getCookie('csrftoken')
        },
        body: JSON.stringify({
            affine: newAffine
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            showNiftiError(data.error);
            return;
        }
        
        // Update current metadata
        currentMetadata.affine = newAffine;
        
        // Refresh display
        displayMetadata(currentMetadata);
        
        // Switch back to display mode
        cancelAffineEdit();
        
        // Show success message
        showSuccessMessage('Affine matrix updated successfully');
    })
    .catch(error => {
        showNiftiError('Failed to update affine matrix: ' + error.message);
    });
}

function isValidAffineMatrix(matrix) {
    // Basic validation: check if it's a 4x4 matrix with numeric values
    if (!Array.isArray(matrix) || matrix.length !== 4) {
        return false;
    }
    
    for (let i = 0; i < 4; i++) {
        if (!Array.isArray(matrix[i]) || matrix[i].length !== 4) {
            return false;
        }
        
        for (let j = 0; j < 4; j++) {
            if (typeof matrix[i][j] !== 'number' || isNaN(matrix[i][j])) {
                return false;
            }
        }
    }
    
    // Check if the 3x3 rotation/scale part is invertible (determinant != 0)
    const det = matrix[0][0] * (matrix[1][1] * matrix[2][2] - matrix[1][2] * matrix[2][1]) -
                matrix[0][1] * (matrix[1][0] * matrix[2][2] - matrix[1][2] * matrix[2][0]) +
                matrix[0][2] * (matrix[1][0] * matrix[2][1] - matrix[1][1] * matrix[2][0]);
    
    return Math.abs(det) > 1e-10; // Small threshold for floating point precision
}

// Utility functions
function getCookie(name) {
    let cookieValue = null;
    if (document.cookie && document.cookie !== '') {
        const cookies = document.cookie.split(';');
        for (let i = 0; i < cookies.length; i++) {
            const cookie = cookies[i].trim();
            if (cookie.substring(0, name.length + 1) === (name + '=')) {
                cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                break;
            }
        }
    }
    return cookieValue;
}

function showSuccessMessage(message) {
    // Create a temporary success message
    const successDiv = document.createElement('div');
    successDiv.className = 'alert alert-success alert-dismissible fade show';
    successDiv.innerHTML = `
        <i class="fas fa-check-circle me-1"></i>
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    // Insert at the top of the metadata box
    const metadataBox = document.querySelector('.nifti-metadata-box');
    metadataBox.insertBefore(successDiv, metadataBox.firstChild);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (successDiv.parentNode) {
            successDiv.remove();
        }
    }, 5000);
}