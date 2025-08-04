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

// Initialize 3D viewer
function initViewer(containerId, upperStlUrl, lowerStlUrl) {
    const container = document.getElementById(containerId);
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
            
            console.log('Both meshes loaded successfully');
            
            centerScansAtOrigin();
            
            console.log('Scans centered and camera positioned');
        }
    }
    
    // Load upper jaw
    loader.load(upperStlUrl, function(geometry) {
        console.log('Upper scan loaded successfully, vertices:', geometry.attributes.position.count);
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
        
        console.log('Upper mesh added to scene');
        onModelLoaded();
    }, undefined, function(error) {
        console.error('Error loading upper jaw:', error);
        if (loadingIndicator) {
            loadingIndicator.innerHTML = '<p style="color: red;">Error loading 3D model</p>';
        }
    });
    
    // Load lower jaw
    loader.load(lowerStlUrl, function(geometry) {
        console.log('Lower scan loaded successfully, vertices:', geometry.attributes.position.count);
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
        
        console.log('Lower mesh added to scene');
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
    }
}

// Revolutionary Classification UI Functions
function toggleDropdown(button) {
    if (!window.canEdit) {
        return; // Not editable for non-annotators
    }
    
    // Close all other dropdowns
    document.querySelectorAll('.value-dropdown.show').forEach(dropdown => {
        if (dropdown !== button.nextElementSibling) {
            dropdown.classList.remove('show');
        }
    });
    
    // Toggle this dropdown
    const dropdown = button.nextElementSibling;
    if (dropdown) {
        dropdown.classList.toggle('show');
        
        dropdown.querySelectorAll('.dropdown-option').forEach(option => {
            option.onclick = function() {
                updateClassification(button, option);
            };
        });
    }
}

function updateClassification(button, option) {
    const field = button.closest('.classification-value').dataset.field;
    const value = option.dataset.value;
    const displayText = option.textContent;
    
    // Update UI immediately
    button.textContent = displayText;
    button.classList.remove('ai-prediction');
    button.classList.add('manual-verified');
    
    // Hide dropdown
    button.nextElementSibling.classList.remove('show');
    
    // Save via AJAX
    fetch(`/scan/${window.scanId}/update/`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            field: field,
            value: value
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showSavedIndicator();
            updatePageStatus();
        } else {
            console.error('Error saving classification:', data.error);
            button.classList.remove('manual-verified');
            button.classList.add('ai-prediction');
        }
    })
    .catch(error => {
        console.error('Network error:', error);
        button.classList.remove('manual-verified');
        button.classList.add('ai-prediction');
    });
}

function showSavedIndicator() {
    const indicator = document.getElementById('savingIndicator');
    indicator.style.display = 'block';
    setTimeout(() => {
        indicator.style.display = 'none';
    }, 2000);
}

function updatePageStatus() {
    const statusBadge = document.querySelector('.status-badge');
    if (statusBadge && statusBadge.classList.contains('ai-pending')) {
        statusBadge.innerHTML = '<i class="fas fa-check-circle me-1"></i>VERIFIED';
        statusBadge.classList.remove('ai-pending');
        statusBadge.classList.add('manual-verified');
        
        const quickActions = document.querySelector('.quick-actions');
        if (quickActions) {
            quickActions.style.display = 'none';
        }
    }
}

// Close dropdowns when clicking outside
document.addEventListener('click', function(event) {
    if (!event.target.closest('.classification-value')) {
        document.querySelectorAll('.value-dropdown.show').forEach(dropdown => {
            dropdown.classList.remove('show');
        });
    }
});

