/**
 * VolumeViewer - Multi-instance 3D volume visualization
 * Implements axial, sagittal, coronal 2D slice views
 * Each instance manages its own state, renderers, and volume data.
 *
 * Refactored from CBCTViewer singleton to support multiple simultaneous viewers.
 */

class VolumeViewer {
    constructor(containerPrefix = '') {
        this.containerPrefix = containerPrefix;
        this.initialized = false;
        this.loading = false;
        this.targetModality = null;

        // Volume data (cached per instance)
        this.volumeData = null;
        this.dimensions = null;
        this.spacing = null;
        this.histogram = null;

        // Three.js objects (per instance)
        this.scenes = {};
        this.cameras = {};
        this.renderers = {};
        this.controls = {};
        this.renderFunctions = {};

        // View state
        this.slicePositions = {
            axial: 0,
            sagittal: 0,
            coronal: 0
        };

        this.zoomLevels = {
            axial: 1.0,
            sagittal: 1.0,
            coronal: 1.0
        };

        this.panOffsets = {
            axial: { x: 0, y: 0 },
            sagittal: { x: 0, y: 0 },
            coronal: { x: 0, y: 0 }
        };

        this.dataAspectRatios = {};
        this.baseCameraBounds = {};

        // Windowing
        this.windowLevel = 0.5;
        this.windowWidth = 1.0;
        this.windowPercentMin = 0;
        this.windowPercentMax = 100;
        this._cachedWindowParams = null;

        // Panoramic (CBCT only)
        this.panoramicZoom = 1.0;
        this.panoramicPan = { x: 0, y: 0 };
        this.panoramicCanvas = null;
        this.panoramicSourceCanvas = null;
        this.panoramicLoaded = false;

        // Event handler references for cleanup
        this._boundWindowResizeHandlerGeneral = null;
        this._boundWindowResizeHandlerDebounced = null;
        this._lastWindowSlider = null;
    }

    /**
     * Initialize the viewer for a specific modality
     * @param {string} modalitySlug - The modality to load (e.g., 'braintumor-mri-t1', 'cbct')
     */
    init(modalitySlug) {
        this.targetModality = modalitySlug || 'cbct';

        // Don't initialize for image modalities
        const imageModalities = ['intraoral', 'intraoral-photo', 'teleradiography', 'panoramic'];
        if (imageModalities.includes(this.targetModality)) {
            console.debug('Skipping volume viewer initialization for image modality:', this.targetModality);
            return;
        }

        // If we already have volume data cached for this modality, reinitialize viewers
        if (this.volumeData && this.dimensions) {
            console.debug('Using cached volume data for', this.targetModality);
            this.initialized = false;
            this.initializeViewers();
            this.initialized = true;
            this.loading = false;

            const idSlug = this.targetModality || 'cbct';
            const loadEl = document.getElementById(this.containerPrefix + idSlug + 'Loading');
            const viewsEl = document.getElementById(this.containerPrefix + idSlug + 'Views');
            if (loadEl) loadEl.style.display = 'none';
            if (viewsEl) viewsEl.style.display = 'block';
            return;
        }

        if (this.loading || this.initialized) {
            console.debug('Volume Viewer already loading or initialized');
            return;
        }

        console.debug('Initializing Volume Viewer for', this.targetModality, 'with prefix', this.containerPrefix);
        if (this.targetModality === 'cbct') {
            this.loadPanoramicImage();
        }
        this.loadVolumeData();
    }

    /**
     * Dispose the viewer and clean up resources
     */
    dispose() {
        try {
            // Remove resize listeners
            if (this._boundWindowResizeHandlerGeneral) {
                window.removeEventListener('resize', this._boundWindowResizeHandlerGeneral);
                this._boundWindowResizeHandlerGeneral = null;
            }
            if (this._boundWindowResizeHandlerDebounced) {
                window.removeEventListener('resize', this._boundWindowResizeHandlerDebounced);
                this._boundWindowResizeHandlerDebounced = null;
            }

            // Dispose 2D slice renderers and remove canvases
            ['axial', 'sagittal', 'coronal'].forEach(orientation => {
                const renderer = this.renderers && this.renderers[orientation];
                if (renderer) {
                    try {
                        // Properly dispose WebGL context
                        const gl = renderer.getContext();
                        if (gl) {
                            gl.getExtension('WEBGL_lose_context')?.loseContext();
                        }
                        renderer.dispose();
                    } catch (e) {
                        console.warn('Error disposing renderer:', e);
                    }
                    // Remove canvas from DOM
                    if (renderer.domElement && renderer.domElement.parentElement) {
                        renderer.domElement.parentElement.removeChild(renderer.domElement);
                    }
                }
                if (this.scenes) this.scenes[orientation] = null;
                if (this.cameras) this.cameras[orientation] = null;
                if (this.renderers) this.renderers[orientation] = null;
                if (this.renderFunctions) this.renderFunctions[orientation] = null;
            });
        } catch (e) {
            console.warn('Error during VolumeViewer dispose:', e);
        }

        // Reset state
        this.initialized = false;
        this.loading = false;
        this.dataAspectRatios = {};
        this.baseCameraBounds = {};
        this.zoomLevels = { axial: 1.0, sagittal: 1.0, coronal: 1.0 };
        this.panOffsets = { axial: { x: 0, y: 0 }, sagittal: { x: 0, y: 0 }, coronal: { x: 0, y: 0 } };

        console.debug('VolumeViewer disposed');
    }

    /**
     * Clear all cached data
     */
    clearCache() {
        console.debug('Clearing volume cache...');
        this.dispose();
        this.volumeData = null;
        this.dimensions = null;
        this.spacing = null;
        this.histogram = null;
    }

