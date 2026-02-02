/**
 * VolumeLoader - NIfTI fetching, decompression, and parsing
 *
 * Responsible for:
 *   - Building the fetch URL based on modality slug
 *   - Downloading the .nii.gz payload
 *   - Decompressing via nifti-reader-js
 *   - Parsing the NIfTI header and voxel data into a Float32Array
 *   - Computing histogram min/max
 *   - Preloading volumes on page load (background fetch + cache)
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
 *
 * Preloading:
 *   // Start background fetch (no UI indicators, no callbacks required)
 *   VolumeLoader.preload('cbct');
 *
 *   // Later, load() automatically uses cached result if available
 *   loader.load('cbct', onSuccess, onError); // instant if preloaded
 */

(function () {
    'use strict';

    /**
     * Global preload cache.
     * Keys are cache keys (scanId:modalitySlug).
     * Values are objects with:
     *   - promise: the in-flight Promise (always present)
     *   - result:  the parsed result (set on success)
     *   - error:   the error object (set on failure)
     *   - status:  'loading' | 'ready' | 'error'
     */
    if (!window._volumePreloadCache) {
        window._volumePreloadCache = {};
    }

    /**
     * Path to the Web Worker script.
     * Set to null to disable Worker-based parsing (falls back to main thread).
     */
    var WORKER_URL = '/static/js/worker/volume_worker.js';

    /**
     * Detect Web Worker support once.
     */
    var _workerSupported = (typeof Worker !== 'undefined');

    function VolumeLoader() {
        this.loading = false;
    }

    /**
     * Build a cache key for the preload cache.
     * @param {string} modalitySlug
     * @returns {string}
     */
    VolumeLoader._cacheKey = function (modalitySlug) {
        var scanId = window.scanId || 'unknown';
        var slug = modalitySlug || 'cbct';
        return scanId + ':' + slug;
    };

    /**
     * Preload a volume in the background (no UI indicators).
     * Fetches, decompresses, and parses the NIfTI data, then stores the
     * result in window._volumePreloadCache for instant retrieval by load().
     *
     * Safe to call multiple times - subsequent calls for the same key are no-ops.
     *
     * @param {string} modalitySlug - e.g. 'cbct'
     */
    VolumeLoader.preload = function (modalitySlug) {
        var key = VolumeLoader._cacheKey(modalitySlug);
        var cache = window._volumePreloadCache;

        // Already preloading or preloaded for this key
        if (cache[key]) {
            console.debug('VolumeLoader.preload: already cached/loading for', key);
            return;
        }

        // Guard: need globals to build URL
        if (!window.projectNamespace || !window.scanId) {
            console.debug('VolumeLoader.preload: missing projectNamespace or scanId, skipping');
            return;
        }

        console.debug('VolumeLoader.preload: starting background fetch for', key);

        var loader = new VolumeLoader();
        var url = loader._buildUrl(modalitySlug);

        var entry = {
            promise: null,
            result: null,
            error: null,
            status: 'loading'
        };

        entry.promise = fetch(url)
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
                console.debug('VolumeLoader.preload: data received for', key, 'size:', compressedData.byteLength);
                return loader._parseWithWorker(compressedData);
            })
            .then(function (result) {
                entry.result = result;
                entry.status = 'ready';
                console.debug('VolumeLoader.preload: ready for', key);
                return result;
            })
            .catch(function (error) {
                console.warn('VolumeLoader.preload: error for', key, error.message);
                var errObj = { type: 'network', message: 'Failed to load volume data' };
                if (error.message.startsWith('processing:')) {
                    errObj.type = 'processing';
                    errObj.message = error.message.substring('processing:'.length) || 'Volume is being processed. Please check back later.';
                } else if (error.message.startsWith('failed:')) {
                    errObj.type = 'failed';
                    errObj.message = error.message.substring('failed:'.length) || 'Volume processing failed.';
                }
                entry.error = errObj;
                entry.status = 'error';
                throw errObj; // re-throw so .then() on the promise sees rejection
            });

        cache[key] = entry;
    };

    /**
     * Check the preload cache for a ready result.
     * @param {string} modalitySlug
     * @returns {object|null} The cached entry or null
     */
    VolumeLoader._getCacheEntry = function (modalitySlug) {
        var key = VolumeLoader._cacheKey(modalitySlug);
        return window._volumePreloadCache[key] || null;
    };

    /**
     * Clear preload cache for a specific modality (or all).
     * @param {string} [modalitySlug] - if omitted, clears entire cache
     */
    VolumeLoader.clearPreloadCache = function (modalitySlug) {
        if (modalitySlug) {
            var key = VolumeLoader._cacheKey(modalitySlug);
            delete window._volumePreloadCache[key];
            console.debug('VolumeLoader: cleared preload cache for', key);
        } else {
            window._volumePreloadCache = {};
            console.debug('VolumeLoader: cleared entire preload cache');
        }
    };

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
     *
     * Checks the preload cache first:
     *   - Cache hit (status='ready'):  calls onSuccess immediately, no network request
     *   - Cache in-flight (status='loading'):  subscribes to the pending promise
     *   - Cache miss or error:  performs a fresh fetch
     *
     * @param {string} modalitySlug - e.g. 'cbct', 'braintumor-mri-t1'
     * @param {function} onSuccess  - callback(result)
     * @param {function} onError    - callback({type, message})
     */
    VolumeLoader.prototype.load = function (modalitySlug, onSuccess, onError) {
        if (this.loading) {
            console.debug('VolumeLoader: already loading');
            return;
        }

        var self = this;
        var cacheEntry = VolumeLoader._getCacheEntry(modalitySlug);

        // --- Cache hit: result already available ---
        if (cacheEntry && cacheEntry.status === 'ready' && cacheEntry.result) {
            console.debug('VolumeLoader: cache HIT for', modalitySlug);
            this.loading = true;
            // Use setTimeout(0) to keep callback async (consistent API contract)
            setTimeout(function () {
                self.loading = false;
                if (onSuccess) onSuccess(cacheEntry.result);
            }, 0);
            return;
        }

        // --- Cache in-flight: preload still running, subscribe to its promise ---
        if (cacheEntry && cacheEntry.status === 'loading' && cacheEntry.promise) {
            console.debug('VolumeLoader: cache in-flight for', modalitySlug, '- subscribing');
            this.loading = true;
            cacheEntry.promise
                .then(function (result) {
                    self.loading = false;
                    if (onSuccess) onSuccess(result);
                })
                .catch(function (errObj) {
                    self.loading = false;
                    if (onError) onError(errObj);
                });
            return;
        }

        // --- Cache miss or previous error: fresh fetch ---
        this.loading = true;
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
                return self._parseWithWorker(compressedData);
            })
            .then(function (result) {
                self.loading = false;
                // Store in preload cache for future use
                var key = VolumeLoader._cacheKey(modalitySlug);
                window._volumePreloadCache[key] = {
                    promise: Promise.resolve(result),
                    result: result,
                    error: null,
                    status: 'ready'
                };
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
     * Parse NIfTI data using a Web Worker (off main thread).
     * Sends the compressed/raw ArrayBuffer to the Worker via Transferable,
     * receives the parsed result with zero-copy Float32Array transfer.
     *
     * Falls back to main-thread parsing if Workers are unsupported.
     *
     * @param {ArrayBuffer} compressedData - Raw or gzipped NIfTI data
     * @returns {Promise<{volumeData: Float32Array, dimensions: {x,y,z}, spacing: {x,y,z}, histogram: {min,max}}>}
     */
    VolumeLoader.prototype._parseWithWorker = function (compressedData) {
        var self = this;

        if (!_workerSupported || !WORKER_URL) {
            console.debug('VolumeLoader: Worker not available, using main-thread parsing');
            return self._decompress(compressedData).then(function (raw) { return self._parseNifti(raw); });
        }

        return new Promise(function (resolve, reject) {
            var worker;
            try {
                worker = new Worker(WORKER_URL);
            } catch (e) {
                console.warn('VolumeLoader: Worker creation failed, falling back to main thread:', e.message);
                self._decompress(compressedData)
                    .then(function (raw) { resolve(self._parseNifti(raw)); })
                    .catch(reject);
                return;
            }

            worker.onmessage = function (e) {
                var msg = e.data;
                if (msg.type === 'result') {
                    console.debug('VolumeLoader: Worker parsing complete');
                    worker.terminate();
                    resolve(msg.data);
                } else if (msg.type === 'error') {
                    console.warn('VolumeLoader: Worker error:', msg.message);
                    worker.terminate();
                    reject(new Error(msg.message));
                } else if (msg.type === 'log') {
                    // Forward Worker log messages
                    console[msg.level || 'debug']('VolumeLoader [Worker]:', msg.message);
                }
            };

            worker.onerror = function (e) {
                console.warn('VolumeLoader: Worker runtime error, falling back to main thread');
                worker.terminate();
                // Fallback: re-parse on main thread
                self._decompress(compressedData)
                    .then(function (raw) { resolve(self._parseNifti(raw)); })
                    .catch(reject);
            };

            // Transfer the ArrayBuffer to the Worker (zero-copy)
            console.debug('VolumeLoader: sending', compressedData.byteLength, 'bytes to Worker');
            worker.postMessage({ type: 'parse', buffer: compressedData }, [compressedData]);
        });
    };

    /**
     * Decompress gzipped NIfTI data if needed.
     * Uses micro-task yielding to avoid blocking the UI thread.
     * Main-thread fallback when Worker is unavailable.
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
