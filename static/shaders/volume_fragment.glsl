#ifdef GL_ES
precision highp float;
#endif

uniform sampler2D volumeTexture;
uniform vec3 dimensions;
uniform float atlasSize;
uniform int renderMode; // 0=MIP, 1=Translucent, 2=Attenuated

varying vec3 vPosition;
varying vec3 vWorldPosition;
varying vec3 vCameraPosition;

/**
 * Sample the volume at a given 3D position
 * Uses 2D texture atlas to store 3D volume data
 */
vec4 sampleVolume(vec3 pos) {
    // Clamp position to valid range
    pos = clamp(pos, 0.0, 1.0);
    
    // Calculate which slice we're in
    float sliceIndex = pos.z * (dimensions.z - 1.0);
    float sliceZ = floor(sliceIndex);
    
    // Make sure slice index is valid
    if (sliceZ >= dimensions.z) {
        return vec4(0.0);
    }
    
    // Calculate atlas grid position (which cell in the atlas grid)
    float atlasX = mod(sliceZ, atlasSize);
    float atlasY = floor(sliceZ / atlasSize);
    
    // Calculate texture coordinates within the atlas
    // The texture size is (atlasSize * dimensions.x) × (atlasSize * dimensions.x)
    // But each slice is only dimensions.x × dimensions.y pixels within its cell
    
    // Calculate the base position of this slice in the atlas (in pixels)
    float slicePixelX = atlasX * dimensions.x;
    float slicePixelY = atlasY * dimensions.y;  // Note: uses dimensions.y for Y spacing
    
    // Add the position within the slice (in pixels)
    float pixelX = slicePixelX + pos.x * dimensions.x;
    float pixelY = slicePixelY + pos.y * dimensions.y;
    
    // Convert to normalized texture coordinates [0,1]
    // The total texture size is atlasSize * dimensions.x (square texture)
    float totalTextureSize = atlasSize * dimensions.x;
    vec2 atlasCoord = vec2(pixelX / totalTextureSize, pixelY / totalTextureSize);
    
    // Clamp atlas coordinates to prevent sampling outside texture
    atlasCoord = clamp(atlasCoord, 0.0, 1.0);
    
    // Sample the texture atlas
    vec4 textureSample = texture2D(volumeTexture, atlasCoord);
    return textureSample;
}

/**
 * Apply medical imaging windowing and color mapping
 */
vec4 applyColorMapping(float intensity) {
    // MUCH MORE AGGRESSIVE contrast enhancement for visibility
    float enhanced = intensity;
    
    // Apply stronger threshold-based enhancement
    if (enhanced > 0.05) {
        // High intensity structures (bone, teeth) - make VERY bright
        enhanced = pow(enhanced, 0.4) * 5.0;
    } else if (enhanced > 0.02) {
        // Medium intensity structures - enhance significantly  
        enhanced = pow(enhanced, 0.6) * 3.5;
    } else if (enhanced > 0.005) {
        // Low intensity structures - strong enhancement
        enhanced = enhanced * 2.5;
    } else {
        // Very low intensities - still enhance to catch faint details
        enhanced = enhanced * 1.5;
    }
    
    enhanced = clamp(enhanced, 0.0, 1.0);
    return vec4(enhanced, enhanced, enhanced, enhanced);
}

void main() {
    // 3D rendering disabled
    gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
    return;
    
    // Screen-space ray marching for true 3D volumetric rendering
    // Cast rays from camera through each pixel to sample the floating 3D volume
    
    // Calculate ray direction from camera through this pixel
    vec3 rayOrigin = cameraPosition;
    vec3 rayDirection = normalize(vWorldPosition - cameraPosition);
    
    // Define MUCH LARGER volume bounds to catch rays from all angles
    vec3 volumeMin = vec3(-200.0, -200.0, -200.0);
    vec3 volumeMax = vec3(200.0, 200.0, 200.0);
    
    // Ray-volume intersection
    vec3 invRayDir = 1.0 / (rayDirection + 0.0001); // Avoid division by zero
    vec3 t1 = (volumeMin - rayOrigin) * invRayDir;
    vec3 t2 = (volumeMax - rayOrigin) * invRayDir;
    
    vec3 tMin = min(t1, t2);
    vec3 tMax = max(t1, t2);
    
    float tNear = max(max(tMin.x, tMin.y), tMin.z);
    float tFar = min(min(tMax.x, tMax.y), tMax.z);
    
    // If ray misses the volume, render TRANSPARENT (not grey)
    if (tNear > tFar || tFar < 0.0) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
        return;
    }
    
    // Ray marching through the volume
    float rayStart = max(tNear, 0.0);
    float stepSize = 0.5; // Good balance of quality and performance
    int numSteps = int((tFar - rayStart) / stepSize);
    numSteps = min(numSteps, 200); // Reasonable step count
    
    vec4 accumulatedColor = vec4(0.0);
    
    // Ray march through the volume
    for (int i = 0; i < 200; i++) {
        if (i >= numSteps) break;
        
        float t = rayStart + float(i) * stepSize;
        vec3 worldPos = rayOrigin + t * rayDirection;
        
        // Convert world position to volume texture coordinates [0,1]
        vec3 volumePos = (worldPos - volumeMin) / (volumeMax - volumeMin);
        
        // Check if we're within volume bounds
        if (volumePos.x >= 0.0 && volumePos.x <= 1.0 &&
            volumePos.y >= 0.0 && volumePos.y <= 1.0 &&
            volumePos.z >= 0.0 && volumePos.z <= 1.0) {
            
            // Sample from expanded coordinate region
            vec3 samplePos = vec3(
                volumePos.x * 0.5 + 0.25,  // Map to [0.25, 0.75] (50% of texture)
                volumePos.y * 0.5 + 0.25,  // Full sampling area
                volumePos.z
            );
            
            // Sample the volume
            vec4 volumeSample = sampleVolume(samplePos);
            float intensity = volumeSample.r;
            
            // Apply thresholding for clear structures
            if (intensity > 0.003) {
                vec4 sampleColor = applyColorMapping(intensity);
                
                // MUCH HIGHER opacity for bright visibility
                if (intensity > 0.05) {
                    sampleColor.a = min(intensity * 0.6, 0.8); // High opacity for bright structures
                } else if (intensity > 0.02) {
                    sampleColor.a = intensity * 0.3; // Medium opacity
                } else {
                    sampleColor.a = intensity * 0.2; // Still visible opacity
                }
                
                // Alpha blending
                float alpha = sampleColor.a;
                accumulatedColor.rgb += sampleColor.rgb * alpha * (1.0 - accumulatedColor.a);
                accumulatedColor.a += alpha * (1.0 - accumulatedColor.a);
                
                // Less early termination for complete structures
                if (accumulatedColor.a > 0.95) break;
            }
        }
    }
    
    // Output the final color with MUCH BRIGHTER result
    if (accumulatedColor.a > 0.005) { // Lower threshold to catch faint structures
        // MUCH more aggressive brightness boost
        accumulatedColor.rgb = pow(accumulatedColor.rgb, vec3(0.7)) * 2.0;
        accumulatedColor.a = min(accumulatedColor.a, 0.9);
        gl_FragColor = accumulatedColor;
    } else {
        // Ensure complete transparency when no volume data
        gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
    }
} 