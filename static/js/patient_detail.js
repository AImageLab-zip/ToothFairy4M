/**
 * Patient Detail Page - Main UI Controller
 * Handles common UI elements and modality viewer coordination
 */

// Revolutionary Classification UI Functions
function toggleDropdown(button) {
    if (!window.canEdit) {
        return; // Not editable for non-annotators
    }
    
    // Close all other dropdowns
    document.querySelectorAll('.value-dropdown.show').forEach(dropdown => {
        if (dropdown !== button.nextElementSibling) {
            dropdown.classList.remove('show');
        }
    });
    
    // Toggle this dropdown
    const dropdown = button.nextElementSibling;
    if (dropdown) {
        dropdown.classList.toggle('show');
        
        dropdown.querySelectorAll('.dropdown-option').forEach(option => {
            option.onclick = function() {
                updateClassification(button, option);
            };
        });
    }
}

function updateClassification(button, option) {
    const field = button.closest('.classification-value').dataset.field;
    const value = option.dataset.value;
    const displayText = option.textContent;
    
    // Update UI immediately
    button.textContent = displayText;
    button.classList.remove('ai-prediction');
    button.classList.add('manual-verified');
    
    // Hide dropdown
    button.nextElementSibling.classList.remove('show');
    
    // Save via AJAX
    fetch(`/${window.projectNamespace}/patient/${window.scanId}/update/`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            field: field,
            value: value
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showSavedIndicator();
            updatePageStatus();
        } else {
            console.error('Error saving classification:', data.error);
            button.classList.remove('manual-verified');
            button.classList.add('ai-prediction');
        }
    })
    .catch(error => {
        console.error('Network error:', error);
        button.classList.remove('manual-verified');
        button.classList.add('ai-prediction');
    });
}

function showSavedIndicator() {
    const indicator = document.getElementById('savingIndicator');
    indicator.style.display = 'block';
    setTimeout(() => {
        indicator.style.display = 'none';
    }, 2000);
}

function updatePageStatus() {
    const statusBadge = document.querySelector('.status-badge');
    if (statusBadge && statusBadge.classList.contains('ai-pending')) {
        statusBadge.innerHTML = '<i class="fas fa-check-circle me-1"></i>VERIFIED';
        statusBadge.classList.remove('ai-pending');
        statusBadge.classList.add('manual-verified');
        
        const quickActions = document.querySelector('.quick-actions');
        if (quickActions) {
            quickActions.style.display = 'none';
        }
    }
}

// Close dropdowns when clicking outside
document.addEventListener('click', function(event) {
    if (!event.target.closest('.classification-value')) {
        document.querySelectorAll('.value-dropdown.show').forEach(dropdown => {
            dropdown.classList.remove('show');
        });
    }
});

