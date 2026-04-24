window.FunctionOfButton = (function () {
    function isValidPoint(pt) {
        return Array.isArray(pt) &&
            pt.length >= 2 &&
            Number.isFinite(Number(pt[0])) &&
            Number.isFinite(Number(pt[1]));
    }

    function normalizeContour(contour) {
        if (!Array.isArray(contour)) return [];
        return contour
            .filter(isValidPoint)
            .map(([x, y]) => [Number(x), Number(y)]);
    }

    function dedupeSequentialPoints(points, minDist = 1) {
        const pts = normalizeContour(points);
        if (!pts.length) return [];

        const result = [pts[0]];
        for (let i = 1; i < pts.length; i++) {
            const [x1, y1] = result[result.length - 1];
            const [x2, y2] = pts[i];
            if (Math.hypot(x2 - x1, y2 - y1) >= minDist) {
                result.push(pts[i]);
            }
        }

        if (result.length > 1) {
            const [fx, fy] = result[0];
            const [lx, ly] = result[result.length - 1];
            if (Math.hypot(lx - fx, ly - fy) < minDist) {
                result.pop();
            }
        }

        return result;
    }

    function closeContour(points) {
        const pts = dedupeSequentialPoints(points);
        if (pts.length < 3) return pts;

        const [fx, fy] = pts[0];
        const [lx, ly] = pts[pts.length - 1];

        if (Math.hypot(lx - fx, ly - fy) > 0) {
            pts.push([fx, fy]);
        }
        return pts;
    }

    function polygonArea(points) {
        const pts = normalizeContour(points);
        if (pts.length < 3) return 0;

        let area = 0;
        for (let i = 0; i < pts.length; i++) {
            const [x1, y1] = pts[i];
            const [x2, y2] = pts[(i + 1) % pts.length];
            area += x1 * y2 - x2 * y1;
        }
        return Math.abs(area) / 2;
    }

    function getContourBounds(contour) {
        const pts = normalizeContour(contour);
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
            minX,
            minY,
            maxX,
            maxY,
            width: maxX - minX,
            height: maxY - minY,
            cx: (minX + maxX) / 2,
            cy: (minY + maxY) / 2,
        };
    }

    function getContourCentroid(contour) {
        const pts = normalizeContour(contour);
        if (!pts.length) return { x: 0, y: 0 };

        let sx = 0;
        let sy = 0;
        for (const [x, y] of pts) {
            sx += x;
            sy += y;
        }

        return {
            x: sx / pts.length,
            y: sy / pts.length,
        };
    }

    function computeAnnotationGeometry(ann) {
        const contour = dedupeSequentialPoints(ann.contour || []);
        const bounds = getContourBounds(contour);
        const centroid = getContourCentroid(contour);

        return {
            ...ann,
            contour,
            area: Math.round(polygonArea(contour)),
            cx: Math.round(centroid.x),
            cy: Math.round(centroid.y),
            bbox: bounds
                ? [
                    Math.round(bounds.minX),
                    Math.round(bounds.minY),
                    Math.round(bounds.width),
                    Math.round(bounds.height),
                ]
                : [0, 0, 0, 0],
        };
    }

    function getNextAnnotationId(annotations) {
        let maxId = 0;

        (annotations || []).forEach((ann, index) => {
            const value = Number.isFinite(Number(ann.id)) ? Number(ann.id) : (index + 1);
            if (value > maxId) maxId = value;
        });

        return maxId + 1;
    }

    function distanceBetween(a, b) {
        const ax = Number(a?.cx || 0);
        const ay = Number(a?.cy || 0);
        const bx = Number(b?.cx || 0);
        const by = Number(b?.cy || 0);
        return Math.hypot(ax - bx, ay - by);
    }

    function drawFilledPolygon(ctx, contour, offsetX, offsetY) {
        const pts = closeContour(contour);
        if (pts.length < 4) return;

        ctx.beginPath();
        ctx.moveTo(pts[0][0] - offsetX, pts[0][1] - offsetY);
        for (let i = 1; i < pts.length; i++) {
            ctx.lineTo(pts[i][0] - offsetX, pts[i][1] - offsetY);
        }
        ctx.closePath();
        ctx.fill();
    }

    function getBoundsForContours(contours, pad = 20) {
        const all = [];
        for (const contour of contours) {
            all.push(...normalizeContour(contour));
        }
        if (!all.length) return null;

        let minX = all[0][0];
        let maxX = all[0][0];
        let minY = all[0][1];
        let maxY = all[0][1];

        for (const [x, y] of all) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
        }

        minX = Math.floor(minX) - pad;
        minY = Math.floor(minY) - pad;
        maxX = Math.ceil(maxX) + pad;
        maxY = Math.ceil(maxY) + pad;

        return {
            minX,
            minY,
            maxX,
            maxY,
            width: Math.max(10, maxX - minX + 1),
            height: Math.max(10, maxY - minY + 1),
        };
    }

    function alphaToBinary(imageData, width, height, threshold = 10) {
        const binary = new Uint8Array(width * height);
        for (let i = 0; i < width * height; i++) {
            binary[i] = imageData[i * 4 + 3] > threshold ? 1 : 0;
        }
        return binary;
    }

    function dilateBinary(binary, width, height, radius = 1) {
        const out = new Uint8Array(binary.length);

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                let on = 0;
                for (let dy = -radius; dy <= radius && !on; dy++) {
                    for (let dx = -radius; dx <= radius; dx++) {
                        const nx = x + dx;
                        const ny = y + dy;
                        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
                        if (binary[ny * width + nx]) {
                            on = 1;
                            break;
                        }
                    }
                }
                out[y * width + x] = on;
            }
        }

        return out;
    }

    function erodeBinary(binary, width, height, radius = 1) {
        const out = new Uint8Array(binary.length);

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                let on = 1;
                for (let dy = -radius; dy <= radius && on; dy++) {
                    for (let dx = -radius; dx <= radius; dx++) {
                        const nx = x + dx;
                        const ny = y + dy;
                        if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
                            on = 0;
                            break;
                        }
                        if (!binary[ny * width + nx]) {
                            on = 0;
                            break;
                        }
                    }
                }
                out[y * width + x] = on;
            }
        }

        return out;
    }

    function closeBinary(binary, width, height, radius = 1) {
        return erodeBinary(dilateBinary(binary, width, height, radius), width, height, radius);
    }

    function getConnectedComponents(binary, width, height, minPixels = 20) {
        const visited = new Uint8Array(width * height);
        const components = [];

        function bfs(sx, sy) {
            const queue = [[sx, sy]];
            const pixels = [];
            let head = 0;
            visited[sy * width + sx] = 1;

            while (head < queue.length) {
                const [x, y] = queue[head++];
                pixels.push([x, y]);

                const neighbors = [
                    [x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1],
                    [x + 1, y + 1], [x - 1, y - 1], [x + 1, y - 1], [x - 1, y + 1]
                ];

                for (const [nx, ny] of neighbors) {
                    if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
                    const idx = ny * width + nx;
                    if (visited[idx] || !binary[idx]) continue;
                    visited[idx] = 1;
                    queue.push([nx, ny]);
                }
            }

            return pixels;
        }

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = y * width + x;
                if (visited[idx] || !binary[idx]) continue;
                const comp = bfs(x, y);
                if (comp.length >= minPixels) {
                    components.push(comp);
                }
            }
        }

        return components;
    }

    function componentToBinary(componentPixels, width, height) {
        const binary = new Uint8Array(width * height);
        for (const [x, y] of componentPixels) {
            binary[y * width + x] = 1;
        }
        return binary;
    }

    function simplifyContour(points, minDist = 2) {
        const pts = dedupeSequentialPoints(points, minDist);
        if (pts.length < 3) return pts;

        const result = [];
        for (let i = 0; i < pts.length; i++) {
            const prev = pts[(i - 1 + pts.length) % pts.length];
            const curr = pts[i];
            const next = pts[(i + 1) % pts.length];

            const v1x = curr[0] - prev[0];
            const v1y = curr[1] - prev[1];
            const v2x = next[0] - curr[0];
            const v2y = next[1] - curr[1];

            const l1 = Math.hypot(v1x, v1y) || 1;
            const l2 = Math.hypot(v2x, v2y) || 1;

            const cross = Math.abs((v1x / l1) * (v2y / l2) - (v1y / l1) * (v2x / l2));

            if (cross > 0.03 || result.length < 3) {
                result.push(curr);
            }
        }

        return dedupeSequentialPoints(result, minDist);
    }

    function traceContourFromBinary(binary, width, height, offsetX, offsetY) {
        function isOn(x, y) {
            if (x < 0 || y < 0 || x >= width || y >= height) return 0;
            return binary[y * width + x] ? 1 : 0;
        }

        function isBoundaryPixel(x, y) {
            if (!isOn(x, y)) return false;
            return (
                !isOn(x - 1, y) ||
                !isOn(x + 1, y) ||
                !isOn(x, y - 1) ||
                !isOn(x, y + 1)
            );
        }

        let start = null;
        for (let y = 0; y < height && !start; y++) {
            for (let x = 0; x < width; x++) {
                if (isBoundaryPixel(x, y)) {
                    start = [x, y];
                    break;
                }
            }
        }

        if (!start) return [];

        const dirs = [
            [1, 0],
            [1, 1],
            [0, 1],
            [-1, 1],
            [-1, 0],
            [-1, -1],
            [0, -1],
            [1, -1],
        ];

        function dirIndex(dx, dy) {
            for (let i = 0; i < dirs.length; i++) {
                if (dirs[i][0] === dx && dirs[i][1] === dy) return i;
            }
            return 0;
        }

        const contour = [];
        let current = start;
        let prev = [start[0] - 1, start[1]];
        const maxSteps = width * height * 4;

        for (let step = 0; step < maxSteps; step++) {
            contour.push([current[0] + offsetX, current[1] + offsetY]);

            const backDx = prev[0] - current[0];
            const backDy = prev[1] - current[1];
            const startDir = dirIndex(backDx, backDy);

            let foundNext = false;
            for (let k = 1; k <= 8; k++) {
                const idx = (startDir + k) % 8;
                const nx = current[0] + dirs[idx][0];
                const ny = current[1] + dirs[idx][1];

                if (isBoundaryPixel(nx, ny)) {
                    prev = current;
                    current = [nx, ny];
                    foundNext = true;
                    break;
                }
            }

            if (!foundNext) break;

            if (
                current[0] === start[0] &&
                current[1] === start[1] &&
                contour.length > 10
            ) {
                break;
            }
        }

        return simplifyContour(contour, 2);
    }

    function extendSplitPath(points, contourBounds) {
        const pts = dedupeSequentialPoints(points, 1);
        if (pts.length < 2 || !contourBounds) return pts;

        const diag = Math.hypot(contourBounds.width || 1, contourBounds.height || 1) + 100;

        const [x0, y0] = pts[0];
        const [x1, y1] = pts[1];
        const [xn1, yn1] = pts[pts.length - 2];
        const [xn, yn] = pts[pts.length - 1];

        const sdx = x0 - x1;
        const sdy = y0 - y1;
        const edx = xn - xn1;
        const edy = yn - yn1;

        const sl = Math.hypot(sdx, sdy) || 1;
        const el = Math.hypot(edx, edy) || 1;

        const startExtended = [x0 + (sdx / sl) * diag, y0 + (sdy / sl) * diag];
        const endExtended = [xn + (edx / el) * diag, yn + (edy / el) * diag];

        return [startExtended, ...pts.slice(1, -1), endExtended];
    }

    function rasterSplitContour(contour, splitLinePoints) {
        const shapePts = closeContour(contour);
        if (shapePts.length < 4) {
            return { ok: false, message: 'Invalid contour.' };
        }

        const bounds = getBoundsForContours([shapePts, splitLinePoints], 60);
        if (!bounds) {
            return { ok: false, message: 'Invalid contour bounds.' };
        }

        const extendedSplit = extendSplitPath(splitLinePoints, bounds);
        if (extendedSplit.length < 2) {
            return { ok: false, message: 'Invalid split path.' };
        }

        const canvas = document.createElement('canvas');
        canvas.width = bounds.width;
        canvas.height = bounds.height;
        const ctx = canvas.getContext('2d');

        ctx.clearRect(0, 0, bounds.width, bounds.height);
        ctx.fillStyle = '#ffffff';
        drawFilledPolygon(ctx, shapePts, bounds.minX, bounds.minY);

        ctx.globalCompositeOperation = 'destination-out';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(extendedSplit[0][0] - bounds.minX, extendedSplit[0][1] - bounds.minY);
        for (let i = 1; i < extendedSplit.length; i++) {
            ctx.lineTo(extendedSplit[i][0] - bounds.minX, extendedSplit[i][1] - bounds.minY);
        }
        ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';

        const img = ctx.getImageData(0, 0, bounds.width, bounds.height);
        const binary = alphaToBinary(img.data, bounds.width, bounds.height, 10);
        const components = getConnectedComponents(binary, bounds.width, bounds.height, 20);

        if (components.length < 2) {
            return { ok: false, message: 'Split failed. Draw the split line fully across the mask.' };
        }

        components.sort((a, b) => b.length - a.length);

        const partABinary = componentToBinary(components[0], bounds.width, bounds.height);
        const partBBinary = componentToBinary(components[1], bounds.width, bounds.height);

        const partA = traceContourFromBinary(
            partABinary,
            bounds.width,
            bounds.height,
            bounds.minX,
            bounds.minY
        );

        const partB = traceContourFromBinary(
            partBBinary,
            bounds.width,
            bounds.height,
            bounds.minX,
            bounds.minY
        );

        if (partA.length < 3 || partB.length < 3) {
            return { ok: false, message: 'Split failed. Could not build valid split contours.' };
        }

        return {
            ok: true,
            partA,
            partB,
        };
    }

    function rasterMergeContours(contourA, contourB) {
        const a = closeContour(contourA);
        const b = closeContour(contourB);

        if (a.length < 4 || b.length < 4) {
            return { ok: false, message: 'Invalid contours for merge.' };
        }

        const bounds = getBoundsForContours([a, b], 20);
        if (!bounds) {
            return { ok: false, message: 'Invalid merge bounds.' };
        }

        const canvas = document.createElement('canvas');
        canvas.width = bounds.width;
        canvas.height = bounds.height;
        const ctx = canvas.getContext('2d');

        ctx.clearRect(0, 0, bounds.width, bounds.height);
        ctx.fillStyle = '#ffffff';
        drawFilledPolygon(ctx, a, bounds.minX, bounds.minY);
        drawFilledPolygon(ctx, b, bounds.minX, bounds.minY);

        const img = ctx.getImageData(0, 0, bounds.width, bounds.height);
        let binary = alphaToBinary(img.data, bounds.width, bounds.height, 10);
        binary = closeBinary(binary, bounds.width, bounds.height, 1);

        const components = getConnectedComponents(binary, bounds.width, bounds.height, 20);
        if (!components.length) {
            return { ok: false, message: 'Merge failed.' };
        }

        components.sort((aComp, bComp) => bComp.length - aComp.length);

        const mergedBinary = componentToBinary(components[0], bounds.width, bounds.height);
        const mergedContour = traceContourFromBinary(
            mergedBinary,
            bounds.width,
            bounds.height,
            bounds.minX,
            bounds.minY
        );

        if (mergedContour.length < 3) {
            return { ok: false, message: 'Merge failed. Invalid merged contour.' };
        }

        return {
            ok: true,
            contour: mergedContour,
        };
    }

    function startAddMode(state) {
        state.drawingPoints = [];
        state.isDrawingAdd = true;
        if (state.setHelpText) {
            state.setHelpText(
                'Add Object mode: click points to draw polygon, double click or press Enter to finish, Backspace to remove last point, Esc to cancel.'
            );
        }
    }

    function cancelAddMode(state) {
        state.drawingPoints = [];
        state.isDrawingAdd = false;
        if (state.setHelpText) {
            state.setHelpText(
                'Click a tooth to inspect it. Use the tools to edit segmentation and save when finished.'
            );
        }
    }

    function finishAddMode(state) {
        if (!state.currentItem || !state.isEditMode || state.currentTool !== 'add') {
            return { ok: false, message: 'Add mode is not active.' };
        }

        if (!Array.isArray(state.drawingPoints) || state.drawingPoints.length < 3) {
            return { ok: false, message: 'Need at least 3 points to create a new object.' };
        }

        const closedContour = closeContour(
            state.drawingPoints.map(([x, y]) => [Math.round(x), Math.round(y)])
        );

        if (closedContour.length < 3 || polygonArea(closedContour) < 20) {
            return { ok: false, message: 'Draw a larger closed shape.' };
        }

        const annotations = state.getCurrentAnnotations();
        const newAnnotation = computeAnnotationGeometry({
            id: getNextAnnotationId(annotations),
            fdi: state.selectedFdi || '11',
            color: state.selectedColor || '#9be7cf',
            source: 'manual',
            contour: closedContour,
        });

        if (!state.currentItem.mask) {
            state.currentItem.mask = {};
        }
        if (!Array.isArray(state.currentItem.mask.annotations)) {
            state.currentItem.mask.annotations = [];
        }

        state.currentItem.mask.annotations.push(newAnnotation);
        state.selectedAnnotationIndex = state.currentItem.mask.annotations.length - 1;
        state.drawingPoints = [];
        state.isDrawingAdd = false;

        if (state.markDirty) state.markDirty();
        if (state.setHelpText) state.setHelpText('New object added.');

        return {
            ok: true,
            selectedAnnotationIndex: state.selectedAnnotationIndex,
        };
    }

    function deleteMask(state, hitIndex) {
        if (!state.currentItem) {
            return { ok: false, message: 'No current image selected.' };
        }

        const annotations = state.getCurrentAnnotations();
        if (hitIndex === null || hitIndex === undefined || !annotations[hitIndex]) {
            return { ok: false, message: 'No mask selected.' };
        }

        annotations.splice(hitIndex, 1);
        state.selectedAnnotationIndex = null;

        if (state.markDirty) state.markDirty();
        return { ok: true };
    }

    function mergeNearest(state) {
		const annotations = state.getCurrentAnnotations();
		const selectedIndex = state.selectedAnnotationIndex;

		if (selectedIndex === null || selectedIndex === undefined || !annotations[selectedIndex]) {
			return { ok: false, message: 'Select one mask first.' };
		}

		if (annotations.length < 2) {
			return { ok: false, message: 'Need at least two masks to merge.' };
		}

		const selected = annotations[selectedIndex];

		// 🔍 find nearest
		let nearestIndex = null;
		let nearestDistance = Infinity;

		annotations.forEach((ann, index) => {
			if (index === selectedIndex) return;
			const d = distanceBetween(selected, ann);
			if (d < nearestDistance) {
				nearestDistance = d;
				nearestIndex = index;
			}
		});

		if (nearestIndex === null) {
			return { ok: false, message: 'No nearest mask found.' };
		}

		const nearest = annotations[nearestIndex];

		// 🧠 merge contours
		const mergeResult = rasterMergeContours(selected.contour, nearest.contour);
		if (!mergeResult.ok) {
			return mergeResult;
		}

		// ✅ update ONLY the selected object
		const updatedSelected = computeAnnotationGeometry({
			...selected,
			contour: mergeResult.contour,
			source: 'edited',
		});

		annotations[selectedIndex] = updatedSelected;

		// ❗ remove only the nearest
		annotations.splice(nearestIndex, 1);

		// ⚠ fix index if needed
		if (nearestIndex < selectedIndex) {
			state.selectedAnnotationIndex -= 1;
		}

		if (state.markDirty) state.markDirty();

		return {
			ok: true,
			selectedAnnotationIndex: state.selectedAnnotationIndex,
		};
	}
    function startSplitMode(state) {
        state.splitLinePoints = [];
        state.isDrawingSplit = true;
        if (state.setHelpText) {
            state.setHelpText(
                'Split Mask mode: click multiple points to draw split path, double click or press Enter to finish, Backspace to remove last point, Esc to cancel.'
            );
        }
    }

    function cancelSplitMode(state) {
        state.splitLinePoints = [];
        state.isDrawingSplit = false;
        if (state.setHelpText) {
            state.setHelpText(
                'Click a tooth to inspect it. Use the tools to edit segmentation and save when finished.'
            );
        }
    }

    function finishSplitMode(state) {
        const annotations = state.getCurrentAnnotations();
        const selectedIndex = state.selectedAnnotationIndex;

        if (selectedIndex === null || selectedIndex === undefined || !annotations[selectedIndex]) {
            return { ok: false, message: 'Select one mask first.' };
        }

        if (!Array.isArray(state.splitLinePoints) || state.splitLinePoints.length < 2) {
            return { ok: false, message: 'Need at least 2 split points.' };
        }

        const current = annotations[selectedIndex];
        const currentContour = normalizeContour(current.contour);

        if (currentContour.length < 3) {
            return { ok: false, message: 'Selected mask has no valid contour.' };
        }

        const splitPath = dedupeSequentialPoints(
            state.splitLinePoints.map(([x, y]) => [Math.round(x), Math.round(y)]),
            1
        );

        if (splitPath.length < 2) {
            return { ok: false, message: 'Split path is too short.' };
        }

        const splitResult = rasterSplitContour(currentContour, splitPath);
        if (!splitResult.ok) {
            return splitResult;
        }

        const nextId = getNextAnnotationId(annotations);

        const partA = computeAnnotationGeometry({
            ...current,
            id: nextId,
            contour: splitResult.partA,
            source: 'edited',
        });

        const partB = computeAnnotationGeometry({
            ...current,
            id: nextId + 1,
            fdi: '',
            color: current.color || '#9ca3af',
            contour: splitResult.partB,
            source: 'edited',
        });

        if (partA.area < 20 || partB.area < 20) {
            return { ok: false, message: 'Split created a part that is too small.' };
        }

        annotations.splice(selectedIndex, 1, partA, partB);
        state.selectedAnnotationIndex = selectedIndex;
        state.splitLinePoints = [];
        state.isDrawingSplit = false;

        if (state.markDirty) state.markDirty();
        if (state.setHelpText) state.setHelpText('Mask split completed.');

        return {
            ok: true,
            selectedAnnotationIndex: selectedIndex,
        };
    }

    function buildSavePayload(state) {
        return {
            patient_id: state.patientId,
            images: (state.editedImages || []).map((item) => ({
                index: item.index,
                annotations: (
                    item.mask && Array.isArray(item.mask.annotations)
                        ? item.mask.annotations
                        : []
                ).map((ann, index) => {
                    const normalized = computeAnnotationGeometry(ann);
                    const bounds = getContourBounds(normalized.contour);

                    return {
                        id: normalized.id || (index + 1),
                        appearance_idx: index + 1,
                        fdi: normalized.fdi || '',
                        FDI_NUM: normalized.fdi || '',
                        color: normalized.color || '#9ca3af',
                        source: normalized.source || 'edited',
                        area: normalized.area || 0,
                        pixel_area: normalized.area || 0,
                        cx: normalized.cx || 0,
                        cy: normalized.cy || 0,
                        centroid_x: normalized.cx || 0,
                        centroid_y: normalized.cy || 0,
                        bbox: normalized.bbox || [0, 0, 0, 0],
                        x_min: bounds ? Math.round(bounds.minX) : 0,
                        y_min: bounds ? Math.round(bounds.minY) : 0,
                        x_max: bounds ? Math.round(bounds.maxX) : 0,
                        y_max: bounds ? Math.round(bounds.maxY) : 0,
                        contour: normalized.contour || [],
                        contours: normalized.contour && normalized.contour.length >= 3 ? [normalized.contour] : [],
                        contour_count: normalized.contour && normalized.contour.length >= 3 ? 1 : 0,
                        class_name: ann.class_name || 'tooth',
                        arch: ann.arch || null,
                    };
                }),
            })),
        };
    }

    return {
        polygonArea,
        normalizeContour,
        getContourBounds,
        getContourCentroid,
        computeAnnotationGeometry,
        getNextAnnotationId,
        startAddMode,
        cancelAddMode,
        finishAddMode,
        deleteMask,
        mergeNearest,
        startSplitMode,
        cancelSplitMode,
        finishSplitMode,
        buildSavePayload,
    };
})();