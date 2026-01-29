/**
 * Viewer Grid - Drag-drop interaction for multi-window MRI viewer
 *
 * Manages state for 4 viewer windows and drag-drop loading of modalities.
 * Each window gets its own NiiVueViewer instance for true multi-window support.
 */

const ViewerGrid = (function() {
    'use strict';

    // Cache for fetched volume blobs (keyed by fileId)
    // Note: Cache persists across window clears for network optimization
    const volumeCache = {};

    // Window state for 4 grid positions
    const windowStates = {
        0: { modality: null, loading: false, error: null, fileId: null, niivueInstance: null, currentOrientation: 'axial' },
        1: { modality: null, loading: false, error: null, fileId: null, niivueInstance: null, currentOrientation: 'axial' },
        2: { modality: null, loading: false, error: null, fileId: null, niivueInstance: null, currentOrientation: 'axial' },
        3: { modality: null, loading: false, error: null, fileId: null, niivueInstance: null, currentOrientation: 'axial' }
    };

    // Synchronization groups - windows viewing the same orientation scroll together
    const synchronizationGroups = {
        'axial': [],
        'sagittal': [],
        'coronal': []
    };

    // Free scroll state - tracks which windows have free-scroll enabled
    const freeScrollWindows = {
        0: false,
        1: false,
        2: false,
        3: false
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

        // Initialize synchronization system
        initSynchronization();

        console.log('ViewerGrid initialized', { djangoData, windowStates });
    }

    /**
     * Initialize synchronization event system
     * Listens for sliceIndexChanged events and propagates to synchronized windows
     */
    function initSynchronization() {
        window.addEventListener('sliceIndexChanged', (event) => {
            const { windowIndex, sliceIndex, orientation } = event.detail;

            // Skip if this window has free-scroll enabled
            if (freeScrollWindows[windowIndex]) {
                return;
            }

            // Get all other windows in the same orientation group
            const group = synchronizationGroups[orientation];
            if (!group) {
                return;
            }

            // Propagate slice change to all other windows in group (except source)
            for (const targetWindowIndex of group) {
                if (targetWindowIndex === windowIndex) {
                    continue; // Skip source window
                }

                // Skip if target has free-scroll enabled
                if (freeScrollWindows[targetWindowIndex]) {
                    continue;
                }

                const targetViewer = windowStates[targetWindowIndex].niivueInstance;
                const targetOrientation = windowStates[targetWindowIndex].currentOrientation;

                // Only sync if orientations match and viewer is ready
                if (targetViewer && targetViewer.isReady() && targetOrientation === orientation) {
                    targetViewer.setSliceIndex(sliceIndex);
                }
            }
        });
    }

    /**
     * Update synchronization group membership for a window
     * Removes from old group and adds to new group
     * @param {number} windowIndex - 0-3 for grid position
     * @param {string} newOrientation - 'axial', 'sagittal', or 'coronal'
     */
    function updateOrientationGroup(windowIndex, newOrientation) {
        // Remove from all groups
        for (const orientation in synchronizationGroups) {
            const index = synchronizationGroups[orientation].indexOf(windowIndex);
            if (index > -1) {
                synchronizationGroups[orientation].splice(index, 1);
            }
        }

        // Add to new group
        if (synchronizationGroups[newOrientation]) {
            synchronizationGroups[newOrientation].push(windowIndex);
            console.log(`Window ${windowIndex} joined ${newOrientation} group:`, synchronizationGroups[newOrientation]);
        }
    }

    /**
     * Get consensus slice index for an orientation group
     * Returns the slice index from the first ready viewer in the group
     * @param {string} orientation - 'axial', 'sagittal', or 'coronal'
     * @returns {number} Slice index, or 0 if no viewers ready
     */
    function getGroupConsensusSlice(orientation) {
        const group = synchronizationGroups[orientation];
        if (!group || group.length === 0) {
            return 0;
        }

        // Find first ready viewer in group
        for (const windowIndex of group) {
            const viewer = windowStates[windowIndex].niivueInstance;
            if (viewer && viewer.isReady() && !freeScrollWindows[windowIndex]) {
                return viewer.getSliceIndex();
            }
        }

        return 0;
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
     * Each window gets its own NiiVueViewer instance
     * @param {number} windowIndex - 0-3 for grid position
     * @param {string} modality - Modality slug (e.g. 'braintumor-mri-t1')
     * @param {string|null} fileId - FileRegistry ID for this modality
     */
    async function loadModalityInWindow(windowIndex, modality, fileId) {
        console.log(`Loading ${modality} (fileId: ${fileId}) in window ${windowIndex}`);

        const windowEl = document.querySelector(`.viewer-window[data-window-index="${windowIndex}"]`);
        if (!windowEl) {
            console.error(`Window element not found for index ${windowIndex}`);
            return;
        }

        // Dispose existing viewer if present
        const existingState = windowStates[windowIndex];
        if (existingState.niivueInstance) {
            console.log(`Disposing previous NiiVue viewer in window ${windowIndex}`);
            try {
                existingState.niivueInstance.dispose();
            } catch (e) {
                console.warn('Error disposing previous viewer:', e);
            }
        }

        // Update state to loading
        windowStates[windowIndex] = {
            modality: modality,
            loading: true,
            error: null,
            fileId: fileId,
            niivueInstance: null,
            currentOrientation: 'axial'
        };

        // Create viewer container structure with canvas and orientation menu
        const canvasId = `niivue-canvas-${windowIndex}`;
        const viewerHTML = `
            <div class="niivue-viewer-container" style="width: 100%; height: 100%; position: relative;">
                <div class="niivue-loading" style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.8); z-index: 10;">
                    <div class="spinner-border text-primary" role="status">
                        <span class="visually-hidden">Loading...</span>
                    </div>
                </div>
                <canvas id="${canvasId}" class="niivue-canvas"></canvas>
                <div class="orientation-menu">
                    <button class="orientation-btn active" data-orientation="axial">A</button>
                    <button class="orientation-btn" data-orientation="sagittal">S</button>
                    <button class="orientation-btn" data-orientation="coronal">C</button>
                    <button class="free-scroll-btn" title="Toggle free scroll">
                        <i class="fas fa-link"></i>
                    </button>
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

        // Check if NiiVueViewer class is available
        if (!window.NiiVueViewer) {
            console.error('NiiVueViewer not loaded');
            windowStates[windowIndex].loading = false;
            windowStates[windowIndex].error = 'NiiVueViewer not loaded';
            updateWindowUI(windowIndex);
            return;
        }

        // Fetch file blob from API (with caching)
        try {
            let fileBlob;
            if (volumeCache[fileId]) {
                console.log(`Using cached blob for fileId ${fileId}`);
                fileBlob = volumeCache[fileId];
            } else {
                console.log(`Fetching blob for fileId ${fileId}`);
                const response = await fetch(`/api/processing/files/serve/${fileId}/`);
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                fileBlob = await response.blob();
                volumeCache[fileId] = fileBlob;
                console.log(`File blob received and cached: ${fileBlob.size} bytes`);
            }

            // Create new NiiVueViewer instance for this window
            const viewer = new window.NiiVueViewer(canvasId);

            // Initialize viewer with modality and blob
            await viewer.init(modality, fileBlob);

            // Store instance in state
            windowStates[windowIndex].niivueInstance = viewer;
            windowStates[windowIndex].loading = false;
            windowStates[windowIndex].error = null;

            // Hide loading spinner
            const loadingDiv = windowEl.querySelector('.niivue-loading');
            if (loadingDiv) {
                loadingDiv.style.display = 'none';
            }

            // Attach slice change callback for synchronization
            viewer.onSliceChange(() => {
                const currentSliceIndex = viewer.getSliceIndex();
                const currentOrientation = windowStates[windowIndex].currentOrientation;

                // Dispatch custom event for synchronization system
                window.dispatchEvent(new CustomEvent('sliceIndexChanged', {
                    detail: {
                        windowIndex: windowIndex,
                        sliceIndex: currentSliceIndex,
                        orientation: currentOrientation
                    }
                }));
            });

            // Add to synchronization group
            updateOrientationGroup(windowIndex, windowStates[windowIndex].currentOrientation);

            // Attach orientation menu event handlers
            const menuBtns = windowEl.querySelectorAll('.orientation-btn');
            menuBtns.forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation(); // Prevent click from reaching NiiVue canvas
                    const orientation = btn.dataset.orientation;
                    viewer.setOrientation(orientation);
                    menuBtns.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    windowStates[windowIndex].currentOrientation = orientation;

                    // Update synchronization group
                    updateOrientationGroup(windowIndex, orientation);

                    // Sync to group consensus slice (unless free-scrolling)
                    if (!freeScrollWindows[windowIndex]) {
                        const consensusSlice = getGroupConsensusSlice(orientation);
                        viewer.setSliceIndex(consensusSlice);
                    }
                });
            });

            // Attach Free Scroll button handler
            const freeScrollBtn = windowEl.querySelector('.free-scroll-btn');
            if (freeScrollBtn) {
                freeScrollBtn.addEventListener('click', (e) => {
                    e.stopPropagation(); // Prevent click from reaching NiiVue canvas

                    // Toggle free-scroll state
                    freeScrollWindows[windowIndex] = !freeScrollWindows[windowIndex];

                    // Update button appearance
                    const icon = freeScrollBtn.querySelector('i');
                    if (freeScrollWindows[windowIndex]) {
                        // Free-scroll enabled (unlinked)
                        freeScrollBtn.classList.add('free-scroll-active');
                        icon.classList.remove('fa-link');
                        icon.classList.add('fa-link-slash');
                        freeScrollBtn.title = 'Re-sync scrolling';
                    } else {
                        // Free-scroll disabled (re-sync)
                        freeScrollBtn.classList.remove('free-scroll-active');
                        icon.classList.remove('fa-link-slash');
                        icon.classList.add('fa-link');
                        freeScrollBtn.title = 'Toggle free scroll';

                        // Re-sync to group consensus slice
                        const currentOrientation = windowStates[windowIndex].currentOrientation;
                        const consensusSlice = getGroupConsensusSlice(currentOrientation);
                        viewer.setSliceIndex(consensusSlice);
                    }

                    console.log(`Window ${windowIndex} free-scroll: ${freeScrollWindows[windowIndex]}`);
                });
            }

            // Mark window as loaded
            windowEl.classList.add('loaded');

            console.log(`Successfully loaded ${modality} in window ${windowIndex} using NiiVue`);

        } catch (error) {
            console.error(`Error loading ${modality} in window ${windowIndex}:`, error);

            // Determine user-friendly message
            let userMessage = 'Failed to load volume';
            if (error.message.includes('HTTP 404')) {
                userMessage = 'Volume file not found';
            } else if (error.message.includes('HTTP 403')) {
                userMessage = 'Access denied to volume';
            } else if (error.message.includes('network') || error.message.includes('fetch') || error.message.includes('Failed to fetch')) {
                userMessage = 'Network error - check connection';
            }

            windowStates[windowIndex].loading = false;
            windowStates[windowIndex].error = userMessage;

            // Show error UI with retry button
            const loadingDiv = windowEl.querySelector('.niivue-loading');
            if (loadingDiv) {
                loadingDiv.style.display = 'none';
            }

            // Remove existing viewer container and replace with error
            const viewerContainerEl = windowEl.querySelector('.niivue-viewer-container');
            if (viewerContainerEl) {
                viewerContainerEl.innerHTML = `
                    <div class="viewer-error">
                        <i class="fas fa-exclamation-triangle"></i>
                        <p>${userMessage}</p>
                        <button class="btn btn-sm btn-outline-light retry-btn"
                                data-window="${windowIndex}"
                                data-modality="${modality}"
                                data-file-id="${fileId}">
                            <i class="fas fa-redo me-1"></i>Retry
                        </button>
                    </div>
                `;

                // Attach retry handler
                const retryBtn = viewerContainerEl.querySelector('.retry-btn');
                if (retryBtn) {
                    retryBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const w = parseInt(e.currentTarget.dataset.window, 10);
                        const m = e.currentTarget.dataset.modality;
                        const f = e.currentTarget.dataset.fileId;
                        loadModalityInWindow(w, m, f);
                    });
                }
            }
        }
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
            // Hide loading spinner if present
            const loadingDiv = windowEl.querySelector('.niivue-loading');
            if (loadingDiv) {
                loadingDiv.style.display = 'none';
            }

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
        // Dispose NiiVue viewer if present
        const state = windowStates[windowIndex];
        if (state.niivueInstance) {
            console.log(`Disposing NiiVue viewer in window ${windowIndex}`);
            try {
                state.niivueInstance.dispose();
            } catch (e) {
                console.warn('Error disposing viewer:', e);
            }
        }

        // Remove from synchronization groups
        for (const orientation in synchronizationGroups) {
            const index = synchronizationGroups[orientation].indexOf(windowIndex);
            if (index > -1) {
                synchronizationGroups[orientation].splice(index, 1);
            }
        }

        // Reset free scroll state
        freeScrollWindows[windowIndex] = false;

        // Reset state
        windowStates[windowIndex] = {
            modality: null,
            loading: false,
            error: null,
            fileId: null,
            niivueInstance: null,
            currentOrientation: 'axial'
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