// Inline name editing functionality
function initNameEditing() {
    const editBtn = document.querySelector('.btn-edit-name');
    const nameDisplay = document.querySelector('.scan-name-display');
    
    if (!editBtn || !nameDisplay) return;
    
    editBtn.addEventListener('click', function() {
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
        input.className = 'name-edit-input';
        input.style.width = '200px';
        
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
            
            fetch(`/${window.projectNamespace}/patient/${window.scanId}/update-name/`, {
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
                    showSavedIndicator();
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
}

// Initialize confirm review functionality
function initConfirmReview() {
    const confirmBtn = document.getElementById('confirmReview');
    if (confirmBtn) {
        confirmBtn.addEventListener('click', function() {
            // Create form and submit to accept AI predictions
            const form = document.createElement('form');
            form.method = 'POST';
            form.style.display = 'none';
            
            const csrfToken = document.querySelector('[name=csrfmiddlewaretoken]').value;
            const csrfInput = document.createElement('input');
            csrfInput.type = 'hidden';
            csrfInput.name = 'csrfmiddlewaretoken';
            csrfInput.value = csrfToken;
            
            const actionInput = document.createElement('input');
            actionInput.type = 'hidden';
            actionInput.name = 'action';
            actionInput.value = 'accept_ai';
            
            form.appendChild(csrfInput);
            form.appendChild(actionInput);
            document.body.appendChild(form);
            form.submit();
        });
    }
}

// Initialize viewer toggle functionality
function initViewerToggle() {
    const iosRadio = document.getElementById('iosViewer');
    const cbctRadio = document.getElementById('cbctViewer');
    const iosContainer = document.getElementById('ios-viewer');
    const cbctContainer = document.getElementById('cbct-viewer');
    const iosControls = document.getElementById('iosControls');
    const cbctControls = document.getElementById('cbctControls');
    const toggleGroup = document.getElementById('modalityToggleGroup');

    // Generic modality switching for dynamically rendered toggles
    if (toggleGroup) {
        toggleGroup.addEventListener('change', function(e) {
            const target = e.target;
            if (!target || target.type !== 'radio') return;
            const label = toggleGroup.querySelector(`label[for="${target.id}"]`);
            const modality = (label && label.dataset.modality) || (target.id && target.id.startsWith('modality_') ? target.id.substring('modality_'.length) : null);
            if (!modality) return;

            // Show relevant container
            if (modality === 'ios') {
                // Dispose any active volume viewers before switching to IOS
                if (typeof window.CBCTViewer !== 'undefined') {
                    try { window.CBCTViewer.dispose(); } catch (e) { console.warn(e); }
                }
                
                // Hide all image viewers
                const imageViewers = ['intraoral-viewer', 'teleradiography-viewer', 'panoramic-viewer'];
                imageViewers.forEach(viewerId => {
                    const viewer = document.getElementById(viewerId);
                    if (viewer) viewer.style.display = 'none';
                });
                
                if (iosContainer) iosContainer.style.display = 'block';
                if (cbctContainer) cbctContainer.style.display = 'none';
                if (iosControls) iosControls.style.display = 'block';
                if (cbctControls) cbctControls.style.display = 'none';
                
                // Initialize IOS viewer if not already done
                if (typeof window.IOSViewer !== 'undefined') {
                    window.IOSViewer.init();
                }
            } else if (modality === 'cbct') {
                // Dispose any existing volume viewers to free GL contexts
                if (typeof window.CBCTViewer !== 'undefined') {
                    try { window.CBCTViewer.dispose(); } catch (e) { console.warn(e); }
                }
                
                // Hide all image viewers
                const imageViewers = ['intraoral-viewer', 'teleradiography-viewer', 'panoramic-viewer'];
                imageViewers.forEach(viewerId => {
                    const viewer = document.getElementById(viewerId);
                    if (viewer) viewer.style.display = 'none';
                });
                
                if (iosContainer) iosContainer.style.display = 'none';
                if (cbctContainer) cbctContainer.style.display = 'block';
                if (iosControls) iosControls.style.display = 'none';
                if (cbctControls) cbctControls.style.display = 'block';
                
                // Show cbct-viewer container
                const cbctViewer = document.getElementById('cbct-viewer');
                if (cbctViewer) cbctViewer.style.display = 'block';
                
                // Only initialize viewer if CBCT is processed
                if (window.isCBCTProcessed) {
                    setTimeout(() => {
                        if (typeof window.CBCTViewer !== 'undefined') {
                            window.CBCTViewer.init();
                        }
                    }, 100);
                } else {
                    console.debug('CBCT not processed yet, skipping viewer initialization');
                }
            } else if (modality === 'intraoral' || modality === 'intraoral-photo') {
                // Handle intraoral photos viewer
                if (typeof window.CBCTViewer !== 'undefined') {
                    try { window.CBCTViewer.dispose(); } catch (e) { console.warn(e); }
                }
                if (iosContainer) iosContainer.style.display = 'none';
                if (cbctContainer) cbctContainer.style.display = 'none';
                if (iosControls) iosControls.style.display = 'none';
                if (cbctControls) cbctControls.style.display = 'none';

                // Hide all viewer containers (but NOT scan-viewer which is inside ios-viewer)
                const allViewers = document.querySelectorAll('[id$="-viewer"]:not(#scan-viewer)');
                allViewers.forEach(el => el.style.display = 'none');
                
                const intraoralViewer = document.getElementById('intraoral-viewer');
                if (intraoralViewer) {
                    intraoralViewer.style.display = 'block';
                    if (typeof window.IntraoralViewer !== 'undefined') {
                        window.IntraoralViewer.load();
                    }
                }
            } else if (modality === 'teleradiography') {
                // Handle teleradiography viewer
                if (typeof window.CBCTViewer !== 'undefined') {
                    try { window.CBCTViewer.dispose(); } catch (e) { console.warn(e); }
                }
                if (iosContainer) iosContainer.style.display = 'none';
                if (cbctContainer) cbctContainer.style.display = 'none';
                if (iosControls) iosControls.style.display = 'none';
                if (cbctControls) cbctControls.style.display = 'none';

                // Hide all viewer containers (but NOT scan-viewer which is inside ios-viewer)
                const allViewers = document.querySelectorAll('[id$="-viewer"]:not(#scan-viewer)');
                allViewers.forEach(el => el.style.display = 'none');
                
                const teleradiographyViewer = document.getElementById('teleradiography-viewer');
                if (teleradiographyViewer) {
                    teleradiographyViewer.style.display = 'block';
                    if (typeof window.TeleradiographyViewer !== 'undefined') {
                        window.TeleradiographyViewer.load();
                    }
                }
            } else if (modality === 'panoramic') {
                // Handle panoramic viewer
                if (typeof window.CBCTViewer !== 'undefined') {
                    try { window.CBCTViewer.dispose(); } catch (e) { console.warn(e); }
                }
                if (iosContainer) iosContainer.style.display = 'none';
                if (cbctContainer) cbctContainer.style.display = 'none';
                if (iosControls) iosControls.style.display = 'none';
                if (cbctControls) cbctControls.style.display = 'none';

                // Hide all viewer containers (but NOT scan-viewer which is inside ios-viewer)
                const allViewers = document.querySelectorAll('[id$="-viewer"]:not(#scan-viewer)');
                allViewers.forEach(el => el.style.display = 'none');
                
                const panoramicViewer = document.getElementById('panoramic-viewer');
                if (panoramicViewer) {
                    panoramicViewer.style.display = 'block';
                    if (typeof window.PanoramicViewer !== 'undefined') {
                        window.PanoramicViewer.load();
                    }
                }
            } else {
                // Show generic container for other volume modalities (but not image modalities)
                // Image modalities are handled explicitly above
                const imageModalities = ['intraoral', 'intraoral-photo', 'teleradiography', 'panoramic'];
                
                if (imageModalities.includes(modality)) {
                    // This should not happen as image modalities are handled explicitly above
                    console.warn(`Image modality ${modality} should not reach generic volume handler`);
                    return;
                }
                
                // For actual volume modalities (like brain MRI), reuse CBCT controls (windowing/reset)
                if (typeof window.CBCTViewer !== 'undefined') {
                    // Always dispose before switching to a different volume modality
                    try { window.CBCTViewer.dispose(); } catch (e) { console.warn(e); }
                }
                if (iosContainer) iosContainer.style.display = 'none';
                if (cbctContainer) cbctContainer.style.display = 'none';
                if (iosControls) iosControls.style.display = 'none';
                if (cbctControls) cbctControls.style.display = 'block';

                const generic = document.getElementById(`${modality}-viewer`);
                const allGeneric = document.querySelectorAll('[id$="-viewer"]:not(#scan-viewer)');
                if (allGeneric && allGeneric.length) {
                    allGeneric.forEach(el => {
                        if (el && el.id !== 'ios-viewer' && el.id !== 'cbct-viewer' && 
                            el.id !== 'intraoral-viewer' && el.id !== 'teleradiography-viewer' && 
                            el.id !== 'panoramic-viewer') {
                            el.style.display = 'none';
                        }
                    });
                }
                if (generic) {
                    generic.style.display = 'block';
                    // Initialize volume viewer for this modality using CBCT viewer backend
                    if (typeof window.CBCTViewer !== 'undefined') {
                        window.CBCTViewer.init(modality);
                    }
                }
            }
        });

        // Ensure a default selection is applied if radios rendered without checked
        const anyChecked = toggleGroup.querySelector('input[type="radio"][name="viewerType"]:checked');
        if (!anyChecked) {
            const preferredSlug = window.defaultModality || (window.hasIOS ? 'ios' : (window.hasCBCT ? 'cbct' : null));
            if (preferredSlug) {
                const preferredInput = document.getElementById(`modality_${preferredSlug}`);
                if (preferredInput) {
                    preferredInput.checked = true;
                    // If the element or its label is hidden on initial layout, delay dispatch
                    setTimeout(() => {
                        preferredInput.dispatchEvent(new Event('change', { bubbles: true }));
                    }, 0);
                }
            }
        } else {
            // Ensure initial viewer initialization even if radio was pre-checked by server
            setTimeout(() => {
                anyChecked.dispatchEvent(new Event('change', { bubbles: true }));
            }, 0);
        }
    }

    // IOS-only case
    if (iosRadio && !cbctRadio) {
        if (iosContainer) iosContainer.style.display = 'block';
        if (cbctContainer) cbctContainer.style.display = 'none';
        if (iosControls) iosControls.style.display = 'block';
        if (cbctControls) cbctControls.style.display = 'none';
        return;
    }

    // CBCT-only case
    if (!iosRadio && cbctRadio) {
        if (iosContainer) iosContainer.style.display = 'none';
        if (cbctContainer) cbctContainer.style.display = 'block';
        if (iosControls) iosControls.style.display = 'none';
        if (cbctControls) cbctControls.style.display = 'block';
        setTimeout(() => {
            if (typeof window.CBCTViewer !== 'undefined') {
                if (!window.CBCTViewer.initialized && !window.CBCTViewer.loading) {
                    window.CBCTViewer.init();
                } else if (window.CBCTViewer.initialized) {
                    window.CBCTViewer.refreshAllViews();
                    window.CBCTViewer.panoramicLoaded = false;
                    window.CBCTViewer.loadPanoramicImage();
                }
            }
        }, 100);
        return;
    }

    // Both toggles exist
    if (cbctRadio && typeof window.hasCBCT !== 'undefined' && !window.hasCBCT) {
        cbctRadio.disabled = true;
        if (cbctRadio.parentElement) {
            cbctRadio.parentElement.classList.add('disabled');
            cbctRadio.parentElement.title = 'No CBCT data available';
        }
    }

    // Handle initial state based on which radio button is checked
    if (cbctRadio && cbctRadio.checked && window.hasCBCT && window.isCBCTProcessed) {
        if (typeof window.CBCTViewer !== 'undefined') {
            if (!window.CBCTViewer.initialized && !window.CBCTViewer.loading) {
                window.CBCTViewer.init();
            } else if (window.CBCTViewer.initialized) {
                window.CBCTViewer.refreshAllViews();
            }
        }
    }

    if (iosRadio) {
        iosRadio.addEventListener('change', function() {
            if (this.checked) {
                if (iosContainer) iosContainer.style.display = 'block';
                if (cbctContainer) cbctContainer.style.display = 'none';
                if (iosControls) iosControls.style.display = 'block';
                if (cbctControls) cbctControls.style.display = 'none';
                
                // Initialize IOS viewer if not already done
                if (typeof window.IOSViewer !== 'undefined') {
                    window.IOSViewer.init();
                }
            }
        });
    }

    if (cbctRadio) {
        cbctRadio.addEventListener('change', function() {
            if (this.checked && window.hasCBCT) {
                if (iosContainer) iosContainer.style.display = 'none';
                if (cbctContainer) cbctContainer.style.display = 'block';
                if (iosControls) iosControls.style.display = 'none';
                if (cbctControls) cbctControls.style.display = 'block';

                // Only initialize viewer if CBCT is processed
                if (window.isCBCTProcessed) {
                    // Handle CBCT viewer state with a delay to ensure containers are visible
                    setTimeout(() => {
                        if (typeof window.CBCTViewer !== 'undefined') {
                            if (!window.CBCTViewer.initialized && !window.CBCTViewer.loading) {
                                console.debug('Initializing CBCT viewer after view switch...');
                                window.CBCTViewer.init();
                            } else if (window.CBCTViewer.initialized) {
                                console.debug('Refreshing CBCT viewer after view switch...');
                                window.CBCTViewer.refreshAllViews();
                                console.debug('Reloading panoramic image after tab switch...');
                                window.CBCTViewer.panoramicLoaded = false; // Reset panoramic state
                                window.CBCTViewer.loadPanoramicImage();
                            }
                        }
                    }, 100); // 100ms delay to ensure containers are visible and sized
                } else {
                    console.debug('CBCT not processed yet, skipping viewer initialization');
                }
            }
        });
    }
} 

// Tag management
function initTagManagement() {
    const chips = document.getElementById('tagChips');
    const addBtn = document.getElementById('btnAddTag');
    const input = document.getElementById('newTagInput');
    if (!chips || !addBtn || !input) return;
    
    addBtn.addEventListener('click', () => addTag(input, chips));
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addTag(input, chips);
        }
    });
    chips.addEventListener('click', (e) => {
        const btn = e.target.closest('.btn-remove-tag');
        if (!btn) return;
        const tag = btn.dataset.tag;
        fetch(`/${window.projectNamespace}/patient/${window.scanId}/tags/remove/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tag })
        }).then(r => r.json()).then(data => {
            if (data.success) {
                const toRemove = chips.querySelector(`[data-tag="${CSS.escape(tag)}"]`);
                if (toRemove) toRemove.remove();
                showSavedIndicator();
            } else {
                alert(data.error || 'Failed to remove tag');
            }
        }).catch(() => alert('Network error'));
    });
}

function addTag(input, chips) {
    const tag = (input.value || '').trim();
    if (!tag) return;
    fetch(`/${window.projectNamespace}/patient/${window.scanId}/tags/add/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag })
    }).then(r => r.json()).then(data => {
        if (data.success) {
            // add chip if not already present
            if (!chips.querySelector(`[data-tag="${CSS.escape(tag)}"]`)) {
                const span = document.createElement('span');
                span.className = 'badge rounded-pill bg-light text-dark border';
                span.setAttribute('data-tag', tag);
                span.innerHTML = `${escapeHtml(tag)} <button type="button" class="btn btn-sm btn-link text-danger p-0 ms-1 btn-remove-tag" data-tag="${escapeHtml(tag)}"><i class="fas fa-times"></i></button>`;
                chips.appendChild(span);
            }
            input.value = '';
            showSavedIndicator();
        } else {
            alert(data.error || 'Failed to add tag');
        }
    }).catch(() => alert('Network error'));
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.innerText = text;
    return div.innerHTML;
} 

