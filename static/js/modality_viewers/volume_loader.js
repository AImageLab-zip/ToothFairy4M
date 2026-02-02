/**
 * VolumeLoader - NIfTI fetching, decompression, and parsing
 *
 * Responsible for:
 *   - Building the fetch URL based on modality slug
 *   - Downloading the .nii.gz payload
 *   - Decompressing via nifti-reader-js
 *   - Parsing the NIfTI header and voxel data into a Float32Array
 *   - Computing histogram min/max
 *
 * Requires: nifti-reader-js (global `nifti`) to be loaded via script tag.
 *
 * Usage (script-tag, no ES6 modules):
 *   var loader = new window.VolumeLoader();
 *   loader.load('cbct', function(result) {
 *       // result.volumeData  - Float32Array
 *       // result.dimensions  - {x, y, z}
 *       // result.spacing     - {x, y, z}
 *       // result.histogram   - {min, max}
 *   }, function(error) {
 *       // error.type: 'processing' | 'failed' | 'network'
 *       // error.message: string
 *   });
 */

(function () {
    'use strict';

    function VolumeLoader() {
        this.loading = false;
    }

    /**
     * Build the API URL for fetching volume data.
     * @param {string} modalitySlug
     * @returns {string}
     */
    VolumeLoader.prototype._buildUrl = function (modalitySlug) {
        if (modalitySlug && modalitySlug !== 'cbct') {
            return '/' + window.projectNamespace + '/api/patient/' + window.scanId + '/volume/' + modalitySlug + '/';
        }
        return '/' + window.projectNamespace + '/api/patient/' + window.scanId + '/cbct/';
    };

    /**
     * Load and parse a NIfTI volume.
     * @param {string} modalitySlug - e.g. 'cbct', 'braintumor-mri-t1'
     * @param {function} onSuccess  - callback(result)
     * @param {function} onError    - callback({type, message})
     */
    VolumeLoader.prototype.load = function (modalitySlug, onSuccess, onError) {
        if (this.loading) {
            console.debug('VolumeLoader: already loading');
            return;
        }

        this.loading = true;
        var self = this;
        var url = this._buildUrl(modalitySlug);

        console.debug('VolumeLoader: fetching', url);

        fetch(url)
            .then(function (response) {
                if (response.status === 202) {
                    return response.json().then(function (data) {
                        throw new Error('processing:' + (data.message || 'Volume is being processed'));
                    });
                }
                if (!response.ok) {
                    return response.json()
                        .then(function (errorData) {
                            if (errorData.status === 'processing') {
                                throw new Error('processing:' + errorData.message);
                            } else if (errorData.status === 'failed') {
                                throw new Error('failed:' + errorData.message);
                            }
                            throw new Error('HTTP error! status: ' + response.status);
                        })
                        .catch(function (e) {
                            if (e.message.startsWith('processing:') || e.message.startsWith('failed:')) {
                                throw e;
                            }
                            throw new Error('HTTP error! status: ' + response.status);
                        });
                }
                return response.arrayBuffer();
            })
            .then(function (compressedData) {
                console.debug('VolumeLoader: compressed data received, size:', compressedData.byteLength);
                return self._decompress(compressedData);
            })
            .then(function (rawData) {
                var result = self._parseNifti(rawData);
                self.loading = false;
                if (onSuccess) onSuccess(result);
            })
            .catch(function (error) {
                self.loading = false;
                console.error('VolumeLoader: error:', error);

                var errObj = { type: 'network', message: 'Failed to load volume data' };
                if (error.message.startsWith('processing:')) {
                    errObj.type = 'processing';
                    errObj.message = error.message.substring('processing:'.length) || 'Volume is being processed. Please check back later.';
                } else if (error.message.startsWith('failed:')) {
                    errObj.type = 'failed';
                    errObj.message = error.message.substring('failed:'.length) || 'Volume processing failed.';
                }
                if (onError) onError(errObj);
            });
    };

    /**
     * Decompress gzipped NIfTI data if needed.
     * Uses micro-task yielding to avoid blocking the UI thread.
     * @param {ArrayBuffer} compressedData
     * @returns {Promise<ArrayBuffer>}
     */
    VolumeLoader.prototype._decompress = function (compressedData) {
        if (nifti.isCompressed(compressedData)) {
            console.debug('VolumeLoader: decompressing gzipped NIfTI data...');
            return new Promise(function (resolve) { setTimeout(resolve, 0); })
                .then(function () {
                    var decompressed = nifti.decompress(compressedData);
                    console.debug('VolumeLoader: decompressed size:', decompressed.byteLength);
                    return new Promise(function (resolve) { setTimeout(function () { resolve(decompressed); }, 0); });
                });
        }
        console.debug('VolumeLoader: NIfTI data is not compressed, using as-is');
        return Promise.resolve(compressedData);
    };

    /**
     * Parse raw (decompressed) NIfTI data into volume arrays.
     * @param {ArrayBuffer} arrayBuffer
     * @returns {{volumeData: Float32Array, dimensions: {x,y,z}, spacing: {x,y,z}, histogram: {min,max}}}
     */
    VolumeLoader.prototype._parseNifti = function (arrayBuffer) {
        console.debug('VolumeLoader: parsing NIfTI data...');

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

        console.debug('VolumeLoader: dims=' + dimX + 'x' + dimY + 'x' + dimZ +
            ', spacing=' + spacingX + 'x' + spacingY + 'x' + spacingZ +
            ', datatype=' + datatype + ', bitpix=' + bitpix +
            ', slope=' + sclSlope + ', intercept=' + sclInter);

        if (dimX < 10 || dimY < 10 || dimZ < 10 || dimX > 2048 || dimY > 2048 || dimZ > 2048) {
            console.warn('VolumeLoader: suspicious dimensions detected');
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

        console.debug('VolumeLoader: value range ' + histMin.toFixed(1) + ' to ' + histMax.toFixed(1));

        return {
            volumeData: volumeData,
            dimensions: { x: dimX, y: dimY, z: dimZ },
            spacing: { x: spacingX, y: spacingY, z: spacingZ },
            histogram: { min: histMin, max: histMax }
        };
    };

    // Expose globally (no ES6 modules)
    window.VolumeLoader = VolumeLoader;
})();
