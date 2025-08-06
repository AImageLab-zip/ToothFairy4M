/**
 * CBCT Viewer - 4-view visualization with volume rendering
 * Implements axial, sagittal, coronal views and 3D volume rendering
 */

// Constants for volume rendering
const VOLUME_DOWNSAMPLE_FACTOR = 2; // Can be adjusted for performance (2 or 4)
const RAY_MARCHING_STEPS = 128;
const VOLUME_OPACITY = 0.8;

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
    
    renderMode: 'mip', // 'mip', 'translucent', 'attenuated'
    windowLevel: 0.5,
    windowWidth: 1.0,
    
    loading: false,
    panoramicLoaded: false,
    
    init: function() {
        if (this.loading || this.initialized) {
            console.log('CBCT Viewer already loading or initialized');
            return;
        }
        
        console.log('Initializing CBCT Viewer...');
        this.loadPanoramicImage();
        this.loadVolumeData();
    },
    
    loadPanoramicImage: function() {
        console.log('Loading panoramic image...');
        
        const panoramicImg = document.getElementById('panoramicImage');
        const panoramicLoading = document.getElementById('panoramicLoading');
        const panoramicError = document.getElementById('panoramicError');
        
        panoramicLoading.style.display = 'block';
        panoramicImg.style.display = 'none';
        panoramicError.style.display = 'none';
        
        const testImg = new Image();
        
        testImg.onload = () => {
            console.log('Panoramic image loaded successfully');
            panoramicImg.src = testImg.src;
            panoramicImg.style.display = 'block';
            panoramicLoading.style.display = 'none';
            panoramicError.style.display = 'none';
            this.panoramicLoaded = true;
            
            this.initPanoramicInteraction();
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
        
        testImg.src = `/api/scan/${window.scanId}/panoramic/`;
    },
    
    loadVolumeData: function() {
        if (this.loading || this.initialized) {
            console.log('CBCT data already loading or loaded');
            return;
        }
        
        console.log('Loading CBCT volume data...');
        this.loading = true;
        
        // Show loading indicator
        document.getElementById('cbctLoading').style.display = 'block';
        document.getElementById('cbctViews').style.display = 'none';
        
        // Fetch CBCT data
        fetch(`/api/scan/${window.scanId}/cbct/`)
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
                console.log('Compressed CBCT data loaded, size:', compressedData.byteLength);
                
                try {
                    if (nifti.isCompressed(compressedData)) {
                        console.log('Decompressing gzipped NIFTI data...');
                        const decompressedData = nifti.decompress(compressedData);
                        console.log('Decompressed size:', decompressedData.byteLength);
                        this.parseNiftiData(decompressedData);
                    } else {
                        console.log('NIFTI data is not compressed, using as-is');
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
                    this.showError('Failed to load CBCT data');
                }
            });
    },
    
    parseNiftiData: function(arrayBuffer) {
        console.log('Parsing NIfTI data using NIFTI-Reader-JS...');
        
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
            
            const datatype = header.datatypeCode;
            const bitpix = header.numBitsPerVoxel;
            
            console.log(`NIfTI dimensions: ${dimX}x${dimY}x${dimZ}`);
            console.log(`NIfTI spacing: ${spacingX}x${spacingY}x${spacingZ}`);
            console.log(`NIfTI datatype: ${datatype}, bitpix: ${bitpix}`);
            
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
            console.log(`Volume size: ${volumeSize}`);
            console.log(`Image data size: ${imageData.byteLength}`);
            
            this.volumeData = new Uint16Array(volumeSize);
            
            const dataView = new DataView(imageData);
            let bytesPerVoxel = Math.max(1, bitpix / 8);
            
            // Read volume data
            for (let i = 0; i < volumeSize; i++) {
                let value = 0;
                const offset = i * bytesPerVoxel;
                
                if (bytesPerVoxel === 1) {
                    if (datatype === 2) { // DT_UNSIGNED_CHAR
                        value = dataView.getUint8(offset);
                    } else { // DT_INT8
                        value = Math.max(0, dataView.getInt8(offset) + 128);
                    }
                    value = value * 256; // Scale to 16-bit range
                } else if (bytesPerVoxel === 2) {
                    if (datatype === 512) { // DT_UINT16
                        value = dataView.getUint16(offset, true);
                    } else { // DT_SIGNED_SHORT
                        value = Math.max(0, dataView.getInt16(offset, true) + 32768);
                    }
                } else if (bytesPerVoxel === 4) {
                    if (datatype === 768) { // DT_UINT32
                        value = Math.min(65535, dataView.getUint32(offset, true) / 65536);
                    } else if (datatype === 16) { // DT_FLOAT
                        value = Math.min(65535, Math.max(0, dataView.getFloat32(offset, true) * 65535));
                    } else { // DT_SIGNED_INT
                        value = Math.min(65535, Math.max(0, dataView.getInt32(offset, true) + 2147483648) / 65536);
                    }
                } else if (bytesPerVoxel === 8) { // DT_DOUBLE
                    value = Math.min(65535, Math.max(0, dataView.getFloat64(offset, true) * 65535));
                }
                
                this.volumeData[i] = Math.floor(value);
            }
            
            this.initializeViewers();
            this.initialized = true;
            this.loading = false;
            
            document.getElementById('cbctLoading').style.display = 'none';
            document.getElementById('cbctViews').style.display = 'block';
            
        } catch (error) {
            console.error('Error parsing NIfTI data:', error);
            this.loading = false;
            this.showError('Failed to parse CBCT data');
        }
    },
    

    

    
    initializeViewers: function() {
        this.initSliceViewer('axialView', 'axial');
        this.initSliceViewer('sagittalView', 'sagittal');
        this.initSliceViewer('coronalView', 'coronal');
        this.initVolumeViewer('volumeView');
        this.setupEventListeners();
    },
    
    initSliceViewer: function(containerId, orientation) {
        const container = document.getElementById(containerId);
        
        if (container.clientWidth === 0 || container.clientHeight === 0) {
            setTimeout(() => {
                this.initSliceViewer(containerId, orientation);
            }, 100);
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
        });
        
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
    
    initVolumeViewer: function(containerId) {
        const volumeTexture = this.createVolumeTexture();
        
        if (typeof window.VolumeRenderer !== 'undefined') {
            window.VolumeRenderer.init(containerId, volumeTexture, this.volumeAtlas, this.volumeAtlas.sliceDims);
        } else {
            console.error('VolumeRenderer not available - make sure volume_renderer.js is loaded');
        }
    },
    
    createVolumeTexture: function() {
        const factor = VOLUME_DOWNSAMPLE_FACTOR;
        const newDims = {
            x: Math.floor(this.dimensions.x / factor),
            y: Math.floor(this.dimensions.y / factor),
            z: Math.floor(this.dimensions.z / factor)
        };
        
        const atlasSize = Math.ceil(Math.sqrt(newDims.z));
        const textureSize = atlasSize * newDims.x;
        const textureData = new Uint8Array(textureSize * textureSize);
        
        for (let z = 0; z < newDims.z; z++) {
            const atlasX = (z % atlasSize) * newDims.x;
            const atlasY = Math.floor(z / atlasSize) * newDims.y;
            
            for (let y = 0; y < newDims.y; y++) {
                for (let x = 0; x < newDims.x; x++) {
                    const origX = Math.floor(x * factor);
                    const origY = Math.floor(y * factor);
                    const origZ = Math.floor(z * factor);
                    
                    const origIdx = origZ * this.dimensions.x * this.dimensions.y + 
                                   origY * this.dimensions.x + origX;
                    
                    const textureX = atlasX + x;
                    const textureY = atlasY + y;
                    const textureIdx = textureY * textureSize + textureX;
                    
                    if (textureIdx < textureData.length && origIdx < this.volumeData.length) {
                        textureData[textureIdx] = this.applyWindowing(this.volumeData[origIdx]);
                    }
                }
            }
        }
        
        const texture = new THREE.DataTexture(textureData, textureSize, textureSize, THREE.LuminanceFormat, THREE.UnsignedByteType);
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        texture.needsUpdate = true;
        
        this.volumeAtlas = {
            atlasSize: atlasSize,
            textureSize: textureSize,
            sliceDims: newDims
        };
        
        let nonZeroCount = 0;
        let maxValue = 0;
        for (let i = 0; i < textureData.length; i++) {
            if (textureData[i] > 0) nonZeroCount++;
            if (textureData[i] > maxValue) maxValue = textureData[i];
        }

        return texture;
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
        
        if (this.renderFunctions && this.renderFunctions[orientation]) {
            this.renderFunctions[orientation]();
        } else {
            this.renderers[orientation].render(scene, this.cameras[orientation]);
        }
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
        
        if (orientation === 'axial') {
            for (let y = 0; y < sliceHeight; y++) {
                for (let x = 0; x < sliceWidth; x++) {
                    const idx3d = sliceIndex * sliceWidth * sliceHeight + y * sliceWidth + x;
                    const idx2d = y * sliceWidth + x;
                    if (idx3d < this.volumeData.length) {
                        sliceData[idx2d] = this.applyWindowing(this.volumeData[idx3d]);
                    }
                }
            }
        } else if (orientation === 'sagittal') {
            for (let z = 0; z < sliceHeight; z++) {
                for (let y = 0; y < sliceWidth; y++) {
                    const idx3d = z * this.dimensions.x * this.dimensions.y + y * this.dimensions.x + sliceIndex;
                    const idx2d = z * sliceWidth + y;
                    if (idx3d < this.volumeData.length) {
                        sliceData[idx2d] = this.applyWindowing(this.volumeData[idx3d]);
                    }
                }
            }
        } else { // coronal
            for (let z = 0; z < sliceHeight; z++) {
                for (let x = 0; x < sliceWidth; x++) {
                    const idx3d = z * this.dimensions.x * this.dimensions.y + sliceIndex * this.dimensions.x + x;
                    const idx2d = z * sliceWidth + x;
                    if (idx3d < this.volumeData.length) {
                        sliceData[idx2d] = this.applyWindowing(this.volumeData[idx3d]);
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
        
        this.updateSlice(orientation);
        this.updateSliceLabel(orientation);
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
        });
        
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
        if (!panoramicImg) return;
        
        const transform = `scale(${this.panoramicZoom}) translate(${this.panoramicPan.x}px, ${this.panoramicPan.y}px)`;
        panoramicImg.style.transform = transform;
        panoramicImg.style.transformOrigin = 'center center';
    },
    
    resetPanoramicView: function() {
        this.panoramicZoom = 1.0;
        this.panoramicPan = { x: 0, y: 0 };
        this.updatePanoramicTransform();
    },
    
    applyWindowing: function(rawValue) {
        // Medical imaging windowing: [-1000, 0] → 0, [0, 5000] → [0, 255], >5000 → 255
        if (rawValue <= 0) {
            return 0; // [-1000, 0] → 0
        } else if (rawValue >= 5000) {
            return 255; // >5000 → 255
        } else {
            // [0, 5000] → [0, 255]
            return Math.floor((rawValue / 5000) * 255);
        }
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
        const containerId = orientation === 'axial' ? 'axialView' : 
                           orientation === 'sagittal' ? 'sagittalView' : 'coronalView';
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
            console.log('CBCT viewer not initialized yet, cannot refresh');
            return;
        }
        
        console.log('Refreshing all CBCT views...');
        
        // Wait a moment for containers to be visible and properly sized
        setTimeout(() => {
            ['axial', 'sagittal', 'coronal'].forEach(orientation => {
                if (this.renderers[orientation] && this.scenes[orientation] && this.cameras[orientation]) {
                    const containerId = orientation === 'axial' ? 'axialView' : 
                                       orientation === 'sagittal' ? 'sagittalView' : 'coronalView';
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
            
            // Re-render volume view if using VolumeRenderer
            if (typeof window.VolumeRenderer !== 'undefined' && window.VolumeRenderer.renderer) {
                const container = document.getElementById('volumeView');
                if (container && container.clientWidth > 0 && container.clientHeight > 0) {
                    const width = container.clientWidth;
                    const height = container.clientHeight;
                    window.VolumeRenderer.handleResize();
                    console.log(`Volume view refreshed: ${width}x${height}`);
                }
            }
            
            // Refresh panoramic image if it wasn't loaded initially
            if (!this.panoramicLoaded) {
                console.log('Refreshing panoramic image...');
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
        
        // Window resize for 2D views
        window.addEventListener('resize', () => {
            this.handleResize();
        });
        
        // Add a specific handler for CBCT view refresh on window resize
        let resizeTimeout;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                if (this.initialized && document.getElementById('cbct-viewer').style.display !== 'none') {
                    console.log('Window resized, refreshing CBCT views...');
                    this.refreshAllViews();
                }
            }, 150); // Debounce resize events
        });
        
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
        ['axial', 'sagittal', 'coronal'].forEach(orientation => {
            if (this.renderers[orientation] && this.cameras[orientation]) {
                const containerId = orientation === 'axial' ? 'axialView' : 
                                   orientation === 'sagittal' ? 'sagittalView' : 'coronalView';
                const container = document.getElementById(containerId);
                if (container) {
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
                }
            }
        });
        
        // Handle volume viewer (can be rectangular)
        if (this.renderers.volume && this.cameras.volume) {
            const container = document.getElementById('volumeView');
            if (container) {
                const width = container.clientWidth;
                const height = container.clientHeight;
                
                this.cameras.volume.aspect = width / height;
                this.cameras.volume.updateProjectionMatrix();
                this.renderers.volume.setSize(width, height);
            }
        }
    },
    
    showError: function(message, type = 'warning') {
        const loadingDiv = document.getElementById('cbctLoading');
        let iconClass = 'fa-exclamation-triangle text-warning';
        let textClass = 'text-muted';
        
        if (type === 'info') {
            iconClass = 'fa-info-circle text-info';
            textClass = 'text-info';
        } else if (type === 'danger') {
            iconClass = 'fa-times-circle text-danger';
            textClass = 'text-danger';
        }
        
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
        
        // Reload the panoramic image
        this.loadPanoramicImage();
    }
    

};

document.addEventListener('DOMContentLoaded', function() {
    if (window.hasCBCT) {
        // Start loading CBCT data in background
        setTimeout(() => {
            if (!window.CBCTViewer.initialized && !window.CBCTViewer.loading) {
                window.CBCTViewer.loadVolumeData();
            }
        }, 500);
    }
}); 