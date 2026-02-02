/**
 * VolumeWindowing - Window/level calculation utilities for volume visualization
 *
 * Handles percent-based windowing parameter calculations and pixel value mapping.
 * Extracted from VolumeViewer to provide a focused, reusable windowing module.
 *
 * Usage (script-tag, no ES6 modules):
 *   var windowing = new window.VolumeWindowing();
 *   windowing.setHistogramRange(-1000, 3000);
 *   windowing.setPercentRange(10, 90);
 *   var params = windowing.calculateParams();
 *   var mapped = windowing.applyToValue(huValue);
 */

(function () {
    'use strict';

    /**
     * @constructor
     * @param {object} [opts]
     * @param {number} [opts.percentMin=0]  - Lower window percent (0-100)
     * @param {number} [opts.percentMax=100] - Upper window percent (0-100)
     * @param {number} [opts.histMin=-1000]  - Histogram minimum (fallback)
     * @param {number} [opts.histMax=3000]   - Histogram maximum (fallback)
     */
    function VolumeWindowing(opts) {
        opts = opts || {};
        this.percentMin = opts.percentMin != null ? opts.percentMin : 0;
        this.percentMax = opts.percentMax != null ? opts.percentMax : 100;
        this.histMin = opts.histMin != null ? opts.histMin : -1000;
        this.histMax = opts.histMax != null ? opts.histMax : 3000;

        // Internal cache
        this._cached = null;
    }

    /**
     * Set the data histogram range (min/max HU values from the volume).
     * Invalidates the cached parameters.
     */
    VolumeWindowing.prototype.setHistogramRange = function (min, max) {
        this.histMin = (min != null && isFinite(min)) ? min : -1000;
        this.histMax = (max != null && isFinite(max)) ? max : 3000;
        this._cached = null;
    };

    /**
     * Set the percent-based window range.
     * Invalidates the cached parameters.
     * @param {number} pMin - 0-100
     * @param {number} pMax - 0-100
     */
    VolumeWindowing.prototype.setPercentRange = function (pMin, pMax) {
        this.percentMin = pMin;
        this.percentMax = pMax;
        this._cached = null;
    };

    /**
     * Invalidate the internal cache (call when parameters change externally).
     */
    VolumeWindowing.prototype.invalidateCache = function () {
        this._cached = null;
    };

    /**
     * Calculate and return windowing parameters.
     * Results are cached until invalidated.
     * @returns {{windowMin: number, windowMax: number, windowRange: number}}
     */
    VolumeWindowing.prototype.calculateParams = function () {
        if (this._cached) return this._cached;

        var histMin = this.histMin;
        var histMax = this.histMax;
        var pMin = Math.max(0, Math.min(100, this.percentMin));
        var pMax = Math.max(0, Math.min(100, this.percentMax));
        var lowP = Math.min(pMin, pMax);
        var highP = Math.max(pMin, pMax);
        var windowMin = histMin + (histMax - histMin) * (lowP / 100.0);
        var windowMax = histMin + (histMax - histMin) * (highP / 100.0);
        var windowRange = Math.max(0.001, windowMax - windowMin);

        this._cached = {
            windowMin: windowMin,
            windowMax: windowMax,
            windowRange: windowRange
        };
        return this._cached;
    };

    /**
     * Map a single HU value to a 0-255 grayscale byte using current window settings.
     * @param {number} huValue
     * @returns {number} 0-255
     */
    VolumeWindowing.prototype.applyToValue = function (huValue) {
        var params = this._cached || this.calculateParams();
        var clamped = Math.max(params.windowMin, Math.min(params.windowMax, huValue));
        var normalized = (clamped - params.windowMin) / params.windowRange;
        return Math.floor(normalized * 255);
    };

    /**
     * Apply windowing to panoramic image data (RGBA pixel array).
     * Converts to grayscale via BT.709 luminance, then maps through window.
     * Operates in-place on the provided ImageData.data array.
     * @param {Uint8ClampedArray} data - ImageData.data (RGBA)
     */
    VolumeWindowing.prototype.applyToPanoramicData = function (data) {
        var pMin = Math.max(0, Math.min(100, this.percentMin));
        var pMax = Math.max(0, Math.min(100, this.percentMax));
        var lowP = Math.min(pMin, pMax);
        var highP = Math.max(pMin, pMax);
        var vMin = Math.round(255 * (lowP / 100));
        var vMax = Math.round(255 * (highP / 100));
        var range = Math.max(1, vMax - vMin);

        for (var i = 0; i < data.length; i += 4) {
            var intensity = Math.round(0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]);
            var clamped = Math.max(vMin, Math.min(vMax, intensity));
            var mapped = Math.round(((clamped - vMin) / range) * 255);
            data[i] = data[i + 1] = data[i + 2] = mapped;
        }
    };

    // Expose globally (no ES6 modules)
    window.VolumeWindowing = VolumeWindowing;
})();
