/**
 * Viewer Grid - Drag-drop interaction for multi-window MRI viewer
 *
 * Manages state for 4 viewer windows and drag-drop loading of modalities.
 * State object tracks: modality, loading, error, fileId for each window.
 */

const ViewerGrid = (function() {
    'use strict';

    // Window state for 4 grid positions
    const windowStates = {
        0: { modality: null, loading: false, error: null, fileId: null },
        1: { modality: null, loading: false, error: null, fileId: null },
        2: { modality: null, loading: false, error: null, fileId: null },
        3: { modality: null, loading: false, error: null, fileId: null }
    };

    // Global data from Django template
    let djangoData = {
        scanId: null,
        projectNamespace: null,
        modalityFiles: {}
    };

    /**
     * Initialize the viewer grid system
     * Called on DOMContentLoaded for brain project pages
     */
    function init() {
        // Load Django data from template script
        loadDjangoData();

        // Populate file IDs on modality chips
        populateChipFileIds();

        // Initialize drag-drop interaction
        initDragDrop();

        // Initialize context menus
        initContextMenus();

        console.log('ViewerGrid initialized', { djangoData, windowStates });
    }

    /**
     * Load Django data from script tag
     */
    function loadDjangoData() {
        const dataEl = document.getElementById('viewerGridData');
        if (dataEl) {
            try {
                const data = JSON.parse(dataEl.textContent);
                djangoData = {
                    scanId: data.scanId,
                    projectNamespace: data.projectNamespace,
                    modalityFiles: data.modalityFiles || {}
                };
            } catch (e) {
                console.error('Error parsing Django data:', e);
            }
        }
    }

    /**
     * Populate file IDs on modality chips from Django data
     */
    function populateChipFileIds() {
        const chips = document.querySelectorAll('.modality-chip');
        chips.forEach(chip => {
            const modality = chip.dataset.modality;
            const fileInfo = djangoData.modalityFiles[modality];
            if (fileInfo && fileInfo.id) {
                chip.dataset.fileId = fileInfo.id;
            }
        });
    }

    /**
     * Initialize drag-drop handlers
     */
    function initDragDrop() {
        const chips = document.querySelectorAll('.modality-chip');
        const windows = document.querySelectorAll('.viewer-window');

        // Make modality chips draggable
        chips.forEach(chip => {
            chip.addEventListener('dragstart', handleDragStart);
            chip.addEventListener('dragend', handleDragEnd);
        });

        // Make viewer windows drop zones
        windows.forEach(window => {
            window.addEventListener('dragover', handleDragOver);
            window.addEventListener('dragleave', handleDragLeave);
            window.addEventListener('drop', handleDrop);
        });
    }

    /**
     * Handle drag start from modality chip
     */
    function handleDragStart(e) {
        const modality = e.currentTarget.dataset.modality;
        const fileId = e.currentTarget.dataset.fileId;

        // Store modality and file ID in dataTransfer
        e.dataTransfer.setData('text/plain', modality);
        e.dataTransfer.setData('application/json', JSON.stringify({
            modality: modality,
            fileId: fileId
        }));

        e.dataTransfer.effectAllowed = 'copy';

        // Visual feedback
        e.currentTarget.style.opacity = '0.5';
    }

    /**
     * Handle drag end
     */
    function handleDragEnd(e) {
        e.currentTarget.style.opacity = '1';
    }

    /**
     * Handle drag over window (for drop zone highlighting)
     */
    function handleDragOver(e) {
        e.preventDefault(); // Required to allow drop
        e.dataTransfer.dropEffect = 'copy';

        // Highlight drop zone
        e.currentTarget.classList.add('drag-over');
    }

    /**
     * Handle drag leave window
     */
    function handleDragLeave(e) {
        // Only remove highlight if leaving the window itself (not child elements)
        if (e.currentTarget === e.target) {
            e.currentTarget.classList.remove('drag-over');
        }
    }

    /**
     * Handle drop into window
     */
    function handleDrop(e) {
        e.preventDefault();
        e.currentTarget.classList.remove('drag-over');

        // Parse dropped data
        let modalityData;
        try {
            modalityData = JSON.parse(e.dataTransfer.getData('application/json'));
        } catch (err) {
            // Fallback to plain text
            const modality = e.dataTransfer.getData('text/plain');
            modalityData = {
                modality: modality,
                fileId: null
            };
        }

        // Get window index
        const windowIndex = parseInt(e.currentTarget.dataset.windowIndex, 10);

        // Load modality in this window
        loadModalityInWindow(windowIndex, modalityData.modality, modalityData.fileId);
    }

    /**
     * Load a modality into a specific window
     * @param {number} windowIndex - 0-3 for grid position
     * @param {string} modality - Modality slug (e.g. 't1', 't2')
     * @param {string|null} fileId - FileRegistry ID for this modality
     */
    function loadModalityInWindow(windowIndex, modality, fileId) {
        // Update state
        windowStates[windowIndex] = {
            modality: modality,
            loading: true,
            error: null,
            fileId: fileId
        };

        // Update UI immediately
        updateWindowUI(windowIndex);

        // Simulate loading (actual viewer integration in Plan 03-03)
        setTimeout(() => {
            // Check if window still has this modality (user might have cleared it)
            if (windowStates[windowIndex].modality === modality) {
                windowStates[windowIndex].loading = false;
                windowStates[windowIndex].error = null;
                updateWindowUI(windowIndex);
            }
        }, 1000);

        console.log(`Loading ${modality} (fileId: ${fileId}) in window ${windowIndex}`);
    }

    /**
     * Update window UI based on state
     * @param {number} windowIndex - 0-3 for grid position
     */
    function updateWindowUI(windowIndex) {
        const state = windowStates[windowIndex];
        const windowEl = document.querySelector(`.viewer-window[data-window-index="${windowIndex}"]`);

        if (!windowEl) return;

        // Clear previous UI elements except drop hint
        const oldLabel = windowEl.querySelector('.window-label');
        const oldSpinner = windowEl.querySelector('.spinner-border');
        const oldError = windowEl.querySelector('.error-message');
        if (oldLabel) oldLabel.remove();
        if (oldSpinner) oldSpinner.remove();
        if (oldError) oldError.remove();

        // Empty state
        if (!state.modality) {
            windowEl.classList.remove('loaded');
            windowEl.querySelector('.drop-hint').style.display = 'flex';
            return;
        }

        // Hide drop hint
        windowEl.querySelector('.drop-hint').style.display = 'none';

        // Loading state
        if (state.loading) {
            const spinner = document.createElement('div');
            spinner.className = 'spinner-border';
            spinner.setAttribute('role', 'status');
            spinner.innerHTML = '<span class="visually-hidden">Loading...</span>';
            windowEl.appendChild(spinner);
            return;
        }

        // Error state
        if (state.error) {
            const errorDiv = document.createElement('div');
            errorDiv.className = 'error-message';
            errorDiv.style.cssText = 'position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: #dc3545; text-align: center;';
            errorDiv.innerHTML = `<i class="fas fa-exclamation-triangle"></i><br>${state.error}`;
            windowEl.appendChild(errorDiv);
            return;
        }

        // Loaded state
        windowEl.classList.add('loaded');

        // Add modality label
        const label = document.createElement('div');
        label.className = 'window-label';
        label.textContent = state.modality.toUpperCase();
        windowEl.appendChild(label);

        // Add placeholder content (actual viewer in Plan 03-03)
        const placeholder = document.createElement('div');
        placeholder.style.cssText = 'position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: #888; text-align: center;';
        placeholder.innerHTML = `<i class="fas fa-brain" style="font-size: 3rem; opacity: 0.3;"></i><br><small>Viewer integration: Plan 03-03</small>`;
        windowEl.appendChild(placeholder);
    }

    /**
     * Initialize context menus for clearing windows
     */
    function initContextMenus() {
        const windows = document.querySelectorAll('.viewer-window');

        windows.forEach(window => {
            window.addEventListener('contextmenu', (e) => {
                e.preventDefault();

                const windowIndex = parseInt(window.dataset.windowIndex, 10);
                const state = windowStates[windowIndex];

                // Only show menu if window has content
                if (state.modality) {
                    showContextMenu(e.clientX, e.clientY, windowIndex);
                }
            });
        });

        // Close context menu on click elsewhere
        document.addEventListener('click', () => {
            const existingMenu = document.getElementById('viewerContextMenu');
            if (existingMenu) {
                existingMenu.remove();
            }
        });
    }

    /**
     * Show context menu at cursor position
     */
    function showContextMenu(x, y, windowIndex) {
        // Remove existing menu
        const existingMenu = document.getElementById('viewerContextMenu');
        if (existingMenu) {
            existingMenu.remove();
        }

        // Create menu
        const menu = document.createElement('div');
        menu.id = 'viewerContextMenu';
        menu.style.cssText = `
            position: fixed;
            top: ${y}px;
            left: ${x}px;
            background: white;
            border: 1px solid #dee2e6;
            border-radius: 4px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.15);
            z-index: 1000;
            min-width: 120px;
        `;

        // Clear option
        const clearOption = document.createElement('div');
        clearOption.style.cssText = 'padding: 8px 16px; cursor: pointer; user-select: none;';
        clearOption.innerHTML = '<i class="fas fa-times me-2"></i>Clear';
        clearOption.addEventListener('mouseenter', () => {
            clearOption.style.background = '#f8f9fa';
        });
        clearOption.addEventListener('mouseleave', () => {
            clearOption.style.background = 'white';
        });
        clearOption.addEventListener('click', () => {
            clearWindow(windowIndex);
            menu.remove();
        });

        menu.appendChild(clearOption);
        document.body.appendChild(menu);
    }

    /**
     * Clear a window (reset to empty state)
     * @param {number} windowIndex - 0-3 for grid position
     */
    function clearWindow(windowIndex) {
        windowStates[windowIndex] = {
            modality: null,
            loading: false,
            error: null,
            fileId: null
        };

        updateWindowUI(windowIndex);
        console.log(`Cleared window ${windowIndex}`);
    }

    // Public API
    return {
        init: init,
        windowStates: windowStates,
        loadModalityInWindow: loadModalityInWindow,
        clearWindow: clearWindow
    };
})();

// Initialize on DOMContentLoaded for brain project pages
document.addEventListener('DOMContentLoaded', function() {
    // Check if we're on a brain patient detail page (has viewer grid)
    if (document.querySelector('.viewer-grid')) {
        ViewerGrid.init();
    }
});
