/**
 * 3D Volume Renderer - Dedicated module for CBCT volume rendering
 * Handles volume cube creation, shader management, and rendering modes
 */

window.VolumeRenderer = {
    // Three.js components
    scene: null,
    camera: null,
    renderer: null,
    controls: null,
    
    // Volume data
    volumeTexture: null,
    volumeAtlas: null,
    dimensions: null,
    
    // Rendering settings
    renderMode: 'mip', // 'mip', 'translucent', 'attenuated'
    
    // Shader cache
    vertexShader: null,
    fragmentShader: null,
    
    init: function(containerId, volumeTexture, volumeAtlas, dimensions) {
        console.log('Initializing Volume Renderer...');
        console.log('Volume data received:', {
            hasTexture: !!volumeTexture,
            textureSize: volumeTexture ? `${volumeTexture.image.width}x${volumeTexture.image.height}` : 'none',
            atlasSize: volumeAtlas ? volumeAtlas.atlasSize : 'none',
            dimensions: dimensions ? `${dimensions.x}x${dimensions.y}x${dimensions.z}` : 'none'
        });
        
        this.volumeTexture = volumeTexture;
        this.volumeAtlas = volumeAtlas;
        this.dimensions = dimensions;
        
        this.setupScene(containerId);
        this.loadShaders().then(() => {
            this.createVolumeCube();
            this.setupEventListeners();
            this.startRenderLoop();
            console.log('Volume Renderer initialized successfully');
        });
    },
    
    setupScene: function(containerId) {
        const container = document.getElementById(containerId);
        if (!container) {
            console.error(`Container with ID '${containerId}' not found!`);
            return;
        }
        
        const width = container.clientWidth;
        const height = container.clientHeight;
        const rect = container.getBoundingClientRect();
        
        console.log(`Setting up volume scene in container: ${containerId}`, {
            clientSize: `${width}x${height}`,
            boundingRect: `${rect.width}x${rect.height}`,
            offsetSize: `${container.offsetWidth}x${container.offsetHeight}`,
            visible: container.offsetParent !== null,
            display: getComputedStyle(container).display,
            visibility: getComputedStyle(container).visibility
        });
        
        // If container has no dimensions, set minimum size
        if (width === 0 || height === 0) {
            console.warn('Container has zero dimensions, setting minimum size');
            container.style.width = '300px';
            container.style.height = '300px';
        }
        
        // Create scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x000000); // Black background for better volume visibility
        
        // Create camera - positioned for optimal volume viewing
        this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
        this.camera.position.set(150, 150, 150); // Closer and at an angle for better viewing
        
        // Create renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(width, height);
        this.renderer.setClearColor(0x000000); // Black clear color
        container.appendChild(this.renderer.domElement);
        
        // Add controls
        this.controls = new THREE.TrackballControls(this.camera, this.renderer.domElement);
        this.controls.rotateSpeed = 1.5;
        this.controls.zoomSpeed = 1.0;
        this.controls.panSpeed = 0.6;
        this.controls.target.set(0, 0, 0); // Look at center of volume
        
        console.log('Volume renderer scene setup complete:', {
            containerFound: !!container,
            sceneCreated: !!this.scene,
            cameraCreated: !!this.camera,
            rendererCreated: !!this.renderer,
            canvasAdded: !!this.renderer.domElement.parentElement
        });
        
        // Scene setup complete
    },
    

    
    loadShaders: function() {
        // Load vertex shader with improved ray marching support
        this.vertexShader = `
            precision highp float;
            
            varying vec3 vPosition;
            varying vec3 vWorldPosition;
            varying vec3 vCameraPosition;
            
            void main() {
                vPosition = position;
                
                // Calculate world position for ray marching
                vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                vWorldPosition = worldPosition.xyz;
                
                // Pass camera position to fragment shader
                vCameraPosition = cameraPosition;
                
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `;
        
        // Load fragment shader from external file and return promise
        return this.loadFragmentShader();
    },
    
    loadFragmentShader: function() {
        // Load fragment shader from external file
        return fetch('/static/shaders/volume_fragment.glsl')
            .then(response => response.text())
            .then(shaderCode => {
                this.fragmentShader = shaderCode;
                console.log('Fragment shader loaded from external file');
                return shaderCode;
            })
            .catch(error => {
                console.warn('Failed to load external fragment shader, using fallback:', error);
                // Fallback to embedded shader
                this.fragmentShader = this.getFallbackFragmentShader();
                return this.fragmentShader;
            });
    },
    
    getFallbackFragmentShader: function() {
        // Simplified fallback shader in case external file fails to load
        return `
            precision highp float;
            
            uniform sampler2D volumeTexture;
            uniform vec3 dimensions;
            uniform float atlasSize;
            uniform int renderMode;
            
            varying vec3 vPosition;
            
            vec4 sampleVolume(vec3 pos) {
                float sliceIndex = pos.z * (dimensions.z - 1.0);
                float sliceZ = floor(sliceIndex);
                float atlasX = sliceZ - floor(sliceZ / atlasSize) * atlasSize;
                float atlasY = floor(sliceZ / atlasSize);
                vec2 atlasCoord = (vec2(atlasX, atlasY) + vec2(pos.x, pos.y)) / atlasSize;
                return texture2D(volumeTexture, atlasCoord);
            }
            
            void main() {
                vec3 pos = (vPosition + 1.0) * 0.5;
                if (pos.x < 0.0 || pos.x > 1.0 || pos.y < 0.0 || pos.y > 1.0 || pos.z < 0.0 || pos.z > 1.0) {
                    gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
                    return;
                }
                
                vec4 volumeSample = sampleVolume(pos);
                float intensity = volumeSample.r;
                
                if (intensity > 0.03) {
                    gl_FragColor = vec4(intensity * 2.0, intensity * 2.0, intensity * 2.0, intensity * 2.0);
                } else {
                    gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
                }
            }
        `;
    },
    
    createVolumeCube: function() {
        // Create a screen-filling quad instead of a cube
        // This allows us to render a 3D volume floating in space
        const geometry = new THREE.PlaneGeometry(200, 200);
        
        // Create material with proper volume shader
        let material;
        let shaderSuccess = false;
        
        // Use the loaded fragment shader for proper volume rendering
        try {
            material = new THREE.ShaderMaterial({
                uniforms: {
                    volumeTexture: { value: this.volumeTexture },
                    dimensions: { value: new THREE.Vector3(this.volumeAtlas.sliceDims.x, this.volumeAtlas.sliceDims.y, this.volumeAtlas.sliceDims.z) },
                    atlasSize: { value: this.volumeAtlas.atlasSize },
                    renderMode: { value: 0 }
                },
                vertexShader: this.vertexShader,
                fragmentShader: this.fragmentShader, // Use the loaded fragment shader
                transparent: true,
                side: THREE.DoubleSide,
                depthWrite: false, // Important for volume rendering
                blending: THREE.NormalBlending // Better for volume visibility
            });
            
            shaderSuccess = true;
            console.log('Volume shader material created with screen quad');
            
        } catch (error) {
            console.error('Volume shader compilation failed:', error);
            shaderSuccess = false;
        }
        
        if (!shaderSuccess) {
            console.warn('Using fallback basic material for volume rendering');
            // Fallback to basic material
            material = new THREE.MeshBasicMaterial({ 
                color: 0x4488ff, 
                transparent: true, 
                opacity: 0.3,
                wireframe: true
            });
        }
        
        const quad = new THREE.Mesh(geometry, material);
        quad.position.set(0, 0, 0); // Center the quad
        this.scene.add(quad);
        
        console.log('Volume quad created:', {
            hasUniforms: !!material.uniforms,
            hasRenderMode: !!(material.uniforms && material.uniforms.renderMode),
            materialType: material.type,
            shaderSuccess: shaderSuccess,
            quadPosition: quad.position,
            sceneChildren: this.scene.children.length,
            atlasInfo: {
                atlasSize: this.volumeAtlas.atlasSize,
                sliceDims: this.volumeAtlas.sliceDims,
                textureSize: this.volumeAtlas.textureSize
            }
        });
        
        // Store shader success state
        this.shaderWorking = shaderSuccess;
        
        // Force an immediate render to see if the quad appears
        if (this.renderer && this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera);
            console.log('Volume quad render completed');
        }
    },
    
    updateRenderMode: function(mode) {
        this.renderMode = mode;
        
        if (this.scene && this.scene.children.length > 0) {
            const quad = this.scene.children[0];
            
            // Check if the material has uniforms (shader material)
            if (quad.material.uniforms && quad.material.uniforms.renderMode) {
                quad.material.uniforms.renderMode.value = 
                    this.renderMode === 'mip' ? 0 : 
                    this.renderMode === 'translucent' ? 1 : 2;
                console.log(`Volume render mode changed to: ${this.renderMode} (${quad.material.uniforms.renderMode.value})`);
            } else {
                console.warn('Volume material does not support render mode changes');
            }
        }
    },
    
    setupEventListeners: function() {
        // Rendering mode dropdown
        document.querySelectorAll('[data-render-mode]').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                this.updateRenderMode(e.target.dataset.renderMode);
            });
        });
        
        // Reset button
        const resetButton = document.getElementById('resetCBCTView');
        if (resetButton) {
            resetButton.addEventListener('click', () => {
                this.resetView();
            });
        }
        
        // Window resize
        window.addEventListener('resize', () => {
            this.handleResize();
        });
    },
    
    resetView: function() {
        if (this.camera && this.controls) {
            this.camera.position.set(150, 150, 150);
            this.controls.target.set(0, 0, 0);
            this.controls.reset();
            console.log('Volume view reset');
        }
    },
    
    handleResize: function() {
        if (this.renderer && this.camera) {
            const container = this.renderer.domElement.parentElement;
            const width = container.clientWidth;
            const height = container.clientHeight;
            
            this.camera.aspect = width / height;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(width, height);
        }
    },
    
    startRenderLoop: function() {
        const animate = () => {
            requestAnimationFrame(animate);
            if (this.controls) {
                this.controls.update();
            }
            if (this.renderer && this.scene && this.camera) {
                try {
                    this.renderer.render(this.scene, this.camera);
                } catch (error) {
                    // Stop render loop if there are persistent WebGL errors
                    if (error.message && error.message.includes('WebGL')) {
                        console.error('WebGL error in volume renderer, stopping render loop:', error);
                        return; // Stop the animation loop
                    }
                }
            }
        };
        animate();
        console.log('Volume render loop started');
    },
    
    // Public method to refresh the volume rendering
    refresh: function() {
        if (this.renderer) {
            this.renderer.setSize(
                this.renderer.domElement.clientWidth,
                this.renderer.domElement.clientHeight
            );
        }
    },
    
    // Cleanup method
    dispose: function() {
        if (this.controls) {
            this.controls.dispose();
        }
        if (this.renderer) {
            this.renderer.dispose();
        }
        console.log('Volume renderer disposed');
    }
}; 