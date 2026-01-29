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
            const { windowIndex, crosshairPos } = event.detail;

            // Skip if source window has free-scroll enabled
            if (freeScrollWindows[windowIndex]) {
                return;
            }

            if (!crosshairPos) {
                return;
            }

            // Propagate 3D crosshair position to ALL windows (cross-orientation).
            // Scrolling in coronal moves the crosshair line in axial/sagittal, etc.
            for (let targetIdx = 0; targetIdx < 4; targetIdx++) {
                if (targetIdx === windowIndex) {
                    continue;
                }

                if (freeScrollWindows[targetIdx]) {
                    continue;
                }

                const targetViewer = windowStates[targetIdx].niivueInstance;
                if (targetViewer && targetViewer.isReady() && targetViewer.nv) {
                    targetViewer.nv.scene.crosshairPos = [...crosshairPos];
                    targetViewer.nv.updateGLVolume();

                    // Update target's slice counter
                    const targetEl = document.querySelector(`.viewer-window[data-window-index="${targetIdx}"]`);
                    const targetCounter = targetEl ? targetEl.querySelector('.slice-counter') : null;
                    if (targetCounter) {
                        const total = targetViewer.getSliceCount();
                        const idx = targetViewer.getSliceIndex();
                        targetCounter.textContent = `${idx + 1} / ${total}`;
                    }
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
                    <button class="reset-view-btn" title="Reset zoom and pan">
                        <i class="fas fa-compress-arrows-alt"></i>
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

            // Attach slice change callback for synchronization and slice counter
            viewer.onSliceChange(() => {
                const currentSliceIndex = viewer.getSliceIndex();
                const currentOrientation = windowStates[windowIndex].currentOrientation;
                const total = viewer.getSliceCount();

                // Update slice counter display
                const counter = windowEl.querySelector('.slice-counter');
                if (counter) {
                    counter.textContent = `${currentSliceIndex + 1} / ${total}`;
                }

                // Dispatch custom event for synchronization system
                window.dispatchEvent(new CustomEvent('sliceIndexChanged', {
                    detail: {
                        windowIndex: windowIndex,
                        sliceIndex: currentSliceIndex,
                        orientation: currentOrientation,
                        crosshairPos: viewer.nv ? [...viewer.nv.scene.crosshairPos] : null
                    }
                }));
            });

            // Add to synchronization group and adopt crosshair from any existing window
            updateOrientationGroup(windowIndex, windowStates[windowIndex].currentOrientation);
            if (!freeScrollWindows[windowIndex]) {
                // Find any other ready viewer and copy its full 3D crosshair position
                for (let i = 0; i < 4; i++) {
                    if (i === windowIndex) continue;
                    const other = windowStates[i].niivueInstance;
                    if (other && other.isReady() && other.nv && !freeScrollWindows[i]) {
                        viewer.nv.scene.crosshairPos = [...other.nv.scene.crosshairPos];
                        viewer.nv.updateGLVolume();
                        break;
                    }
                }
            }

            // Add slice counter element
            const sliceCounter = document.createElement('div');
            sliceCounter.className = 'slice-counter';
            const currentSlice = viewer.getSliceIndex();
            const totalSlices = viewer.getSliceCount();
            sliceCounter.textContent = `${currentSlice + 1} / ${totalSlices}`;
            windowEl.querySelector('.niivue-viewer-container').appendChild(sliceCounter);

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

                    // Update slice counter for new orientation
                    const counter = windowEl.querySelector('.slice-counter');
                    if (counter) {
                        const idx = viewer.getSliceIndex();
                        const total = viewer.getSliceCount();
                        counter.textContent = `${idx + 1} / ${total}`;
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

            // Attach Reset View button handler
            const resetViewBtn = windowEl.querySelector('.reset-view-btn');
            if (resetViewBtn) {
                resetViewBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (viewer.nv) {
                        viewer.nv.scene.pan2Dxyzmm = [0, 0, 0, 1];
                        viewer.nv.drawScene();
                    }
                });
            }

            // Custom scroll/zoom/pan handlers on canvas.
            // Use capture phase so we intercept before NiiVue's own handlers.
            const canvas = document.getElementById(canvasId);
            if (canvas) {
                // Disable NiiVue's default right-click behavior (intensity adjustment square)
                canvas.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    e.stopImmediatePropagation();

                    // Show custom context menu at cursor position
                    const rect = canvas.getBoundingClientRect();
                    showViewerContextMenu(e.clientX, e.clientY, windowIndex, viewer);
                }, { capture: true });

                // Shift+scroll: fast navigation (5 slices per step)
                // Ctrl+scroll: zoom in/out via setPan2Dxyzmm
                canvas.addEventListener('wheel', (e) => {
                    if (e.ctrlKey) {
                        e.preventDefault();
                        e.stopImmediatePropagation();
                        const nv = viewer.nv;
                        const pan = nv.scene.pan2Dxyzmm;
                        const currentZoom = pan[3] || 1;
                        const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
                        const newZoom = Math.max(1, Math.min(5, currentZoom * zoomFactor));

                        // Calculate mouse position relative to canvas center (in screen pixels)
                        const rect = canvas.getBoundingClientRect();
                        const mouseX = e.clientX - rect.left - rect.width / 2;
                        const mouseY = e.clientY - rect.top - rect.height / 2;

                        // Adjust pan to keep cursor position stationary during zoom
                        // Formula: newPan = oldPan + mouseOffset * (1 - newZoom/oldZoom)
                        const zoomRatio = newZoom / currentZoom;
                        const newPanX = pan[0] + mouseX * (1 - zoomRatio);
                        const newPanY = pan[1] - mouseY * (1 - zoomRatio); // Y inverted

                        // Apply new clamping formula - image border cannot exceed half window width
                        const maxPan = (canvas.clientWidth / 2) * (1 - 1/newZoom);
                        const clampedX = Math.max(-maxPan, Math.min(maxPan, newPanX));
                        const clampedY = Math.max(-maxPan, Math.min(maxPan, newPanY));

                        nv.scene.pan2Dxyzmm = [clampedX, clampedY, pan[2], newZoom];
                        nv.drawScene();
                    } else if (e.shiftKey) {
                        e.preventDefault();
                        e.stopImmediatePropagation();
                        const step = e.deltaY > 0 ? 5 : -5;
                        const current = viewer.getSliceIndex();
                        const total = viewer.getSliceCount();
                        const next = Math.max(0, Math.min(total - 1, current + step));
                        viewer.setSliceIndex(next);
                        viewer.nv.drawScene();
                    }
                }, { capture: true });

                // Ctrl+drag: pan the view via setPan2Dxyzmm
                let isPanning = false;
                let panStart = { x: 0, y: 0 };

                canvas.addEventListener('mousedown', (e) => {
                    if (e.ctrlKey && e.button === 0) {
                        isPanning = true;
                        panStart = { x: e.clientX, y: e.clientY };
                        e.preventDefault();
                        e.stopImmediatePropagation();
                        canvas.style.cursor = 'grabbing';
                    }
                }, { capture: true });

                canvas.addEventListener('mousemove', (e) => {
                    if (!isPanning) return;
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    const dx = e.clientX - panStart.x;
                    const dy = e.clientY - panStart.y;
                    const nv = viewer.nv;
                    const pan = nv.scene.pan2Dxyzmm;
                    const zoom = pan[3] || 1;
                    // Clamp pan so image edge can't go past canvas center.
                    // At zoom 1x the image fills the view, so no pan is useful.
                    // At higher zoom, allow proportional panning.
                    const maxPan = (canvas.clientWidth / 2) * (1 - 1/zoom);
                    const newX = Math.max(-maxPan, Math.min(maxPan, pan[0] + dx));
                    const newY = Math.max(-maxPan, Math.min(maxPan, pan[1] - dy));
                    nv.scene.pan2Dxyzmm = [newX, newY, pan[2], zoom];
                    nv.drawScene();
                    panStart = { x: e.clientX, y: e.clientY };
                }, { capture: true });

                const stopPan = () => {
                    if (isPanning) {
                        isPanning = false;
                        canvas.style.cursor = '';
                    }
                };
                canvas.addEventListener('mouseup', stopPan);
                canvas.addEventListener('mouseleave', stopPan);

                // Alt+left click: intensity adjustment (window/level)
                let isAdjustingIntensity = false;

                canvas.addEventListener('mousedown', (e) => {
                    if (e.altKey && e.button === 0) {
                        isAdjustingIntensity = true;
                        viewer.nv.opts.dragMode = window.niivue.DRAG_MODE.contrast;
                        canvas.style.cursor = 'crosshair';
                        // Do NOT preventDefault - let NiiVue handle the drag
                    }
                }, { capture: true });

                const stopIntensityAdjust = () => {
                    if (isAdjustingIntensity) {
                        isAdjustingIntensity = false;
                        viewer.nv.opts.dragMode = window.niivue.DRAG_MODE.none;
                        canvas.style.cursor = '';
                    }
                };
                canvas.addEventListener('mouseup', stopIntensityAdjust);
                canvas.addEventListener('mouseleave', stopIntensityAdjust);
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
        // Close context menu on click elsewhere
        document.addEventListener('click', () => {
            const existingMenu = document.getElementById('viewerContextMenu');
            if (existingMenu) {
                existingMenu.remove();
            }
        });
    }

    /**
     * Show context menu for viewer window at cursor position
     */
    function showViewerContextMenu(x, y, windowIndex, viewer) {
        // Remove existing menu
        const existingMenu = document.getElementById('viewerContextMenu');
        if (existingMenu) {
            existingMenu.remove();
        }

        const windowEl = document.querySelector(`.viewer-window[data-window-index="${windowIndex}"]`);
        const currentOrientation = windowStates[windowIndex].currentOrientation;
        const isFreeScroll = freeScrollWindows[windowIndex];

        // Create menu
        const menu = document.createElement('div');
        menu.id = 'viewerContextMenu';
        menu.className = 'viewer-context-menu';
        menu.style.top = `${y}px`;
        menu.style.left = `${x}px`;

        // Orientation section
        const orientSection = document.createElement('div');
        orientSection.className = 'context-menu-section';
        orientSection.innerHTML = '<div class="context-menu-label">Orientation</div>';

        const orientButtons = document.createElement('div');
        orientButtons.className = 'context-menu-orientation-buttons';
        ['axial', 'sagittal', 'coronal'].forEach(orient => {
            const btn = document.createElement('button');
            btn.textContent = orient[0].toUpperCase();
            btn.className = 'context-menu-orient-btn' + (orient === currentOrientation ? ' active' : '');
            btn.onclick = () => {
                viewer.setOrientation(orient);
                const menuBtns = windowEl.querySelectorAll('.orientation-btn');
                menuBtns.forEach(b => b.classList.remove('active'));
                const targetBtn = windowEl.querySelector(`.orientation-btn[data-orientation="${orient}"]`);
                if (targetBtn) targetBtn.classList.add('active');
                windowStates[windowIndex].currentOrientation = orient;
                updateOrientationGroup(windowIndex, orient);
                if (!freeScrollWindows[windowIndex]) {
                    const consensusSlice = getGroupConsensusSlice(orient);
                    viewer.setSliceIndex(consensusSlice);
                }
                menu.remove();
            };
            orientButtons.appendChild(btn);
        });
        orientSection.appendChild(orientButtons);
        menu.appendChild(orientSection);

        // Actions section
        const actionsSection = document.createElement('div');
        actionsSection.className = 'context-menu-section';

        // Reset view option
        const resetOption = createMenuOption(
            'compress-arrows-alt',
            'Reset View',
            () => {
                if (viewer.nv) {
                    viewer.nv.scene.pan2Dxyzmm = [0, 0, 0, 1];
                    viewer.nv.drawScene();
                }
                menu.remove();
            }
        );
        actionsSection.appendChild(resetOption);

        // Unlink/sync option
        const unlinkOption = createMenuOption(
            isFreeScroll ? 'link' : 'link-slash',
            isFreeScroll ? 'Re-sync Scrolling' : 'Unlink (Free Scroll)',
            () => {
                freeScrollWindows[windowIndex] = !freeScrollWindows[windowIndex];
                const freeScrollBtn = windowEl.querySelector('.free-scroll-btn');
                if (freeScrollBtn) {
                    const icon = freeScrollBtn.querySelector('i');
                    if (freeScrollWindows[windowIndex]) {
                        freeScrollBtn.classList.add('free-scroll-active');
                        icon.classList.remove('fa-link');
                        icon.classList.add('fa-link-slash');
                    } else {
                        freeScrollBtn.classList.remove('free-scroll-active');
                        icon.classList.remove('fa-link-slash');
                        icon.classList.add('fa-link');
                        const consensusSlice = getGroupConsensusSlice(windowStates[windowIndex].currentOrientation);
                        viewer.setSliceIndex(consensusSlice);
                    }
                }
                menu.remove();
            }
        );
        actionsSection.appendChild(unlinkOption);

        // Clear window option
        const clearOption = createMenuOption(
            'times',
            'Clear Window',
            () => {
                clearWindow(windowIndex);
                menu.remove();
            }
        );
        actionsSection.appendChild(clearOption);

        menu.appendChild(actionsSection);
        document.body.appendChild(menu);

        // Position menu to stay on screen
        const rect = menu.getBoundingClientRect();
        if (rect.right > window.innerWidth) {
            menu.style.left = `${x - rect.width}px`;
        }
        if (rect.bottom > window.innerHeight) {
            menu.style.top = `${y - rect.height}px`;
        }
    }

    /**
     * Helper to create context menu option
     */
    function createMenuOption(iconClass, text, onClick) {
        const option = document.createElement('div');
        option.className = 'context-menu-option';
        option.innerHTML = `<i class="fas fa-${iconClass} me-2"></i>${text}`;
        option.onclick = onClick;
        return option;
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
