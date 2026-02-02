/**
 * volume_worker.js - Web Worker for background NIfTI decompression and parsing
 *
 * Runs in a separate thread to prevent UI blocking during large volume processing.
 * Receives an ArrayBuffer of compressed/raw NIfTI data, parses it, and returns
 * the result (volumeData, dimensions, spacing, histogram) via postMessage.
 *
 * Uses Transferable objects (ArrayBuffer) for zero-copy data return to main thread.
 *
 * Protocol:
 *   Main -> Worker:  { type: 'parse', buffer: ArrayBuffer }
 *   Worker -> Main:  { type: 'result', data: {volumeData, dimensions, spacing, histogram} }
 *                    OR { type: 'error', message: string }
 *
 * Requires: nifti-reader.js accessible via importScripts at the static URL.
 */

/* global self, importScripts */
'use strict';

// ---------------------------------------------------------------------------
// Shim: nifti-reader.js assigns to `window.nifti`.  Workers have no `window`
// global, so we create one temporarily so the import succeeds.
// After import we copy the reference to a local `nifti` variable and tidy up.
// ---------------------------------------------------------------------------
self.window = self;

// The static URL for nifti-reader.js.  This must match STATIC_URL in Django.
// Because workers resolve importScripts relative to their own URL, we use an
// absolute path so it works regardless of where the worker file is hosted.
importScripts('/static/js/nifti-reader.js');

var nifti = self.nifti;

// ---------------------------------------------------------------------------
// NIfTI parsing (mirrored from VolumeLoader._decompress + _parseNifti)
// ---------------------------------------------------------------------------

/**
 * Decompress gzipped NIfTI data if necessary.
 * @param {ArrayBuffer} compressedData
 * @returns {ArrayBuffer}
 */
function decompress(compressedData) {
    if (nifti.isCompressed(compressedData)) {
        return nifti.decompress(compressedData);
    }
    return compressedData;
}

/**
 * Parse raw (decompressed) NIfTI data into volume arrays.
 * Returns a plain object that can be sent via postMessage.
 *
 * @param {ArrayBuffer} arrayBuffer - Decompressed NIfTI bytes
 * @returns {{volumeData: Float32Array, dimensions: {x,y,z}, spacing: {x,y,z}, histogram: {min,max}}}
 */
function parseNifti(arrayBuffer) {
    var header = nifti.readHeader(arrayBuffer);
    if (!header) {
        throw new Error('Failed to read NIfTI header');
    }

    var dimX = header.dims[1];
    var dimY = header.dims[2];
    var dimZ = header.dims[3];

    var spacingX = header.pixDims[1];
    var spacingY = header.pixDims[2];
    var spacingZ = header.pixDims[3];

    var sclSlope = header.scl_slope || 1.0;
    var sclInter = header.scl_inter || 0.0;

    var datatype = header.datatypeCode;
    var bitpix = header.numBitsPerVoxel;

    if (dimX < 10 || dimY < 10 || dimZ < 10 || dimX > 2048 || dimY > 2048 || dimZ > 2048) {
        // Non-fatal: just a sanity note
        self.postMessage({ type: 'log', level: 'warn', message: 'Suspicious dimensions: ' + dimX + 'x' + dimY + 'x' + dimZ });
    }

    var imageData = nifti.readImage(header, arrayBuffer);
    if (!imageData) {
        throw new Error('Failed to read NIfTI image data');
    }

    var volumeSize = dimX * dimY * dimZ;
    var volumeData = new Float32Array(volumeSize);
    var histMin = Infinity;
    var histMax = -Infinity;

    var bytesPerVoxel = Math.max(1, bitpix / 8);

    // Dispatch to the correct typed array based on NIfTI datatype
    var typedArray = null;

    if (bytesPerVoxel === 1) {
        typedArray = (datatype === 2) ? new Uint8Array(imageData) : new Int8Array(imageData);
    } else if (bytesPerVoxel === 2) {
        typedArray = (datatype === 512) ? new Uint16Array(imageData) : new Int16Array(imageData);
    } else if (bytesPerVoxel === 4) {
        if (datatype === 768) {
            typedArray = new Uint32Array(imageData);
        } else if (datatype === 16) {
            typedArray = new Float32Array(imageData);
        } else {
            typedArray = new Int32Array(imageData);
        }
    } else if (bytesPerVoxel === 8) {
        typedArray = new Float64Array(imageData);
    }

    if (!typedArray) {
        throw new Error('Unsupported NIfTI datatype: ' + datatype);
    }

    var isFloat = (datatype === 16 || bytesPerVoxel === 8);

    for (var i = 0; i < volumeSize; i++) {
        var raw = typedArray[i];
        if (isFloat && (isNaN(raw) || !isFinite(raw))) {
            volumeData[i] = 0;
        } else {
            var huValue = raw * sclSlope + sclInter;
            volumeData[i] = huValue;
            if (huValue < histMin) histMin = huValue;
            if (huValue > histMax) histMax = huValue;
        }
    }

    return {
        volumeData: volumeData,
        dimensions: { x: dimX, y: dimY, z: dimZ },
        spacing: { x: spacingX, y: spacingY, z: spacingZ },
        histogram: { min: histMin, max: histMax }
    };
}

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------
self.onmessage = function (e) {
    var msg = e.data;

    if (msg.type === 'parse') {
        try {
            var rawData = decompress(msg.buffer);
            var result = parseNifti(rawData);

            // Transfer the Float32Array's underlying ArrayBuffer for zero-copy
            self.postMessage(
                { type: 'result', data: result },
                [result.volumeData.buffer]
            );
        } catch (err) {
            self.postMessage({
                type: 'error',
                message: err.message || 'Unknown worker error'
            });
        }
    }
};
