/**
 * IOS (Intraoral Scan) Viewer
 * Handles 3D visualization of upper and lower jaw STL files
 */

// STL Loader - simplified version
THREE.STLLoader = function() {
    this.manager = THREE.DefaultLoadingManager;
};

THREE.STLLoader.prototype = {
    constructor: THREE.STLLoader,
    
    load: function(url, onLoad, onProgress, onError) {
        var scope = this;
        var loader = new THREE.FileLoader(scope.manager);
        loader.setResponseType('arraybuffer');
        loader.load(url, function(data) {
            try {
                onLoad(scope.parse(data));
            } catch (e) {
                if (onError) {
                    onError(e);
                } else {
                    console.error(e);
                }
                scope.manager.itemError(url);
            }
        }, onProgress, onError);
    },
    
    parse: function(data) {
        var geometry = new THREE.BufferGeometry();
        
        // Simple ASCII STL parser
        var dataString = new TextDecoder().decode(data);
        
        if (dataString.indexOf('solid') === 0) {
            // ASCII format
            var vertices = [];
            var normals = [];
            
            var lines = dataString.split('\n');
            for (var i = 0; i < lines.length; i++) {
                var line = lines[i].trim();
                if (line.startsWith('vertex')) {
                    var coords = line.split(/\s+/);
                    vertices.push(parseFloat(coords[1]), parseFloat(coords[2]), parseFloat(coords[3]));
                } else if (line.startsWith('facet normal')) {
                    var coords = line.split(/\s+/);
                    var nx = parseFloat(coords[2]);
                    var ny = parseFloat(coords[3]);
                    var nz = parseFloat(coords[4]);
                    // Add normal for each of the 3 vertices of the triangle
                    normals.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
                }
            }
            
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
            geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        } else {
            // Binary format - simplified parser
            var view = new DataView(data);
            var triangles = view.getUint32(80, true);
            
            var vertices = [];
            var normals = [];
            
            for (var i = 0; i < triangles; i++) {
                var offset = 84 + i * 50;
                
                // Normal
                var nx = view.getFloat32(offset, true);
                var ny = view.getFloat32(offset + 4, true);
                var nz = view.getFloat32(offset + 8, true);
                
                // Vertices
                for (var j = 0; j < 3; j++) {
                    var vx = view.getFloat32(offset + 12 + j * 12, true);
                    var vy = view.getFloat32(offset + 16 + j * 12, true);
                    var vz = view.getFloat32(offset + 20 + j * 12, true);
                    
                    vertices.push(vx, vy, vz);
                    normals.push(nx, ny, nz);
                }
            }
            
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
            geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        }
        
        return geometry;
    }
};

// =====================================================
// 3D VIEWER IMPLEMENTATION
// =====================================================

// Global variables for 3D scene
let scene1, camera1, renderer1;
let controls1;
let upperMesh1, lowerMesh1;
let cameraLight1;
let gridOverlay1;

