/**
 * Viewer Grid - Drag-drop interaction for multi-window MRI viewer
 *
 * Manages state for 4 viewer windows and drag-drop loading of modalities.
 * Each window gets its own VolumeViewer instance for true multi-window support.
 */

const ViewerGrid = (function() {
    'use strict';

    // Window state for 4 grid positions
    const windowStates = {
        0: { modality: null, loading: false, error: null, fileId: null, viewerInstance: null },
        1: { modality: null, loading: false, error: null, fileId: null, viewerInstance: null },
        2: { modality: null, loading: false, error: null, fileId: null, viewerInstance: null },
        3: { modality: null, loading: false, error: null, fileId: null, viewerInstance: null }
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
     * Each window gets its own VolumeViewer instance
     * @param {number} windowIndex - 0-3 for grid position
     * @param {string} modality - Modality slug (e.g. 'braintumor-mri-t1')
     * @param {string|null} fileId - FileRegistry ID for this modality
     */
    function loadModalityInWindow(windowIndex, modality, fileId) {
        console.log(`Loading ${modality} (fileId: ${fileId}) in window ${windowIndex}`);

        const windowEl = document.querySelector(`.viewer-window[data-window-index="${windowIndex}"]`);
        if (!windowEl) {
            console.error(`Window element not found for index ${windowIndex}`);
            return;
        }

        // Dispose existing viewer if present
        const existingState = windowStates[windowIndex];
        if (existingState.viewerInstance) {
            console.log(`Disposing previous viewer in window ${windowIndex}`);
            existingState.viewerInstance.dispose();
        }

        // Update state
        windowStates[windowIndex] = {
            modality: modality,
            loading: true,
            error: null,
            fileId: fileId,
            viewerInstance: null
        };

        // Build container prefix for this window
        const containerPrefix = `window${windowIndex}_`;

        // Create viewer container structure
        const viewerHTML = `
            <div id="${containerPrefix}${modality}-viewer" class="modality-viewer" style="width: 100%; height: 100%; position: relative;">
                <div id="${containerPrefix}${modality}Loading" style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.8); z-index: 10;">
                    <div class="spinner-border text-primary" role="status">
                        <span class="visually-hidden">Loading...</span>
                    </div>
                </div>
                <div id="${containerPrefix}${modality}Views" style="display: block; width: 100%; height: 100%;">
                    <div style="display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; width: 100%; height: 100%; gap: 2px; background: #000;">
                        <div id="${containerPrefix}${modality}_axialView" style="position: relative; background: #000; min-height: 120px;"></div>
                        <div id="${containerPrefix}${modality}_sagittalView" style="position: relative; background: #000; min-height: 120px;"></div>
                        <div id="${containerPrefix}${modality}_coronalView" style="position: relative; background: #000; min-height: 120px;"></div>
                        <div id="${containerPrefix}${modality}_volumeView" style="position: relative; background: #1a1a1a; min-height: 120px;"></div>
                    </div>
                </div>
            </div>
        `;

        // Clear window content (except drop hint)
        const dropHint = windowEl.querySelector('.drop-hint');
        windowEl.innerHTML = '';
        if (dropHint) {
            windowEl.appendChild(dropHint);
            dropHint.style.display = 'none';
        }

        // Add viewer container
        const viewerContainer = document.createElement('div');
        viewerContainer.innerHTML = viewerHTML;
        windowEl.appendChild(viewerContainer.firstElementChild);

        // Add window label
        const label = document.createElement('div');
        label.className = 'window-label';
        label.textContent = modality.toUpperCase();
        windowEl.appendChild(label);

        // Check if VolumeViewer class is available
        if (!window.VolumeViewer) {
            console.error('VolumeViewer not loaded');
            windowStates[windowIndex].loading = false;
            windowStates[windowIndex].error = 'VolumeViewer not loaded';
            updateWindowUI(windowIndex);
            return;
        }

        // Create new VolumeViewer instance for this window
        const viewer = new window.VolumeViewer(containerPrefix);
        windowStates[windowIndex].viewerInstance = viewer;

        // Initialize viewer (async - will update UI when done)
        viewer.init(modality);

        // Poll for completion
        waitForViewerReady(windowIndex, viewer, 30000);
    }

    /**
     * Wait for a viewer instance to finish loading
     * @param {number} windowIndex - Window index
     * @param {VolumeViewer} viewer - The viewer instance
     * @param {number} timeoutMs - Maximum wait time
     */
    function waitForViewerReady(windowIndex, viewer, timeoutMs = 30000) {
        const startTime = Date.now();
        const checkInterval = 100;

        function check() {
            // Check if this is still the active viewer for this window
            if (windowStates[windowIndex].viewerInstance !== viewer) {
                console.log(`Viewer changed for window ${windowIndex}, stopping wait`);
                return;
            }

            // Check if viewer is ready
            if (!viewer.loading && viewer.initialized) {
                windowStates[windowIndex].loading = false;
                windowStates[windowIndex].error = null;

                const windowEl = document.querySelector(`.viewer-window[data-window-index="${windowIndex}"]`);
                if (windowEl) {
                    windowEl.classList.add('loaded');
                }

                console.log(`Successfully loaded ${windowStates[windowIndex].modality} in window ${windowIndex}`);
                return;
            }

            // Check for timeout
            if (Date.now() - startTime > timeoutMs) {
                console.warn(`Timeout waiting for viewer in window ${windowIndex}`);
                windowStates[windowIndex].loading = false;
                windowStates[windowIndex].error = 'Timeout loading volume';
                updateWindowUI(windowIndex);
                return;
            }

            // Keep checking
            setTimeout(check, checkInterval);
        }

        check();
    }

    /**
     * Update window UI based on state
     * @param {number} windowIndex - 0-3 for grid position
     */
    function updateWindowUI(windowIndex) {
        const state = windowStates[windowIndex];
        const windowEl = document.querySelector(`.viewer-window[data-window-index="${windowIndex}"]`);

        if (!windowEl) return;

        // Empty state
        if (!state.modality) {
            // Clear all content except drop hint
            const dropHint = windowEl.querySelector('.drop-hint');
            windowEl.innerHTML = '';
            if (dropHint) {
                windowEl.appendChild(dropHint);
                dropHint.style.display = 'flex';
            } else {
                // Create drop hint if it doesn't exist
                const newDropHint = document.createElement('div');
                newDropHint.className = 'drop-hint';
                newDropHint.innerHTML = '<i class="fas fa-arrow-down"></i><p>Drop modality here</p>';
                windowEl.appendChild(newDropHint);
            }
            windowEl.classList.remove('loaded');
            return;
        }

        // Hide drop hint if present
        const dropHint = windowEl.querySelector('.drop-hint');
        if (dropHint) {
            dropHint.style.display = 'none';
        }

        // Error state
        if (state.error) {
            // Find or create error container
            let errorDiv = windowEl.querySelector('.error-message');
            if (!errorDiv) {
                errorDiv = document.createElement('div');
                errorDiv.className = 'error-message';
                errorDiv.style.cssText = 'position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: #dc3545; text-align: center; z-index: 100;';
                windowEl.appendChild(errorDiv);
            }
            errorDiv.innerHTML = `<i class="fas fa-exclamation-triangle"></i><br>${state.error}`;
            return;
        }

        // Loading and loaded states are handled by loadModalityInWindow
        // which creates the viewer container HTML directly
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
        // Dispose viewer if present
        const state = windowStates[windowIndex];
        if (state.viewerInstance) {
            console.log(`Disposing viewer in window ${windowIndex}`);
            state.viewerInstance.dispose();
        }

        // Reset state
        windowStates[windowIndex] = {
            modality: null,
            loading: false,
            error: null,
            fileId: null,
            viewerInstance: null
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
