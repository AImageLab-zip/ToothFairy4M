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
            if (data.error) {
                showNiftiError(data.error);
                return;
            }
            
            currentMetadata = data;
            displayMetadata(data);
            
            // Show display div and hide loading
            contentDiv.innerHTML = '';
            displayDiv.style.display = 'block';
        })
        .catch(error => {
            showNiftiError('Failed to load NIFTI metadata: ' + error.message);
        });
}

function displayMetadata(metadata) {
    // Basic info
    document.getElementById('niftiOrientation').textContent = metadata.orientation;
    document.getElementById('niftiDataType').textContent = metadata.data_type;
    document.getElementById('niftiShape').textContent = metadata.shape.join(' × ');
    document.getElementById('niftiVoxelDims').textContent = 
        metadata.voxel_dimensions.map(d => d.toFixed(3)).join(' × ') + ' mm';
    
    // Origin
    document.getElementById('originX').textContent = metadata.origin[0].toFixed(3);
    document.getElementById('originY').textContent = metadata.origin[1].toFixed(3);
    document.getElementById('originZ').textContent = metadata.origin[2].toFixed(3);
    
    // Affine matrix
    const affineTable = document.getElementById('affineTable');
    affineTable.innerHTML = '';
    for (let i = 0; i < 4; i++) {
        const row = affineTable.insertRow();
        for (let j = 0; j < 4; j++) {
            const cell = row.insertCell();
            cell.textContent = metadata.affine[i][j].toFixed(6);
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

// Origin editing functions
function editOrigin() {
    if (!currentMetadata) return;
    
    document.getElementById('originDisplay').style.display = 'none';
    document.getElementById('originEdit').style.display = 'block';
    
    document.getElementById('originXInput').value = currentMetadata.origin[0];
    document.getElementById('originYInput').value = currentMetadata.origin[1];
    document.getElementById('originZInput').value = currentMetadata.origin[2];
}

function cancelOriginEdit() {
    document.getElementById('originDisplay').style.display = 'block';
    document.getElementById('originEdit').style.display = 'none';
}

function saveOrigin() {
    const scanId = JSON.parse(document.getElementById('django-data').textContent).scanId;
    const newOrigin = [
        parseFloat(document.getElementById('originXInput').value),
        parseFloat(document.getElementById('originYInput').value),
        parseFloat(document.getElementById('originZInput').value)
    ];
    
    // Validate
    if (newOrigin.some(isNaN)) {
        alert('Please enter valid numeric values for all coordinates');
        return;
    }
    
    // Show saving state
    const saveBtn = event.target;
    const originalText = saveBtn.innerHTML;
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
    
    fetch(`/api/scan/${scanId}/nifti-metadata/update/`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': getCookie('csrftoken')
        },
        body: JSON.stringify({ origin: newOrigin })
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            alert('Error updating origin: ' + data.error);
            saveBtn.disabled = false;
            saveBtn.innerHTML = originalText;
            return;
        }
        
        // Update display with new data
        currentMetadata = data;
        displayMetadata(data);
        cancelOriginEdit();
        
        // Show success message
        showSuccessMessage('Origin updated successfully');
    })
    .catch(error => {
        alert('Failed to update origin: ' + error.message);
        saveBtn.disabled = false;
        saveBtn.innerHTML = originalText;
    });
}

// Affine matrix editing functions
function editAffine() {
    if (!currentMetadata) return;
    
    document.getElementById('affineDisplay').style.display = 'none';
    document.getElementById('affineEdit').style.display = 'block';
    
    // Create editable table
    const editTable = document.getElementById('affineEditTable');
    editTable.innerHTML = '<table class="table table-sm table-bordered"><tbody></tbody></table>';
    const tbody = editTable.querySelector('tbody');
    
    for (let i = 0; i < 4; i++) {
        const row = tbody.insertRow();
        for (let j = 0; j < 4; j++) {
            const cell = row.insertCell();
            const input = document.createElement('input');
            input.type = 'number';
            input.className = 'form-control form-control-sm affine-input';
            input.step = '0.000001';
            input.value = currentMetadata.affine[i][j];
            input.id = `affine_${i}_${j}`;
            cell.appendChild(input);
        }
    }
}

function cancelAffineEdit() {
    document.getElementById('affineDisplay').style.display = 'block';
    document.getElementById('affineEdit').style.display = 'none';
}

function saveAffine() {
    const scanId = JSON.parse(document.getElementById('django-data').textContent).scanId;
    const newAffine = [];
    
    // Collect values
    for (let i = 0; i < 4; i++) {
        newAffine[i] = [];
        for (let j = 0; j < 4; j++) {
            const value = parseFloat(document.getElementById(`affine_${i}_${j}`).value);
            if (isNaN(value)) {
                alert(`Invalid value at position [${i+1}, ${j+1}]`);
                return;
            }
            newAffine[i][j] = value;
        }
    }
    
    // Confirm action
    if (!confirm('Are you sure you want to update the affine matrix? This will change the spatial orientation of the CBCT scan.')) {
        return;
    }
    
    // Show saving state
    const saveBtn = event.target;
    const originalText = saveBtn.innerHTML;
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
    
    fetch(`/api/scan/${scanId}/nifti-metadata/update/`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': getCookie('csrftoken')
        },
        body: JSON.stringify({ affine: newAffine })
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            alert('Error updating affine matrix: ' + data.error);
            saveBtn.disabled = false;
            saveBtn.innerHTML = originalText;
            return;
        }
        
        // Update display with new data
        currentMetadata = data;
        displayMetadata(data);
        cancelAffineEdit();
        
        // Show success message
        showSuccessMessage('Affine matrix updated successfully');
        
        // Reload CBCT viewer if it's active
        if (document.getElementById('cbctViewer').checked) {
            alert('CBCT metadata has been updated. Please reload the viewer to see changes.');
        }
    })
    .catch(error => {
        alert('Failed to update affine matrix: ' + error.message);
        saveBtn.disabled = false;
        saveBtn.innerHTML = originalText;
    });
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
    const alert = document.createElement('div');
    alert.className = 'alert alert-success alert-dismissible fade show mt-2';
    alert.innerHTML = `
        <i class="fas fa-check-circle"></i> ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    const container = document.getElementById('niftiMetadataContent').parentElement;
    container.insertBefore(alert, container.firstChild);
    
    // Auto-dismiss after 3 seconds
    setTimeout(() => {
        alert.classList.remove('show');
        setTimeout(() => alert.remove(), 150);
    }, 3000);
}