    loadPanoramicImage() {
        if (this.targetModality !== 'cbct') {
            return;
        }
        console.debug('Loading panoramic image...');

        const panoramicImg = document.getElementById('panoramicImage');
        const panoramicLoading = document.getElementById('panoramicLoading');
        const panoramicError = document.getElementById('panoramicError');

        if (!panoramicImg || !panoramicLoading || !panoramicError) return;

        panoramicLoading.style.display = 'block';
        panoramicImg.style.display = 'none';
        panoramicError.style.display = 'none';

        const testImg = new Image();

        testImg.onload = () => {
            console.debug('Panoramic image loaded successfully');
            panoramicImg.src = testImg.src;
            panoramicImg.style.display = 'block';
            panoramicLoading.style.display = 'none';
            panoramicError.style.display = 'none';
            this.panoramicLoaded = true;

            this.initPanoramicInteraction();
            try {
                this.initPanoramicCanvases(testImg);
                this.updatePanoramicWindowing();
            } catch (e) {
                console.warn('Panoramic canvas init failed:', e);
            }
        };

        testImg.onerror = () => {
            console.error('Panoramic image not available');
            panoramicLoading.style.display = 'none';
            panoramicImg.style.display = 'none';
            panoramicError.style.display = 'block';

            const errorElement = panoramicError.querySelector('p');
            if (errorElement) {
                if (!window.isCBCTProcessed) {
                    errorElement.textContent = 'Panoramic available after CBCT processing';
                } else {
                    errorElement.textContent = 'Panoramic view not available';
                }
            }

            this.panoramicLoaded = false;
        };

        testImg.src = `/${window.projectNamespace}/api/patient/${window.scanId}/panoramic/`;
    }

