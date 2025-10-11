/**
 * CBCT Viewer - 4-view visualization
 * Implements axial, sagittal, coronal 2D slice views and panoramic view
 * Note: 3D volume rendering is disabled
 */

// Note: 3D volume rendering has been disabled - only 2D slice views are available
const projectNamespace = window.projectNamespace;

window.CBCTViewer = {
    initialized: false,
    volumeData: null,
    dimensions: null,
    spacing: null,
    
    scenes: {},
    cameras: {},
    renderers: {},
    controls: {},
    
    slicePositions: {
        axial: 0,
        sagittal: 0,
        coronal: 0
    },
    
    zoomLevels: {
        axial: 1.0,
        sagittal: 1.0,
        coronal: 1.0
    },
    
    panOffsets: {
        axial: { x: 0, y: 0 },
        sagittal: { x: 0, y: 0 },
        coronal: { x: 0, y: 0 }
    },
    
    panoramicZoom: 1.0,
    panoramicPan: { x: 0, y: 0 },
    panoramicCanvas: null,
    panoramicSourceCanvas: null,
    
    renderMode: 'mip', // 'mip', 'translucent', 'attenuated'
    windowLevel: 0.5,
    windowWidth: 1.0,
    windowPercentMin: 0,
    windowPercentMax: 100,
    
    loading: false,
    panoramicLoaded: false,
    _boundWindowResizeHandlerGeneral: null,
    _boundWindowResizeHandlerDebounced: null,
    
    init: function(modalitySlug) {
        this.targetModality = modalitySlug || 'cbct';
        
        // Don't initialize CBCT viewer for image modalities
        const imageModalities = ['intraoral', 'intraoral-photo', 'teleradiography', 'panoramic'];
        if (imageModalities.includes(this.targetModality)) {
            console.debug('Skipping CBCT viewer initialization for image modality:', this.targetModality);
            return;
        }
        
        // If we already have the volume data cached, just reinitialize the viewers
        if (this.volumeData && this.dimensions) {
            console.debug('Using cached volume data for', this.targetModality);
            this.initialized = false; // Reset so we can reinitialize
            this.initializeViewers();
            this.initialized = true;
            this.loading = false;
            
            const idSlug = this.targetModality || 'cbct';
            const loadEl = document.getElementById(idSlug + 'Loading');
            const viewsEl = document.getElementById(idSlug + 'Views');
            if (loadEl) loadEl.style.display = 'none';
            if (viewsEl) viewsEl.style.display = 'block';
            return;
        }
        
        if (this.loading || this.initialized) {
            console.debug('CBCT Viewer already loading or initialized');
            return;
        }
        
        console.debug('Initializing Volume Viewer for', this.targetModality);
        if (this.targetModality === 'cbct') {
            this.loadPanoramicImage();
        }
        this.loadVolumeData();
    },
    
    dispose: function() {
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
            ['axial','sagittal','coronal'].forEach(orientation => {
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
            // Volume renderer removed - no longer used
        } catch (e) {
            console.warn('Error during CBCTViewer dispose:', e);
        }
        // Reset state BUT KEEP CACHED DATA (volumeData, dimensions, spacing, histogram)
        this.initialized = false;
        this.loading = false;
        // Don't clear: volumeData, dimensions, spacing, histogram (for caching)
        this.dataAspectRatios = {};
        this.baseCameraBounds = {};
        this.zoomLevels = { axial: 1.0, sagittal: 1.0, coronal: 1.0 };
        this.panOffsets = { axial: {x:0,y:0}, sagittal: {x:0,y:0}, coronal: {x:0,y:0} };
        console.debug('CBCTViewer disposed (data cached)');
    },
    
    loadPanoramicImage: function() {
        if (this.targetModality !== 'cbct') {
            return;
        }
        console.debug('Loading panoramic image...');
        
        const panoramicImg = document.getElementById('panoramicImage');
        const panoramicLoading = document.getElementById('panoramicLoading');
        const panoramicError = document.getElementById('panoramicError');
        
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
    },
    
    loadVolumeData: function() {
        if (this.loading || this.initialized) {
            console.debug('Volume data already loading or loaded');
            return;
        }
        
        console.debug('Loading volume data...');
        this.loading = true;
        
        // Show loading indicator (wrappers use slug without underscore)
        const idSlug = this.targetModality;
        const loadEl = document.getElementById(idSlug + 'Loading');
        const viewsEl = document.getElementById(idSlug + 'Views');
        if (loadEl) loadEl.style.display = 'block';
        if (viewsEl) viewsEl.style.display = 'none';

        // Fetch volume data (CBCT vs generic)
        const url = (this.targetModality && this.targetModality !== 'cbct')
            ? `/${window.projectNamespace}/api/patient/${window.scanId}/volume/${this.targetModality}/`
            : `/${window.projectNamespace}/api/patient/${window.scanId}/cbct/`;
        fetch(url)
            .then(async response => {
                if (response.status === 202) {
                    // Processing in progress
                    const data = await response.json();
                    throw new Error(`processing:${data.message || 'CBCT is being processed'}`);
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
                console.debug('Compressed CBCT data loaded, size:', compressedData.byteLength);
                
                try {
                    if (nifti.isCompressed(compressedData)) {
                        console.debug('Decompressing gzipped NIFTI data...');
                        // Decompress asynchronously to avoid blocking the UI
                        await new Promise(resolve => setTimeout(resolve, 0));
                        const decompressedData = nifti.decompress(compressedData);
                        console.debug('Decompressed size:', decompressedData.byteLength);
                        // Parse asynchronously
                        await new Promise(resolve => setTimeout(resolve, 0));
                        this.parseNiftiData(decompressedData);
                    } else {
                        console.debug('NIFTI data is not compressed, using as-is');
                        this.parseNiftiData(compressedData);
                    }
                } catch (error) {
                    console.error('Error during decompression:', error);
                    this.loading = false;
                    this.showError('Failed to decompress CBCT data');
                }
            })
            .catch(error => {
                console.error('Error loading CBCT data:', error);
                this.loading = false;
                
                if (error.message.startsWith('processing:')) {
                    const message = error.message.substring('processing:'.length);
                    this.showError(message || 'CBCT is being processed. Please check back later.', 'info');
                } else if (error.message.startsWith('failed:')) {
                    const message = error.message.substring('failed:'.length);
                    this.showError(message || 'CBCT processing failed.', 'danger');
                } else {
                    this.showError('Failed to load volume data');
                }
            });
    },
    
    parseNiftiData: function(arrayBuffer) {
        console.debug('Parsing NIfTI data using NIFTI-Reader-JS...');
        
        try {
            // Use NIFTI-Reader-JS to read header
            const header = nifti.readHeader(arrayBuffer);
            if (!header) {
                throw new Error('Failed to read NIFTI header');
            }
 
            // Get dimensions from header
            const dimX = header.dims[1];
            const dimY = header.dims[2];
            const dimZ = header.dims[3];
            
            // Get spacing from header
            const spacingX = header.pixDims[1];
            const spacingY = header.pixDims[2];
            const spacingZ = header.pixDims[3];
            
            // Get scaling parameters for HU conversion
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
            
            this.volumeData = new Float32Array(volumeSize); // Store as float for HU values
            this.histogram = { min: Infinity, max: -Infinity }; // Track HU range
            
            const dataView = new DataView(imageData);
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
            
            console.debug(`HU range: ${this.histogram.min.toFixed(1)} to ${this.histogram.max.toFixed(1)}`);

            this.initializeViewers();
            this.initialized = true;
            this.loading = false;
            
            const idSlug2 = this.targetModality || 'cbct';
            const loadEl2 = document.getElementById(idSlug2 !== 'cbct' ? (idSlug2 + 'Loading') : 'cbctLoading');
            const viewsEl2 = document.getElementById(idSlug2 !== 'cbct' ? (idSlug2 + 'Views') : 'cbctViews');
            if (loadEl2) loadEl2.style.display = 'none';
            if (viewsEl2) viewsEl2.style.display = 'block';
            
        } catch (error) {
            console.error('Error parsing NIfTI data:', error);
            this.loading = false;
            this.showError('Failed to parse CBCT data');
        }
    },
    

    

    
    initializeViewers: function() {
        const idPrefix = (this.targetModality && this.targetModality !== 'cbct') ? (this.targetModality + '_') : '';
        this.initSliceViewer(idPrefix + 'axialView', 'axial');
        this.initSliceViewer(idPrefix + 'sagittalView', 'sagittal');
        this.initSliceViewer(idPrefix + 'coronalView', 'coronal');
        this.initVolumeViewerPlaceholder(idPrefix + 'volumeView');
        this.setupEventListeners();
    },
    
    initSliceViewer: function(containerId, orientation, retryCount = 0) {
        const container = document.getElementById(containerId);
        
        // Check if container exists and has size, and if dimensions are loaded
        if (!container || container.clientWidth === 0 || container.clientHeight === 0) {
            // Limit retries to prevent infinite loop
            if (retryCount < 50) {
                setTimeout(() => {
                    this.initSliceViewer(containerId, orientation, retryCount + 1);
                }, 100);
            } else {
                console.error('Failed to initialize slice viewer: container not ready after 5 seconds');
            }
            return;
        }
        
        // Check if dimensions are loaded (critical to avoid null access errors)
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
        } else { // coronal
            this.slicePositions[orientation] = Math.floor(this.dimensions.y / 2);
        }
        
        this.updateSlice(orientation);
        this.updateSliceLabel(orientation);
        
        renderer.domElement.addEventListener('wheel', (event) => {
            event.preventDefault();
            event.stopPropagation();
            
            if (event.ctrlKey) {
                this.handleSliceZoom(orientation, event.deltaY > 0 ? -0.1 : 0.1);
            } else {
                let offset = event.shiftKey ? 10 : 1;
                this.handleSliceScroll(orientation, event.deltaY > 0 ? offset : -offset);
            }
        }, { passive: false }); // Need passive: false because we call preventDefault()
        
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
    },
    
    initVolumeViewerPlaceholder: function(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        // Clear any existing content
        container.innerHTML = '';
        
        // Add "Not yet supported" message
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
    },
    
    updateSlice: function(orientation) {
        const scene = this.scenes[orientation];
        const position = this.slicePositions[orientation];
        const dataAspectRatio = this.dataAspectRatios[orientation];
        
        while(scene.children.length > 0) {
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
        
        // Add crosshairs to show positions of other views
        this.addCrosshairs(orientation, planeWidth, planeHeight);
        
        if (this.renderFunctions && this.renderFunctions[orientation]) {
            this.renderFunctions[orientation]();
        } else {
            this.renderers[orientation].render(scene, this.cameras[orientation]);
        }
    },
    
    addCrosshairs: function(orientation, planeWidth, planeHeight) {
        const scene = this.scenes[orientation];
        
        if (orientation === 'axial') {
            // Show sagittal and coronal positions on axial view
            // Sagittal line (vertical) - represents X position (blue)
            const sagittalPos = this.slicePositions.sagittal;
            const sagittalNormalized = (sagittalPos / (this.dimensions.x - 1)) * 2 - 1; // Convert to -1 to 1 range
            const sagittalX = sagittalNormalized * (planeWidth / 2);
            
            const sagittalMaterial = new THREE.LineBasicMaterial({ 
                color: 0x0000ff, // Blue for sagittal
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
            
            // Coronal line (horizontal) - represents Y position (green)
            const coronalPos = this.slicePositions.coronal;
            const coronalNormalized = (coronalPos / (this.dimensions.y - 1)) * 2 - 1;
            const coronalY = coronalNormalized * (planeHeight / 2); // Remove flip - texture coordinate system matches
            
            const coronalMaterial = new THREE.LineBasicMaterial({ 
                color: 0x00ff00, // Green for coronal
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
            // Show axial and coronal positions on sagittal view
            // Axial line (horizontal) - represents Z position (red)
            const axialPos = this.slicePositions.axial;
            const axialNormalized = (axialPos / (this.dimensions.z - 1)) * 2 - 1;
            const axialZ = axialNormalized * (planeHeight / 2);
            
            const axialMaterial = new THREE.LineBasicMaterial({ 
                color: 0xff0000, // Red for axial
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
            
            // Coronal line (vertical) - represents Y position (green)
            const coronalPos = this.slicePositions.coronal;
            const coronalNormalized = (coronalPos / (this.dimensions.y - 1)) * 2 - 1;
            const coronalY = coronalNormalized * (planeWidth / 2);
            
            const coronalMaterial = new THREE.LineBasicMaterial({ 
                color: 0x00ff00, // Green for coronal
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
            // Show axial and sagittal positions on coronal view
            // Axial line (horizontal) - represents Z position (red)
            const axialPos = this.slicePositions.axial;
            const axialNormalized = (axialPos / (this.dimensions.z - 1)) * 2 - 1;
            const axialZ = axialNormalized * (planeHeight / 2);
            
            const axialMaterial = new THREE.LineBasicMaterial({ 
                color: 0xff0000, // Red for axial
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
            
            // Sagittal line (vertical) - represents X position (blue)
            const sagittalPos = this.slicePositions.sagittal;
            const sagittalNormalized = (sagittalPos / (this.dimensions.x - 1)) * 2 - 1;
            const sagittalX = sagittalNormalized * (planeWidth / 2);
            
            const sagittalMaterial = new THREE.LineBasicMaterial({ 
                color: 0x0000ff, // Blue for sagittal
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
    },
    
    updateCrosshairs: function(changedOrientation) {
        // Update crosshairs on the other two views when one view's slice position changes
        const orientations = ['axial', 'sagittal', 'coronal'];
        
        orientations.forEach(orientation => {
            if (orientation !== changedOrientation && this.scenes[orientation]) {
                // Re-render the slice to update crosshairs
                this.updateSlice(orientation);
            }
        });
    },
    
    createSliceTexture: function(orientation, sliceIndex) {
        let sliceWidth, sliceHeight, sliceData;
        
        if (orientation === 'axial') {
            sliceWidth = this.dimensions.x;
            sliceHeight = this.dimensions.y;
        } else if (orientation === 'sagittal') {
            sliceWidth = this.dimensions.y;
            sliceHeight = this.dimensions.z;
        } else { // coronal
            sliceWidth = this.dimensions.x;
            sliceHeight = this.dimensions.z;
        }
        
        sliceData = new Uint8Array(sliceWidth * sliceHeight);
        
        // Calculate windowing parameters once per slice (not per pixel)
        const params = this._calculateWindowParams();
        const windowMin = params.windowMin;
        const windowMax = params.windowMax;
        const windowRange = params.windowRange;
        
        // Inline windowing for performance (avoid function call overhead)
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
        } else { // coronal
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
    },
    
    handleSliceScroll: function(orientation, direction) {
        if (!this.initialized || !this.volumeData || !this.dimensions) {
            return;
        }
        
        let maxSlice;
        if (orientation === 'axial') {
            maxSlice = this.dimensions.z - 1;
        } else if (orientation === 'sagittal') {
            maxSlice = this.dimensions.x - 1;
        } else { // coronal
            maxSlice = this.dimensions.y - 1;
        }
        
        this.slicePositions[orientation] = Math.max(0, Math.min(maxSlice, 
            this.slicePositions[orientation] + direction));
        
        // Update the current slice view
        this.updateSlice(orientation);
        this.updateSliceLabel(orientation);
        
        // Update crosshairs on other views
        this.updateCrosshairs(orientation);
    },
    
    handleSliceZoom: function(orientation, zoomDelta) {
        // Don't handle zoom if data isn't loaded yet
        if (!this.initialized || !this.cameras[orientation] || !this.baseCameraBounds[orientation]) {
            return;
        }
        
        // Clamp zoom level between 0.1 and 5.0
        this.zoomLevels[orientation] = Math.max(0.1, Math.min(5.0, 
            this.zoomLevels[orientation] + zoomDelta));
        
        const camera = this.cameras[orientation];
        const baseBounds = this.baseCameraBounds[orientation];
        const zoomLevel = this.zoomLevels[orientation];
        
        // Calculate camera bounds with zoom applied
        const width = (baseBounds.right - baseBounds.left) / zoomLevel;
        const height = (baseBounds.top - baseBounds.bottom) / zoomLevel;
        
        // Reset pan when zooming out to 1.0 or less
        if (zoomLevel <= 1.0) {
            this.panOffsets[orientation].x = 0;
            this.panOffsets[orientation].y = 0;
        }
        
        // Apply zoom and pan
        const panX = this.panOffsets[orientation].x;
        const panY = this.panOffsets[orientation].y;
        
        camera.left = -width / 2 + panX;
        camera.right = width / 2 + panX;
        camera.top = height / 2 + panY;
        camera.bottom = -height / 2 + panY;
        
        camera.updateProjectionMatrix();
        
        // Re-render the view
        if (this.renderFunctions[orientation]) {
            this.renderFunctions[orientation]();
        }
    },

    handleSlicePan: function(orientation, deltaX, deltaY) {
        // Don't handle pan if data isn't loaded yet
        if (!this.initialized || !this.cameras[orientation] || !this.baseCameraBounds[orientation]) {
            return;
        }
        
        const camera = this.cameras[orientation];
        const baseBounds = this.baseCameraBounds[orientation];
        const zoomLevel = this.zoomLevels[orientation];
        
        // Only allow panning when zoomed in
        if (zoomLevel <= 1.0) {
            return;
        }
        
        // Calculate current camera dimensions
        const currentWidth = (baseBounds.right - baseBounds.left) / zoomLevel;
        const currentHeight = (baseBounds.top - baseBounds.bottom) / zoomLevel;
        const container = this.renderers[orientation].domElement;
        
        // Calculate pan sensitivity based on current camera size
        const panSensitivityX = currentWidth / container.clientWidth;
        const panSensitivityY = currentHeight / container.clientHeight;
        
        // Update pan offsets
        this.panOffsets[orientation].x -= deltaX * panSensitivityX;
        this.panOffsets[orientation].y += deltaY * panSensitivityY; // Invert Y for natural dragging
        
        // Allow unlimited panning when zoomed in
        // No clamping - user can pan freely
        
        // Apply pan to camera bounds
        const panX = this.panOffsets[orientation].x;
        const panY = this.panOffsets[orientation].y;
        
        camera.left = -currentWidth / 2 + panX;
        camera.right = currentWidth / 2 + panX;
        camera.top = currentHeight / 2 + panY;
        camera.bottom = -currentHeight / 2 + panY;
        
        camera.updateProjectionMatrix();
        
        // Re-render the view
        if (this.renderFunctions[orientation]) {
            this.renderFunctions[orientation]();
        }
    },
    
    initPanoramicInteraction: function() {
        const panoramicView = document.getElementById('panoramicView');
        const panoramicImg = document.getElementById('panoramicImage');
        
        if (!panoramicView || !panoramicImg) {
            console.warn('Panoramic elements not found');
            return;
        }
        
        // Reset zoom and pan
        this.panoramicZoom = 1.0;
        this.panoramicPan = { x: 0, y: 0 };
        this.updatePanoramicTransform();
        
        // Mouse wheel for zoom
        panoramicView.addEventListener('wheel', (event) => {
            event.preventDefault();
            event.stopPropagation();
            
            const zoomDelta = event.deltaY > 0 ? -0.1 : 0.1;
            this.handlePanoramicZoom(zoomDelta);
        }, { passive: false }); // Need passive: false because we call preventDefault()
        
        // Mouse drag for pan
        let isDragging = false;
        let lastMouseX = 0;
        let lastMouseY = 0;
        
        panoramicView.addEventListener('mousedown', (event) => {
            if (event.button === 0) { // Left mouse button
                event.preventDefault();
                event.stopPropagation();
                isDragging = true;
                lastMouseX = event.clientX;
                lastMouseY = event.clientY;
                panoramicView.style.cursor = 'move';
            }
        });
        
        panoramicView.addEventListener('mousemove', (event) => {
            if (isDragging && event.buttons === 1) { // Left button held
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
            if (event.button === 0) { // Left mouse button
                isDragging = false;
                panoramicView.style.cursor = 'crosshair';
            }
        });
        
        // Prevent context menu on right click
        panoramicView.addEventListener('contextmenu', (event) => {
            event.preventDefault();
        });
        
        // Double-click to reset zoom and pan
        panoramicView.addEventListener('dblclick', (event) => {
            event.preventDefault();
            this.resetPanoramicView();
        });
    },
    
    handlePanoramicZoom: function(zoomDelta) {
        // Clamp zoom level between 0.5 and 5.0
        this.panoramicZoom = Math.max(0.5, Math.min(5.0, this.panoramicZoom + zoomDelta));
        
        // Reset pan when zooming out to 1.0 or less
        if (this.panoramicZoom <= 1.0) {
            this.panoramicPan.x = 0;
            this.panoramicPan.y = 0;
        }
        
        this.updatePanoramicTransform();
    },
    
    handlePanoramicPan: function(deltaX, deltaY) {
        // Only allow panning when zoomed in
        if (this.panoramicZoom <= 1.0) {
            return;
        }
        
        // Calculate pan sensitivity based on zoom level
        const panSensitivity = 1.0 / this.panoramicZoom;
        
        // Update pan offsets
        this.panoramicPan.x += deltaX * panSensitivity;
        this.panoramicPan.y += deltaY * panSensitivity;
        
        // Get container dimensions to clamp panning
        const panoramicView = document.getElementById('panoramicView');
        const containerWidth = panoramicView.clientWidth;
        const containerHeight = panoramicView.clientHeight;
        
        // Allow unlimited panning when zoomed in
        // No clamping - user can pan freely
        
        this.updatePanoramicTransform();
    },
    
    updatePanoramicTransform: function() {
        const panoramicImg = document.getElementById('panoramicImage');
        const canvas = this.panoramicCanvas;
        const target = (canvas && canvas.style.display !== 'none') ? canvas : panoramicImg;
        if (!target) return;
        const transform = `scale(${this.panoramicZoom}) translate(${this.panoramicPan.x}px, ${this.panoramicPan.y}px)`;
        target.style.transform = transform;
        target.style.transformOrigin = 'center center';
    },
    
    resetPanoramicView: function() {
        this.panoramicZoom = 1.0;
        this.panoramicPan = { x: 0, y: 0 };
        this.updatePanoramicTransform();
    },
    
    // Cache windowing parameters to avoid recalculation on every pixel
    _cachedWindowParams: null,
    
    _calculateWindowParams: function() {
        const histMin = (this.histogram && isFinite(this.histogram.min)) ? this.histogram.min : -1000;
        const histMax = (this.histogram && isFinite(this.histogram.max)) ? this.histogram.max : 3000;
        const pMin = Math.max(0, Math.min(100, this.windowPercentMin));
        const pMax = Math.max(0, Math.min(100, this.windowPercentMax));
        const lowP = Math.min(pMin, pMax);
        const highP = Math.max(pMin, pMax);
        const windowMin = histMin + (histMax - histMin) * (lowP / 100.0);
        const windowMax = histMin + (histMax - histMin) * (highP / 100.0);
        const windowRange = Math.max(0.001, windowMax - windowMin); // Avoid division by zero
        
        this._cachedWindowParams = { windowMin, windowMax, windowRange };
        return this._cachedWindowParams;
    },
    
    applyWindowing: function(huValue) {
        // Use cached parameters if available, otherwise calculate
        const params = this._cachedWindowParams || this._calculateWindowParams();
        
        // Clamp values to window range
        const clampedValue = Math.max(params.windowMin, Math.min(params.windowMax, huValue));
        
        // Map to 0-255 range (optimized)
        const normalizedValue = (clampedValue - params.windowMin) / params.windowRange;
        return Math.floor(normalizedValue * 255);
    },
    
    updateSliceLabel: function(orientation) {
        let maxSlice, currentSlice;
        if (orientation === 'axial') {
            maxSlice = this.dimensions.z;
            currentSlice = this.slicePositions[orientation] + 1;
        } else if (orientation === 'sagittal') {
            maxSlice = this.dimensions.x;
            currentSlice = this.slicePositions[orientation] + 1;
        } else { // coronal
            maxSlice = this.dimensions.y;
            currentSlice = this.slicePositions[orientation] + 1;
        }
        
        // Find or create slice label
        const prefix = (this.targetModality && this.targetModality !== 'cbct') ? (this.targetModality + '_') : '';
        const containerId = orientation === 'axial' ? (prefix + 'axialView') : 
                           orientation === 'sagittal' ? (prefix + 'sagittalView') : (prefix + 'coronalView');
        const container = document.getElementById(containerId);
        
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
    },
    
    refreshAllViews: function() {
        // Fix black windows when switching to CBCT tab after background loading
        if (!this.initialized) {
            console.debug('CBCT viewer not initialized yet, cannot refresh');
            return;
        }
        
        console.debug('Refreshing all CBCT views...');
        
        // Wait a moment for containers to be visible and properly sized
        setTimeout(() => {
            ['axial', 'sagittal', 'coronal'].forEach(orientation => {
                if (this.renderers[orientation] && this.scenes[orientation] && this.cameras[orientation]) {
                    const prefix = (this.targetModality && this.targetModality !== 'cbct') ? (this.targetModality + '_') : '';
                    const containerId = orientation === 'axial' ? (prefix + 'axialView') : 
                                       orientation === 'sagittal' ? (prefix + 'sagittalView') : (prefix + 'coronalView');
                    const container = document.getElementById(containerId);
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
            
            // Volume renderer removed - no longer used
            
            // Refresh panoramic image if it wasn't loaded initially (CBCT only)
            if (this.targetModality === 'cbct' && !this.panoramicLoaded) {
                console.debug('Refreshing panoramic image...');
                this.loadPanoramicImage();
            }
        }, 50); // Small delay to ensure containers are visible
    },
    
    setupEventListeners: function() {
        // Reset button for 2D views
        const resetButton = document.getElementById('resetCBCTView');
        if (resetButton) {
            resetButton.addEventListener('click', () => {
                this.resetAllViews();
            });
        }
        
        // Windowing sliders (percent-based) with optimized debouncing
        const minRange = document.getElementById('windowMinRange');
        const maxRange = document.getElementById('windowMaxRange');
        const minLabel = document.getElementById('windowMinValue');
        const maxLabel = document.getElementById('windowMaxValue');
        
        let windowingTimeout = null;
        let updatePending = false;
        
        const performUpdate = () => {
            if (updatePending) return; // Prevent overlapping updates
            updatePending = true;
            
            requestAnimationFrame(() => {
                if (this.initialized) {
                    this.updateSlice('axial');
                    this.updateSlice('sagittal');
                    this.updateSlice('coronal');
                }
                if (this.panoramicLoaded) {
                    this.updatePanoramicWindowing();
                }
                updatePending = false;
            });
        };
        
        const updateFromUI = (immediate = false) => {
            if (!minRange || !maxRange) return;
            let minVal = parseInt(minRange.value || '0', 10);
            let maxVal = parseInt(maxRange.value || '100', 10);
            if (minVal > maxVal) {
                if (this._lastWindowSlider === 'min') {
                    maxVal = minVal; maxRange.value = String(maxVal);
                } else {
                    minVal = maxVal; minRange.value = String(minVal);
                }
            }
            this.windowPercentMin = minVal;
            this.windowPercentMax = maxVal;
            
            // Invalidate windowing cache when parameters change
            this._cachedWindowParams = null;
            
            // Update labels immediately for responsive feedback
            if (minLabel) minLabel.textContent = String(minVal);
            if (maxLabel) maxLabel.textContent = String(maxVal);
            
            if (immediate) {
                // Immediate update (on change/mouseup)
                performUpdate();
            } else {
                // Debounced update (on input while dragging)
                clearTimeout(windowingTimeout);
                windowingTimeout = setTimeout(performUpdate, 200); // 200ms debounce
            }
        };
        
        if (minRange) {
            minRange.addEventListener('input', () => { this._lastWindowSlider = 'min'; updateFromUI(false); });
            minRange.addEventListener('change', () => { this._lastWindowSlider = 'min'; updateFromUI(true); });
            if (minLabel) minLabel.textContent = String(parseInt(minRange.value || '0', 10));
        }
        if (maxRange) {
            maxRange.addEventListener('input', () => { this._lastWindowSlider = 'max'; updateFromUI(false); });
            maxRange.addEventListener('change', () => { this._lastWindowSlider = 'max'; updateFromUI(true); });
            if (maxLabel) maxLabel.textContent = String(parseInt(maxRange.value || '100', 10));
        }

        // Window resize for 2D views
        if (this._boundWindowResizeHandlerGeneral) {
            window.removeEventListener('resize', this._boundWindowResizeHandlerGeneral);
        }
        this._boundWindowResizeHandlerGeneral = () => { this.handleResize(); };
        window.addEventListener('resize', this._boundWindowResizeHandlerGeneral);
        
        // Add a specific handler for view refresh on window resize (modality-aware)
        if (this._boundWindowResizeHandlerDebounced) {
            window.removeEventListener('resize', this._boundWindowResizeHandlerDebounced);
        }
        let resizeTimeout;
        this._boundWindowResizeHandlerDebounced = () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                const idSlug = (this.targetModality && this.targetModality !== 'cbct') ? `${this.targetModality}-viewer` : 'cbct-viewer';
                const container = document.getElementById(idSlug);
                if (this.initialized && container && container.style.display !== 'none') {
                    console.debug('Window resized, refreshing CBCT views...');
                    this.refreshAllViews();
                }
            }, 150);
        };
        window.addEventListener('resize', this._boundWindowResizeHandlerDebounced);
        
        // Note: Volume rendering events are handled by VolumeRenderer
    },
    
    // Volume rendering updates are now handled by VolumeRenderer
    
    resetAllViews: function() {
        // Reset slice positions
        this.slicePositions.axial = Math.floor(this.dimensions.z / 2);
        this.slicePositions.sagittal = Math.floor(this.dimensions.x / 2);
        this.slicePositions.coronal = Math.floor(this.dimensions.y / 2);
        
        // Update all slice views
        this.updateSlice('axial');
        this.updateSlice('sagittal');
        this.updateSlice('coronal');
        
        // Reset volume view
        if (this.controls.volume) {
            this.controls.volume.reset();
        }
    },
    
    handleResize: function() {
        const prefix = (this.targetModality && this.targetModality !== 'cbct') ? (this.targetModality + '_') : '';
        ['axial', 'sagittal', 'coronal'].forEach(orientation => {
            if (this.renderers[orientation] && this.cameras[orientation]) {
                const containerId = orientation === 'axial' ? (prefix + 'axialView') : 
                                   orientation === 'sagittal' ? (prefix + 'sagittalView') : (prefix + 'coronalView');
                const container = document.getElementById(containerId);
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
                    // Force re-render of slice to avoid black view
                    this.updateSlice(orientation);
                }
            }
        });
        
        // Volume renderer removed - no longer used
    },
    
    showError: function(message, type = 'warning') {
        const idSlug = (this.targetModality && this.targetModality !== 'cbct') ? this.targetModality : 'cbct';
        const loadingDiv = document.getElementById(idSlug + 'Loading') || document.getElementById('cbctLoading');
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
    },
    
    // Method to force refresh panoramic image
    forceRefreshPanoramic: function() {
        console.log('Force refreshing panoramic image...');
        this.panoramicLoaded = false; // Reset loaded state
        
        // Clear any existing image
        const panoramicImg = document.getElementById('panoramicImage');
        const panoramicLoading = document.getElementById('panoramicLoading');
        const panoramicError = document.getElementById('panoramicError');
        
        if (panoramicImg) panoramicImg.style.display = 'none';
        if (panoramicError) panoramicError.style.display = 'none';
        if (panoramicLoading) panoramicLoading.style.display = 'block';
        
        // Remove and reset canvases
        if (this.panoramicCanvas && this.panoramicCanvas.parentElement) {
            this.panoramicCanvas.parentElement.removeChild(this.panoramicCanvas);
        }
        this.panoramicCanvas = null;
        this.panoramicSourceCanvas = null;
        
        // Reload the panoramic image
        this.loadPanoramicImage();
    },
    
    // Method to clear cached volume data (e.g., when switching patients)
    clearCache: function() {
        console.debug('Clearing CBCT cache...');
        this.dispose();
        this.volumeData = null;
        this.dimensions = null;
        this.spacing = null;
        this.histogram = null;
    }
    ,
    // Initialize panoramic canvases
    initPanoramicCanvases: function(loadedImg) {
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
    ,
    updatePanoramicWindowing: function() {
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

};

// CBCT will be loaded only when the user actually switches to CBCT modality
// No background loading to avoid issues with quick modality switching 