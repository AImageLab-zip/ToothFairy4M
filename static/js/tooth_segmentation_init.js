window.ToothSegmentation = window.ToothSegmentation || {};

(function (ns) {
    async function init() {
        const root = document.getElementById('tooth-segmentation-root');
        if (!root) return;

        if (root.dataset.segmentationInitialized === '1') return;
        root.dataset.segmentationInitialized = '1';

        const state = {
            patientId: Number(root.dataset.patientId),
            apiUrl: '',
            saveApiUrl: '',

            thumbsContainer: document.getElementById('segmentation-thumbnails'),
            canvas: document.getElementById('segmentation-canvas'),
            ctx: null,

            modeBadge: document.getElementById('mode-badge'),
            zoomBadge: document.getElementById('zoom-badge'),
            saveStatus: document.getElementById('save-status'),
            canvasHelp: document.getElementById('canvas-help'),

            saveBtn: document.getElementById('save-segmentation-btn'),
            cancelBtn: document.getElementById('cancel-segmentation-btn'),

            zoomOutBtn: document.getElementById('zoom-out-btn'),
            zoomInBtn: document.getElementById('zoom-in-btn'),
            zoomResetBtn: document.getElementById('zoom-reset-btn'),

            fdiColorList: document.getElementById('fdi-color-list'),
            selectedColorPreview: document.getElementById('selected-color-preview'),
            selectedColorText: document.getElementById('selected-color-text'),

            selectedFdiEl: document.getElementById('selected-fdi'),
            selectedColorEl: document.getElementById('selected-color'),
            selectedSourceEl: document.getElementById('selected-source'),
            selectedAreaEl: document.getElementById('selected-area'),
            selectedCenterEl: document.getElementById('selected-center'),
            selectedStatusEl: document.getElementById('selected-status'),

            progressWrap: document.getElementById('segmentation-progress-wrap'),
            progressText: document.getElementById('segmentation-progress-text'),
            progressBar: document.getElementById('segmentation-progress-bar'),
            progressPercent: document.getElementById('segmentation-progress-percent'),

            canvasBusyOverlay: document.getElementById('canvas-busy-overlay'),
            canvasBusyText: document.getElementById('canvas-busy-text'),

            apiImages: [],
            editedImages: [],
            currentItem: null,
            currentImageIndex: null,
            selectedThumb: null,
            selectedAnnotationIndex: null,

            isEditMode: true,
            currentTool: 'select',
            zoomLevel: 1.0,

            drawingPoints: [],
            isDrawingAdd: false,

            splitLinePoints: [],
            isDrawingSplit: false,

            selectedFdiValue: '',
            selectedFdiColor: '',

            historyStack: [],
            MAX_HISTORY: 50,

            dragPointIndex: null,
            dragPointMode: null,
            selectedDragPointIndex: null,

            isPageDirty: false,
            imageCache: new Map(),
        };

        state.apiUrl = `/maxillo/api/patient/${state.patientId}/intraoral-segmentation/`;
        state.saveApiUrl = `/maxillo/api/patient/${state.patientId}/intraoral-segmentation/update/`;
        state.ctx = state.canvas.getContext('2d');

        function dedupeImagesForRender(images) {
            const seen = new Set();
            const result = [];

            for (const item of (images || [])) {
                const filename = String(item?.original?.filename || '').trim().toLowerCase();
                const url = String(item?.original?.url || '')
                    .trim()
                    .toLowerCase()
                    .split('?')[0]
                    .replace(/\\/g, '/');
                const index = Number.isFinite(item?.index) ? String(item.index) : '';
                const key = [index, filename, url].filter(Boolean).join('|');

                if (!key) continue;
                if (seen.has(key)) continue;

                seen.add(key);
                result.push(item);
            }

            return result;
        }

        function pushHistorySnapshot() {
            if (!state.currentItem || !state.currentItem.mask) return;

            state.historyStack.push({
                imageIndex: state.currentImageIndex,
                annotations: ns.cloneAnnotations(state.currentItem.mask.annotations)
            });

            if (state.historyStack.length > state.MAX_HISTORY) {
                state.historyStack.shift();
            }
        }

        function updateCursor(state) {
            if (!state.canvas) return;

            switch (state.currentTool) {
                case 'select':
                    state.canvas.style.cursor = 'pointer';
                    break;
                case 'add':
                case 'split':
                    state.canvas.style.cursor = 'crosshair';
                    break;
                case 'merge':
                case 'delete':
                    state.canvas.style.cursor = 'pointer';
                    break;
                default:
                    state.canvas.style.cursor = 'default';
            }
        }

        async function refreshFdiListAndRedraw(redrawResetZoom = false) {
            ns.populateFdiList(state, async () => {
                if (state.currentItem) {
                    await ns.drawOverlay(state, state.currentItem, false);
                }
            });

            ns.updateSelectedInfo(state);

            if (state.currentItem) {
                await ns.drawOverlay(state, state.currentItem, redrawResetZoom);
            }
        }

        async function undoLastAction() {
            if (!state.historyStack.length || !state.currentItem) return false;

            const snapshot = state.historyStack.pop();
            const targetItem = state.editedImages.find(x => x.index === snapshot.imageIndex);
            if (!targetItem || !targetItem.mask) return false;

            targetItem.mask.annotations = ns.cloneAnnotations(snapshot.annotations);

            if (state.currentImageIndex === snapshot.imageIndex) {
                state.currentItem = targetItem;
                state.selectedAnnotationIndex = null;
                state.drawingPoints = [];
                state.splitLinePoints = [];
                state.isDrawingAdd = false;
                state.isDrawingSplit = false;
                state.dragPointIndex = null;
                state.dragPointMode = null;
                state.selectedDragPointIndex = null;

                ns.markCurrentDirty(state);
                await refreshFdiListAndRedraw(false);
            }

            return true;
        }

        ns.populateFdiList(state, async () => {
            if (state.currentItem) {
                await ns.drawOverlay(state, state.currentItem, false);
            }
        });

        state.canvas.addEventListener('mousedown', (evt) => {
            if (!state.currentItem || !state.isEditMode) return;

            const { x, y } = ns.getCanvasCoords(state, evt);

            if (state.currentTool === 'select' && state.selectedAnnotationIndex !== null) {
                const idx = ns.findNearbySelectedContourPoint(state, x, y, 10);
                if (idx !== null) {
                    pushHistorySnapshot();
                    state.selectedDragPointIndex = idx;
                    state.dragPointMode = 'selected-contour';
                    return;
                }
            }

            if (state.currentTool === 'add' && state.drawingPoints.length) {
                const idx = ns.findNearbyPoint(state.drawingPoints, x, y, 10);
                if (idx !== null) {
                    state.dragPointIndex = idx;
                    state.dragPointMode = 'add';
                    return;
                }
            }

            if (state.currentTool === 'split' && state.splitLinePoints.length) {
                const idx = ns.findNearbyPoint(state.splitLinePoints, x, y, 10);
                if (idx !== null) {
                    state.dragPointIndex = idx;
                    state.dragPointMode = 'split';
                }
            }
        });

        state.canvas.addEventListener('mousemove', async (evt) => {
            if ((state.dragPointIndex === null && state.selectedDragPointIndex === null) || !state.dragPointMode) return;

            const { x, y } = ns.getCanvasCoords(state, evt);

            if (state.dragPointMode === 'add' && state.dragPointIndex !== null) {
                state.drawingPoints[state.dragPointIndex] = [x, y];
            } else if (state.dragPointMode === 'split' && state.dragPointIndex !== null) {
                state.splitLinePoints[state.dragPointIndex] = [x, y];
            } else if (state.dragPointMode === 'selected-contour' && state.selectedDragPointIndex !== null) {
                const annotations = ns.getCurrentAnnotations(state);
                const ann = (state.selectedAnnotationIndex !== null && annotations[state.selectedAnnotationIndex])
                    ? annotations[state.selectedAnnotationIndex]
                    : null;

                if (
                    ann &&
                    Array.isArray(ann.contour) &&
                    state.selectedDragPointIndex >= 0 &&
                    state.selectedDragPointIndex < ann.contour.length
                ) {
                    ann.contour[state.selectedDragPointIndex] = [x, y];
                    ann.source = ann.source || 'edited';
                    ns.markCurrentDirty(state);
                }
            }

            if (state.currentItem) {
                await ns.drawOverlay(state, state.currentItem);
            }
        });

        state.canvas.addEventListener('mouseup', () => ns.stopPointDrag(state));
        state.canvas.addEventListener('mouseleave', () => ns.stopPointDrag(state));

        state.canvas.addEventListener('click', async (evt) => {
            if (!state.currentItem) return;
            if (state.dragPointIndex !== null || state.selectedDragPointIndex !== null) return;

            const { x, y } = ns.getCanvasCoords(state, evt);
            const hitIndex = ns.findAnnotationAtPoint(state, x, y);

            if (state.currentTool === 'delete' && state.isEditMode) {
                if (hitIndex !== null) {
                    pushHistorySnapshot();
                }

                const btnState = ns.getButtonState(state);
                const result = window.FunctionOfButton.deleteMask(btnState, hitIndex);
                ns.applyButtonState(state, btnState);

                if (result.ok) {
                    ns.updateSelectedInfo(state);
                    await ns.drawOverlay(state, state.currentItem);
                }
                return;
            }

            if (state.currentTool === 'add' && state.isEditMode) {
                if (!state.isDrawingAdd) {
                    const btnState = ns.getButtonState(state);
                    window.FunctionOfButton.startAddMode(btnState);
                    ns.applyButtonState(state, btnState);
                }

                state.drawingPoints.push([x, y]);

                if (state.drawingPoints.length >= 3) {
                    const firstPoint = state.drawingPoints[0];
                    const lastPoint = state.drawingPoints[state.drawingPoints.length - 1];
                    const closeDistance = ns.distanceBetweenPoints(firstPoint, lastPoint);

                    if (closeDistance <= 12) {
                        state.drawingPoints[state.drawingPoints.length - 1] = [...firstPoint];

                        pushHistorySnapshot();
                        const btnState = ns.getButtonState(state);
                        const result = window.FunctionOfButton.finishAddMode(btnState);
                        ns.applyButtonState(state, btnState);

                        if (!result.ok) {
                            alert(result.message || 'Failed to add object.');
                            return;
                        }

                        ns.updateSelectedInfo(state);
                        await refreshFdiListAndRedraw(false);
                        return;
                    }
                }

                await ns.drawOverlay(state, state.currentItem);
                return;
            }

            if (state.currentTool === 'split' && state.isEditMode) {
                if (!state.isDrawingSplit) {
                    const btnState = ns.getButtonState(state);
                    window.FunctionOfButton.startSplitMode(btnState);
                    ns.applyButtonState(state, btnState);
                }

                state.splitLinePoints.push([x, y]);
                await ns.drawOverlay(state, state.currentItem);
                return;
            }

            if (state.currentTool === 'merge' && state.isEditMode) {
                state.selectedAnnotationIndex = hitIndex;
                if (state.selectedAnnotationIndex === null) {
                    ns.updateSelectedInfo(state);
                    await ns.drawOverlay(state, state.currentItem);
                    return;
                }

                pushHistorySnapshot();
                const btnState = ns.getButtonState(state);
                const result = window.FunctionOfButton.mergeNearest(btnState);
                ns.applyButtonState(state, btnState);

                if (!result.ok) {
                    alert(result.message || 'Merge failed.');
                    return;
                }

                ns.updateSelectedInfo(state);
                await refreshFdiListAndRedraw(false);
                return;
            }

            state.selectedAnnotationIndex = hitIndex;
            ns.updateSelectedInfo(state);
            await ns.drawOverlay(state, state.currentItem);
        });

        state.canvas.addEventListener('dblclick', async (evt) => {
            if (!state.currentItem || !state.isEditMode) return;

            evt.preventDefault();

            if (state.currentTool === 'add' && state.isDrawingAdd) {
                pushHistorySnapshot();
                const btnState = ns.getButtonState(state);
                const result = window.FunctionOfButton.finishAddMode(btnState);
                ns.applyButtonState(state, btnState);

                if (!result.ok) {
                    alert(result.message || 'Failed to add object.');
                    return;
                }

                ns.updateSelectedInfo(state);
                await refreshFdiListAndRedraw(false);
                return;
            }

            if (state.currentTool === 'split' && state.isDrawingSplit) {
                pushHistorySnapshot();
                const btnState = ns.getButtonState(state);
                const result = window.FunctionOfButton.finishSplitMode(btnState);
                ns.applyButtonState(state, btnState);

                if (!result.ok) {
                    alert(result.message || 'Split failed.');
                    return;
                }

                ns.updateSelectedInfo(state);
                await refreshFdiListAndRedraw(false);
            }
        });

        state.canvas.addEventListener('wheel', async (evt) => {
            if (!(evt.ctrlKey || evt.altKey)) return;

            evt.preventDefault();

            const step = 0.05;
            if (evt.deltaY < 0) {
                state.zoomLevel = Math.min(3, state.zoomLevel + step);
            } else {
                state.zoomLevel = Math.max(0.05, state.zoomLevel - step);
            }

            ns.updateZoomBadge(state);
            if (state.currentItem) {
                await ns.drawOverlay(state, state.currentItem);
            }
        }, { passive: false });

        window.addEventListener('keydown', async (evt) => {
            if (!state.isEditMode || !state.currentItem) return;

            const isUndoShortcut = (evt.ctrlKey || evt.metaKey) && evt.key.toLowerCase() === 'z';

            if (isUndoShortcut && !state.isDrawingAdd && !state.isDrawingSplit) {
                evt.preventDefault();
                const ok = await undoLastAction();
                if (ok) {
                    state.canvasHelp.textContent = 'Last action undone.';
                }
                return;
            }

            if (state.currentTool === 'add' && state.isDrawingAdd) {
                if (evt.key === 'Enter') {
                    evt.preventDefault();
                    pushHistorySnapshot();

                    const btnState = ns.getButtonState(state);
                    const result = window.FunctionOfButton.finishAddMode(btnState);
                    ns.applyButtonState(state, btnState);

                    if (!result.ok) {
                        alert(result.message || 'Failed to add object.');
                        return;
                    }

                    ns.updateSelectedInfo(state);
                    await refreshFdiListAndRedraw(false);
                    return;
                }

                if (evt.key === 'Escape') {
                    evt.preventDefault();
                    const btnState = ns.getButtonState(state);
                    window.FunctionOfButton.cancelAddMode(btnState);
                    ns.applyButtonState(state, btnState);
                    await ns.drawOverlay(state, state.currentItem);
                    return;
                }

                if (evt.key === 'Backspace' || isUndoShortcut) {
                    evt.preventDefault();
                    if (state.drawingPoints.length > 0) {
                        state.drawingPoints.pop();
                        await ns.drawOverlay(state, state.currentItem);
                    }
                    return;
                }
            }

            if (state.currentTool === 'split' && state.isDrawingSplit) {
                if (evt.key === 'Enter') {
                    evt.preventDefault();
                    pushHistorySnapshot();

                    const btnState = ns.getButtonState(state);
                    const result = window.FunctionOfButton.finishSplitMode(btnState);
                    ns.applyButtonState(state, btnState);

                    if (!result.ok) {
                        alert(result.message || 'Split failed.');
                        return;
                    }

                    ns.updateSelectedInfo(state);
                    await refreshFdiListAndRedraw(false);
                    return;
                }

                if (evt.key === 'Escape') {
                    evt.preventDefault();
                    const btnState = ns.getButtonState(state);
                    window.FunctionOfButton.cancelSplitMode(btnState);
                    ns.applyButtonState(state, btnState);
                    await ns.drawOverlay(state, state.currentItem);
                    return;
                }

                if (evt.key === 'Backspace' || isUndoShortcut) {
                    evt.preventDefault();
                    if (state.splitLinePoints.length > 0) {
                        state.splitLinePoints.pop();
                        await ns.drawOverlay(state, state.currentItem);
                    }
                    return;
                }
            }
        });

        document.querySelectorAll('.tool-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                ns.setTool(state, btn.dataset.tool);
                updateCursor(state);

                if (state.currentTool === 'add') {
                    const btnState = ns.getButtonState(state);
                    window.FunctionOfButton.startAddMode(btnState);
                    ns.applyButtonState(state, btnState);
                }

                if (state.currentTool === 'split') {
                    const btnState = ns.getButtonState(state);
                    window.FunctionOfButton.startSplitMode(btnState);
                    ns.applyButtonState(state, btnState);
                }

                ns.updateSelectedInfo(state);
                if (state.currentItem) {
                    await ns.drawOverlay(state, state.currentItem);
                }
            });
        });

        state.cancelBtn.addEventListener('click', async () => {
            state.drawingPoints = [];
            state.isDrawingAdd = false;
            state.splitLinePoints = [];
            state.isDrawingSplit = false;
            state.dragPointIndex = null;
            state.dragPointMode = null;
            state.selectedDragPointIndex = null;

            state.editedImages = ns.deepClone(state.apiImages);
            state.currentItem = state.editedImages.find(x => x.index === state.currentImageIndex) || state.editedImages[0] || null;
            state.selectedAnnotationIndex = null;
            state.historyStack = [];
            ns.setEditMode(state, true);
            ns.updateSaveStatus(state);

            await refreshFdiListAndRedraw(true);
        });

        state.saveBtn.addEventListener('click', async () => {
            const payload = {
                patientId: state.patientId,
                images: state.editedImages
                    .filter(item => item && Number.isFinite(item.index))
                    .map(item => ({
                        index: item.index,
                        annotations: (item.mask && Array.isArray(item.mask.annotations))
                            ? item.mask.annotations.map(ann => ({
                                fdi: ann.fdi || '',
                                FDI_NUM: ann.fdi || '',
                                color: ann.color || '',
                                class_name: ann.class_name || 'tooth',
                                appearance_idx: ann.appearance_idx || 0,
                                arch: ann.arch || null,
                                contour: Array.isArray(ann.contour) ? ann.contour : [],
                                contours: Array.isArray(ann.contours) ? ann.contours : (
                                    Array.isArray(ann.contour) ? [ann.contour] : []
                                ),
                            }))
                            : []
                    }))
            };

            try {
                const totalViews = payload.images.length;

                ns.showProgress(state, `Preparing ${totalViews} view(s) for save...`, 10);
                ns.setCanvasBusy(state, true, `Saving ${totalViews} view(s)...`);
                state.saveStatus.textContent = `Saving ${totalViews} view(s)...`;
                state.saveStatus.className = 'small text-primary fw-semibold';

                for (let i = 0; i < totalViews; i++) {
                    ns.updateProgress(state, `Preparing save data ${i + 1} / ${totalViews}...`, i + 1, totalViews);
                    await new Promise(resolve => setTimeout(resolve, 0));
                }

                ns.showProgress(state, `Saving the update ${totalViews} view(s)...`, 75);

                const response = await fetch(state.saveApiUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRFToken': ns.getCsrfToken()
                    },
                    body: JSON.stringify(payload)
                });

                ns.showProgress(state, 'Finalizing save...', 90);

                if (!response.ok) {
                    let errorMessage = 'Failed to save segmentation changes.';
                    try {
                        const data = await response.json();
                        if (data && data.error) errorMessage = data.error;
                    } catch (e) {}

                    ns.showProgress(state, errorMessage, 100);
                    state.saveStatus.textContent = errorMessage;
                    state.saveStatus.className = 'small text-danger fw-semibold';
                    ns.setCanvasBusy(state, false);
                    setTimeout(() => ns.hideProgress(state), 2000);
                    return;
                }

                const result = await response.json();

                state.apiImages = ns.deepClone(state.editedImages);
                state.editedImages.forEach(item => { item._dirty = false; });
                state.isPageDirty = false;
                state.historyStack = [];

                ns.updateSaveStatus(state);
                ns.setEditMode(state, true);

                const updatedCount = result.updated_count || totalViews;

                ns.showProgress(state, `Successfully saved ${updatedCount} view(s).`, 100);
                state.saveStatus.textContent = `Successfully saved ${updatedCount} view(s).`;
                state.saveStatus.className = 'small text-success fw-semibold';
                ns.setCanvasBusy(state, false);
                setTimeout(() => ns.hideProgress(state), 1400);
            } catch (err) {
                console.error(err);
                ns.showProgress(state, 'Save request failed.', 100);
                state.saveStatus.textContent = 'Save request failed.';
                state.saveStatus.className = 'small text-danger fw-semibold';
                ns.setCanvasBusy(state, false);
                setTimeout(() => ns.hideProgress(state), 2000);
            }
        });

        state.zoomInBtn.addEventListener('click', async () => {
            state.zoomLevel = Math.min(3, state.zoomLevel + 0.05);
            ns.updateZoomBadge(state);
            if (state.currentItem) await ns.drawOverlay(state, state.currentItem);
        });

        state.zoomOutBtn.addEventListener('click', async () => {
            state.zoomLevel = Math.max(0.05, state.zoomLevel - 0.05);
            ns.updateZoomBadge(state);
            if (state.currentItem) await ns.drawOverlay(state, state.currentItem);
        });

        state.zoomResetBtn.addEventListener('click', async () => {
            if (state.currentItem) {
                await ns.drawOverlay(state, state.currentItem, true);
            }
        });

        window.addEventListener('beforeunload', function (e) {
            const hasChanges = state.editedImages.some(item => item._dirty);
            if (!hasChanges) return;

            e.preventDefault();
            e.returnValue = '';
        });

        ns.updateModeBadge(state);
        ns.updateZoomBadge(state);
        ns.updateSaveStatus(state);
        ns.updateSelectedInfo(state);
        ns.setEditMode(state, true);
        ns.setTool(state, 'select');
        updateCursor(state);

        try {
            ns.showProgress(state, 'Loading segmentation data...', 5);
            ns.setCanvasBusy(state, true, 'Loading segmentation...');

            const response = await fetch(state.apiUrl);
            ns.showProgress(state, 'Processing server response...', 20);

            const data = await response.json();
            ns.showProgress(state, 'Preparing segmentation views...', 35);

            if (!response.ok) {
                state.thumbsContainer.innerHTML = `<div class="text-danger">${data.error || 'Failed to load segmentation data.'}</div>`;
                ns.setCanvasBusy(state, false);
                ns.showProgress(state, data.error || 'Failed to load segmentation data.', 100);
                setTimeout(() => ns.hideProgress(state), 1800);
                return;
            }

            const rawImages = Array.isArray(data.images) ? data.images : [];
            state.apiImages = ns.dedupeImages(rawImages);
            state.apiImages = dedupeImagesForRender(state.apiImages);
            state.editedImages = ns.deepClone(state.apiImages);

            state.thumbsContainer.innerHTML = '';
            state.selectedThumb = null;

            if (state.editedImages.length > 0) {
                state.currentItem = state.editedImages[0];
                state.currentImageIndex = state.currentItem.index;

                ns.populateFdiList(state, async () => {
                    if (state.currentItem) {
                        await ns.drawOverlay(state, state.currentItem, false);
                    }
                });

                ns.updateSelectedInfo(state);

                ns.showProgress(state, 'Rendering first view...', 50);
                await ns.drawOverlay(state, state.currentItem, true);

                ns.showProgress(state, 'Loading thumbnails...', 60);
                const thumbWrappers = await ns.renderThumbnails(state, state.editedImages);

                if (thumbWrappers[0]) {
                    thumbWrappers[0].classList.add('active-thumb');
                    state.selectedThumb = thumbWrappers[0];
                }

                ns.showProgress(state, `Loaded ${state.editedImages.length} view(s).`, 100);
                ns.setCanvasBusy(state, false);
                setTimeout(() => ns.hideProgress(state), 1000);
            } else {
                state.thumbsContainer.innerHTML = `<div class="small text-muted p-2">No views available.</div>`;
                ns.showProgress(state, 'No views available.', 100);
                ns.setCanvasBusy(state, false);
                setTimeout(() => ns.hideProgress(state), 1500);
            }
        } catch (error) {
            console.error(error);
            state.thumbsContainer.innerHTML = `<div class="text-danger">Failed to load segmentation data.</div>`;
            ns.showProgress(state, 'Failed to load segmentation data.', 100);
            ns.setCanvasBusy(state, false);
            setTimeout(() => ns.hideProgress(state), 1800);
        }
    }

    ns.init = init;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            ns.init();
        });
    } else {
        ns.init();
    }
})(window.ToothSegmentation);