    loadVolumeData() {
        if (this.loading || this.initialized) {
            console.debug('Volume data already loading or loaded');
            return;
        }

        console.debug('Loading volume data...');
        this.loading = true;

        // Show loading indicator
        const idSlug = this.targetModality;
        const loadEl = document.getElementById(this.containerPrefix + idSlug + 'Loading');
        const viewsEl = document.getElementById(this.containerPrefix + idSlug + 'Views');
        if (loadEl) loadEl.style.display = 'flex';
        if (viewsEl) viewsEl.style.display = 'none';

        // Fetch volume data
        const url = (this.targetModality && this.targetModality !== 'cbct')
            ? `/${window.projectNamespace}/api/patient/${window.scanId}/volume/${this.targetModality}/`
            : `/${window.projectNamespace}/api/patient/${window.scanId}/cbct/`;

        fetch(url)
            .then(async response => {
                if (response.status === 202) {
                    const data = await response.json();
                    throw new Error(`processing:${data.message || 'Volume is being processed'}`);
                }
                if (!response.ok) {
                    try {
                        const errorData = await response.json();
                        if (errorData.status === 'processing') {
                            throw new Error(`processing:${errorData.message}`);
                        } else if (errorData.status === 'failed') {
                            throw new Error(`failed:${errorData.message}`);
                        }
                    } catch (e) {}
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response.arrayBuffer();
            })
            .then(async compressedData => {
                console.debug('Compressed volume data loaded, size:', compressedData.byteLength);

                try {
                    if (nifti.isCompressed(compressedData)) {
                        console.debug('Decompressing gzipped NIFTI data...');
                        await new Promise(resolve => setTimeout(resolve, 0));
                        const decompressedData = nifti.decompress(compressedData);
                        console.debug('Decompressed size:', decompressedData.byteLength);
                        await new Promise(resolve => setTimeout(resolve, 0));
                        this.parseNiftiData(decompressedData);
                    } else {
                        console.debug('NIFTI data is not compressed, using as-is');
                        this.parseNiftiData(compressedData);
                    }
                } catch (error) {
                    console.error('Error during decompression:', error);
                    this.loading = false;
                    this.showError('Failed to decompress volume data');
                }
            })
            .catch(error => {
                console.error('Error loading volume data:', error);
                this.loading = false;

                if (error.message.startsWith('processing:')) {
                    const message = error.message.substring('processing:'.length);
                    this.showError(message || 'Volume is being processed. Please check back later.', 'info');
                } else if (error.message.startsWith('failed:')) {
                    const message = error.message.substring('failed:'.length);
                    this.showError(message || 'Volume processing failed.', 'danger');
                } else {
                    this.showError('Failed to load volume data');
                }
            });
    }

    parseNiftiData(arrayBuffer) {
        console.debug('Parsing NIfTI data using NIFTI-Reader-JS...');

        try {
            const header = nifti.readHeader(arrayBuffer);
            if (!header) {
                throw new Error('Failed to read NIFTI header');
            }

            const dimX = header.dims[1];
            const dimY = header.dims[2];
            const dimZ = header.dims[3];

            const spacingX = header.pixDims[1];
            const spacingY = header.pixDims[2];
            const spacingZ = header.pixDims[3];

            const sclSlope = header.scl_slope || 1.0;
            const sclInter = header.scl_inter || 0.0;

            const datatype = header.datatypeCode;
            const bitpix = header.numBitsPerVoxel;

            console.debug(`NIFTI scaling: slope=${sclSlope}, intercept=${sclInter}`);
            console.debug(`NIfTI dimensions: ${dimX}x${dimY}x${dimZ}`);
            console.debug(`NIfTI spacing: ${spacingX}x${spacingY}x${spacingZ}`);
            console.debug(`NIfTI datatype: ${datatype}, bitpix: ${bitpix}`);

            if (dimX < 10 || dimY < 10 || dimZ < 10 || dimX > 2048 || dimY > 2048 || dimZ > 2048) {
                console.warn('Suspicious dimensions detected, may indicate parsing error');
            }

            this.dimensions = { x: dimX, y: dimY, z: dimZ };
            this.spacing = { x: spacingX, y: spacingY, z: spacingZ };

            const imageData = nifti.readImage(header, arrayBuffer);
            if (!imageData) {
                throw new Error('Failed to read NIFTI image data');
            }

            const volumeSize = dimX * dimY * dimZ;
            console.debug(`Volume size: ${volumeSize}`);
            console.debug(`Image data size: ${imageData.byteLength}`);

            this.volumeData = new Float32Array(volumeSize);
            this.histogram = { min: Infinity, max: -Infinity };

            let bytesPerVoxel = Math.max(1, bitpix / 8);
            const volumeData = this.volumeData;

            if (bytesPerVoxel === 1) {
                if (datatype === 2) { // DT_UNSIGNED_CHAR
                    const dataViewU8 = new Uint8Array(imageData);
                    for (let i = 0; i < volumeSize; i++) {
                        const huValue = dataViewU8[i] * sclSlope + sclInter;
                        volumeData[i] = huValue;
                        this.histogram.min = Math.min(this.histogram.min, huValue);
                        this.histogram.max = Math.max(this.histogram.max, huValue);
                    }
                } else { // DT_INT8
                    const dataViewI8 = new Int8Array(imageData);
                    for (let i = 0; i < volumeSize; i++) {
                        const huValue = dataViewI8[i] * sclSlope + sclInter;
                        volumeData[i] = huValue;
                        this.histogram.min = Math.min(this.histogram.min, huValue);
                        this.histogram.max = Math.max(this.histogram.max, huValue);
                    }
                }
            } else if (bytesPerVoxel === 2) {
                if (datatype === 512) { // DT_UINT16
                    const dataViewU16 = new Uint16Array(imageData);
                    for (let i = 0; i < volumeSize; i++) {
                        const huValue = dataViewU16[i] * sclSlope + sclInter;
                        volumeData[i] = huValue;
                        this.histogram.min = Math.min(this.histogram.min, huValue);
                        this.histogram.max = Math.max(this.histogram.max, huValue);
                    }
                } else { // DT_SIGNED_SHORT
                    const dataViewI16 = new Int16Array(imageData);
                    for (let i = 0; i < volumeSize; i++) {
                        const huValue = dataViewI16[i] * sclSlope + sclInter;
                        volumeData[i] = huValue;
                        this.histogram.min = Math.min(this.histogram.min, huValue);
                        this.histogram.max = Math.max(this.histogram.max, huValue);
                    }
                }
            } else if (bytesPerVoxel === 4) {
                if (datatype === 768) { // DT_UINT32
                    const dataViewU32 = new Uint32Array(imageData);
                    for (let i = 0; i < volumeSize; i++) {
                        const huValue = dataViewU32[i] * sclSlope + sclInter;
                        volumeData[i] = huValue;
                        this.histogram.min = Math.min(this.histogram.min, huValue);
                        this.histogram.max = Math.max(this.histogram.max, huValue);
                    }
                } else if (datatype === 16) { // DT_FLOAT
                    const dataViewF32 = new Float32Array(imageData);
                    for (let i = 0; i < volumeSize; i++) {
                        const value = dataViewF32[i];
                        if (isNaN(value) || !isFinite(value)) {
                            volumeData[i] = 0;
                        } else {
                            const huValue = value * sclSlope + sclInter;
                            volumeData[i] = huValue;
                            this.histogram.min = Math.min(this.histogram.min, huValue);
                            this.histogram.max = Math.max(this.histogram.max, huValue);
                        }
                    }
                } else { // DT_SIGNED_INT
                    const dataViewI32 = new Int32Array(imageData);
                    for (let i = 0; i < volumeSize; i++) {
                        const huValue = dataViewI32[i] * sclSlope + sclInter;
                        volumeData[i] = huValue;
                        this.histogram.min = Math.min(this.histogram.min, huValue);
                        this.histogram.max = Math.max(this.histogram.max, huValue);
                    }
                }
            } else if (bytesPerVoxel === 8) { // DT_DOUBLE
                const dataViewF64 = new Float64Array(imageData);
                for (let i = 0; i < volumeSize; i++) {
                    const value = dataViewF64[i];
                    if (isNaN(value) || !isFinite(value)) {
                        volumeData[i] = 0;
                    } else {
                        const huValue = value * sclSlope + sclInter;
                        volumeData[i] = huValue;
                        this.histogram.min = Math.min(this.histogram.min, huValue);
                        this.histogram.max = Math.max(this.histogram.max, huValue);
                    }
                }
            }

            console.debug(`Value range: ${this.histogram.min.toFixed(1)} to ${this.histogram.max.toFixed(1)}`);

            this.initializeViewers();
            this.initialized = true;
            this.loading = false;

            // Hide loading indicator
            const idSlug2 = this.targetModality || 'cbct';
            const loadEl2 = document.getElementById(this.containerPrefix + idSlug2 + 'Loading');
            const viewsEl2 = document.getElementById(this.containerPrefix + idSlug2 + 'Views');
            if (loadEl2) loadEl2.style.display = 'none';
            if (viewsEl2) viewsEl2.style.display = 'block';

        } catch (error) {
            console.error('Error parsing NIfTI data:', error);
            this.loading = false;
            this.showError('Failed to parse volume data');
        }
    }

    initializeViewers() {
        const idPrefix = (this.targetModality && this.targetModality !== 'cbct') ? (this.targetModality + '_') : '';
        this.initSliceViewer(idPrefix + 'axialView', 'axial');
        this.initSliceViewer(idPrefix + 'sagittalView', 'sagittal');
        this.initSliceViewer(idPrefix + 'coronalView', 'coronal');
        this.initVolumeViewerPlaceholder(idPrefix + 'volumeView');
        this.setupEventListeners();
    }

    initSliceViewer(containerId, orientation, retryCount = 0) {
        const actualContainerId = this.containerPrefix + containerId;
        const container = document.getElementById(actualContainerId);

        if (!container || container.clientWidth === 0 || container.clientHeight === 0) {
            if (retryCount < 50) {
                setTimeout(() => {
                    this.initSliceViewer(containerId, orientation, retryCount + 1);
                }, 100);
            } else {
                console.error('Failed to initialize slice viewer: container not ready after 5 seconds');
            }
            return;
        }

        if (!this.dimensions) {
            console.error('Cannot initialize slice viewer: dimensions not loaded');
            return;
        }

        const containerWidth = container.clientWidth;
        const containerHeight = container.clientHeight;

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x000000);

        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
        camera.position.set(0, 0, 1);
        camera.lookAt(0, 0, 0);

        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(containerWidth, containerHeight);
        container.appendChild(renderer.domElement);

        this.scenes[orientation] = scene;
        this.cameras[orientation] = camera;
        this.renderers[orientation] = renderer;

        let sliceWidth, sliceHeight;
        if (orientation === 'axial') {
            sliceWidth = this.dimensions.x;
            sliceHeight = this.dimensions.y;
        } else if (orientation === 'sagittal') {
            sliceWidth = this.dimensions.y;
            sliceHeight = this.dimensions.z;
        } else {
            sliceWidth = this.dimensions.x;
            sliceHeight = this.dimensions.z;
        }

        this.dataAspectRatios = this.dataAspectRatios || {};
        this.dataAspectRatios[orientation] = sliceWidth / sliceHeight;

        this.baseCameraBounds = this.baseCameraBounds || {};
        this.baseCameraBounds[orientation] = {
            left: -1,
            right: 1,
            top: 1,
            bottom: -1
        };

        if (orientation === 'axial') {
            this.slicePositions[orientation] = Math.floor(this.dimensions.z / 2);
        } else if (orientation === 'sagittal') {
            this.slicePositions[orientation] = Math.floor(this.dimensions.x / 2);
        } else {
            this.slicePositions[orientation] = Math.floor(this.dimensions.y / 2);
        }

        this.updateSlice(orientation);
        this.updateSliceLabel(orientation);

        // Bind event handlers with proper 'this' context
        renderer.domElement.addEventListener('wheel', (event) => {
            event.preventDefault();
            event.stopPropagation();

            if (event.ctrlKey) {
                this.handleSliceZoom(orientation, event.deltaY > 0 ? -0.1 : 0.1);
            } else {
                let offset = event.shiftKey ? 10 : 1;
                this.handleSliceScroll(orientation, event.deltaY > 0 ? offset : -offset);
            }
        }, { passive: false });

        let isDragging = false;
        let lastMouseX = 0;
        let lastMouseY = 0;

        renderer.domElement.addEventListener('mousedown', (event) => {
            if (event.button === 0) {
                event.preventDefault();
                event.stopPropagation();
                isDragging = true;
                lastMouseX = event.clientX;
                lastMouseY = event.clientY;
                renderer.domElement.style.cursor = 'move';
            }
        });

        renderer.domElement.addEventListener('mousemove', (event) => {
            if (isDragging && event.buttons === 1) {
                event.preventDefault();
                event.stopPropagation();

                const deltaX = event.clientX - lastMouseX;
                const deltaY = event.clientY - lastMouseY;

                this.handleSlicePan(orientation, deltaX, deltaY);

                lastMouseX = event.clientX;
                lastMouseY = event.clientY;
            }
        });

        renderer.domElement.addEventListener('mouseup', (event) => {
            if (event.button === 0) {
                event.preventDefault();
                event.stopPropagation();
                isDragging = false;
                renderer.domElement.style.cursor = 'crosshair';
            }
        });

        renderer.domElement.addEventListener('mouseleave', () => {
            isDragging = false;
            renderer.domElement.style.cursor = 'crosshair';
        });

        renderer.domElement.addEventListener('contextmenu', (event) => {
            event.preventDefault();
        });

        renderer.render(scene, camera);

        this.renderFunctions = this.renderFunctions || {};
        this.renderFunctions[orientation] = () => {
            renderer.render(scene, camera);
        };
    }

