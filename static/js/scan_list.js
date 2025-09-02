// Filter management
function toggleFilters() {
    const content = document.getElementById('filterContent');
    const chevron = document.getElementById('filterChevron');
    
    // Only proceed if both elements exist
    if (!content || !chevron) {
        return;
    }
    
    content.classList.toggle('show');
    chevron.classList.toggle('fa-chevron-down');
    chevron.classList.toggle('fa-chevron-up');
}

// Clean form submission to only include non-empty values
function cleanFormSubmission() {
    const form = document.getElementById('filterForm');
    if (!form) return;
    
    // Get all form inputs
    const inputs = form.querySelectorAll('input, select');
    
    inputs.forEach(input => {
        // For hidden filter inputs, remove them if they have no value
        if (input.name && (input.name.startsWith('has_') || input.name === 'tags') && input.value === '') {
            input.disabled = true; // Disable empty inputs so they're not submitted
        }
    });
    
    // Re-enable inputs after a short delay to allow for future submissions
    setTimeout(() => {
        inputs.forEach(input => {
            if (input.disabled) {
                input.disabled = false;
            }
        });
    }, 100);
}

// Update URL to reflect current filter state (for bookmarking/sharing)
function updateFilterURL() {
    const url = new URL(window.location);
    const form = document.getElementById('filterForm');
    
    if (!form) return;
    
    // Clear existing filter parameters
    url.searchParams.delete('has_ios');
    url.searchParams.delete('has_cbct');
    url.searchParams.delete('has_voice');
    url.searchParams.delete('has_bite');
    url.searchParams.delete('tags');
    url.searchParams.delete('search');
    
    // Add non-empty filter values
    const inputs = form.querySelectorAll('input[name^="has_"], input[name="tags"], input[name="search"]');
    inputs.forEach(input => {
        if (input.value && input.value.trim() !== '') {
            url.searchParams.set(input.name, input.value.trim());
        }
    });
    
    // Update browser URL without reloading the page
    window.history.replaceState({}, '', url.toString());
}

// Handle per_page change with clean submission
function handlePerPageChange(selectElement) {
    cleanFormSubmission();
    selectElement.form.submit();
}

function clearAllFilters() {
    const url = new URL(window.location);
    
    // Keep only essential parameters (folder, per_page)
    const newSearchParams = new URLSearchParams();
    
    // Preserve folder if it's not 'all'
    const folder = url.searchParams.get('folder');
    if (folder && folder !== 'all') {
        newSearchParams.set('folder', folder);
    }
    
    // Preserve per_page if it's not the default
    const perPage = url.searchParams.get('per_page');
    if (perPage && perPage !== '20') {
        newSearchParams.set('per_page', perPage);
    }
    
    url.search = newSearchParams.toString();
    window.location.href = url.toString();
}