// Initialize everything when page loads
document.addEventListener('DOMContentLoaded', function() {
    console.debug('DOM Content Loaded - initializing...');
    
    // Get Django data
    const djangoData = JSON.parse(document.getElementById('django-data').textContent);
    window.canEdit = djangoData.canEdit;
    window.scanId = djangoData.scanId;
    window.hasIOS = djangoData.hasIOS;
    window.hasCBCT = djangoData.hasCBCT;
    window.isCBCTProcessed = djangoData.isCBCTProcessed;
    window.modalities = Array.isArray(djangoData.modalities) ? djangoData.modalities : [];
    window.defaultModality = djangoData.defaultModality || null;
    
    console.debug('Can edit:', window.canEdit);
    console.debug('Scan ID:', window.scanId);
    console.debug('Has CBCT:', window.hasCBCT);
    console.debug('Is CBCT processed:', window.isCBCTProcessed);
    
    // Initialize modality viewers
    if (window.hasIOS && typeof window.IOSViewer !== 'undefined') {
        console.debug('Initializing IOS viewer');
        window.IOSViewer.init();
    }
    
    // Initialize image modality viewers
    if (typeof window.IntraoralViewer !== 'undefined') {
        window.IntraoralViewer.init(window.scanId);
    }
    if (typeof window.TeleradiographyViewer !== 'undefined') {
        window.TeleradiographyViewer.init(window.scanId);
    }
    if (typeof window.PanoramicViewer !== 'undefined') {
        window.PanoramicViewer.init(window.scanId);
    }
    
    // Initialize other UI components
    initNameEditing();
    initConfirmReview();
    initViewerToggle();
    initTagManagement();
});
