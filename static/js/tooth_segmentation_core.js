window.ToothSegmentation = window.ToothSegmentation || {};

(function (ns) {
    ns.DENTAL_GRADIENT_COLORS = [
        "#1E5BFF",
        "#00A9FF",
        "#00D4C7",
        "#38D66B",
        "#DCEB00",
        "#FFF066"
    ];

    ns.interpolateHexColor = function (c1, c2, t) {
        const a = String(c1 || '').replace('#', '');
        const b = String(c2 || '').replace('#', '');

        const r1 = parseInt(a.slice(0, 2), 16);
        const g1 = parseInt(a.slice(2, 4), 16);
        const b1 = parseInt(a.slice(4, 6), 16);

        const r2 = parseInt(b.slice(0, 2), 16);
        const g2 = parseInt(b.slice(2, 4), 16);
        const b2 = parseInt(b.slice(4, 6), 16);

        const r = Math.round(r1 + (r2 - r1) * t);
        const g = Math.round(g1 + (g2 - g1) * t);
        const bl = Math.round(b1 + (b2 - b1) * t);

        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${bl.toString(16).padStart(2, '0')}`;
    };

    ns.getGradientColorByIndex = function (index, total) {
        if (total <= 1) return ns.DENTAL_GRADIENT_COLORS[0];

        const safeIndex = Math.max(0, Math.min(index, total - 1));
        const t = safeIndex / (total - 1);
        const segment = t * (ns.DENTAL_GRADIENT_COLORS.length - 1);
        const left = Math.floor(segment);
        const right = Math.min(left + 1, ns.DENTAL_GRADIENT_COLORS.length - 1);
        const localT = segment - left;

        return ns.interpolateHexColor(
            ns.DENTAL_GRADIENT_COLORS[left],
            ns.DENTAL_GRADIENT_COLORS[right],
            localT
        );
    };

    ns.generateDentalGradientFDI = function () {
        const ordered = [
            '11', '12', '13', '14', '15', '16', '17', '18',
            '21', '22', '23', '24', '25', '26', '27', '28',
            '31', '32', '33', '34', '35', '36', '37', '38',
            '41', '42', '43', '44', '45', '46', '47', '48'
        ];

        return ordered.map((fdi, idx) => ({
            fdi,
            color: ns.getGradientColorByIndex(idx, ordered.length)
        }));
    };

    ns.getGradientColorForFdi = function (fdi) {
		const f = String(fdi || '').trim();
		const num = Number(f);
		if (!Number.isFinite(num)) return '#1E5BFF';

		const quadrant = Math.floor(num / 10);
		const tooth = num % 10;

		let index, total;

		// UPPER: 11–18, 21–28
		if (quadrant === 1 || quadrant === 2) {
			// map 11–18 → 0–7
			// map 21–28 → 8–15
			index = (quadrant === 1) ? (tooth - 1) : (8 + tooth - 1);
			total = 16;
		}

		// LOWER: 31–38, 41–48
		else if (quadrant === 3 || quadrant === 4) {
			// map 41–48 → 0–7
			// map 31–38 → 8–15
			index = (quadrant === 4) ? (tooth - 1) : (8 + tooth - 1);
			total = 16;
		}

		else {
			return '#1E5BFF';
		}

		return ns.getGradientColorByIndex(index, total);
	};

    ns.deepClone = function (obj) {
        return JSON.parse(JSON.stringify(obj));
    };

    ns.cloneAnnotations = function (annotations) {
        return JSON.parse(JSON.stringify(annotations || []));
    };

    ns.showProgress = function (state, message = 'Working...', percent = 0) {
        const safePercent = Math.max(0, Math.min(100, Math.round(percent)));
        state.progressWrap.classList.remove('d-none');
        state.progressText.textContent = message;
        state.progressPercent.textContent = `${safePercent}%`;
        state.progressBar.style.width = `${safePercent}%`;
        state.progressBar.setAttribute('aria-valuenow', String(safePercent));
    };

    ns.updateProgress = function (state, message, current, total) {
        const percent = total > 0 ? (current / total) * 100 : 0;
        ns.showProgress(state, message, percent);
    };

    ns.hideProgress = function (state) {
        state.progressWrap.classList.add('d-none');
    };

    ns.setCanvasBusy = function (state, isBusy, message = 'Working...') {
        state.canvasBusyText.textContent = message;
        state.canvasBusyOverlay.classList.toggle('d-none', !isBusy);

        const actionButtons = [
            state.saveBtn, state.cancelBtn,
            state.zoomOutBtn, state.zoomInBtn, state.zoomResetBtn
        ];

        actionButtons.forEach(btn => {
            if (btn) {
                btn.disabled = isBusy;
                btn.classList.toggle('is-busy', isBusy);
            }
        });

        document.querySelectorAll('.tool-btn').forEach(btn => {
            btn.disabled = isBusy;
            btn.classList.toggle('is-busy', isBusy);
        });
    };

    ns.hexToRgba = function (hex, alpha = 0.55) {
        const value = String(hex || '').trim();

        if (/^#([0-9a-fA-F]{6})$/.test(value)) {
            const r = parseInt(value.slice(1, 3), 16);
            const g = parseInt(value.slice(3, 5), 16);
            const b = parseInt(value.slice(5, 7), 16);
            return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        }

        if (/^#([0-9a-fA-F]{3})$/.test(value)) {
            const r = parseInt(value[1] + value[1], 16);
            const g = parseInt(value[2] + value[2], 16);
            const b = parseInt(value[3] + value[3], 16);
            return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        }

        return `rgba(54, 162, 235, ${alpha})`;
    };

    ns.loadImage = function (state, src) {
        if (state.imageCache.has(src)) {
            return state.imageCache.get(src);
        }

        const promise = new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = src;
        });

        state.imageCache.set(src, promise);
        return promise;
    };

    ns.getInitialFitScale = function (imgWidth, imgHeight) {
        const wrapper = document.getElementById('canvas-wrapper');
        if (!wrapper) return 1.0;

        const maxWidth = Math.max(200, wrapper.clientWidth - 24);
        const maxHeight = Math.max(200, window.innerHeight * 0.65);

        const scaleX = maxWidth / imgWidth;
        const scaleY = maxHeight / imgHeight;

        return Math.min(scaleX, scaleY, 1.0);
    };

    ns.isValidPoint = function (pt) {
        return Array.isArray(pt) &&
            pt.length >= 2 &&
            Number.isFinite(pt[0]) &&
            Number.isFinite(pt[1]);
    };

    ns.normalizeContour = function (contour) {
        if (!Array.isArray(contour)) return [];
        return contour.filter(ns.isValidPoint);
    };

    ns.pointInPolygon = function (x, y, polygon) {
        const pts = ns.normalizeContour(polygon);
        if (pts.length < 3) return false;

        let inside = false;
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
            const xi = pts[i][0], yi = pts[i][1];
            const xj = pts[j][0], yj = pts[j][1];

            const intersect = ((yi > y) !== (yj > y)) &&
                (x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-9) + xi);

            if (intersect) inside = !inside;
        }
        return inside;
    };

    ns.getContourBounds = function (contour) {
        const pts = ns.normalizeContour(contour);
        if (!pts.length) return null;

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

        return {
            minX, minY, maxX, maxY,
            width: maxX - minX,
            height: maxY - minY,
            cx: (minX + maxX) / 2,
            cy: (minY + maxY) / 2
        };
    };

    ns.getBoxCenter = function (box) {
        if (!Array.isArray(box) || box.length < 4) return null;
        const [a, b, c, d] = box;
        return {
            x: a + c / 2,
            y: b + d / 2
        };
    };

    ns.getLabelPosition = function (ann, canvasWidth, canvasHeight) {
        const bounds = ns.getContourBounds(ann.contour || []);
        let x = Number.isFinite(ann.cx) ? ann.cx : null;
        let y = Number.isFinite(ann.cy) ? ann.cy : null;

        if (bounds) {
            x = bounds.cx;
            y = bounds.cy;
        } else if ((x === null || y === null) && Array.isArray(ann.bbox)) {
            const center = ns.getBoxCenter(ann.bbox);
            if (center) {
                x = center.x;
                y = center.y;
            }
        }

        if (!Number.isFinite(x)) x = 20;
        if (!Number.isFinite(y)) y = 20;

        x = Math.max(10, Math.min(canvasWidth - 10, x));
        y = Math.max(10, Math.min(canvasHeight - 10, y));

        return { x, y };
    };

    ns.isHexColor = function (value) {
        return /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/.test(String(value || '').trim());
    };

    ns.getAnnotationDisplayColor = function (ann) {
        return ns.getGradientColorForFdi(ann && ann.fdi ? ann.fdi : '');
    };

    ns.getAnnotationColor = function (ann, alpha = 0.55) {
        return ns.hexToRgba(ns.getAnnotationDisplayColor(ann), alpha);
    };

    ns.getCurrentAnnotations = function (state) {
        if (!state.currentItem || !state.currentItem.mask || !Array.isArray(state.currentItem.mask.annotations)) {
            return [];
        }
        return state.currentItem.mask.annotations;
    };

    ns.getSequentialFdiList = function () {
        return [
            '11', '12', '13', '14', '15', '16', '17', '18',
            '21', '22', '23', '24', '25', '26', '27', '28',
            '31', '32', '33', '34', '35', '36', '37', '38',
            '41', '42', '43', '44', '45', '46', '47', '48'
        ];
    };

    ns.getCurrentViewFdiColorMap = function (state) {
        const map = new Map();
        const annotations = ns.getCurrentAnnotations(state);

        annotations.forEach((ann) => {
            const fdi = String(ann && ann.fdi ? ann.fdi : '').trim();
            if (!fdi) return;
            map.set(fdi, ns.getAnnotationDisplayColor(ann));
        });

        return map;
    };

    ns.getSelectedFdiAndColor = function (state) {
        const defaultItem = ns.generateDentalGradientFDI().find(x => x.fdi === '11') || { fdi: '11', color: '#1E5BFF' };

        return {
            selectedFdi: state.selectedFdiValue || defaultItem.fdi,
            selectedColor: state.selectedFdiColor || defaultItem.color,
        };
    };

    ns.getButtonState = function (state) {
        const { selectedFdi, selectedColor } = ns.getSelectedFdiAndColor(state);

        return {
            patientId: state.patientId,
            editedImages: state.editedImages,
            currentItem: state.currentItem,
            currentImageIndex: state.currentImageIndex,
            selectedAnnotationIndex: state.selectedAnnotationIndex,
            isEditMode: state.isEditMode,
            currentTool: state.currentTool,
            drawingPoints: state.drawingPoints,
            isDrawingAdd: state.isDrawingAdd,
            splitLinePoints: state.splitLinePoints,
            isDrawingSplit: state.isDrawingSplit,
            selectedFdi,
            selectedColor,
            getCurrentAnnotations: () => ns.getCurrentAnnotations(state),
            markDirty: () => ns.markCurrentDirty(state),
            setHelpText: (text) => {
                state.canvasHelp.textContent = text;
            },
        };
    };

    ns.applyButtonState = function (state, nextState) {
        state.selectedAnnotationIndex = nextState.selectedAnnotationIndex;
        state.drawingPoints = nextState.drawingPoints;
        state.isDrawingAdd = nextState.isDrawingAdd;
        state.splitLinePoints = nextState.splitLinePoints;
        state.isDrawingSplit = nextState.isDrawingSplit;
    };

    ns.updateModeBadge = function (state) {
        const labels = {
            select: 'Select',
            add: 'Add Object',
            split: 'Split Mask',
            delete: 'Delete Mask',
        };
        state.modeBadge.textContent = labels[state.currentTool] || 'Select';
        state.modeBadge.className = 'badge bg-primary';
    };

    ns.updateZoomBadge = function (state) {
        state.zoomBadge.textContent = `${Math.round(state.zoomLevel * 100)}%`;
    };

    ns.updateSaveStatus = function (state) {
        const hasChanges = state.editedImages.some(item => item._dirty);
        state.isPageDirty = hasChanges;
        state.saveStatus.textContent = hasChanges ? 'Unsaved changes present.' : 'No unsaved changes.';
        state.saveStatus.className = hasChanges ? 'small text-warning fw-semibold' : 'small text-muted';
    };

    ns.updateSelectedInfo = function (state) {
        const annotations = ns.getCurrentAnnotations(state);
        const ann = (state.selectedAnnotationIndex !== null && annotations[state.selectedAnnotationIndex])
            ? annotations[state.selectedAnnotationIndex]
            : null;

        if (!ann) {
            if (state.selectedColorPreview) state.selectedColorPreview.style.background = '#fff';
            if (state.selectedColorText) state.selectedColorText.textContent = 'No FDI selected';
            state.selectedFdiValue = '';
            state.selectedFdiColor = '';
            document.querySelectorAll('.fdi-color-item').forEach(el => el.classList.remove('active'));
            return;
        }

        const uiColor = ns.getAnnotationDisplayColor(ann);

        if (state.selectedColorPreview) state.selectedColorPreview.style.background = uiColor || '#fff';
        if (state.selectedColorText) state.selectedColorText.textContent = ann.fdi ? `${ann.fdi} — ${uiColor}` : 'No FDI selected';

        state.selectedFdiValue = ann.fdi || '';
        state.selectedFdiColor = uiColor || '';

        document.querySelectorAll('.fdi-color-item').forEach(el => {
            const isActive = el.dataset.fdi === state.selectedFdiValue;
            el.classList.toggle('active', isActive);
        });
    };

    ns.populateFdiList = function (state, redraw) {
        state.fdiColorList.innerHTML = '';

        const sequentialFdis = ns.getSequentialFdiList();

        sequentialFdis.forEach((fdi) => {
            const displayColor = ns.getGradientColorForFdi(fdi);

            const row = document.createElement('div');
            row.className = 'fdi-color-item';
            row.dataset.fdi = fdi;
            row.dataset.color = displayColor;

            row.innerHTML = `
                <div class="fdi-color-swatch" style="background:${displayColor};"></div>
                <div class="fdi-color-label">${fdi} — ${displayColor}</div>
            `;

            row.addEventListener('click', async () => {
                state.selectedFdiValue = fdi;
                state.selectedFdiColor = displayColor;

                document.querySelectorAll('.fdi-color-item').forEach(el => {
                    el.classList.remove('active');
                });
                row.classList.add('active');

                if (state.selectedColorPreview) state.selectedColorPreview.style.background = displayColor;
                if (state.selectedColorText) state.selectedColorText.textContent = `${fdi} — ${displayColor}`;

                const annotations = ns.getCurrentAnnotations(state);
                const ann = (state.selectedAnnotationIndex !== null && annotations[state.selectedAnnotationIndex])
                    ? annotations[state.selectedAnnotationIndex]
                    : null;

                if (!ann || !state.isEditMode) {
                    return;
                }

                ann.fdi = fdi;
                ann.color = displayColor;
                ann.source = ann.source || 'edited';

                ns.markCurrentDirty(state);
                ns.updateSelectedInfo(state);
                await redraw();
            });

            state.fdiColorList.appendChild(row);
        });
    };

    ns.setTool = function (state, tool) {
        state.currentTool = tool;

        if (tool !== 'add') {
            state.drawingPoints = [];
            state.isDrawingAdd = false;
        }

        if (tool !== 'split') {
            state.splitLinePoints = [];
            state.isDrawingSplit = false;
        }

        state.dragPointIndex = null;
        state.dragPointMode = null;
        state.selectedDragPointIndex = null;

        document.querySelectorAll('.tool-btn').forEach(btn => {
            btn.classList.toggle('active-tool', btn.dataset.tool === tool);
        });

        ns.updateModeBadge(state);
    };

    ns.markCurrentDirty = function (state) {
        if (state.currentItem) {
            state.currentItem._dirty = true;
        }
        state.isPageDirty = state.editedImages.some(item => item._dirty);
        ns.updateSaveStatus(state);
    };

    ns.setEditMode = function (state, enabled) {
        state.isEditMode = enabled;

        if (!enabled) {
            ns.setTool(state, 'select');
            state.drawingPoints = [];
            state.isDrawingAdd = false;
            state.splitLinePoints = [];
            state.isDrawingSplit = false;
            state.dragPointIndex = null;
            state.dragPointMode = null;
            state.selectedDragPointIndex = null;
        }

        state.canvasHelp.textContent = 'Click a tooth to inspect it. Use the tools to edit segmentation and save when finished.';
        ns.updateModeBadge(state);
        ns.updateSelectedInfo(state);
    };

    ns.getCsrfToken = function () {
        const input = document.getElementById('csrf-token');
        if (input && input.value) {
            return input.value;
        }

        const cookie = document.cookie
            .split('; ')
            .find(row => row.startsWith('csrftoken='));

        return cookie ? decodeURIComponent(cookie.split('=')[1]) : '';
    };

    ns.distanceBetweenPoints = function (a, b) {
        if (!a || !b) return Infinity;
        const dx = a[0] - b[0];
        const dy = a[1] - b[1];
        return Math.sqrt(dx * dx + dy * dy);
    };

    ns.findNearbyPoint = function (points, x, y, threshold = 10) {
        for (let i = points.length - 1; i >= 0; i--) {
            const px = points[i][0];
            const py = points[i][1];
            const dx = px - x;
            const dy = py - y;
            if (Math.sqrt(dx * dx + dy * dy) <= threshold) {
                return i;
            }
        }
        return null;
    };

    ns.getDisplayContourHandles = function (contour, minSpacing = 10, turnThreshold = 0.09) {
        const pts = ns.normalizeContour(contour);
        if (pts.length === 0) return [];
        if (pts.length === 1) return [{ point: pts[0], sourceIndex: 0 }];

        const result = [];
        const lastIndex = pts.length - 1;

        function dist(a, b) {
            return Math.hypot(a[0] - b[0], a[1] - b[1]);
        }

        function turnStrength(prev, curr, next) {
            const v1x = curr[0] - prev[0];
            const v1y = curr[1] - prev[1];
            const v2x = next[0] - curr[0];
            const v2y = next[1] - curr[1];

            const l1 = Math.hypot(v1x, v1y);
            const l2 = Math.hypot(v2x, v2y);
            if (l1 < 1e-6 || l2 < 1e-6) return 0;

            const n1x = v1x / l1;
            const n1y = v1y / l1;
            const n2x = v2x / l2;
            const n2y = v2y / l2;

            const dot = Math.max(-1, Math.min(1, n1x * n2x + n1y * n2y));
            return 1 - dot;
        }

        result.push({ point: pts[0], sourceIndex: 0 });
        let lastKeptPoint = pts[0];

        for (let i = 1; i < lastIndex; i++) {
            const prev = pts[i - 1];
            const curr = pts[i];
            const next = pts[i + 1];

            const turn = turnStrength(prev, curr, next);
            const spacingFromLast = dist(curr, lastKeptPoint);

            const isStrongCorner = turn >= turnThreshold;
            const isFarAndCurved = spacingFromLast >= minSpacing && turn >= turnThreshold * 0.55;

            if (isStrongCorner || isFarAndCurved) {
                result.push({ point: curr, sourceIndex: i });
                lastKeptPoint = curr;
            }
        }

        if (dist(pts[lastIndex], lastKeptPoint) >= 2) {
            result.push({ point: pts[lastIndex], sourceIndex: lastIndex });
        }

        return result;
    };

    ns.findNearbyHandlePoint = function (handles, x, y, threshold = 10) {
        for (let i = handles.length - 1; i >= 0; i--) {
            const px = handles[i].point[0];
            const py = handles[i].point[1];
            const dx = px - x;
            const dy = py - y;
            if (Math.sqrt(dx * dx + dy * dy) <= threshold) {
                return handles[i].sourceIndex;
            }
        }
        return null;
    };

    ns.dedupeImages = function (images) {
        const result = [];
        const seen = new Set();

        function normalizeName(name) {
            return String(name || '')
                .trim()
                .toLowerCase()
                .replace(/\s+/g, '')
                .replace(/[_-]+/g, '_');
        }

        function normalizeUrl(url) {
            return String(url || '')
                .trim()
                .toLowerCase()
                .split('?')[0]
                .replace(/\\/g, '/');
        }

        function detectView(item) {
            const text = [
                item?.original?.filename || '',
                item?.original?.url || '',
                item?.view || '',
                item?.name || '',
                item?.label || ''
            ].join(' ').toLowerCase();

            if (text.includes('upper') || text.includes('maxillary') || text.includes('occlusal_upper')) return 'upper';
            if (text.includes('lower') || text.includes('mandibular') || text.includes('occlusal_lower')) return 'lower';
            if (text.includes('left') || text.includes('lateral_left')) return 'left';
            if (text.includes('right') || text.includes('lateral_right')) return 'right';
            if (text.includes('frontal') || text.includes('front') || text.includes('intraoral_1')) return 'front';

            return '';
        }

        function annotationSignature(item) {
            const anns = Array.isArray(item?.mask?.annotations) ? item.mask.annotations : [];
            return anns
                .slice(0, 8)
                .map(a => `${a?.fdi || ''}:${Math.round(a?.cx || 0)}:${Math.round(a?.cy || 0)}`)
                .join('|');
        }

        for (const item of (images || [])) {
            const filename = normalizeName(item?.original?.filename);
            const url = normalizeUrl(item?.original?.url);
            const view = detectView(item);
            const annSig = annotationSignature(item);

            let key = '';
            if (filename && view) {
                key = `fileview|${filename}|${view}`;
            } else if (url && view) {
                key = `urlview|${url}|${view}`;
            } else if (filename) {
                key = `file|${filename}`;
            } else if (url) {
                key = `url|${url}`;
            } else {
                key = `anns|${view}|${annSig}`;
            }

            if (seen.has(key)) continue;
            seen.add(key);
            result.push(item);
        }

        return result;
    };
})(window.ToothSegmentation);