// Auto-expand filters if any are active
function autoExpandFilters() {
    // Check if filter elements exist on this page
    const filterContent = document.getElementById('filterContent');
    if (!filterContent) {
        return; // No filter UI on this page
    }
    
    // Check if any filters are applied by looking at URL parameters
    const url = new URL(window.location);
    const hasFilters = url.searchParams.has('search') || 
                      url.searchParams.has('has_ios') || 
                      url.searchParams.has('has_cbct') || 
                      url.searchParams.has('has_bite') || 
                      url.searchParams.has('has_voice') || 
                      url.searchParams.has('tags');
    
    if (hasFilters) {
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
    
    // Rerun processing handler with modal selection
    const rerunModalEl = document.getElementById('rerunProcessingModal');
    let rerunModal = null;
    let rerunTargetScanId = null;
    if (rerunModalEl && window.bootstrap) {
        rerunModal = new window.bootstrap.Modal(rerunModalEl);
    }
    document.querySelectorAll('.btn-rerun-processing').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            rerunTargetScanId = this.dataset.scanId;
            const scanName = this.dataset.scanName || `Scan #${rerunTargetScanId}`;
            const subtitle = document.getElementById('rerunScanSubtitle');
            if (subtitle) subtitle.textContent = scanName;
            // reset checkboxes
            ['rerunIos','rerunBite','rerunCbct','rerunVoice'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.checked = false;
            });
            if (rerunModal) rerunModal.show();
        });
    });
    const confirmRerunBtn = document.getElementById('confirmRerunBtn');
    if (confirmRerunBtn) {
        confirmRerunBtn.addEventListener('click', function() {
            const jobs = [];
            if (document.getElementById('rerunIos')?.checked) jobs.push('ios');
            if (document.getElementById('rerunBite')?.checked) jobs.push('bite_classification');
            if (document.getElementById('rerunCbct')?.checked) jobs.push('cbct');
            if (document.getElementById('rerunVoice')?.checked) jobs.push('voice');
            if (!jobs.length) {
                showNotification('error', 'Select at least one job to rerun');
                return;
            }
            const label = this.querySelector('.label');
            const spinner = this.querySelector('.spinner');
            this.disabled = true;
            if (label) label.classList.add('d-none');
            if (spinner) spinner.classList.remove('d-none');
            fetch(`/scan/${rerunTargetScanId}/rerun-processing/`, {
                method: 'POST',
                headers: {
                    'X-CSRFToken': getCookie('csrftoken'),
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ jobs })
            }).then(r => r.json()).then(data => {
                if (data.success) {
                    showNotification('success', data.message || 'Jobs set to pending');
                    if (rerunModal) rerunModal.hide();
                    // Update status indicators for this row based on selected jobs
                    const row = document.querySelector(`.scan-row[data-scan-id="${rerunTargetScanId}"]`);
                    if (row) {
                        if (jobs.includes('ios')) {
                            // first .status-icon with tooth
                            const icon = row.querySelector('.status-icon i.fas.fa-tooth')?.parentElement;
                            if (icon) {
                                icon.classList.remove('status-processed','status-failed','status-pending');
                                icon.classList.add('status-processing');
                            }
                        }
                        if (jobs.includes('cbct')) {
                            const icon = row.querySelector('.status-icon i.fas.fa-cube')?.parentElement;
                            if (icon) {
                                icon.classList.remove('status-processed','status-failed','status-pending');
                                icon.classList.add('status-processing');
                            }
                        }
                        if (jobs.includes('voice')) {
                            const icon = row.querySelector('.status-icon i.fas.fa-microphone')?.parentElement;
                            if (icon) {
                                icon.classList.remove('status-processed','status-failed','status-pending');
                                icon.classList.add('status-processing');
                            }
                        }
                        if (jobs.includes('bite_classification')) {
                            const icon = row.querySelector('.status-icon i.fas.fa-teeth')?.parentElement;
                            if (icon) {
                                icon.classList.remove('status-processed','status-failed','status-absent');
                                icon.classList.add('status-processing');
                            }
                        }
                    }
                } else {
                    showNotification('error', data.error || 'Failed to rerun jobs');
                }
            }).catch(() => showNotification('error', 'Network error')).finally(() => {
                confirmRerunBtn.disabled = false;
                if (label) label.classList.remove('d-none');
                if (spinner) spinner.classList.add('d-none');
            });
        });
    }
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
            // This function is no longer needed as filters are removed from URL
            // Keeping it for now in case it's re-added or used elsewhere, but it won't do anything.
            console.warn(`Filter removal for type "${filterType}" is not implemented.`);
        });
    });
}

