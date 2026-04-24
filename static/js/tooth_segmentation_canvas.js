window.ToothSegmentation = window.ToothSegmentation || {};

(function (ns) {
    ns.drawContourOnContext = function (targetCtx, contour, fillStyle, isSelected = false) {
        const pts = ns.normalizeContour(contour);
        if (pts.length < 3) return false;

        targetCtx.save();
        targetCtx.beginPath();
        targetCtx.moveTo(pts[0][0], pts[0][1]);

        for (let i = 1; i < pts.length; i++) {
            targetCtx.lineTo(pts[i][0], pts[i][1]);
        }

        targetCtx.closePath();
        targetCtx.fillStyle = fillStyle;
        targetCtx.fill();

        targetCtx.lineWidth = isSelected ? 8 : 2;
        targetCtx.strokeStyle = isSelected ? 'rgba(0,123,255,0.95)' : 'rgba(255,255,255,0.95)';
        targetCtx.stroke();

        targetCtx.lineWidth = 1;
        targetCtx.strokeStyle = 'rgba(0,0,0,0.35)';
        targetCtx.stroke();
        targetCtx.restore();

        return true;
    };

    ns.drawLabelOnContext = function (targetCtx, text, x, y, fontSize = 28) {
        if (text === null || text === undefined || text === '') return;

        targetCtx.save();
        targetCtx.font = `bold ${fontSize}px Arial`;
        targetCtx.textAlign = 'center';
        targetCtx.textBaseline = 'middle';
        targetCtx.fillStyle = 'black';
        targetCtx.shadowColor = 'rgba(255,255,255,0.45)';
        targetCtx.shadowBlur = 1;
        targetCtx.fillText(String(text), x, y);
        targetCtx.restore();
    };

    ns.getAdaptiveLabelFontSize = function (contour, displayScale = 1, options = {}) {
        const pts = ns.normalizeContour(contour);
        if (!pts.length) {
            return options.fallbackCanvasFont || 24;
        }

        let minX = pts[0][0];
        let maxX = pts[0][0];
        let minY = pts[0][1];
        let maxY = pts[0][1];

        for (const [x, y] of pts) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
        }

        const width = Math.max(1, maxX - minX);
        const height = Math.max(1, maxY - minY);
        const minSide = Math.min(width, height);

        const safeScale = Math.max(displayScale || 1, 0.01);
        const visibleMinSide = minSide * safeScale;

        const minScreenFont = options.minScreenFont || 12;
        const maxScreenFont = options.maxScreenFont || 28;
        const screenRatio = options.screenRatio || 0.32;

        let screenFont = Math.round(visibleMinSide * screenRatio);
        screenFont = Math.max(minScreenFont, Math.min(maxScreenFont, screenFont));

        let canvasFont = Math.round(screenFont / safeScale);

        const minCanvasFont = options.minCanvasFont || 12;
        const maxCanvasFont = options.maxCanvasFont || 140;

        canvasFont = Math.max(minCanvasFont, Math.min(maxCanvasFont, canvasFont));
        return canvasFont;
    };

    ns.getThumbDisplayScale = function (canvasEl) {
        if (!canvasEl || !canvasEl.width) return 1;

        const cssWidth = canvasEl.clientWidth || canvasEl.width;
        return Math.max(cssWidth / canvasEl.width, 0.01);
    };

    ns.drawOverlay = async function (state, item, resetZoom = false) {
        const originalImg = await ns.loadImage(state, item.original.url);

        if (resetZoom) {
            state.zoomLevel = ns.getInitialFitScale(originalImg.width, originalImg.height);
            ns.updateZoomBadge(state);
        }

        state.canvas.width = originalImg.width;
        state.canvas.height = originalImg.height;

        state.canvas.style.width = `${originalImg.width * state.zoomLevel}px`;
        state.canvas.style.height = `${originalImg.height * state.zoomLevel}px`;

        state.ctx.clearRect(0, 0, state.canvas.width, state.canvas.height);
        state.ctx.imageSmoothingEnabled = true;
        state.ctx.drawImage(originalImg, 0, 0);

        const annotations = (item.mask && Array.isArray(item.mask.annotations))
            ? item.mask.annotations
            : [];

        annotations.forEach((ann, idx) => {
            ns.drawContourOnContext(
                state.ctx,
                ann.contour || [],
                ns.getAnnotationColor(ann, 0.60),
                idx === state.selectedAnnotationIndex
            );
        });

        annotations.forEach((ann) => {
            const pos = ns.getLabelPosition(ann, state.canvas.width, state.canvas.height);
            const fontSize = ns.getAdaptiveLabelFontSize(
                ann.contour || [],
                state.zoomLevel,
                {
                    minScreenFont: 11,
                    maxScreenFont: 24,
                    screenRatio: 0.30,
                    minCanvasFont: 12,
                    maxCanvasFont: 140,
                    fallbackCanvasFont: 24
                }
            );

            ns.drawLabelOnContext(state.ctx, ann.fdi, pos.x, pos.y, fontSize);
        });

        if (state.currentTool === 'select' && state.selectedAnnotationIndex !== null) {
            const ann = annotations[state.selectedAnnotationIndex];

            if (ann && Array.isArray(ann.contour) && ann.contour.length > 0) {
                const handles = ns.getDisplayContourHandles(ann.contour, 12);

                state.ctx.save();
                handles.forEach(({ point: [x, y] }) => {
                    state.ctx.beginPath();
                    state.ctx.arc(x, y, 7, 0, Math.PI * 2);
                    state.ctx.fillStyle = '#ffffff';
                    state.ctx.fill();
                    state.ctx.lineWidth = 3;
                    state.ctx.strokeStyle = '#6f42c1';
                    state.ctx.stroke();
                });
                state.ctx.restore();
            }
        }

        if (state.isEditMode && state.currentTool === 'add' && state.drawingPoints.length > 0) {
            state.ctx.save();

            state.ctx.beginPath();
            state.ctx.moveTo(state.drawingPoints[0][0], state.drawingPoints[0][1]);
            for (let i = 1; i < state.drawingPoints.length; i++) {
                state.ctx.lineTo(state.drawingPoints[i][0], state.drawingPoints[i][1]);
            }
            state.ctx.strokeStyle = 'rgba(0,123,255,1)';
            state.ctx.lineWidth = 5;
            state.ctx.setLineDash([6, 4]);
            state.ctx.stroke();

            state.drawingPoints.forEach(([x, y], idx) => {
                state.ctx.beginPath();
                state.ctx.arc(x, y, idx === 0 ? 8 : 6, 0, Math.PI * 2);
                state.ctx.fillStyle = idx === 0 ? '#198754' : '#0d6efd';
                state.ctx.fill();
                state.ctx.lineWidth = 2;
                state.ctx.strokeStyle = '#ffffff';
                state.ctx.stroke();
            });

            if (state.drawingPoints.length >= 2) {
                const [fx, fy] = state.drawingPoints[0];
                state.ctx.beginPath();
                state.ctx.arc(fx, fy, 12, 0, Math.PI * 2);
                state.ctx.strokeStyle = 'rgba(25,135,84,0.35)';
                state.ctx.lineWidth = 2;
                state.ctx.setLineDash([3, 3]);
                state.ctx.stroke();
            }

            state.ctx.restore();
        }

        if (state.isEditMode && state.currentTool === 'split' && state.splitLinePoints.length > 0) {
            state.ctx.save();

            state.ctx.beginPath();
            state.ctx.moveTo(state.splitLinePoints[0][0], state.splitLinePoints[0][1]);
            for (let i = 1; i < state.splitLinePoints.length; i++) {
                state.ctx.lineTo(state.splitLinePoints[i][0], state.splitLinePoints[i][1]);
            }
            state.ctx.strokeStyle = 'rgba(220,53,69,0.95)';
            state.ctx.lineWidth = 3;
            state.ctx.setLineDash([8, 5]);
            state.ctx.stroke();

            state.splitLinePoints.forEach(([x, y], idx) => {
                state.ctx.beginPath();
                state.ctx.arc(x, y, idx === 0 ? 6 : 5, 0, Math.PI * 2);
                state.ctx.fillStyle = idx === 0 ? '#fd7e14' : '#dc3545';
                state.ctx.fill();
                state.ctx.lineWidth = 2;
                state.ctx.strokeStyle = '#ffffff';
                state.ctx.stroke();
            });

            state.ctx.restore();
        }
    };

    ns.makeThumb = async function (state, item) {
        const wrapper = document.createElement('div');
        wrapper.className = 'card shadow-sm thumb-card';
        wrapper.style.cursor = 'pointer';

        const thumbCanvas = document.createElement('canvas');
        thumbCanvas.className = 'card-img-top';
        thumbCanvas.style.width = '100%';
        thumbCanvas.style.height = 'auto';
        thumbCanvas.style.display = 'block';

        const body = document.createElement('div');
        body.className = 'card-body p-2';

        const title = document.createElement('div');
        title.className = 'small';
        title.textContent = item.original.filename;

        body.appendChild(title);
        wrapper.appendChild(thumbCanvas);
        wrapper.appendChild(body);

        const originalImg = await ns.loadImage(state, item.original.url);
        const thumbCtx = thumbCanvas.getContext('2d');

        thumbCanvas.width = originalImg.width;
        thumbCanvas.height = originalImg.height;

        thumbCtx.clearRect(0, 0, thumbCanvas.width, thumbCanvas.height);
        thumbCtx.imageSmoothingEnabled = true;
        thumbCtx.drawImage(originalImg, 0, 0);

        const annotations = (item.mask && Array.isArray(item.mask.annotations))
            ? item.mask.annotations
            : [];

        annotations.forEach((ann) => {
            ns.drawContourOnContext(
                thumbCtx,
                ann.contour || [],
                ns.getAnnotationColor(ann, 0.60),
                false
            );
        });

        const thumbDisplayScale = ns.getThumbDisplayScale(thumbCanvas);

        annotations.forEach((ann) => {
            const pos = ns.getLabelPosition(ann, thumbCanvas.width, thumbCanvas.height);
            const fontSize = ns.getAdaptiveLabelFontSize(
                ann.contour || [],
                thumbDisplayScale,
                {
                    minScreenFont: 10,
                    maxScreenFont: 20,
                    screenRatio: 0.28,
                    minCanvasFont: 10,
                    maxCanvasFont: 120,
                    fallbackCanvasFont: 18
                }
            );

            ns.drawLabelOnContext(thumbCtx, ann.fdi, pos.x, pos.y, fontSize);
        });

        wrapper.addEventListener('click', async () => {
            if (state.selectedThumb) {
                state.selectedThumb.classList.remove('active-thumb');
            }
            wrapper.classList.add('active-thumb');
            state.selectedThumb = wrapper;

            state.currentItem = item;
            state.currentImageIndex = item.index;
            state.selectedAnnotationIndex = null;
            state.drawingPoints = [];
            state.isDrawingAdd = false;
            state.splitLinePoints = [];
            state.isDrawingSplit = false;
            state.dragPointIndex = null;
            state.dragPointMode = null;
            state.selectedDragPointIndex = null;

            if (typeof ns.populateFdiList === 'function') {
                ns.populateFdiList(state, async () => {
                    if (state.currentItem) {
                        await ns.drawOverlay(state, state.currentItem, false);
                    }
                });
            }

            ns.updateSelectedInfo(state);
            await ns.drawOverlay(state, item, true);
        });

        return wrapper;
    };

    ns.renderThumbnails = async function (state, items) {
        state.thumbsContainer.innerHTML = '';

        const thumbs = [];
        const total = items.length;
        const seen = new Set();

        for (let i = 0; i < total; i++) {
            const item = items[i];
            const key = [
                Number.isFinite(item?.index) ? item.index : '',
                String(item?.original?.filename || '').trim().toLowerCase(),
                String(item?.original?.url || '').trim().toLowerCase().split('?')[0]
            ].filter(Boolean).join('|');

            if (!key || seen.has(key)) continue;
            seen.add(key);

            ns.updateProgress(state, `Rendering views ${i + 1} / ${total}...`, i + 1, total);
            const thumb = await ns.makeThumb(state, item);
            thumbs.push(thumb);
            state.thumbsContainer.appendChild(thumb);
            await new Promise(resolve => setTimeout(resolve, 0));
        }

        return thumbs;
    };

    ns.getCanvasCoords = function (state, evt) {
        const rect = state.canvas.getBoundingClientRect();
        const scaleX = state.canvas.width / rect.width;
        const scaleY = state.canvas.height / rect.height;

        return {
            x: (evt.clientX - rect.left) * scaleX,
            y: (evt.clientY - rect.top) * scaleY
        };
    };

    ns.findAnnotationAtPoint = function (state, x, y) {
        const annotations = ns.getCurrentAnnotations(state);

        for (let i = annotations.length - 1; i >= 0; i--) {
            const ann = annotations[i];
            const contour = ann.contour || [];
            if (ns.pointInPolygon(x, y, contour)) {
                return i;
            }
        }
        return null;
    };

    ns.findNearbySelectedContourPoint = function (state, x, y, threshold = 10) {
        const annotations = ns.getCurrentAnnotations(state);
        const ann = (state.selectedAnnotationIndex !== null && annotations[state.selectedAnnotationIndex])
            ? annotations[state.selectedAnnotationIndex]
            : null;

        if (!ann || !Array.isArray(ann.contour)) return null;

        const handles = ns.getDisplayContourHandles(ann.contour, 12);
        return ns.findNearbyHandlePoint(handles, x, y, threshold);
    };

    ns.stopPointDrag = function (state) {
        state.dragPointIndex = null;
        state.selectedDragPointIndex = null;
        state.dragPointMode = null;
    };
})(window.ToothSegmentation);