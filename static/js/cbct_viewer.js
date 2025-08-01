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
    
    // Three.js components for each view
    scenes: {},
    cameras: {},
    renderers: {},
    controls: {},
    
    // Current slice positions
    slicePositions: {
        axial: 0,
        sagittal: 0,
        coronal: 0
    },
    
    // Zoom levels for 2D views
    zoomLevels: {
        axial: 1.0,
        sagittal: 1.0,
        coronal: 1.0
    },
    
    // Pan offsets for 2D views (when zoomed)
    panOffsets: {
        axial: { x: 0, y: 0 },
        sagittal: { x: 0, y: 0 },
        coronal: { x: 0, y: 0 }
    },
    
    // Panoramic view zoom and pan
    panoramicZoom: 1.0,
    panoramicPan: { x: 0, y: 0 },
    
    // Volume rendering settings
    renderMode: 'mip', // 'mip', 'translucent', 'attenuated'
    windowLevel: 0.5,
    windowWidth: 1.0,
    
    // Loading state
    loading: false,
    panoramicLoaded: false,
    
    init: function() {
        if (this.loading || this.initialized) {
            console.log('CBCT Viewer already loading or initialized');
            return;
        }
        
        console.log('Initializing CBCT Viewer...');
        // Load panoramic first, then CBCT data
        this.loadPanoramicImage();
    },
    
    loadPanoramicImage: function() {
        console.log('Loading panoramic image...');
        
        const panoramicImg = document.getElementById('panoramicImage');
        const panoramicLoading = document.getElementById('panoramicLoading');
        const panoramicError = document.getElementById('panoramicError');
        
        // Check if CBCT processing is complete
        if (!window.isCBCTProcessed) {
            console.log('CBCT processing not complete - panoramic not available yet');
            panoramicLoading.style.display = 'none';
            panoramicImg.style.display = 'none';
            panoramicError.style.display = 'block';
            
            // Update error message to be more specific
            const errorElement = panoramicError.querySelector('p');
            if (errorElement) {
                errorElement.textContent = 'Panoramic available after CBCT processing';
            }
            
            this.panoramicLoaded = false;
            
            // Still proceed with CBCT data loading (raw CBCT can be loaded)
            this.loadVolumeData();
            return;
        }
        
        // Show loading state
        panoramicLoading.style.display = 'block';
        panoramicImg.style.display = 'none';
        panoramicError.style.display = 'none';
        
        // Create a new image to test if panoramic exists
        const testImg = new Image();
        
        testImg.onload = () => {
            console.log('Panoramic image loaded successfully');
            panoramicImg.src = testImg.src;
            panoramicImg.style.display = 'block';
            panoramicLoading.style.display = 'none';
            panoramicError.style.display = 'none';
            this.panoramicLoaded = true;
            
            // Initialize panoramic zoom and pan
            this.initPanoramicInteraction();
            
            // Now load CBCT data
            this.loadVolumeData();
        };
        
        testImg.onerror = () => {
            console.log('Panoramic image not available');
            panoramicLoading.style.display = 'none';
            panoramicImg.style.display = 'none';
            panoramicError.style.display = 'block';
            this.panoramicLoaded = false;
            
            // Still proceed with CBCT data loading
            this.loadVolumeData();
        };
        
        // Try to load the panoramic image
        testImg.src = `/api/scan/${window.scanId}/panoramic/`;
    },
    
    loadVolumeData: function() {
        // Prevent duplicate loading
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
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response.arrayBuffer();
            })
            .then(async compressedData => {
                console.log('Compressed CBCT data loaded, size:', compressedData.byteLength);
                
                try {
                    // Check for gzip magic number (0x1f, 0x8b)
                    const header = new Uint8Array(compressedData.slice(0, 2));
                    if (header[0] === 0x1f && header[1] === 0x8b) {
                        console.log('Decompressing gzipped NIFTI data...');
                        // Use pako or fflate for decompression
                        const decompressedData = pako.inflate(new Uint8Array(compressedData));
                        console.log('Decompressed size:', decompressedData.length);
                        this.parseNiftiData(decompressedData.buffer);
                    } else {
                        // Data is not compressed, use as-is
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
                this.showError('Failed to load CBCT data');
            });
    },
    
    parseNiftiData: function(arrayBuffer) {
        console.log('Parsing NIfTI data...');
        
        try {
            // Check if this is a gzipped file (starts with 0x1f8b)
            const dataView = new DataView(arrayBuffer);
            const magic1 = dataView.getUint8(0);
            const magic2 = dataView.getUint8(1);
            
            let niftiBuffer = arrayBuffer;
            
            if (magic1 === 0x1f && magic2 === 0x8b) {
                console.log('Detected gzipped NIfTI file, decompressing...');
                console.log('Original compressed size:', arrayBuffer.byteLength);
                niftiBuffer = this.decompressGzip(arrayBuffer);
                console.log('Decompressed size:', niftiBuffer.byteLength);
            } else {
                console.log('NIfTI file is not gzipped, proceeding with raw data');
            }
            
            // Parse NIfTI header (simplified - first 348 bytes)
            const niftiView = new DataView(niftiBuffer);
            
            // Read NIfTI header more carefully
            // First check the header size and magic
            const headerSize = niftiView.getInt32(0, true);
            console.log('Header size:', headerSize);
            
            // Read number of dimensions (at offset 40)
            const ndim = niftiView.getInt16(40, true);
            console.log('Number of dimensions:', ndim);
            
            // Read dimensions from NIfTI header
            // dim[1] = x, dim[2] = y, dim[3] = z (at offset 42, 44, 46)
            const dimX = niftiView.getInt16(42, true); // little endian
            const dimY = niftiView.getInt16(44, true);
            const dimZ = niftiView.getInt16(46, true);
            
            // Read voxel spacing (pixdim at offset 80, 84, 88)
            const spacingX = niftiView.getFloat32(80, true);
            const spacingY = niftiView.getFloat32(84, true);
            const spacingZ = niftiView.getFloat32(88, true);
            
            // Read datatype (at offset 70)
            const datatype = niftiView.getInt16(70, true);
            
            // Read bits per pixel (at offset 72)
            const bitpix = niftiView.getInt16(72, true);
            
            console.log(`NIfTI dimensions: ${dimX}x${dimY}x${dimZ}`);
            console.log(`NIfTI spacing: ${spacingX}x${spacingY}x${spacingZ}`);
            console.log(`NIfTI datatype: ${datatype}, bitpix: ${bitpix}`);
            
            // Validate dimensions - they should be reasonable for medical imaging
            if (dimX < 10 || dimY < 10 || dimZ < 10 || dimX > 2048 || dimY > 2048 || dimZ > 2048) {
                console.warn('Suspicious dimensions detected, may indicate parsing error');
                console.log('Raw dimension data:');
                for (let i = 40; i < 50; i += 2) {
                    console.log(`Offset ${i}: ${niftiView.getInt16(i, true)}`);
                }
            }
            
            this.dimensions = { x: dimX, y: dimY, z: dimZ };
            this.spacing = { x: spacingX, y: spacingY, z: spacingZ };
            
            // Determine bytes per voxel based on datatype and bitpix
            let bytesPerVoxel = Math.max(1, bitpix / 8); // Use bitpix as primary indicator
            
            // Common NIfTI datatypes
            if (datatype === 2) bytesPerVoxel = 1;      // DT_UNSIGNED_CHAR
            else if (datatype === 4) bytesPerVoxel = 2;  // DT_SIGNED_SHORT
            else if (datatype === 8) bytesPerVoxel = 4;  // DT_SIGNED_INT
            else if (datatype === 16) bytesPerVoxel = 4; // DT_FLOAT
            else if (datatype === 64) bytesPerVoxel = 8; // DT_DOUBLE
            else if (datatype === 256) bytesPerVoxel = 1; // DT_INT8
            else if (datatype === 512) bytesPerVoxel = 2; // DT_UINT16
            else if (datatype === 768) bytesPerVoxel = 4; // DT_UINT32
            
            console.log(`Using ${bytesPerVoxel} bytes per voxel for datatype ${datatype}`);
            
            // Extract volume data (starts after header)
            // For NIfTI-1, data usually starts at offset 352
            const dataOffset = Math.max(headerSize, 352);
            const volumeSize = dimX * dimY * dimZ;
            
            console.log(`Data offset: ${dataOffset}, Volume size: ${volumeSize}`);
            console.log(`Expected file size: ${dataOffset + volumeSize * bytesPerVoxel}`);
            console.log(`Actual file size: ${niftiBuffer.byteLength}`);
            
            this.volumeData = new Uint16Array(volumeSize);
            
            // Read volume data
            for (let i = 0; i < volumeSize; i++) {
                let value = 0;
                const offset = dataOffset + i * bytesPerVoxel;
                
                if (bytesPerVoxel === 1) {
                    if (datatype === 2) { // DT_UNSIGNED_CHAR
                        value = niftiView.getUint8(offset);
                    } else { // DT_INT8
                        value = Math.max(0, niftiView.getInt8(offset) + 128);
                    }
                    value = value * 256; // Scale to 16-bit range
                } else if (bytesPerVoxel === 2) {
                    if (datatype === 512) { // DT_UINT16
                        value = niftiView.getUint16(offset, true);
                    } else { // DT_SIGNED_SHORT
                        value = Math.max(0, niftiView.getInt16(offset, true) + 32768);
                    }
                } else if (bytesPerVoxel === 4) {
                    if (datatype === 768) { // DT_UINT32
                        value = Math.min(65535, niftiView.getUint32(offset, true) / 65536);
                    } else if (datatype === 16) { // DT_FLOAT
                        value = Math.min(65535, Math.max(0, niftiView.getFloat32(offset, true) * 65535));
                    } else { // DT_SIGNED_INT
                        value = Math.min(65535, Math.max(0, niftiView.getInt32(offset, true) + 2147483648) / 65536);
                    }
                } else if (bytesPerVoxel === 8) { // DT_DOUBLE
                    value = Math.min(65535, Math.max(0, niftiView.getFloat64(offset, true) * 65535));
                }
                
                this.volumeData[i] = Math.floor(value);
            }
            
            // Debug: Check volume data statistics
            let minVal = 65535, maxVal = 0, nonZeroCount = 0;
            for (let i = 0; i < Math.min(1000, this.volumeData.length); i++) {
                const val = this.volumeData[i];
                if (val > 0) nonZeroCount++;
                if (val < minVal) minVal = val;
                if (val > maxVal) maxVal = val;
            }
            console.log(`Volume data sample (first 1000): min=${minVal}, max=${maxVal}, non-zero=${nonZeroCount}/1000`);
            console.log('NIfTI data parsed successfully');
            
            // Initialize viewers
            this.initializeViewers();
            this.initialized = true;
            this.loading = false;
            
            // Hide loading, show views
            document.getElementById('cbctLoading').style.display = 'none';
            document.getElementById('cbctViews').style.display = 'block';
            
        } catch (error) {
            console.error('Error parsing NIfTI data:', error);
            this.loading = false; // Reset loading state on error
            this.showError('Failed to parse CBCT data');
        }
    },
    
    decompressGzip: function(gzipBuffer) {
        console.log('Attempting client-side gzip decompression...');
        
        // Use pako library for gzip decompression
        if (typeof pako !== 'undefined') {
            try {
                console.log('Using pako for decompression');
                const uint8Array = new Uint8Array(gzipBuffer);
                const decompressed = pako.inflate(uint8Array);
                console.log('Pako decompression successful, size:', decompressed.length);
                return decompressed.buffer;
            } catch (error) {
                console.error('Pako decompression failed:', error);
                throw new Error(`Failed to decompress gzip data with pako: ${error.message}`);
            }
        }
        
        // If pako is not available, the server should have handled decompression
        throw new Error('Client-side gzip decompression not available. Server should handle decompression.');
    },
    

    
    initializeViewers: function() {
        this.initSliceViewer('axialView', 'axial');
        this.initSliceViewer('sagittalView', 'sagittal');
        this.initSliceViewer('coronalView', 'coronal');
        // Initialize volume viewer using dedicated renderer
        this.initVolumeViewer('volumeView');
        this.setupEventListeners();
    },
    
    initSliceViewer: function(containerId, orientation) {
        const container = document.getElementById(containerId);
        
        // Wait a bit for container to be properly sized if it has zero dimensions
        if (container.clientWidth === 0 || container.clientHeight === 0) {
            console.log(`Container ${containerId} has zero dimensions, waiting for proper sizing...`);
            setTimeout(() => {
                this.initSliceViewer(containerId, orientation);
            }, 100);
            return;
        }
        
        const containerWidth = container.clientWidth;
        const containerHeight = container.clientHeight;
        
        console.log(`Initializing ${orientation} viewer: ${containerWidth}x${containerHeight} (full container)`);
        
        // Determine the aspect ratio of the actual slice data
        let sliceWidth, sliceHeight;
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
        
        const dataAspectRatio = sliceWidth / sliceHeight;
        const containerAspectRatio = containerWidth / containerHeight;
        
        console.log(`${orientation} data aspect: ${dataAspectRatio.toFixed(2)} (${sliceWidth}x${sliceHeight}), container: ${containerAspectRatio.toFixed(2)}`);
        
        // Create scene
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x000000); // Black background
        
        // Create orthographic camera - maintain data aspect ratio, fit within container
        let cameraLeft, cameraRight, cameraTop, cameraBottom;
        
        // Calculate how to fit the data aspect ratio within the container
        // We want the image to be as large as possible while maintaining aspect ratio
        if (dataAspectRatio > containerAspectRatio) {
            // Data is wider relative to container - fit to container width
            const halfWidth = containerAspectRatio;
            const halfHeight = containerAspectRatio / dataAspectRatio;
            cameraLeft = -halfWidth;
            cameraRight = halfWidth;
            cameraTop = halfHeight;
            cameraBottom = -halfHeight;
        } else {
            // Data is taller relative to container - fit to container height  
            const halfWidth = dataAspectRatio;
            const halfHeight = 1.0;
            cameraLeft = -halfWidth;
            cameraRight = halfWidth;
            cameraTop = halfHeight;
            cameraBottom = -halfHeight;
        }
        
        const camera = new THREE.OrthographicCamera(cameraLeft, cameraRight, cameraTop, cameraBottom, 0.1, 100);
        camera.position.set(0, 0, 1);
        camera.lookAt(0, 0, 0);
        
        console.log(`${orientation} camera bounds: [${cameraLeft.toFixed(3)}, ${cameraRight.toFixed(3)}, ${cameraTop.toFixed(3)}, ${cameraBottom.toFixed(3)}]`);
        
        // Create renderer using full container dimensions
        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(containerWidth, containerHeight);
        container.appendChild(renderer.domElement);
        
        // Store references
        this.scenes[orientation] = scene;
        this.cameras[orientation] = camera;
        this.renderers[orientation] = renderer;
        
        // Store aspect ratios for this orientation
        this.dataAspectRatios = this.dataAspectRatios || {};
        this.dataAspectRatios[orientation] = dataAspectRatio;
        
        this.containerAspectRatios = this.containerAspectRatios || {};
        this.containerAspectRatios[orientation] = containerAspectRatio;
        
        // Store base camera bounds for zoom/pan
        this.baseCameraBounds = this.baseCameraBounds || {};
        this.baseCameraBounds[orientation] = {
            left: cameraLeft,
            right: cameraRight,
            top: cameraTop,
            bottom: cameraBottom
        };
        
        // Initialize slice position based on orientation
        if (orientation === 'axial') {
            this.slicePositions[orientation] = Math.floor(this.dimensions.z / 2);
        } else if (orientation === 'sagittal') {
            this.slicePositions[orientation] = Math.floor(this.dimensions.x / 2);
        } else { // coronal
            this.slicePositions[orientation] = Math.floor(this.dimensions.y / 2);
        }
        
        // Create initial slice
        this.updateSlice(orientation);
        this.updateSliceLabel(orientation);
        
        // Add mouse wheel event for slice navigation and zoom
        renderer.domElement.addEventListener('wheel', (event) => {
            event.preventDefault();
            event.stopPropagation();
            
            if (event.ctrlKey) {
                // CTRL+wheel = zoom
                this.handleSliceZoom(orientation, event.deltaY > 0 ? -0.1 : 0.1);
            } else {
                // Regular wheel = slice navigation
                this.handleSliceScroll(orientation, event.deltaY > 0 ? 1 : -1);
            }
        });
        
        // Add mouse drag events for panning
        let isDragging = false;
        let lastMouseX = 0;
        let lastMouseY = 0;
        
        renderer.domElement.addEventListener('mousedown', (event) => {
            if (event.button === 2) { // Right mouse button
                event.preventDefault();
                event.stopPropagation();
                isDragging = true;
                lastMouseX = event.clientX;
                lastMouseY = event.clientY;
                renderer.domElement.style.cursor = 'move';
            }
        });
        
        renderer.domElement.addEventListener('mousemove', (event) => {
            if (isDragging && event.buttons === 2) { // Right button held
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
            if (event.button === 2) { // Right mouse button
                event.preventDefault();
                event.stopPropagation();
                isDragging = false;
                renderer.domElement.style.cursor = 'crosshair';
            }
        });
        
        // Handle mouse leave to stop dragging
        renderer.domElement.addEventListener('mouseleave', () => {
            isDragging = false;
            renderer.domElement.style.cursor = 'crosshair';
        });
        
        // Prevent context menu
        renderer.domElement.addEventListener('contextmenu', (event) => {
            event.preventDefault();
        });
        
        // Render initially
        renderer.render(scene, camera);
        
        // Store render function for updates
        this.renderFunctions = this.renderFunctions || {};
        this.renderFunctions[orientation] = () => {
            renderer.render(scene, camera);
        };
    },
    
    initVolumeViewer: function(containerId) {
        // Create volume texture for the dedicated renderer
        const volumeTexture = this.createVolumeTexture();
        
        // Initialize the dedicated volume renderer with correct dimensions
        if (typeof window.VolumeRenderer !== 'undefined') {
            // Pass the downsampled dimensions, not the original ones
            window.VolumeRenderer.init(containerId, volumeTexture, this.volumeAtlas, this.volumeAtlas.sliceDims);
            console.log('Volume viewer initialized with dedicated renderer');
        } else {
            console.error('VolumeRenderer not available - make sure volume_renderer.js is loaded');
        }
    },
    
    // Volume rendering cube creation is now handled by VolumeRenderer
    
    createVolumeTexture: function() {
        // Downsample volume data for performance
        const factor = VOLUME_DOWNSAMPLE_FACTOR;
        const newDims = {
            x: Math.floor(this.dimensions.x / factor),
            y: Math.floor(this.dimensions.y / factor),
            z: Math.floor(this.dimensions.z / factor)
        };
        
        // For Three.js r128 compatibility, we'll create a 2D texture atlas
        // that contains all slices arranged in a grid
        const atlasSize = Math.ceil(Math.sqrt(newDims.z));
        const textureSize = atlasSize * newDims.x;
        const textureData = new Uint8Array(textureSize * textureSize);
        
        // Arrange slices in atlas
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
        
        // Store atlas info for shader
        this.volumeAtlas = {
            atlasSize: atlasSize,
            textureSize: textureSize,
            sliceDims: newDims
        };
        
        // Debug: Check if texture data has any non-zero values
        let nonZeroCount = 0;
        let maxValue = 0;
        for (let i = 0; i < textureData.length; i++) {
            if (textureData[i] > 0) nonZeroCount++;
            if (textureData[i] > maxValue) maxValue = textureData[i];
        }
        console.log(`Texture atlas: ${textureSize}x${textureSize}, non-zero pixels: ${nonZeroCount}/${textureData.length}, max value: ${maxValue}`);
        
        return texture;
    },
    
    // Volume shaders are now handled by VolumeRenderer
    
    updateSlice: function(orientation) {
        const scene = this.scenes[orientation];
        const position = this.slicePositions[orientation];
        const dataAspectRatio = this.dataAspectRatios[orientation];
        
        console.log(`Updating ${orientation} slice ${position}`);
        
        // Debug: Show the actual dimensions used for this orientation
        let sliceWidth, sliceHeight;
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
        
        const calculatedAspectRatio = sliceWidth / sliceHeight;
        console.log(`${orientation} DEBUG: sliceWidth=${sliceWidth}, sliceHeight=${sliceHeight}, calculatedAspect=${calculatedAspectRatio.toFixed(3)}, storedAspect=${dataAspectRatio.toFixed(3)}`);
        
        // Clear previous slice
        while(scene.children.length > 0) {
            scene.remove(scene.children[0]);
        }
        
        // Create slice texture
        const texture = this.createSliceTexture(orientation, position);
        
        // Debug: Check if texture has data
        console.log(`${orientation} texture created:`, texture.image.width, 'x', texture.image.height, `aspect: ${(texture.image.width / texture.image.height).toFixed(3)}`);
        
        // Create plane geometry with correct aspect ratio
        // Size the plane to fit within [-1, 1] bounds while maintaining aspect ratio
        let planeWidth, planeHeight;
        
        if (dataAspectRatio > 1.0) {
            // Data is wider than tall - make width = 2, scale height accordingly
            planeWidth = 2.0;
            planeHeight = 2.0 / dataAspectRatio;
        } else {
            // Data is taller than wide - make height = 2, scale width accordingly  
            planeHeight = 2.0;
            planeWidth = 2.0 * dataAspectRatio;
        }
        
        console.log(`${orientation} plane size: ${planeWidth.toFixed(3)} x ${planeHeight.toFixed(3)} (aspect: ${dataAspectRatio.toFixed(3)}, condition: ${dataAspectRatio > 1.0 ? 'WIDE' : 'TALL'})`);
        
        const geometry = new THREE.PlaneGeometry(planeWidth, planeHeight);
        const material = new THREE.MeshBasicMaterial({ 
            map: texture, 
            transparent: false,
            side: THREE.DoubleSide
        });
        
        const plane = new THREE.Mesh(geometry, material);
        scene.add(plane);
        
        // Render
        if (this.renderFunctions && this.renderFunctions[orientation]) {
            this.renderFunctions[orientation]();
        } else {
            this.renderers[orientation].render(scene, this.cameras[orientation]);
        }
        
        console.log(`${orientation} slice rendered`);
    },
    
    createSliceTexture: function(orientation, sliceIndex) {
        let sliceWidth, sliceHeight, sliceData;
        
        // Get original slice dimensions
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
        
        // Create slice data with natural dimensions
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
        
        // Debug: Check slice data
        let nonZeroPixels = 0;
        let maxValue = 0;
        for (let i = 0; i < sliceData.length; i++) {
            if (sliceData[i] > 0) nonZeroPixels++;
            if (sliceData[i] > maxValue) maxValue = sliceData[i];
        }
        console.log(`${orientation} slice ${sliceIndex}: ${sliceWidth}x${sliceHeight}, non-zero: ${nonZeroPixels}/${sliceData.length}, max: ${maxValue}`);
        
        const texture = new THREE.DataTexture(sliceData, sliceWidth, sliceHeight, THREE.LuminanceFormat, THREE.UnsignedByteType);
        texture.minFilter = THREE.NearestFilter;
        texture.magFilter = THREE.NearestFilter;
        texture.needsUpdate = true;
        return texture;
    },
    
    handleSliceScroll: function(orientation, direction) {
        // Don't handle scroll if data isn't loaded yet
        if (!this.initialized || !this.volumeData || !this.dimensions) {
            console.log('CBCT data not ready for slice scrolling');
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
            console.log('CBCT data not ready for zooming');
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
        
        console.log(`${orientation} zoom: ${zoomLevel.toFixed(2)}x`);
    },

    handleSlicePan: function(orientation, deltaX, deltaY) {
        // Don't handle pan if data isn't loaded yet
        if (!this.initialized || !this.cameras[orientation] || !this.baseCameraBounds[orientation]) {
            console.log('CBCT data not ready for panning');
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
        
        // Clamp pan offsets to prevent panning too far out of bounds
        const maxPanX = (currentWidth * (zoomLevel - 1)) / (2 * zoomLevel);
        const maxPanY = (currentHeight * (zoomLevel - 1)) / (2 * zoomLevel);
        
        this.panOffsets[orientation].x = Math.max(-maxPanX, Math.min(maxPanX, this.panOffsets[orientation].x));
        this.panOffsets[orientation].y = Math.max(-maxPanY, Math.min(maxPanY, this.panOffsets[orientation].y));
        
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
        
        // Debug output
        console.log(`${orientation} pan: (${panX.toFixed(3)}, ${panY.toFixed(3)})`);
    },
    
    initPanoramicInteraction: function() {
        const panoramicView = document.getElementById('panoramicView');
        const panoramicImg = document.getElementById('panoramicImage');
        
        if (!panoramicView || !panoramicImg) {
            console.log('Panoramic elements not found');
            return;
        }
        
        console.log('Initializing panoramic interaction...');
        
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
            if (event.button === 2) { // Right mouse button
                event.preventDefault();
                event.stopPropagation();
                isDragging = true;
                lastMouseX = event.clientX;
                lastMouseY = event.clientY;
                panoramicView.style.cursor = 'move';
            }
        });
        
        panoramicView.addEventListener('mousemove', (event) => {
            if (isDragging && event.buttons === 2) { // Right button held
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
            if (event.button === 2) { // Right mouse button
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
        console.log(`Panoramic zoom: ${this.panoramicZoom.toFixed(2)}x`);
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
        
        // Calculate maximum pan limits based on zoom level
        const maxPanX = (containerWidth * (this.panoramicZoom - 1)) / (2 * this.panoramicZoom);
        const maxPanY = (containerHeight * (this.panoramicZoom - 1)) / (2 * this.panoramicZoom);
        
        // Clamp pan offsets
        this.panoramicPan.x = Math.max(-maxPanX, Math.min(maxPanX, this.panoramicPan.x));
        this.panoramicPan.y = Math.max(-maxPanY, Math.min(maxPanY, this.panoramicPan.y));
        
        this.updatePanoramicTransform();
        console.log(`Panoramic pan: (${this.panoramicPan.x.toFixed(1)}, ${this.panoramicPan.y.toFixed(1)})`);
    },
    
    updatePanoramicTransform: function() {
        const panoramicImg = document.getElementById('panoramicImage');
        if (!panoramicImg) return;
        
        const transform = `scale(${this.panoramicZoom}) translate(${this.panoramicPan.x}px, ${this.panoramicPan.y}px)`;
        panoramicImg.style.transform = transform;
        panoramicImg.style.transformOrigin = 'center center';
    },
    
    resetPanoramicView: function() {
        console.log('Resetting panoramic view');
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
            // Re-render all slice views
            ['axial', 'sagittal', 'coronal'].forEach(orientation => {
                if (this.renderers[orientation] && this.scenes[orientation] && this.cameras[orientation]) {
                    // Resize renderer to current container size (full size)
                    const containerId = orientation === 'axial' ? 'axialView' : 
                                       orientation === 'sagittal' ? 'sagittalView' : 'coronalView';
                    const container = document.getElementById(containerId);
                    if (container && container.clientWidth > 0 && container.clientHeight > 0) {
                        const containerWidth = container.clientWidth;
                        const containerHeight = container.clientHeight;
                        const containerAspectRatio = containerWidth / containerHeight;
                        const dataAspectRatio = this.dataAspectRatios[orientation];
                        
                        console.log(`Refreshing ${orientation}: container ${containerWidth}x${containerHeight}, data aspect ${dataAspectRatio.toFixed(2)}`);
                        
                        this.renderers[orientation].setSize(containerWidth, containerHeight);
                        
                        // Recalculate camera bounds to maintain data aspect ratio
                        let cameraLeft, cameraRight, cameraTop, cameraBottom;
                        
                        // Calculate how to fit the data aspect ratio within the container
                        if (dataAspectRatio > containerAspectRatio) {
                            // Data is wider relative to container - fit to container width
                            const halfWidth = containerAspectRatio;
                            const halfHeight = containerAspectRatio / dataAspectRatio;
                            cameraLeft = -halfWidth;
                            cameraRight = halfWidth;
                            cameraTop = halfHeight;
                            cameraBottom = -halfHeight;
                        } else {
                            // Data is taller relative to container - fit to container height
                            const halfWidth = dataAspectRatio;
                            const halfHeight = 1.0;
                            cameraLeft = -halfWidth;
                            cameraRight = halfWidth;
                            cameraTop = halfHeight;
                            cameraBottom = -halfHeight;
                        }
                        
                        // Update stored bounds
                        this.baseCameraBounds[orientation] = {
                            left: cameraLeft,
                            right: cameraRight,
                            top: cameraTop,
                            bottom: cameraBottom
                        };
                        
                        // Reset zoom and pan for resize
                        this.zoomLevels[orientation] = 1.0;
                        this.panOffsets[orientation] = { x: 0, y: 0 };
                        
                        // Apply to camera
                        const camera = this.cameras[orientation];
                        camera.left = cameraLeft;
                        camera.right = cameraRight;
                        camera.top = cameraTop;
                        camera.bottom = cameraBottom;
                        camera.updateProjectionMatrix();
                        
                        // Force re-render
                        this.updateSlice(orientation);
                    } else {
                        console.warn(`Container ${containerId} not ready for refresh (${container ? container.clientWidth + 'x' + container.clientHeight : 'not found'})`);
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
        // Handle slice viewers (full size with correct aspect ratio)
        ['axial', 'sagittal', 'coronal'].forEach(orientation => {
            if (this.renderers[orientation] && this.cameras[orientation]) {
                const containerId = orientation === 'axial' ? 'axialView' : 
                                   orientation === 'sagittal' ? 'sagittalView' : 'coronalView';
                const container = document.getElementById(containerId);
                if (container) {
                    const containerWidth = container.clientWidth;
                    const containerHeight = container.clientHeight;
                    const containerAspectRatio = containerWidth / containerHeight;
                    
                    this.renderers[orientation].setSize(containerWidth, containerHeight);
                    
                    // Recalculate camera bounds to maintain data aspect ratio
                    const dataAspectRatio = this.dataAspectRatios[orientation];
                    let cameraLeft, cameraRight, cameraTop, cameraBottom;
                    
                    // Calculate how to fit the data aspect ratio within the container
                    if (dataAspectRatio > containerAspectRatio) {
                        // Data is wider relative to container - fit to container width
                        const halfWidth = containerAspectRatio;
                        const halfHeight = containerAspectRatio / dataAspectRatio;
                        cameraLeft = -halfWidth;
                        cameraRight = halfWidth;
                        cameraTop = halfHeight;
                        cameraBottom = -halfHeight;
                    } else {
                        // Data is taller relative to container - fit to container height
                        const halfWidth = dataAspectRatio;
                        const halfHeight = 1.0;
                        cameraLeft = -halfWidth;
                        cameraRight = halfWidth;
                        cameraTop = halfHeight;
                        cameraBottom = -halfHeight;
                    }
                    
                    // Update stored bounds
                    this.baseCameraBounds[orientation] = {
                        left: cameraLeft,
                        right: cameraRight,
                        top: cameraTop,
                        bottom: cameraBottom
                    };
                    
                    // Apply current zoom and pan with new bounds
                    const zoomLevel = this.zoomLevels[orientation] || 1.0;
                    const panX = (this.panOffsets[orientation] && this.panOffsets[orientation].x) || 0;
                    const panY = (this.panOffsets[orientation] && this.panOffsets[orientation].y) || 0;
                    
                    const width = (cameraRight - cameraLeft) / zoomLevel;
                    const height = (cameraTop - cameraBottom) / zoomLevel;
                    
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
    
    showError: function(message) {
        const loadingDiv = document.getElementById('cbctLoading');
        loadingDiv.innerHTML = `
            <div class="text-center py-4">
                <i class="fas fa-exclamation-triangle text-warning mb-2" style="font-size: 2rem;"></i>
                <p class="text-muted">${message}</p>
            </div>
        `;
    }
};

// Auto-start CBCT loading when IOS viewer is ready (if CBCT data exists)
document.addEventListener('DOMContentLoaded', function() {
    if (window.hasCBCT) {
        // Start loading CBCT data in background
        setTimeout(() => {
            if (!window.CBCTViewer.initialized && !window.CBCTViewer.loading) {
                console.log('Pre-loading CBCT data...');
                window.CBCTViewer.loadVolumeData();
            }
        }, 2000); // Wait 2 seconds after IOS viewer loads
    }
}); 