// Bulk selection and move functionality
function initBulkSelection() {
    const selectAll = document.getElementById('selectAll');
    const rows = document.querySelectorAll('.scan-row');
    const toolbar = document.getElementById('bulkToolbar');
    const countEl = document.getElementById('selectedCount');
    const clearBtn = document.getElementById('btnClearSelection');
    const moveBtn = document.getElementById('btnMoveSelected');
    const moveSelect = document.getElementById('moveFolderSelect');
    
    // Only proceed if essential elements exist
    if (!toolbar || !countEl) {
        return;
    }
    
    function updateToolbar() {
        const selected = document.querySelectorAll('.row-select:checked');
        const count = selected.length;
        if (countEl) countEl.textContent = `${count} selected`;
        if (toolbar) toolbar.style.display = count > 0 ? 'flex' : 'none';
        if (selectAll) selectAll.checked = count > 0 && document.querySelectorAll('.row-select').length === count;
    }
    
    if (selectAll) {
        selectAll.addEventListener('change', function() {
            document.querySelectorAll('.row-select').forEach(cb => {
                cb.checked = selectAll.checked;
                cb.closest('.scan-row').classList.toggle('selected', cb.checked);
            });
            updateToolbar();
        });
    }
    
    document.querySelectorAll('.row-select').forEach(cb => {
        cb.addEventListener('change', function() {
            cb.closest('.scan-row').classList.toggle('selected', cb.checked);
            updateToolbar();
        });
    });
    
    if (clearBtn) {
        clearBtn.addEventListener('click', function() {
            document.querySelectorAll('.row-select').forEach(cb => {
                cb.checked = false;
                cb.closest('.scan-row').classList.remove('selected');
            });
            updateToolbar();
        });
    }
    
    if (moveBtn && moveSelect) {
        moveBtn.addEventListener('click', function() {
            const ids = Array.from(document.querySelectorAll('.row-select:checked')).map(cb => parseInt(cb.value));
            if (!ids.length) return;
            const folder_id = moveSelect.value;
            moveBtn.disabled = true;
            moveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            fetch('/folders/move-scans/', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'X-CSRFToken': getCookie('csrftoken') // Added CSRF token
                },
                body: JSON.stringify({ scan_ids: ids, folder_id })
            }).then(r => r.json()).then(data => {
                if (data.success) {
                    showNotification('success', 'Scans moved successfully');
                    window.location.reload();
                } else {
                    showNotification('error', data.error || 'Failed to move scans');
                }
            }).catch(() => showNotification('error', 'Network error')).finally(() => {
                moveBtn.disabled = false;
                moveBtn.innerHTML = '<i class="fas fa-arrows-alt me-1"></i>Apply';
            });
        });
    }

    // Add bulk delete functionality
    const deleteBtn = document.getElementById('btnDeleteSelected');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', function() {
            const ids = Array.from(document.querySelectorAll('.row-select:checked')).map(cb => parseInt(cb.value));
            if (!ids.length) return;
            
            // Show confirmation dialog
            const count = ids.length;
            const confirmMessage = `Are you sure you want to delete ${count} scan${count > 1 ? 's' : ''}? This action cannot be undone and will permanently remove all associated data and files.`;
            
            if (!confirm(confirmMessage)) {
                return;
            }
            
            deleteBtn.disabled = true;
            deleteBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Deleting...';
            
            fetch('/scans/bulk-delete/', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'X-CSRFToken': getCookie('csrftoken')
                },
                body: JSON.stringify({ scan_ids: ids })
            }).then(r => r.json()).then(data => {
                if (data.success) {
                    showNotification('success', data.message || 'Scans deleted successfully');
                    window.location.reload();
                } else {
                    showNotification('error', data.error || 'Failed to delete scans');
                }
            }).catch(() => showNotification('error', 'Network error')).finally(() => {
                deleteBtn.disabled = false;
                deleteBtn.innerHTML = '<i class="fas fa-trash me-1"></i>Delete';
            });
        });
    }
}

function initCreateFolder() {
    const btn = document.getElementById('btnCreateFolder');
    if (!btn) return;
    btn.addEventListener('click', function() {
        const name = prompt('Folder name');
        if (!name) return;
        const current = new URL(window.location).searchParams.get('folder');
        const parent_id = current && current !== 'all' ? current : null; // parent_id is now ignored by backend
        fetch('/folders/create/', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'X-CSRFToken': getCookie('csrftoken') // Added CSRF token
            },
            body: JSON.stringify({ name, parent_id })
        }).then(r => r.json()).then(data => {
            if (data.success) {
                showNotification('success', 'Folder created');
                const url = new URL(window.location);
                // If we're currently viewing "all", stay there, otherwise go to the new folder
                if (url.searchParams.get('folder') !== 'all') {
                    url.searchParams.set('folder', data.folder.id);
                }
                window.location.href = url.toString();
            } else {
                showNotification('error', data.error || 'Failed to create folder');
            }
        }).catch(() => showNotification('error', 'Network error'));
    });
}