    initVolumeViewerPlaceholder(containerId) {
        const actualContainerId = this.containerPrefix + containerId;
        const container = document.getElementById(actualContainerId);
        if (!container) return;

        container.innerHTML = '';

        const placeholder = document.createElement('div');
        placeholder.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: center;
            width: 100%;
            height: 100%;
            background-color: #1a1a1a;
            color: #888;
            font-size: 1.2rem;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        `;
        placeholder.innerHTML = `
            <div style="text-align: center;">
                <i class="fas fa-cube" style="font-size: 3rem; opacity: 0.5; margin-bottom: 1rem; display: block;"></i>
                <div>3D Volume Rendering</div>
                <div style="font-size: 0.9rem; opacity: 0.7; margin-top: 0.5rem;">Not yet supported</div>
            </div>
        `;
        container.appendChild(placeholder);
    }

    updateSlice(orientation) {
        const scene = this.scenes[orientation];
        const position = this.slicePositions[orientation];
        const dataAspectRatio = this.dataAspectRatios[orientation];

        while (scene.children.length > 0) {
            scene.remove(scene.children[0]);
        }

        const texture = this.createSliceTexture(orientation, position);
        const containerAspect = this.renderers[orientation].domElement.width / this.renderers[orientation].domElement.height;
        let planeWidth, planeHeight;

        if (dataAspectRatio > containerAspect) {
            planeWidth = 2.0;
            planeHeight = 2.0 * containerAspect / dataAspectRatio;
        } else {
            planeHeight = 2.0;
            planeWidth = 2.0 * dataAspectRatio / containerAspect;
        }

        const geometry = new THREE.PlaneGeometry(planeWidth, planeHeight);
        const material = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: false,
            side: THREE.DoubleSide
        });

        const plane = new THREE.Mesh(geometry, material);
        scene.add(plane);

        this.addCrosshairs(orientation, planeWidth, planeHeight);

        if (this.renderFunctions && this.renderFunctions[orientation]) {
            this.renderFunctions[orientation]();
        } else {
            this.renderers[orientation].render(scene, this.cameras[orientation]);
        }
    }

    addCrosshairs(orientation, planeWidth, planeHeight) {
        const scene = this.scenes[orientation];

        if (orientation === 'axial') {
            const sagittalPos = this.slicePositions.sagittal;
            const sagittalNormalized = (sagittalPos / (this.dimensions.x - 1)) * 2 - 1;
            const sagittalX = sagittalNormalized * (planeWidth / 2);

            const sagittalMaterial = new THREE.LineBasicMaterial({
                color: 0x0000ff,
                linewidth: 2,
                transparent: true,
                opacity: 0.8
            });

            const sagittalGeometry = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(sagittalX, -planeHeight / 2, 0.001),
                new THREE.Vector3(sagittalX, planeHeight / 2, 0.001)
            ]);
            const sagittalLine = new THREE.Line(sagittalGeometry, sagittalMaterial);
            scene.add(sagittalLine);

            const coronalPos = this.slicePositions.coronal;
            const coronalNormalized = (coronalPos / (this.dimensions.y - 1)) * 2 - 1;
            const coronalY = coronalNormalized * (planeHeight / 2);

            const coronalMaterial = new THREE.LineBasicMaterial({
                color: 0x00ff00,
                linewidth: 2,
                transparent: true,
                opacity: 0.8
            });

            const coronalGeometry = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(-planeWidth / 2, coronalY, 0.001),
                new THREE.Vector3(planeWidth / 2, coronalY, 0.001)
            ]);
            const coronalLine = new THREE.Line(coronalGeometry, coronalMaterial);
            scene.add(coronalLine);

        } else if (orientation === 'sagittal') {
            const axialPos = this.slicePositions.axial;
            const axialNormalized = (axialPos / (this.dimensions.z - 1)) * 2 - 1;
            const axialZ = axialNormalized * (planeHeight / 2);

            const axialMaterial = new THREE.LineBasicMaterial({
                color: 0xff0000,
                linewidth: 2,
                transparent: true,
                opacity: 0.8
            });

            const axialGeometry = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(-planeWidth / 2, axialZ, 0.001),
                new THREE.Vector3(planeWidth / 2, axialZ, 0.001)
            ]);
            const axialLine = new THREE.Line(axialGeometry, axialMaterial);
            scene.add(axialLine);

            const coronalPos = this.slicePositions.coronal;
            const coronalNormalized = (coronalPos / (this.dimensions.y - 1)) * 2 - 1;
            const coronalY = coronalNormalized * (planeWidth / 2);

            const coronalMaterial = new THREE.LineBasicMaterial({
                color: 0x00ff00,
                linewidth: 2,
                transparent: true,
                opacity: 0.8
            });

            const coronalGeometry = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(coronalY, -planeHeight / 2, 0.001),
                new THREE.Vector3(coronalY, planeHeight / 2, 0.001)
            ]);
            const coronalLine = new THREE.Line(coronalGeometry, coronalMaterial);
            scene.add(coronalLine);

        } else if (orientation === 'coronal') {
            const axialPos = this.slicePositions.axial;
            const axialNormalized = (axialPos / (this.dimensions.z - 1)) * 2 - 1;
            const axialZ = axialNormalized * (planeHeight / 2);

            const axialMaterial = new THREE.LineBasicMaterial({
                color: 0xff0000,
                linewidth: 2,
                transparent: true,
                opacity: 0.8
            });

            const axialGeometry = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(-planeWidth / 2, axialZ, 0.001),
                new THREE.Vector3(planeWidth / 2, axialZ, 0.001)
            ]);
            const axialLine = new THREE.Line(axialGeometry, axialMaterial);
            scene.add(axialLine);

            const sagittalPos = this.slicePositions.sagittal;
            const sagittalNormalized = (sagittalPos / (this.dimensions.x - 1)) * 2 - 1;
            const sagittalX = sagittalNormalized * (planeWidth / 2);

            const sagittalMaterial = new THREE.LineBasicMaterial({
                color: 0x0000ff,
                linewidth: 2,
                transparent: true,
                opacity: 0.8
            });

            const sagittalGeometry = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(sagittalX, -planeHeight / 2, 0.001),
                new THREE.Vector3(sagittalX, planeHeight / 2, 0.001)
            ]);
            const sagittalLine = new THREE.Line(sagittalGeometry, sagittalMaterial);
            scene.add(sagittalLine);
        }
    }

    updateCrosshairs(changedOrientation) {
        const orientations = ['axial', 'sagittal', 'coronal'];

        orientations.forEach(orientation => {
            if (orientation !== changedOrientation && this.scenes[orientation]) {
                this.updateSlice(orientation);
            }
        });
    }

    createSliceTexture(orientation, sliceIndex) {
        let sliceWidth, sliceHeight, sliceData;

        if (orientation === 'axial') {
            sliceWidth = this.dimensions.x;
            sliceHeight = this.dimensions.y;
        } else if (orientation === 'sagittal') {
            sliceWidth = this.dimensions.y;
            sliceHeight = this.dimensions.z;
        } else {
            sliceWidth = this.dimensions.x;
            sliceHeight = this.dimensions.z;
        }

        sliceData = new Uint8Array(sliceWidth * sliceHeight);

        const params = this._calculateWindowParams();
        const windowMin = params.windowMin;
        const windowMax = params.windowMax;
        const windowRange = params.windowRange;

        if (orientation === 'axial') {
            for (let y = 0; y < sliceHeight; y++) {
                for (let x = 0; x < sliceWidth; x++) {
                    const idx3d = sliceIndex * sliceWidth * sliceHeight + y * sliceWidth + x;
                    const idx2d = y * sliceWidth + x;
                    if (idx3d < this.volumeData.length) {
                        const huValue = this.volumeData[idx3d];
                        const clampedValue = Math.max(windowMin, Math.min(windowMax, huValue));
                        const normalizedValue = (clampedValue - windowMin) / windowRange;
                        sliceData[idx2d] = Math.floor(normalizedValue * 255);
                    }
                }
            }
        } else if (orientation === 'sagittal') {
            for (let z = 0; z < sliceHeight; z++) {
                for (let y = 0; y < sliceWidth; y++) {
                    const idx3d = z * this.dimensions.x * this.dimensions.y + y * this.dimensions.x + sliceIndex;
                    const idx2d = z * sliceWidth + y;
                    if (idx3d < this.volumeData.length) {
                        const huValue = this.volumeData[idx3d];
                        const clampedValue = Math.max(windowMin, Math.min(windowMax, huValue));
                        const normalizedValue = (clampedValue - windowMin) / windowRange;
                        sliceData[idx2d] = Math.floor(normalizedValue * 255);
                    }
                }
            }
        } else {
            for (let z = 0; z < sliceHeight; z++) {
                for (let x = 0; x < sliceWidth; x++) {
                    const idx3d = z * this.dimensions.x * this.dimensions.y + sliceIndex * this.dimensions.x + x;
                    const idx2d = z * sliceWidth + x;
                    if (idx3d < this.volumeData.length) {
                        const huValue = this.volumeData[idx3d];
                        const clampedValue = Math.max(windowMin, Math.min(windowMax, huValue));
                        const normalizedValue = (clampedValue - windowMin) / windowRange;
                        sliceData[idx2d] = Math.floor(normalizedValue * 255);
                    }
                }
            }
        }

        const texture = new THREE.DataTexture(sliceData, sliceWidth, sliceHeight, THREE.LuminanceFormat, THREE.UnsignedByteType);
        texture.minFilter = THREE.NearestFilter;
        texture.magFilter = THREE.NearestFilter;
        texture.needsUpdate = true;
        return texture;
    }

    handleSliceScroll(orientation, direction) {
        if (!this.initialized || !this.volumeData || !this.dimensions) {
            return;
        }

        let maxSlice;
        if (orientation === 'axial') {
            maxSlice = this.dimensions.z - 1;
        } else if (orientation === 'sagittal') {
            maxSlice = this.dimensions.x - 1;
        } else {
            maxSlice = this.dimensions.y - 1;
        }

        this.slicePositions[orientation] = Math.max(0, Math.min(maxSlice,
            this.slicePositions[orientation] + direction));

        this.updateSlice(orientation);
        this.updateSliceLabel(orientation);
        this.updateCrosshairs(orientation);
    }

    handleSliceZoom(orientation, zoomDelta) {
        if (!this.initialized || !this.cameras[orientation] || !this.baseCameraBounds[orientation]) {
            return;
        }

        this.zoomLevels[orientation] = Math.max(0.1, Math.min(5.0,
            this.zoomLevels[orientation] + zoomDelta));

        const camera = this.cameras[orientation];
        const baseBounds = this.baseCameraBounds[orientation];
        const zoomLevel = this.zoomLevels[orientation];

        const width = (baseBounds.right - baseBounds.left) / zoomLevel;
        const height = (baseBounds.top - baseBounds.bottom) / zoomLevel;

        if (zoomLevel <= 1.0) {
            this.panOffsets[orientation].x = 0;
            this.panOffsets[orientation].y = 0;
        }

        const panX = this.panOffsets[orientation].x;
        const panY = this.panOffsets[orientation].y;

        camera.left = -width / 2 + panX;
        camera.right = width / 2 + panX;
        camera.top = height / 2 + panY;
        camera.bottom = -height / 2 + panY;

        camera.updateProjectionMatrix();

        if (this.renderFunctions[orientation]) {
            this.renderFunctions[orientation]();
        }
    }

    handleSlicePan(orientation, deltaX, deltaY) {
        if (!this.initialized || !this.cameras[orientation] || !this.baseCameraBounds[orientation]) {
            return;
        }

        const camera = this.cameras[orientation];
        const baseBounds = this.baseCameraBounds[orientation];
        const zoomLevel = this.zoomLevels[orientation];

        if (zoomLevel <= 1.0) {
            return;
        }

        const currentWidth = (baseBounds.right - baseBounds.left) / zoomLevel;
        const currentHeight = (baseBounds.top - baseBounds.bottom) / zoomLevel;
        const container = this.renderers[orientation].domElement;

        const panSensitivityX = currentWidth / container.clientWidth;
        const panSensitivityY = currentHeight / container.clientHeight;

        this.panOffsets[orientation].x -= deltaX * panSensitivityX;
        this.panOffsets[orientation].y += deltaY * panSensitivityY;

        const panX = this.panOffsets[orientation].x;
        const panY = this.panOffsets[orientation].y;

        camera.left = -currentWidth / 2 + panX;
        camera.right = currentWidth / 2 + panX;
        camera.top = currentHeight / 2 + panY;
        camera.bottom = -currentHeight / 2 + panY;

        camera.updateProjectionMatrix();

        if (this.renderFunctions[orientation]) {
            this.renderFunctions[orientation]();
        }
    }

    initPanoramicInteraction() {
        const panoramicView = document.getElementById('panoramicView');
        const panoramicImg = document.getElementById('panoramicImage');

        if (!panoramicView || !panoramicImg) {
            console.warn('Panoramic elements not found');
            return;
        }

        this.panoramicZoom = 1.0;
        this.panoramicPan = { x: 0, y: 0 };
        this.updatePanoramicTransform();

        panoramicView.addEventListener('wheel', (event) => {
            event.preventDefault();
            event.stopPropagation();

            const zoomDelta = event.deltaY > 0 ? -0.1 : 0.1;
            this.handlePanoramicZoom(zoomDelta);
        }, { passive: false });

        let isDragging = false;
        let lastMouseX = 0;
        let lastMouseY = 0;

        panoramicView.addEventListener('mousedown', (event) => {
            if (event.button === 0) {
                event.preventDefault();
                event.stopPropagation();
                isDragging = true;
                lastMouseX = event.clientX;
                lastMouseY = event.clientY;
                panoramicView.style.cursor = 'move';
            }
        });

        panoramicView.addEventListener('mousemove', (event) => {
            if (isDragging && event.buttons === 1) {
                event.preventDefault();
                event.stopPropagation();

                const deltaX = event.clientX - lastMouseX;
                const deltaY = event.clientY - lastMouseY;

                this.handlePanoramicPan(deltaX, deltaY);

                lastMouseX = event.clientX;
                lastMouseY = event.clientY;
            }
        });

        panoramicView.addEventListener('mouseup', (event) => {
            if (event.button === 0) {
                isDragging = false;
                panoramicView.style.cursor = 'crosshair';
            }
        });

        panoramicView.addEventListener('contextmenu', (event) => {
            event.preventDefault();
        });

        panoramicView.addEventListener('dblclick', (event) => {
            event.preventDefault();
            this.resetPanoramicView();
        });
    }

    handlePanoramicZoom(zoomDelta) {
        this.panoramicZoom = Math.max(0.5, Math.min(5.0, this.panoramicZoom + zoomDelta));

        if (this.panoramicZoom <= 1.0) {
            this.panoramicPan.x = 0;
            this.panoramicPan.y = 0;
        }

        this.updatePanoramicTransform();
    }

    handlePanoramicPan(deltaX, deltaY) {
        if (this.panoramicZoom <= 1.0) {
            return;
        }

        const panSensitivity = 1.0 / this.panoramicZoom;

        this.panoramicPan.x += deltaX * panSensitivity;
        this.panoramicPan.y += deltaY * panSensitivity;

        this.updatePanoramicTransform();
    }

    updatePanoramicTransform() {
        const panoramicImg = document.getElementById('panoramicImage');
        const canvas = this.panoramicCanvas;
        const target = (canvas && canvas.style.display !== 'none') ? canvas : panoramicImg;
        if (!target) return;
        const transform = `scale(${this.panoramicZoom}) translate(${this.panoramicPan.x}px, ${this.panoramicPan.y}px)`;
        target.style.transform = transform;
        target.style.transformOrigin = 'center center';
    }

    resetPanoramicView() {
        this.panoramicZoom = 1.0;
        this.panoramicPan = { x: 0, y: 0 };
        this.updatePanoramicTransform();
    }

    _calculateWindowParams() {
        const histMin = (this.histogram && isFinite(this.histogram.min)) ? this.histogram.min : -1000;
        const histMax = (this.histogram && isFinite(this.histogram.max)) ? this.histogram.max : 3000;
        const pMin = Math.max(0, Math.min(100, this.windowPercentMin));
        const pMax = Math.max(0, Math.min(100, this.windowPercentMax));
        const lowP = Math.min(pMin, pMax);
        const highP = Math.max(pMin, pMax);
        const windowMin = histMin + (histMax - histMin) * (lowP / 100.0);
        const windowMax = histMin + (histMax - histMin) * (highP / 100.0);
        const windowRange = Math.max(0.001, windowMax - windowMin);

        this._cachedWindowParams = { windowMin, windowMax, windowRange };
        return this._cachedWindowParams;
    }

    applyWindowing(huValue) {
        const params = this._cachedWindowParams || this._calculateWindowParams();
        const clampedValue = Math.max(params.windowMin, Math.min(params.windowMax, huValue));
        const normalizedValue = (clampedValue - params.windowMin) / params.windowRange;
        return Math.floor(normalizedValue * 255);
    }

    updateSliceLabel(orientation) {
        let maxSlice, currentSlice;
        if (orientation === 'axial') {
            maxSlice = this.dimensions.z;
            currentSlice = this.slicePositions[orientation] + 1;
        } else if (orientation === 'sagittal') {
            maxSlice = this.dimensions.x;
            currentSlice = this.slicePositions[orientation] + 1;
        } else {
            maxSlice = this.dimensions.y;
            currentSlice = this.slicePositions[orientation] + 1;
        }

        const prefix = (this.targetModality && this.targetModality !== 'cbct') ? (this.targetModality + '_') : '';
        const containerId = orientation === 'axial' ? (prefix + 'axialView') :
                           orientation === 'sagittal' ? (prefix + 'sagittalView') : (prefix + 'coronalView');
        const container = document.getElementById(this.containerPrefix + containerId);

        if (!container) return;

        let label = container.querySelector('.slice-counter');
        if (!label) {
            label = document.createElement('div');
            label.className = 'slice-counter';
            label.style.cssText = `
                position: absolute;
                bottom: 5px;
                right: 10px;
                color: white;
                font-size: 0.8rem;
                background: rgba(0, 0, 0, 0.7);
                padding: 2px 6px;
                border-radius: 3px;
                z-index: 100;
                pointer-events: none;
            `;
            container.appendChild(label);
        }

        label.textContent = `${currentSlice}/${maxSlice}`;
    }

    refreshAllViews() {
        if (!this.initialized) {
            console.debug('Volume viewer not initialized yet, cannot refresh');
            return;
        }

        console.debug('Refreshing all volume views...');

        setTimeout(() => {
            ['axial', 'sagittal', 'coronal'].forEach(orientation => {
                if (this.renderers[orientation] && this.scenes[orientation] && this.cameras[orientation]) {
                    const prefix = (this.targetModality && this.targetModality !== 'cbct') ? (this.targetModality + '_') : '';
                    const containerId = orientation === 'axial' ? (prefix + 'axialView') :
                                       orientation === 'sagittal' ? (prefix + 'sagittalView') : (prefix + 'coronalView');
                    const container = document.getElementById(this.containerPrefix + containerId);
                    if (container && container.clientWidth > 0 && container.clientHeight > 0) {
                        this.renderers[orientation].setSize(container.clientWidth, container.clientHeight);
                        this.zoomLevels[orientation] = 1.0;
                        this.panOffsets[orientation] = { x: 0, y: 0 };

                        const camera = this.cameras[orientation];
                        camera.left = -1;
                        camera.right = 1;
                        camera.top = 1;
                        camera.bottom = -1;
                        camera.updateProjectionMatrix();

                        this.updateSlice(orientation);
                    }
                }
            });

            if (this.targetModality === 'cbct' && !this.panoramicLoaded) {
                console.debug('Refreshing panoramic image...');
                this.loadPanoramicImage();
            }
        }, 50);
    }

    setupEventListeners() {
        // Note: Per-viewer event listeners are already set up in initSliceViewer
        // Global listeners (windowing sliders, reset button) should be handled by the page, not the viewer instance
    }

    resetAllViews() {
        this.slicePositions.axial = Math.floor(this.dimensions.z / 2);
        this.slicePositions.sagittal = Math.floor(this.dimensions.x / 2);
        this.slicePositions.coronal = Math.floor(this.dimensions.y / 2);

        this.updateSlice('axial');
        this.updateSlice('sagittal');
        this.updateSlice('coronal');

        if (this.controls.volume) {
            this.controls.volume.reset();
        }
    }

    handleResize() {
        const prefix = (this.targetModality && this.targetModality !== 'cbct') ? (this.targetModality + '_') : '';
        ['axial', 'sagittal', 'coronal'].forEach(orientation => {
            if (this.renderers[orientation] && this.cameras[orientation]) {
                const containerId = orientation === 'axial' ? (prefix + 'axialView') :
                                   orientation === 'sagittal' ? (prefix + 'sagittalView') : (prefix + 'coronalView');
                const container = document.getElementById(this.containerPrefix + containerId);
                if (container && container.clientWidth > 0 && container.clientHeight > 0) {
                    this.renderers[orientation].setSize(container.clientWidth, container.clientHeight);

                    const zoomLevel = this.zoomLevels[orientation] || 1.0;
                    const panX = (this.panOffsets[orientation] && this.panOffsets[orientation].x) || 0;
                    const panY = (this.panOffsets[orientation] && this.panOffsets[orientation].y) || 0;

                    const width = 2 / zoomLevel;
                    const height = 2 / zoomLevel;

                    const camera = this.cameras[orientation];
                    camera.left = -width / 2 + panX;
                    camera.right = width / 2 + panX;
                    camera.top = height / 2 + panY;
                    camera.bottom = -height / 2 + panY;
                    camera.updateProjectionMatrix();
                    this.updateSlice(orientation);
                }
            }
        });
    }

    showError(message, type = 'warning') {
        const idSlug = (this.targetModality && this.targetModality !== 'cbct') ? this.targetModality : 'cbct';
        const loadingDiv = document.getElementById(this.containerPrefix + idSlug + 'Loading') || document.getElementById(this.containerPrefix + 'cbctLoading');
        let iconClass = 'fa-exclamation-triangle text-warning';
        let textClass = 'text-muted';

        if (type === 'info') {
            iconClass = 'fa-info-circle text-info';
            textClass = 'text-info';
        } else if (type === 'danger') {
            iconClass = 'fa-times-circle text-danger';
            textClass = 'text-danger';
        }

        if (!loadingDiv) return;
        loadingDiv.innerHTML = `
            <div class="text-center py-4">
                <i class="fas ${iconClass} mb-2" style="font-size: 2rem;"></i>
                <p class="${textClass}">${message}</p>
            </div>
        `;
    }

    forceRefreshPanoramic() {
        console.log('Force refreshing panoramic image...');
        this.panoramicLoaded = false;

        const panoramicImg = document.getElementById('panoramicImage');
        const panoramicLoading = document.getElementById('panoramicLoading');
        const panoramicError = document.getElementById('panoramicError');

        if (panoramicImg) panoramicImg.style.display = 'none';
        if (panoramicError) panoramicError.style.display = 'none';
        if (panoramicLoading) panoramicLoading.style.display = 'block';

        if (this.panoramicCanvas && this.panoramicCanvas.parentElement) {
            this.panoramicCanvas.parentElement.removeChild(this.panoramicCanvas);
        }
        this.panoramicCanvas = null;
        this.panoramicSourceCanvas = null;

        this.loadPanoramicImage();
    }

    initPanoramicCanvases(loadedImg) {
        const panoramicView = document.getElementById('panoramicView');
        const imgEl = document.getElementById('panoramicImage');
        if (!panoramicView || !imgEl || !loadedImg) return;
        if (!this.panoramicSourceCanvas) {
            this.panoramicSourceCanvas = document.createElement('canvas');
        }
        const srcCanvas = this.panoramicSourceCanvas;
        srcCanvas.width = loadedImg.naturalWidth || loadedImg.width;
        srcCanvas.height = loadedImg.naturalHeight || loadedImg.height;
        const srcCtx = srcCanvas.getContext('2d', { willReadFrequently: true });
        srcCtx.drawImage(loadedImg, 0, 0, srcCanvas.width, srcCanvas.height);
        if (!this.panoramicCanvas) {
            this.panoramicCanvas = document.createElement('canvas');
            this.panoramicCanvas.id = 'panoramicCanvas';
            this.panoramicCanvas.className = 'panoramic-image';
            this.panoramicCanvas.style.maxWidth = '100%';
            this.panoramicCanvas.style.maxHeight = '100%';
            this.panoramicCanvas.style.objectFit = 'contain';
            panoramicView.appendChild(this.panoramicCanvas);
        }
        const canvas = this.panoramicCanvas;
        canvas.width = srcCanvas.width;
        canvas.height = srcCanvas.height;
        imgEl.style.display = 'none';
        canvas.style.display = 'block';
        this.updatePanoramicTransform();
    }

    updatePanoramicWindowing() {
        if (!this.panoramicCanvas || !this.panoramicSourceCanvas) return;
        const dst = this.panoramicCanvas;
        const src = this.panoramicSourceCanvas;
        const srcCtx = src.getContext('2d', { willReadFrequently: true });
        const dstCtx = dst.getContext('2d', { willReadFrequently: true });
        const imgData = srcCtx.getImageData(0, 0, src.width, src.height);
        const data = imgData.data;
        const pMin = Math.max(0, Math.min(100, this.windowPercentMin));
        const pMax = Math.max(0, Math.min(100, this.windowPercentMax));
        const lowP = Math.min(pMin, pMax);
        const highP = Math.max(pMin, pMax);
        const vMin = Math.round(255 * (lowP / 100));
        const vMax = Math.round(255 * (highP / 100));
        const range = Math.max(1, vMax - vMin);
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const intensity = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
            const clamped = Math.max(vMin, Math.min(vMax, intensity));
            const mapped = Math.round(((clamped - vMin) / range) * 255);
            data[i] = data[i + 1] = data[i + 2] = mapped;
        }
        dstCtx.putImageData(imgData, 0, 0);
    }
}

// Legacy compatibility: Create a wrapper that mimics the old singleton API
// This allows existing code (Maxillo pages) to continue working
window.CBCTViewer = {
    _instance: null,
    containerPrefix: '',

    init: function(modalitySlug) {
        // Create new instance with current containerPrefix
        if (this._instance) {
            this._instance.dispose();
        }
        this._instance = new VolumeViewer(this.containerPrefix);
        this._instance.init(modalitySlug);
    },

    dispose: function() {
        if (this._instance) {
            this._instance.dispose();
            this._instance = null;
        }
    },

    clearCache: function() {
        if (this._instance) {
            this._instance.clearCache();
        }
    },

    refreshAllViews: function() {
        if (this._instance) {
            this._instance.refreshAllViews();
        }
    },

    // Proxy common properties
    get initialized() {
        return this._instance ? this._instance.initialized : false;
    },

    get loading() {
        return this._instance ? this._instance.loading : false;
    },

    get volumeData() {
        return this._instance ? this._instance.volumeData : null;
    },

    get dimensions() {
        return this._instance ? this._instance.dimensions : null;
    }
};

// Export class for direct use
window.VolumeViewer = VolumeViewer;