// Inline name editing functionality
function initNameEditing() {
    const editBtn = document.querySelector('.btn-edit-name');
    const nameDisplay = document.querySelector('.scan-name-display');
    
    if (!editBtn || !nameDisplay) return;
    
    editBtn.addEventListener('click', function() {
        const currentName = nameDisplay.textContent.trim();
        const parentElement = nameDisplay.parentNode;
        
        if (!parentElement) {
            console.error('Parent element not found');
            return;
        }
        
        // Create input field
        const input = document.createElement('input');
        input.type = 'text';
        input.value = currentName;
        input.className = 'name-edit-input';
        input.style.width = '200px';
        
        // Replace display with input
        parentElement.replaceChild(input, nameDisplay);
        input.focus();
        input.select();
        
        // Handle save
        function saveName() {
            const newName = input.value.trim();
            if (!newName) {
                input.value = currentName;
                return;
            }
            
            fetch(`/scan/${window.scanId}/update-name/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    name: newName
                })
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    nameDisplay.textContent = data.name;
                    if (input.parentNode) {
                        input.parentNode.replaceChild(nameDisplay, input);
                    }
                    showSavedIndicator();
                } else {
                    alert('Error saving name: ' + (data.error || 'Unknown error'));
                    if (input.parentNode) {
                        input.parentNode.replaceChild(nameDisplay, input);
                    }
                }
            })
            .catch(error => {
                console.error('Error:', error);
                alert('Error saving name');
                if (input.parentNode) {
                    input.parentNode.replaceChild(nameDisplay, input);
                }
            });
        }
        
        // Handle cancel
        function cancelEdit() {
            if (input.parentNode) {
                input.parentNode.replaceChild(nameDisplay, input);
            }
        }
        
        // Event handlers
        input.addEventListener('blur', saveName);
        input.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                saveName();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                cancelEdit();
            }
        });
    });
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
}

// Initialize everything when page loads
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM Content Loaded - initializing...');
    
    // Check if Three.js is available
    if (typeof THREE === 'undefined') {
        console.error('Three.js is not loaded!');
        return;
    }
    console.log('Three.js version:', THREE.REVISION);
    
    // Check required Three.js components
    console.log('TrackballControls available:', typeof THREE.TrackballControls !== 'undefined');
    
    // Get Django data
    const djangoData = JSON.parse(document.getElementById('django-data').textContent);
    window.canEdit = djangoData.canEdit;
    window.scanId = djangoData.scanId;
    window.hasCBCT = djangoData.hasCBCT;
    window.isCBCTProcessed = djangoData.isCBCTProcessed;
    
    console.log('Can edit:', window.canEdit);
    console.log('Scan ID:', window.scanId);
    console.log('Has CBCT:', window.hasCBCT);
    console.log('Is CBCT processed:', window.isCBCTProcessed);
    
    // Load scan data and initialize viewer
    loadScanDataAndInitViewer();
    
    // Initialize other UI components
    initNameEditing();
    init3DControls();
    initConfirmReview();
    initViewerToggle();
});

// Load scan data from API and initialize viewer
function loadScanDataAndInitViewer() {
    console.log('Loading scan data for ID:', window.scanId);
    
    fetch(`/api/scan/${window.scanId}/data/`)
        .then(async response => {
            console.log('Response status:', response.status);
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
            console.log('Scan data received:', data);
            if (data.error) {
                console.error('Error loading scan data:', data.error);
                return;
            }
            
            console.log('Upper scan URL:', data.upper_scan_url);
            console.log('Lower scan URL:', data.lower_scan_url);
            
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

// Initialize confirm review functionality
function initConfirmReview() {
    const confirmBtn = document.getElementById('confirmReview');
    if (confirmBtn) {
        confirmBtn.addEventListener('click', function() {
            // Create form and submit to accept AI predictions
            const form = document.createElement('form');
            form.method = 'POST';
            form.style.display = 'none';
            
            const csrfToken = document.querySelector('[name=csrfmiddlewaretoken]').value;
            const csrfInput = document.createElement('input');
            csrfInput.type = 'hidden';
            csrfInput.name = 'csrfmiddlewaretoken';
            csrfInput.value = csrfToken;
            
            const actionInput = document.createElement('input');
            actionInput.type = 'hidden';
            actionInput.name = 'action';
            actionInput.value = 'accept_ai';
            
            form.appendChild(csrfInput);
            form.appendChild(actionInput);
            document.body.appendChild(form);
            form.submit();
        });
    }
}

// Initialize viewer toggle functionality
function initViewerToggle() {
    const iosRadio = document.getElementById('iosViewer');
    const cbctRadio = document.getElementById('cbctViewer');
    const iosContainer = document.getElementById('ios-viewer');
    const cbctContainer = document.getElementById('cbct-viewer');
    const iosControls = document.getElementById('iosControls');
    const cbctControls = document.getElementById('cbctControls');
    
    // Disable CBCT option if no CBCT data
    if (!window.hasCBCT) {
        cbctRadio.disabled = true;
        cbctRadio.parentElement.classList.add('disabled');
        cbctRadio.parentElement.title = 'No CBCT data available';
    }
    
    // Handle initial state based on which radio button is checked
    if (cbctRadio.checked && window.hasCBCT) {
        // CBCT is initially selected - initialize CBCT viewer
        if (typeof window.CBCTViewer !== 'undefined') {
            if (!window.CBCTViewer.initialized && !window.CBCTViewer.loading) {
                // Not initialized and not loading - start initialization
                window.CBCTViewer.init();
            } else if (window.CBCTViewer.initialized) {
                // Already initialized - refresh views
                window.CBCTViewer.refreshAllViews();
            }
        }
    }
    
    iosRadio.addEventListener('change', function() {
        if (this.checked) {
            iosContainer.style.display = 'block';
            cbctContainer.style.display = 'none';
            iosControls.style.display = 'block';
            cbctControls.style.display = 'none';
        }
    });
    
    cbctRadio.addEventListener('change', function() {
        if (this.checked && window.hasCBCT) {
            iosContainer.style.display = 'none';
            cbctContainer.style.display = 'block';
            iosControls.style.display = 'none';
            cbctControls.style.display = 'block';
            
            // Handle CBCT viewer state with a delay to ensure containers are visible
            setTimeout(() => {
                if (typeof window.CBCTViewer !== 'undefined') {
                    if (!window.CBCTViewer.initialized && !window.CBCTViewer.loading) {
                        // Not initialized and not loading - start initialization
                        console.log('Initializing CBCT viewer after view switch...');
                        window.CBCTViewer.init();
                    } else if (window.CBCTViewer.initialized) {
                        // Already initialized - refresh views and reload panoramic
                        console.log('Refreshing CBCT viewer after view switch...');
                        window.CBCTViewer.refreshAllViews();
                        
                        // Always reload panoramic when switching to CBCT tab
                        if (window.CBCTViewer.panoramicLoaded !== undefined) {
                            console.log('Reloading panoramic image after tab switch...');
                            window.CBCTViewer.panoramicLoaded = false; // Reset panoramic state
                            window.CBCTViewer.loadPanoramicImage();
                        }
                    }
                    // If loading is in progress, do nothing - let it complete naturally
                }
            }, 100); // 100ms delay to ensure containers are visible and sized
        }
    });
} 