function initTagAddInline() {
    document.querySelectorAll('.btn-add-tag').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            const scanId = this.dataset.scanId;
            const tag = prompt('New tag');
            if (!tag) return;
            fetch(`/scan/${scanId}/tags/add/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ tag })
            }).then(r => r.json()).then(data => {
                if (data.success) {
                    const tagsCol = this.closest('.tags-col');
                    if (tagsCol) {
                        // Remove placeholder '-'
                        const dash = tagsCol.querySelector('small.text-muted');
                        if (dash) dash.remove();
                        // Append chip if not exists
                        if (!tagsCol.querySelector(`span.tag-badge[data-tag="${CSS.escape(tag)}"]`)) {
                            const span = document.createElement('span');
                            span.className = 'tag-badge';
                            span.setAttribute('data-tag', tag);
                            span.innerHTML = `
                                ${tag}
                                <button type="button" class="btn-remove-tag-inline" data-scan-id="${scanId}" data-tag="${tag}" title="Remove tag">&times;</button>
                            `;
                            tagsCol.insertBefore(span, this);
                            

                            
                            // Refresh the tags dropdown to include the new tag
                            if (window.refreshTagsDropdown) {
                                window.refreshTagsDropdown();
                            }

                        }
                    }
                    showNotification('success', 'Tag added');
                } else {
                    showNotification('error', data.error || 'Failed to add tag');
                }
            }).catch(() => showNotification('error', 'Network error'));
        });
    });
}

function initTagFilter() {
    const tagSearchInput = document.getElementById('tagSearchInput');
    const tagsDropdown = document.getElementById('tagsDropdown');
    const tagsInput = document.getElementById('tagsInput');
    
    if (!tagSearchInput || !tagsDropdown || !tagsInput) return;
    
    let selectedTags = new Set();
    
    // Initialize selected tags from hidden input
    const initialTags = tagsInput.value ? tagsInput.value.split(',').filter(t => t.trim()) : [];
    initialTags.forEach(tag => selectedTags.add(tag.trim()));
    updateSelectedTagsDisplay();
    
    // Populate dropdown with available tags
    populateTagsDropdown();
    
    // Show dropdown on focus
    tagSearchInput.addEventListener('focus', function() {
        tagsDropdown.classList.add('show');
        updateTagsDropdown();
    });
    
    // Hide dropdown on blur (with delay to allow clicking)
    tagSearchInput.addEventListener('blur', function() {
        setTimeout(() => {
            tagsDropdown.classList.remove('show');
        }, 200);
    });
    
    // Search functionality
    tagSearchInput.addEventListener('input', function() {
        updateTagsDropdown();
    });
    
    // Tag selection
    tagsDropdown.addEventListener('click', function(e) {
        const tagOption = e.target.closest('.tag-option');
        if (!tagOption) return;
        
        const tagName = tagOption.dataset.tag;
        if (selectedTags.has(tagName)) {
            selectedTags.delete(tagName);
        } else {
            selectedTags.add(tagName);
        }
        
        updateSelectedTagsDisplay();
        updateTagsDropdown();
        
        // Update URL to reflect current tag selection
        updateFilterURL();
        tagSearchInput.value = '';
        
        // Update URL to reflect current tag selection
        updateFilterURL();
    });
    
    // Remove tag
    tagSearchInput.parentNode.addEventListener('click', function(e) {
        if (e.target.classList.contains('remove-tag')) {
            const tagName = e.target.dataset.tag;
            selectedTags.delete(tagName);
            updateSelectedTagsDisplay();
            updateTagsDropdown();
        }
    });
    
    function populateTagsDropdown() {
        // Get all available tags from the page (you might need to pass this from Django)
        const availableTags = Array.from(document.querySelectorAll('.tag-badge')).map(tag => tag.dataset.tag);
        const uniqueTags = [...new Set(availableTags)];
        
        tagsDropdown.innerHTML = uniqueTags.map(tag => `
            <div class="tag-option" data-tag="${tag}" data-selected="false">
                <span class="tag-name">${tag}</span>
                <span class="tag-checkbox">
                    <i class="fas fa-check" style="display: none;"></i>
                </span>
            </div>
        `).join('');
    }
    
    // Function to refresh tags dropdown with current page tags
    function refreshTagsDropdown() {
        populateTagsDropdown();
        updateTagsDropdown();
    }
    
    // Make refreshTagsDropdown globally accessible
    window.refreshTagsDropdown = refreshTagsDropdown;
    
    function updateTagsDropdown() {
        const searchTerm = tagSearchInput.value.toLowerCase();
        const tagOptions = tagsDropdown.querySelectorAll('.tag-option');
        
        tagOptions.forEach(option => {
            const tagName = option.dataset.tag;
            const isSelected = selectedTags.has(tagName);
            const matchesSearch = tagName.toLowerCase().includes(searchTerm);
            
            option.style.display = matchesSearch ? 'block' : 'none';
            option.dataset.selected = isSelected.toString();
            const checkbox = option.querySelector('.tag-checkbox i');
            if (checkbox) {
                checkbox.style.display = isSelected ? 'inline' : 'none';
            }
        });
    }
    
    function updateSelectedTagsDisplay() {
        const tagsArray = Array.from(selectedTags);
        tagsInput.value = tagsArray.join(',');
        
        // Clear existing tag chips
        const existingChips = tagSearchInput.parentNode.querySelectorAll('.tag-chip');
        existingChips.forEach(chip => chip.remove());
        
        // Add tag chips before the input
        tagsArray.forEach(tag => {
            const tagChip = document.createElement('span');
            tagChip.className = 'tag-chip';
            tagChip.innerHTML = `
                ${tag}
                <button type="button" class="remove-tag" data-tag="${tag}">&times;</button>
            `;
            tagSearchInput.parentNode.insertBefore(tagChip, tagSearchInput);
        });
        
        // Update placeholder visibility
        if (tagsArray.length > 0) {
            tagSearchInput.placeholder = 'Add more tags...';
        } else {
            tagSearchInput.placeholder = 'Search tags...';
        }
    }
}

function initStatusFilterButtons() {
    const statusButtons = document.querySelectorAll('.status-filter-btn');
    
    // Initialize button states based on current filter values
    initializeStatusButtonStates();
    
    statusButtons.forEach(btn => {
        btn.addEventListener('click', function() {
            const filter = this.dataset.filter;
            const currentValue = this.dataset.value || '';
            
            let newValue, newClass;
            
            if (currentValue === '') {
                newValue = 'yes';
                newClass = 'status-green';
            } else if (currentValue === 'yes') {
                newValue = 'no';
                newClass = 'status-yellow';
            } else if (currentValue === 'no') {
                newValue = 'failed';
                newClass = 'status-red';
            } else {
                newValue = '';
                newClass = 'status-gray';
            }
            
            // Update button state
            this.dataset.value = newValue;
            this.className = `status-filter-btn ${newClass}`;
            
            // Update hidden input value
            const hiddenInput = document.getElementById(`${filter}FilterValue`);
            if (hiddenInput) {
                hiddenInput.value = newValue;
            }
            
            // Update button title
            updateButtonTitle(this, filter, newValue);
            
            // Update URL to reflect current filter state
            updateFilterURL();
        });
    });
}

function initializeStatusButtonStates() {
    const buttonMappings = [
        { filter: 'ios', inputId: 'iosFilterValue', buttonSelector: '[data-filter="ios"]' },
        { filter: 'cbct', inputId: 'cbctFilterValue', buttonSelector: '[data-filter="cbct"]' },
        { filter: 'bite', inputId: 'biteFilterValue', buttonSelector: '[data-filter="bite"]' },
        { filter: 'voice', inputId: 'voiceFilterValue', buttonSelector: '[data-filter="voice"]' }
    ];
    
    buttonMappings.forEach(mapping => {
        const input = document.getElementById(mapping.inputId);
        const button = document.querySelector(mapping.buttonSelector);
        
        if (input && button) {
            const value = input.value;
            let className = 'status-gray';
            
            // Set appropriate class based on current value
            if (value === 'yes') {
                className = 'status-green';
            } else if (value === 'no') {
                className = 'status-yellow';
            } else if (value === 'failed') {
                className = 'status-red';
            } else {
                // Empty value or any other value -> gray (no filter)
                className = 'status-gray';
            }
            
            // Update button state
            button.dataset.value = value;
            button.className = `status-filter-btn ${className}`;
            updateButtonTitle(button, mapping.filter, value);
        }
    });
}

function updateButtonTitle(button, filter, value) {
    const filterLabels = {
        'ios': { '': 'All IOS (no filter)', 'yes': 'Has IOS', 'no': 'No IOS', 'failed': 'IOS Failed' },
        'cbct': { '': 'All CBCT (no filter)', 'yes': 'Has CBCT', 'no': 'No CBCT', 'failed': 'CBCT Failed' },
        'bite': { '': 'All Bite (no filter)', 'yes': 'Has Bite Classification', 'no': 'No Bite Classification', 'failed': 'Bite Classification Failed' },
        'voice': { '': 'All Voice (no filter)', 'yes': 'Has Voice', 'no': 'No Voice', 'failed': 'Voice Failed' }
    };
    
    // For gray state (no filter), show the "no filter" title
    const title = value ? filterLabels[filter][value] : filterLabels[filter][''];
    button.title = title;
}

function initInlineTagRemoval() {
    document.addEventListener('click', function(e) {

        if (e.target.classList.contains('btn-remove-tag-inline')) {
            e.preventDefault();
            const scanId = e.target.dataset.scanId;
            const tag = e.target.dataset.tag;
            
            if (confirm(`Remove tag "${tag}" from this scan?`)) {
                fetch(`/scan/${scanId}/tags/remove/`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRFToken': getCookie('csrftoken')
                    },
                    body: JSON.stringify({ tag })
                }).then(r => r.json()).then(data => {
                    if (data.success) {
                        // Remove the tag badge from the UI
                        const tagBadge = e.target.closest('.tag-badge');
                        if (tagBadge) {
                            tagBadge.remove();
                        }
                        
                        // If no tags left, show the placeholder
                        const tagsCol = e.target.closest('.tags-col');
                        if (tagsCol && !tagsCol.querySelector('.tag-badge')) {
                            // Clear the column and add placeholder and button
                            tagsCol.innerHTML = '';
                            const placeholder = document.createElement('small');
                            placeholder.className = 'text-muted';
                            placeholder.textContent = '-';
                            tagsCol.appendChild(placeholder);
                            
                            // Re-add the add tag button
                            const addButton = document.createElement('button');
                            addButton.className = 'btn btn-sm btn-outline-secondary p-0 ms-1 btn-add-tag';
                            addButton.dataset.scanId = scanId;
                            addButton.title = 'Add tag';
                            addButton.innerHTML = '<i class="fas fa-plus" style="font-size: 0.65rem;"></i>';
                            tagsCol.appendChild(addButton);
                            // Re-initialize the add tag functionality
                            initTagAddInline();
                        }
                        
                        // Refresh the tags dropdown to reflect the removed tag
                        if (window.refreshTagsDropdown) {
                            window.refreshTagsDropdown();
                        }
                        
                        showNotification('success', 'Tag removed successfully');
                    } else {
                        showNotification('error', data.error || 'Failed to remove tag');
                    }
                }).catch(() => showNotification('error', 'Network error'));
            }
        }
    });
}

// Initialize everything
document.addEventListener('DOMContentLoaded', function() {
    autoExpandFilters();
    initListNameEditing();
    initAdminActions();
    initFilterRemoveButtons();
    initBulkSelection();
    initCreateFolder();
    initTagAddInline();
    initTagFilter();
    initStatusFilterButtons();
    initInlineTagRemoval();
    
    // Ensure tag dropdown is refreshed after all initialization
    setTimeout(() => {
        if (window.refreshTagsDropdown) {
            window.refreshTagsDropdown();
        }
    }, 100);
    
    // Add form submission handler to clean empty values
    const filterForm = document.getElementById('filterForm');
    if (filterForm) {
        filterForm.addEventListener('submit', cleanFormSubmission);
    }
    
    // Override per_page select onchange to use clean submission
    const perPageSelect = document.querySelector('select[name="per_page"]');
    if (perPageSelect) {
        perPageSelect.addEventListener('change', function() {
            handlePerPageChange(this);
        });
        // Remove the inline onchange to prevent double execution
        perPageSelect.removeAttribute('onchange');
    }
    
    // Add search input change handler to update URL
    const searchInput = document.querySelector('input[name="search"]');
    if (searchInput) {
        searchInput.addEventListener('input', function() {
            // Debounce the URL update to avoid too many updates
            clearTimeout(window.searchTimeout);
            window.searchTimeout = setTimeout(() => {
                updateFilterURL();
            }, 500);
        });
    }
}); 