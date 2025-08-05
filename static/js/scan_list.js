// Filter management
function toggleFilters() {
    const content = document.getElementById('filterContent');
    const chevron = document.getElementById('filterChevron');
    
    content.classList.toggle('show');
    chevron.classList.toggle('fa-chevron-down');
    chevron.classList.toggle('fa-chevron-up');
}

function removeFilter(filterType) {
    const url = new URL(window.location);
    
    if (filterType === 'search') {
        url.searchParams.delete('search');
    } else if (filterType === 'has_ios') {
        url.searchParams.delete('has_ios');
    } else if (filterType === 'has_cbct') {
        url.searchParams.delete('has_cbct');
    } else if (filterType === 'has_annotated') {
        url.searchParams.delete('has_annotated');
    }
    
    url.searchParams.delete('page'); // Reset to first page
    // Keep the per_page parameter when removing filters
    window.location.href = url.toString();
}

function clearAllFilters() {
    const url = new URL(window.location);
    url.search = '';
    window.location.href = url.toString();
}

// Auto-expand filters if any are active
function autoExpandFilters() {
    const activeFilters = document.getElementById('activeFilters');
    if (activeFilters && activeFilters.children.length > 0) {
        toggleFilters();
    }
}

// Inline name editing functionality for list view
function initListNameEditing() {
    document.querySelectorAll('.btn-edit-name-list').forEach(editBtn => {
        editBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            
            const scanId = this.dataset.scanId;
            const nameDisplay = document.querySelector(`.scan-name-display[data-scan-id="${scanId}"]`);
            
            if (!nameDisplay) return;
            
            const currentName = nameDisplay.textContent.trim();
            const parentElement = nameDisplay.parentNode;
            
            if (!parentElement) {
                console.error('Parent element not found');
                return;
            }
            
            // Create input field
            const input = document.createElement('input');
            input.type = 'text';
            input.value = currentName;
            input.className = 'name-edit-input-list';
            
            // Replace display with input
            parentElement.replaceChild(input, nameDisplay);
            input.focus();
            input.select();
            
            // Handle save
            function saveName() {
                const newName = input.value.trim();
                if (!newName) {
                    input.value = currentName;
                    return;
                }
                
                fetch(`/scan/${scanId}/update-name/`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        name: newName
                    })
                })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        nameDisplay.textContent = data.name;
                        if (input.parentNode) {
                            input.parentNode.replaceChild(nameDisplay, input);
                        }
                    } else {
                        alert('Error saving name: ' + (data.error || 'Unknown error'));
                        if (input.parentNode) {
                            input.parentNode.replaceChild(nameDisplay, input);
                        }
                    }
                })
                .catch(error => {
                    console.error('Error:', error);
                    alert('Error saving name');
                    if (input.parentNode) {
                        input.parentNode.replaceChild(nameDisplay, input);
                    }
                });
            }
            
            // Handle cancel
            function cancelEdit() {
                if (input.parentNode) {
                    input.parentNode.replaceChild(nameDisplay, input);
                }
            }
            
            // Event handlers
            input.addEventListener('blur', saveName);
            input.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    saveName();
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    cancelEdit();
                }
            });
        });
    });
}

// Admin action handlers
function initAdminActions() {
    // Delete scan handler
    document.querySelectorAll('.btn-delete-scan').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            
            const scanId = this.dataset.scanId;
            const scanName = this.dataset.scanName || `Scan #${scanId}`;
            const patientId = this.dataset.patientId;
            
            if (!confirm(`Are you sure you want to delete ${scanName}?\n\nThis will permanently delete:\n- All scan files (STL, CBCT)\n- All classifications\n- All voice captions\n- All processed data\n\nThis action cannot be undone!`)) {
                return;
            }
            
            // Disable button and show loading
            this.disabled = true;
            const originalContent = this.innerHTML;
            this.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            
            fetch(`/scan/${scanId}/delete/`, {
                method: 'POST',
                headers: {
                    'X-CSRFToken': getCookie('csrftoken'),
                    'Content-Type': 'application/json',
                },
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    // Remove the row with animation
                    const row = this.closest('.scan-row');
                    row.style.transition = 'opacity 0.3s, transform 0.3s';
                    row.style.opacity = '0';
                    row.style.transform = 'translateX(-20px)';
                    
                    setTimeout(() => {
                        row.remove();
                        // Show success message
                        showNotification('success', data.message || 'Scan deleted successfully');
                    }, 300);
                } else {
                    throw new Error(data.error || 'Failed to delete scan');
                }
            })
            .catch(error => {
                console.error('Error:', error);
                showNotification('error', error.message || 'Error deleting scan');
                // Re-enable button
                this.disabled = false;
                this.innerHTML = originalContent;
            });
        });
    });
    
    // Rerun processing handler
    document.querySelectorAll('.btn-rerun-processing').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            
            const scanId = this.dataset.scanId;
            const scanName = this.dataset.scanName || `Scan #${scanId}`;
            
            if (!confirm(`Rerun all processing for ${scanName}?\n\nThis will:\n- Reprocess IOS scans (if present)\n- Reprocess CBCT scan (if present)\n- Reprocess all voice captions\n\nExisting results will be overwritten.`)) {
                return;
            }
            
            // Disable button and show loading
            this.disabled = true;
            const originalContent = this.innerHTML;
            this.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            
            fetch(`/scan/${scanId}/rerun-processing/`, {
                method: 'POST',
                headers: {
                    'X-CSRFToken': getCookie('csrftoken'),
                    'Content-Type': 'application/json',
                },
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    showNotification('success', data.message || 'Processing restarted successfully');
                    // Update status indicators
                    const row = this.closest('.scan-row');
                    const statusIcons = row.querySelectorAll('.status-icon');
                    statusIcons.forEach(icon => {
                        if (!icon.classList.contains('status-absent')) {
                            icon.classList.remove('status-processed', 'status-failed', 'status-pending');
                            icon.classList.add('status-processing');
                        }
                    });
                    
                    // Re-enable button after delay
                    setTimeout(() => {
                        this.disabled = false;
                        this.innerHTML = originalContent;
                    }, 2000);
                } else {
                    throw new Error(data.error || 'Failed to restart processing');
                }
            })
            .catch(error => {
                console.error('Error:', error);
                showNotification('error', error.message || 'Error restarting processing');
                // Re-enable button
                this.disabled = false;
                this.innerHTML = originalContent;
            });
        });
    });
}

// Utility function to get CSRF token
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

// Show notification
function showNotification(type, message) {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `alert alert-${type === 'success' ? 'success' : 'danger'} alert-dismissible fade show`;
    notification.style.cssText = 'position: fixed; top: 20px; right: 20px; z-index: 1050; min-width: 300px;';
    notification.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    document.body.appendChild(notification);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 150);
    }, 5000);
}

// Initialize filter remove buttons
function initFilterRemoveButtons() {
    document.querySelectorAll('.remove[data-filter]').forEach(removeBtn => {
        removeBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            const filterType = this.dataset.filter;
            removeFilter(filterType);
        });
    });
}

// Initialize everything
document.addEventListener('DOMContentLoaded', function() {
    autoExpandFilters();
    initListNameEditing();
    initAdminActions();
    initFilterRemoveButtons();
}); 