// Initialize 3D viewer
function initViewer(containerId, upperStlUrl, lowerStlUrl, retryCount = 0) {
    const container = document.getElementById(containerId);
    console.debug('IOS initViewer called with containerId:', containerId, 'retry:', retryCount);
    console.debug('Container element:', container);
    
    if (!container) {
        console.error('IOS viewer container not found:', containerId);
        return;
    }
    
    // Make sure container is visible
    if (container.style.display === 'none') {
        console.debug('Removing display:none from container');
        container.style.display = '';
    }
    
    console.debug('Container dimensions:', container.clientWidth, 'x', container.clientHeight);
    
    if (container.clientWidth === 0 || container.clientHeight === 0) {
        if (retryCount < 20) { // Max 2 seconds of retries
            console.warn('Container has zero dimensions, retrying in 100ms... (attempt', retryCount + 1, 'of 20)');
            setTimeout(() => initViewer(containerId, upperStlUrl, lowerStlUrl, retryCount + 1), 100);
        } else {
            console.error('Failed to initialize IOS viewer: container has no dimensions after 2 seconds');
            window.IOSViewer.loading = false; // Reset loading state
        }
        return;
    }
    
    console.debug('Container ready, initializing 3D viewer...');
    const loadingIndicator = null; // No loading indicator element for now
    
    // Create scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);
    
    // Create camera
    const camera = new THREE.PerspectiveCamera(35, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.set(0, 80, 0);
    camera.up.set(0, 0, -1); // Set Z-axis as up
    camera.lookAt(0, 0, 0);
    
    // Create renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.style.position = 'absolute';
    renderer.domElement.style.top = '0';
    renderer.domElement.style.left = '0';
    container.appendChild(renderer.domElement);
    
    // Add lighting
    const cameraLight = new THREE.DirectionalLight(0xffffff, 0.9);
    cameraLight.position.copy(camera.position);
    cameraLight.target.position.set(0, 0, 0);
    scene.add(cameraLight);
    scene.add(cameraLight.target);
    
    // Add controls
    const controls = new THREE.TrackballControls(camera, renderer.domElement);
    controls.rotateSpeed = 2.0;
    controls.zoomSpeed = 1.2;
    controls.panSpeed = 0.8;
    controls.noZoom = false;
    controls.noPan = false;
    controls.noRotate = false;
    controls.staticMoving = true;
    controls.dynamicDampingFactor = 0.3;
    controls.target.set(0, 0, 0);
    controls.screen.left = 0;
    controls.screen.top = 0;
    controls.screen.width = container.clientWidth;
    controls.screen.height = container.clientHeight;
    controls.handleResize();
    
    // Add reference frame axis
    addReferenceAxis(scene);
    
    // Store references
    scene1 = scene;
    camera1 = camera;
    renderer1 = renderer;
    controls1 = controls;
    cameraLight1 = cameraLight;
    
    // Create grid helper (hidden by default)
    createGrid(9); // Default to 9x9 grid
    
    // Load STL files
    loadSTLFiles(scene, loadingIndicator, upperStlUrl, lowerStlUrl);
    
    // Start animation loop
    animate();
}

// Add reference frame axis
function addReferenceAxis(scene) {
    const axisLength = 10;
    const axisWidth = 0.2;
    const axisGroup = new THREE.Group();
    
    // X-axis (Red) - pointing left
    const xGeometry = new THREE.CylinderGeometry(axisWidth, axisWidth, axisLength, 8);
    const xMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const xAxis = new THREE.Mesh(xGeometry, xMaterial);
    xAxis.rotation.z = Math.PI / 2;
    xAxis.position.x = -axisLength / 2;
    axisGroup.add(xAxis);
    
    const xArrowGeometry = new THREE.ConeGeometry(axisWidth * 2, axisWidth * 4, 8);
    const xArrow = new THREE.Mesh(xArrowGeometry, xMaterial);
    xArrow.rotation.z = Math.PI / 2;
    xArrow.position.x = -axisLength - axisWidth * 2;
    axisGroup.add(xArrow);
    
    // Y-axis (Green) - pointing up
    const yGeometry = new THREE.CylinderGeometry(axisWidth, axisWidth, axisLength, 8);
    const yMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    const yAxis = new THREE.Mesh(yGeometry, yMaterial);
    yAxis.position.y = axisLength / 2;
    axisGroup.add(yAxis);
    
    const yArrowGeometry = new THREE.ConeGeometry(axisWidth * 2, axisWidth * 4, 8);
    const yArrow = new THREE.Mesh(yArrowGeometry, yMaterial);
    yArrow.position.y = axisLength + axisWidth * 2;
    axisGroup.add(yArrow);
    
    // Z-axis (Blue) - pointing backward
    const zGeometry = new THREE.CylinderGeometry(axisWidth, axisWidth, axisLength, 8);
    const zMaterial = new THREE.MeshBasicMaterial({ color: 0x0000ff });
    const zAxis = new THREE.Mesh(zGeometry, zMaterial);
    zAxis.rotation.x = -Math.PI / 2;
    zAxis.position.z = -axisLength / 2;
    axisGroup.add(zAxis);
    
    const zArrowGeometry = new THREE.ConeGeometry(axisWidth * 2, axisWidth * 4, 8);
    const zArrow = new THREE.Mesh(zArrowGeometry, zMaterial);
    zArrow.rotation.x = -Math.PI / 2;
    zArrow.position.z = -axisLength - axisWidth * 2;
    axisGroup.add(zArrow);
    
    // Add text labels
    addAxisLabels(axisGroup, axisLength);
    
    scene.add(axisGroup);
}

// Add text labels for the axes
function addAxisLabels(axisGroup, axisLength) {
    const labelOffset = axisLength + 3;
    
    function createTextTexture(text, color) {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 64;
        canvas.height = 64;
        
        context.fillStyle = color;
        context.font = 'bold 48px Arial';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(text, 32, 32);
        
        return new THREE.CanvasTexture(canvas);
    }
    
    // X-axis label (0)
    const xLabel = new THREE.Sprite(new THREE.SpriteMaterial({ map: createTextTexture('0', '#ff0000') }));
    xLabel.position.set(-labelOffset, 0, 0);
    xLabel.scale.set(2, 2, 1);
    axisGroup.add(xLabel);
    
    // Y-axis label (1)
    const yLabel = new THREE.Sprite(new THREE.SpriteMaterial({ map: createTextTexture('1', '#00ff00') }));
    yLabel.position.set(0, labelOffset, 0);
    yLabel.scale.set(2, 2, 1);
    axisGroup.add(yLabel);
    
    // Z-axis label (2)
    const zLabel = new THREE.Sprite(new THREE.SpriteMaterial({ map: createTextTexture('2', '#0000ff') }));
    zLabel.position.set(0, 0, -labelOffset);
    zLabel.scale.set(2, 2, 1);
    axisGroup.add(zLabel);
}

// Load STL files
function loadSTLFiles(scene, loadingIndicator, upperStlUrl, lowerStlUrl) {
    const loader = new THREE.STLLoader();
    let meshesLoaded = 0;
    
    function onModelLoaded() {
        meshesLoaded++;
        if (meshesLoaded === 2) {
            if (loadingIndicator) {
                loadingIndicator.style.display = 'none';
            }
            
            console.debug('Both meshes loaded successfully');
            
            centerScansAtOrigin();
            
            console.debug('Scans centered and camera positioned');
            
            // Mark IOS viewer as initialized
            if (window.IOSViewer && typeof window.IOSViewer.markInitialized === 'function') {
                window.IOSViewer.markInitialized();
            }
        }
    }
    
    // Load upper jaw
    loader.load(upperStlUrl, function(geometry) {
        console.debug('Upper scan loaded successfully, vertices:', geometry.attributes.position.count);
        geometry.computeBoundingBox();
        geometry.computeVertexNormals();
        
        const material = new THREE.MeshPhongMaterial({ 
            color: 0xffcccc,
            side: THREE.DoubleSide
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.rotation.y = Math.PI; // Rotate 180 degrees around Y-axis
        
        scene.add(mesh);
        upperMesh1 = mesh;
        
        console.debug('Upper mesh added to scene');
        onModelLoaded();
    }, undefined, function(error) {
        console.error('Error loading upper jaw:', error);
        if (loadingIndicator) {
            loadingIndicator.innerHTML = '<p style="color: red;">Error loading 3D model</p>';
        }
    });
    
    // Load lower jaw
    loader.load(lowerStlUrl, function(geometry) {
        console.debug('Lower scan loaded successfully, vertices:', geometry.attributes.position.count);
        geometry.computeBoundingBox();
        geometry.computeVertexNormals();
        
        const material = new THREE.MeshPhongMaterial({ 
            color: 0xccccff,
            side: THREE.DoubleSide
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.rotation.y = Math.PI; // Rotate 180 degrees around Y-axis
        
        scene.add(mesh);
        lowerMesh1 = mesh;
        
        console.debug('Lower mesh added to scene');
        onModelLoaded();
    }, undefined, function(error) {
        console.error('Error loading lower jaw:', error);
        if (loadingIndicator) {
            loadingIndicator.innerHTML = '<p style="color: red;">Error loading 3D model</p>';
        }
    });
}

// Center both scans at origin
function centerScansAtOrigin() {
    if (!upperMesh1 || !lowerMesh1) return;
    
    const combinedBox = new THREE.Box3();
    combinedBox.expandByObject(upperMesh1);
    combinedBox.expandByObject(lowerMesh1);
    
    const combinedCenter = combinedBox.getCenter(new THREE.Vector3());
    const offset = combinedCenter.clone().negate();
    
    upperMesh1.position.add(offset);
    lowerMesh1.position.add(offset);
}

// Position camera at appropriate distance
function positionCameraForScans() {
    if (!upperMesh1 || !lowerMesh1 || !camera1 || !controls1) return;
    
    const combinedBox = new THREE.Box3();
    combinedBox.expandByObject(upperMesh1);
    combinedBox.expandByObject(lowerMesh1);
    
    const size = combinedBox.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const scaledDistance = Math.max(maxDim * 2, 20);
    
    camera1.position.set(0, scaledDistance, 0);
    camera1.up.set(0, 0, -1);
    camera1.lookAt(0, 0, 0);
    
    controls1.target.set(0, 0, 0);
    controls1.update();
}

// =====================================================
// GRID OVERLAY FUNCTIONALITY
// =====================================================

// Create grid overlay (2D canvas on top of viewer)
function createGrid(size) {
    const container = document.getElementById('scan-viewer');
    if (!container) return;
    
    // Remove existing grid if present
    if (gridOverlay1) {
        gridOverlay1.remove();
    }
    
    // Create canvas element for grid overlay
    gridOverlay1 = document.createElement('canvas');
    gridOverlay1.id = 'grid-overlay';
    gridOverlay1.style.position = 'absolute';
    gridOverlay1.style.top = '0';
    gridOverlay1.style.left = '0';
    gridOverlay1.style.width = '100%';
    gridOverlay1.style.height = '100%';
    gridOverlay1.style.pointerEvents = 'none';
    gridOverlay1.style.display = 'none'; // Hidden by default
    gridOverlay1.style.zIndex = '10';
    
    // Set canvas size to match container
    gridOverlay1.width = container.clientWidth;
    gridOverlay1.height = container.clientHeight;
    
    container.appendChild(gridOverlay1);
    
    // Draw grid
    drawGrid(size);
}

// Draw grid on overlay canvas
function drawGrid(divisions) {
    if (!gridOverlay1) return;
    
    const ctx = gridOverlay1.getContext('2d');
    const width = gridOverlay1.width;
    const height = gridOverlay1.height;
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height);
    
    // Grid styling - slightly darker gray
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.lineWidth = 2;
    
    // Calculate cell size
    const cellWidth = width / divisions;
    const cellHeight = height / divisions;
    
    // Draw vertical lines
    for (let i = 0; i <= divisions; i++) {
        const x = i * cellWidth;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
    }
    
    // Draw horizontal lines
    for (let i = 0; i <= divisions; i++) {
        const y = i * cellHeight;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
    }
}

// Toggle grid visibility
function toggleGrid() {
    if (gridOverlay1) {
        const isVisible = gridOverlay1.style.display !== 'none';
        gridOverlay1.style.display = isVisible ? 'none' : 'block';
        const btn = document.getElementById('toggleGrid');
        if (btn) {
            btn.classList.toggle('active', !isVisible);
        }
    }
}

// Update grid size
function updateGridSize(size) {
    if (gridOverlay1) {
        const wasVisible = gridOverlay1.style.display !== 'none';
        drawGrid(size);
        if (wasVisible) {
            gridOverlay1.style.display = 'block';
        }
    }
}

// Update grid overlay on window resize
function updateGridOnResize() {
    if (gridOverlay1) {
        const container = document.getElementById('scan-viewer');
        if (container) {
            gridOverlay1.width = container.clientWidth;
            gridOverlay1.height = container.clientHeight;
            
            // Redraw grid with current size
            const gridSizeSelect = document.getElementById('gridSize');
            const currentSize = gridSizeSelect ? parseInt(gridSizeSelect.value) : 9;
            drawGrid(currentSize);
        }
    }
}

// =====================================================
// CAMERA POSITIONING FUNCTIONS
// =====================================================

// View from the right side
function viewRight() {
    if (!camera1 || !controls1) return;
    
    const distance = camera1.position.length();
    camera1.position.set(-distance, 0, 0);
    camera1.up.set(0, 0, -1);
    camera1.lookAt(0, 0, 0);
    
    controls1.target.set(0, 0, 0);
    controls1.update();
}

// View from the left side
function viewLeft() {
    if (!camera1 || !controls1) return;
    
    const distance = camera1.position.length();
    camera1.position.set(distance, 0, 0);
    camera1.up.set(0, 0, -1);
    camera1.lookAt(0, 0, 0);
    
    controls1.target.set(0, 0, 0);
    controls1.update();
}

// View from the front (same as reset)
function viewFront() {
    if (!camera1 || !controls1) return;
    
    const distance = camera1.position.length();
    camera1.position.set(0, distance, 0);
    camera1.up.set(0, 0, -1);
    camera1.lookAt(0, 0, 0);
    
    controls1.target.set(0, 0, 0);
    controls1.update();
}

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    
    if (controls1) {
        controls1.update();
    }
    
    if (cameraLight1) {
        cameraLight1.position.copy(camera1.position);
    }
    
    if (renderer1 && scene1 && camera1) {
        renderer1.render(scene1, camera1);
    }
}

// Initialize the STL viewer
function initSTLViewers(upperStlUrl, lowerStlUrl) {
    initViewer('scan-viewer', upperStlUrl, lowerStlUrl);
    window.addEventListener('resize', onWindowResize);
}

// =====================================================
// UI CONTROLS
// =====================================================

// 3D Viewer button controls
function toggleMesh(type) {
    if (type === 'upper' && upperMesh1) {
        upperMesh1.visible = !upperMesh1.visible;
    } else if (type === 'lower' && lowerMesh1) {
        lowerMesh1.visible = !lowerMesh1.visible;
    }
}

function resetView() {
    if (camera1 && controls1) {
        camera1.position.set(0, 80, 0);
        camera1.up.set(0, 0, -1);
        camera1.lookAt(0, 0, 0);
        controls1.target.set(0, 0, 0);
        controls1.reset();
        controls1.update();
    }
}

// Handle window resize
function onWindowResize() {
    const container = document.getElementById('scan-viewer');
    
    if (container && camera1 && renderer1 && controls1) {
        camera1.aspect = container.clientWidth / container.clientHeight;
        camera1.updateProjectionMatrix();
        renderer1.setSize(container.clientWidth, container.clientHeight);
        
        controls1.screen.width = container.clientWidth;
        controls1.screen.height = container.clientHeight;
        controls1.handleResize();
        
        // Update grid overlay
        updateGridOnResize();
    }
}

// Initialize 3D viewer control buttons
function init3DControls() {
    // Reset view button
    const resetViewBtn = document.getElementById('resetView');
    if (resetViewBtn) {
        resetViewBtn.addEventListener('click', resetView);
    }

    // Toggle wireframe button
    const toggleWireframeBtn = document.getElementById('toggleWireframe');
    if (toggleWireframeBtn) {
        toggleWireframeBtn.addEventListener('click', function() {
            if (upperMesh1) upperMesh1.material.wireframe = !upperMesh1.material.wireframe;
            if (lowerMesh1) lowerMesh1.material.wireframe = !lowerMesh1.material.wireframe;
        });
    }

    // Toggle grid button
    const toggleGridBtn = document.getElementById('toggleGrid');
    if (toggleGridBtn) {
        toggleGridBtn.addEventListener('click', toggleGrid);
    }

    // Grid size selector
    const gridSizeSelect = document.getElementById('gridSize');
    if (gridSizeSelect) {
        gridSizeSelect.addEventListener('change', function() {
            updateGridSize(parseInt(this.value));
        });
    }

    // Toggle upper jaw visibility
    const showUpperBtn = document.getElementById('showUpper');
    if (showUpperBtn) {
        showUpperBtn.addEventListener('click', function() {
            if (upperMesh1) {
                upperMesh1.visible = !upperMesh1.visible;
                this.classList.toggle('active', upperMesh1.visible);
            }
        });
    }

    // Toggle lower jaw visibility
    const showLowerBtn = document.getElementById('showLower');
    if (showLowerBtn) {
        showLowerBtn.addEventListener('click', function() {
            if (lowerMesh1) {
                lowerMesh1.visible = !lowerMesh1.visible;
                this.classList.toggle('active', lowerMesh1.visible);
            }
        });
    }

    // View positioning buttons
    const viewRightBtn = document.getElementById('viewRight');
    if (viewRightBtn) {
        viewRightBtn.addEventListener('click', viewRight);
    }

    const viewLeftBtn = document.getElementById('viewLeft');
    if (viewLeftBtn) {
        viewLeftBtn.addEventListener('click', viewLeft);
    }

    const viewFrontBtn = document.getElementById('viewFront');
    if (viewFrontBtn) {
        viewFrontBtn.addEventListener('click', viewFront);
    }
}

// Load scan data from API and initialize viewer
function loadScanDataAndInitViewer() {
    console.debug('Loading scan data for ID:', window.scanId);
    console.debug('Project namespace:', window.projectNamespace);
    
    const apiUrl = `/${window.projectNamespace}/api/patient/${window.scanId}/data/`;
    console.debug('Fetching from:', apiUrl);
    
    fetch(apiUrl)
        .then(async response => {
            console.debug('Response status:', response.status);
            if (response.status === 202) {
                // Processing in progress
                const data = await response.json();
                throw new Error(`processing:${data.message || 'IOS scans are being processed'}`);
            }
            if (!response.ok) {
                // Try to get error details
                try {
                    const errorData = await response.json();
                    if (errorData.status === 'processing') {
                        throw new Error(`processing:${errorData.message}`);
                    } else if (errorData.status === 'failed') {
                        throw new Error(`failed:${errorData.message}`);
                    }
                } catch (e) {
                    // If JSON parsing fails, use generic error
                }
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            console.debug('Scan data received:', data);
            if (data.error) {
                console.error('Error loading scan data:', data.error);
                return;
            }
            
            console.debug('Upper scan URL:', data.upper_scan_url);
            console.debug('Lower scan URL:', data.lower_scan_url);
            
            // Initialize the STL viewer with the scan URLs
            initSTLViewers(data.upper_scan_url, data.lower_scan_url);
        })
        .catch(error => {
            console.error('Error fetching scan data:', error);
            
            // Show appropriate message in the viewer
            const viewerContainer = document.getElementById('iosViewerContainer');
            if (viewerContainer) {
                let message = 'Failed to load scan data';
                let iconClass = 'fa-exclamation-triangle text-warning';
                let textClass = 'text-muted';
                
                if (error.message.startsWith('processing:')) {
                    message = error.message.substring('processing:'.length);
                    iconClass = 'fa-spinner fa-spin text-info';
                    textClass = 'text-info';
                } else if (error.message.startsWith('failed:')) {
                    message = error.message.substring('failed:'.length);
                    iconClass = 'fa-times-circle text-danger';
                    textClass = 'text-danger';
                }
                
                viewerContainer.innerHTML = `
                    <div class="text-center py-5">
                        <i class="fas ${iconClass} mb-3" style="font-size: 3rem;"></i>
                        <p class="${textClass}">${message}</p>
                    </div>
                `;
            }
        });
}

// Export IOSViewer module
window.IOSViewer = {
    initialized: false,
    loading: false,
    
    init: function() {
        console.debug('IOS Viewer init called');
        console.debug('window.hasIOS:', window.hasIOS);
        console.debug('window.scanId:', window.scanId);
        console.debug('THREE available:', typeof THREE !== 'undefined');
        
        // Check if the scan-viewer container exists
        const container = document.getElementById('scan-viewer');
        const parentContainer = document.getElementById('ios-viewer');
        console.debug('scan-viewer container:', container);
        console.debug('ios-viewer parent container:', parentContainer);
        
        // Check if Three.js is available
        if (typeof THREE === 'undefined') {
            console.error('Three.js is not loaded!');
            return;
        }
        
        // If already initialized, just make sure viewer is visible
        if (this.initialized) {
            console.debug('IOS Viewer already initialized');
            return;
        }
        
        // If currently loading, don't start again
        if (this.loading) {
            console.debug('IOS Viewer already loading');
            return;
        }
        
        // Check if container exists
        if (!container) {
            console.warn('scan-viewer container not found - IOS scans may not be available');
            return;
        }
        
        // Make sure parent container is visible
        if (parentContainer && parentContainer.style.display === 'none') {
            console.debug('Parent ios-viewer is hidden, making it visible');
            parentContainer.style.display = 'block';
        }
        
        // Load IOS scan data only if IOS exists
        if (window.hasIOS) {
            console.debug('Loading IOS scan data because hasIOS is true');
            this.loading = true;
            loadScanDataAndInitViewer();
        } else {
            console.debug('Skipping IOS scan data load because hasIOS is false');
        }
        
        // Initialize 3D controls (safe to call multiple times)
        init3DControls();
    },
    
    // Mark as initialized after successful load
    markInitialized: function() {
        this.initialized = true;
        this.loading = false;
        console.debug('IOS Viewer marked as initialized');
    },
    
    // Expose utility functions
    toggleMesh: toggleMesh,
    resetView: resetView,
    toggleGrid: toggleGrid,
    updateGridSize: updateGridSize,
    viewRight: viewRight,
    viewLeft: viewLeft,
    viewFront: viewFront
};

