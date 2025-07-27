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
    } else if (filterType === 'status') {
        url.searchParams.delete('status');
    } else if (filterType === 'visibility') {
        url.searchParams.delete('visibility');
    } else if (filterType === 'uploader') {
        url.searchParams.delete('uploader');
    } else if (filterType === 'annotator') {
        url.searchParams.delete('annotator');
    } else if (filterType === 'date') {
        url.searchParams.delete('date_from');
        url.searchParams.delete('date_to');
    }
    
    url.searchParams.delete('page'); // Reset to first page
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

// Initialize everything
document.addEventListener('DOMContentLoaded', function() {
    autoExpandFilters();
    initListNameEditing();
}); 