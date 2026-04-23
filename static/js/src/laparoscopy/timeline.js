'use strict';

var TIMELINE_PIN_MERGE_TOLERANCE = 0.050;

var PALETTE = [
    '#e74c3c', '#3498db', '#2ecc71', '#f39c12',
    '#9b59b6', '#1abc9c', '#e67e22', '#34495e',
    '#e91e63', '#00bcd4', '#8bc34a', '#ff5722',
];

function _fmtTime(t) {
    var mm = Math.floor(t / 60);
    var ss = Math.floor(t % 60);
    var ms = Math.floor((t % 1) * 1000);
    return String(mm).padStart(2, '0') + ':' +
           String(ss).padStart(2, '0') + '.' +
           String(ms).padStart(3, '0');
}

function _openColorPicker(initialColor, onChange) {
    var colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.value = initialColor;
    colorInput.style.position = 'absolute';
    colorInput.style.left = '-9999px';
    colorInput.style.top = '-9999px';
    document.body.appendChild(colorInput);

    colorInput.addEventListener('change', function () {
        onChange(colorInput.value);
        if (colorInput.parentNode) colorInput.parentNode.removeChild(colorInput);
    });
    colorInput.addEventListener('cancel', function () {
        if (colorInput.parentNode) colorInput.parentNode.removeChild(colorInput);
    });
    colorInput.click();
}

export function applyTimelineMixin(proto) {
        proto._refreshTimelineVisuals = function () {
            this._renderTimelinePins();
            this._renderTimelineSegments();
            this._updateTemporalTimelineUI();
        };

        proto._refreshTimelineWithClasses = function () {
            this._renderTimelineClassList();
            this._refreshTimelineVisuals();
        };

        proto._timelineEnabled = function () {
            return !!(
                this.timelineTrackWrapEl &&
                this.timelineSegmentsLayerEl &&
                this.timelinePinsLayerEl &&
                this.timelinePlayheadEl
            );
        };

        proto._videoDuration = function () {
            var d = this.videoEl ? this.videoEl.duration : 0;
            return (isFinite(d) && d > 0) ? d : 0;
        };

        proto._clampTimelineTime = function (t) {
            var duration = this._videoDuration();
            if (!isFinite(t) || t < 0) return 0;
            if (duration > 0) return Math.min(duration, t);
            return t;
        };

        proto._timelineTimeToPct = function (t) {
            var duration = this._videoDuration();
            if (!duration) return 0;
            var ratio = this._clampTimelineTime(t) / duration;
            return Math.max(0, Math.min(1, ratio));
        };

        proto._timelineTimeFromClientX = function (clientX) {
            if (!this.timelineTrackWrapEl) return 0;
            var rect = this.timelineTrackWrapEl.getBoundingClientRect();
            var left = rect.left + 8;
            var width = Math.max(1, rect.width - 16);
            var ratio = (clientX - left) / width;
            ratio = Math.max(0, Math.min(1, ratio));
            return this._clampTimelineTime(ratio * this._videoDuration());
        };

        proto._timelineClassById = function (classId) {
            return this.timelineClasses.find(function (c) { return c.id === classId; }) || null;
        };

        proto._activeTimelineClass = function () {
            var active = this._timelineClassById(this.activeTimelineClassId);
            if (active && active.visible) return active;

            var visible = this.timelineClasses.find(function (c) { return c.visible; }) || null;
            if (visible) {
                this.activeTimelineClassId = visible.id;
                return visible;
            }

            if (this.timelineClasses[0]) {
                this.activeTimelineClassId = this.timelineClasses[0].id;
                return this.timelineClasses[0];
            }
            return null;
        };

        proto._timelineClassColor = function (classObj) {
            return (classObj && classObj.color) ? classObj.color : '#6c757d';
        };

        proto._addDefaultTimelineClass = function () {
            if (this.timelineClasses.length === 0) {
                this.addTimelineClass('1');
            }
        };

        proto.addTimelineClass = function (name, color, dbId) {
            var actualColor;
            if (color) {
                actualColor = color;
            } else {
                actualColor = PALETTE[this._timelinePaletteIdx % PALETTE.length];
                this._timelinePaletteIdx++;
            }

            var id = 'timeline-class-' + Date.now() + '-' + Math.random().toString(36).slice(2);
            var cls = { id: id, dbId: dbId || null, name: name, color: actualColor, visible: true };
            this.timelineClasses.push(cls);

            if (!this.activeTimelineClassId) this.activeTimelineClassId = id;

            this._refreshTimelineWithClasses();
            return cls;
        };

        proto._startTimelineClassEdit = function (classId) {
            if (!this.isAdmin) return;
            this.activeTimelineClassId = classId;
            this._editingTimelineClassId = classId;
            this._renderTimelineClassList();
        };

        proto._commitTimelineClassEdit = function (classId, nextValue) {
            if (!this.isAdmin) return;
            var cls = this._timelineClassById(classId);
            if (!cls) return;
            var trimmed = (nextValue || '').trim();
            if (trimmed) cls.name = trimmed;
            this._editingTimelineClassId = null;
            this._refreshTimelineWithClasses();
            if (this.isAdmin && cls.dbId && trimmed) {
                this._requestVoid('/laparoscopy/api/quadrant-types/' + cls.dbId + '/', {
                    method: 'PATCH',
                    headers: this._jsonHeaders(),
                    body: JSON.stringify({ name: trimmed }),
                });
            }
        };

        proto._cancelTimelineClassEdit = function () {
            this._editingTimelineClassId = null;
            this._renderTimelineClassList();
        };

        proto._changeTimelineClassColor = function (classId, newColor) {
            var cls = this._timelineClassById(classId);
            if (!cls) return;
            cls.color = newColor;
            this._refreshTimelineWithClasses();
            if (cls.dbId) {
                this._requestVoid('/laparoscopy/api/quadrant-types/' + cls.dbId + '/', {
                    method: 'PATCH',
                    headers: this._jsonHeaders(),
                    body: JSON.stringify({ color: newColor }),
                });
            }
        };

        proto._removeTimelineClass = function (classId) {
            if (!this.isAdmin) return;
            if (this.timelineClasses.length <= 1) return;

            var target = this._timelineClassById(classId);
            if (!target) return;

            var replacement = this.timelineClasses.find(function (c) { return c.id !== classId; }) || null;
            if (!replacement) return;

            this.timelinePins.forEach(function (pin) {
                if (pin.classId === classId) pin.classId = replacement.id;
            });

            var deletedDbId = target.dbId;
            this.timelineClasses = this.timelineClasses.filter(function (c) { return c.id !== classId; });
            if (this.activeTimelineClassId === classId) this.activeTimelineClassId = replacement.id;
            if (this._editingTimelineClassId === classId) this._editingTimelineClassId = null;

            this._closeTimelinePinMenu();
            this._refreshTimelineWithClasses();
            this._scheduleTimelineMarkersSync();

            if (this.isAdmin && deletedDbId && replacement.dbId) {
                this._requestVoid('/laparoscopy/api/quadrant-types/' + deletedDbId + '/', {
                    method: 'DELETE',
                    headers: this._jsonHeaders(),
                    body: JSON.stringify({ replacement_id: replacement.dbId }),
                });
            }
        };

        proto._renderTimelineClassList = function () {
            var self = this;
            if (!this.timelineClassListEl) return;
            this.timelineClassListEl.innerHTML = '';

            this.timelineClasses.forEach(function (cls) {
                var li = document.createElement('li');
                var btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'dropdown-item d-flex align-items-center gap-2' +
                    (cls.id === self.activeTimelineClassId ? ' active' : '');

                var dot = document.createElement('span');
                dot.style.cssText = 'display:inline-block;width:12px;height:12px;border-radius:50%;flex-shrink:0;background:' + cls.color + ';cursor:pointer;';
                dot.title = 'Change color';
                dot.addEventListener('click', function (e) {
                    e.stopPropagation();
                    _openColorPicker(cls.color, function (nextColor) {
                        self._changeTimelineClassColor(cls.id, nextColor);
                    });
                });
                btn.appendChild(dot);

                var nameLabel = document.createElement('span');
                nameLabel.className = 'small flex-grow-1';
                nameLabel.textContent = cls.name;
                btn.appendChild(nameLabel);

                btn.addEventListener('click', function () {
                    self.activeTimelineClassId = cls.id;
                    self._renderTimelineClassList();
                    self._updateTemporalTimelineUI();
                });

                li.appendChild(btn);
                self.timelineClassListEl.appendChild(li);
            });

            var activeCls = this._timelineClassById(this.activeTimelineClassId);
            var swatchEl = document.getElementById('timeline-class-active-swatch');
            var labelEl  = document.getElementById('timeline-class-active-label');
            if (activeCls) {
                if (swatchEl) swatchEl.style.background = activeCls.color;
                if (labelEl)  labelEl.textContent = activeCls.name;
            }
        };

        proto._selectedTimelinePin = function () {
            var selectedId = this._selectedTimelinePinId;
            return this.timelinePins.find(function (pin) { return pin.id === selectedId; }) || null;
        };

        proto._sortTimelinePins = function () {
            this.timelinePins.sort(function (a, b) { return a.time - b.time; });
        };

        proto._compactTimelinePins = function () {
            this._sortTimelinePins();
            var compacted = [];
            for (var i = 0; i < this.timelinePins.length; i++) {
                var pin = this.timelinePins[i];
                var prev = compacted[compacted.length - 1] || null;
                if (prev && prev.classId === pin.classId) {
                    if (this._selectedTimelinePinId === pin.id) {
                        this._selectedTimelinePinId = prev.id;
                    }
                    continue;
                }
                compacted.push(pin);
            }
            this.timelinePins = compacted;
        };

        proto._timelineClassAt = function (timeSeconds) {
            var t = this._clampTimelineTime(timeSeconds);
            var activeClass = null;

            for (var i = 0; i < this.timelinePins.length; i++) {
                var pin = this.timelinePins[i];
                var cls = this._timelineClassById(pin.classId);
                if (!cls || !cls.visible) continue;
                if (pin.time <= t + TIMELINE_PIN_MERGE_TOLERANCE) activeClass = cls;
                else break;
            }

            return activeClass;
        };

        proto._renderTimelineSegments = function () {
            if (!this.timelineSegmentsLayerEl) return;
            this.timelineSegmentsLayerEl.innerHTML = '';

            var duration = this._videoDuration();
            if (!duration) return;

            var sorted = this.timelinePins.slice().sort(function (a, b) { return a.time - b.time; });
            var cursor = 0;
            var activeClass = null;

            var self = this;
            function appendSegment(start, end, cls) {
                if (end <= start) return;
                var segment = document.createElement('div');
                segment.className = 'timeline-segment';
                segment.style.left = ((start / duration) * 100).toFixed(4) + '%';
                segment.style.width = (((end - start) / duration) * 100).toFixed(4) + '%';
                segment.style.setProperty('--segment-color', self._timelineClassColor(cls));
                if (!cls) segment.style.opacity = '0.35';
                self.timelineSegmentsLayerEl.appendChild(segment);
            }

            for (var i = 0; i < sorted.length; i++) {
                var pin = sorted[i];
                var pinClass = this._timelineClassById(pin.classId);
                if (!pinClass || !pinClass.visible) continue;

                appendSegment(cursor, pin.time, activeClass);
                cursor = pin.time;
                activeClass = pinClass;
            }
            appendSegment(cursor, duration, activeClass);
        };

        proto._renderTimelinePins = function () {
            if (!this._timelineEnabled()) return;
            var self = this;
            this.timelinePinsLayerEl.innerHTML = '';

            this._sortTimelinePins();

            this.timelinePins.forEach(function (pin) {
                var cls = self._timelineClassById(pin.classId);
                if (!cls || !cls.visible) return;

                var pinBtn = document.createElement('button');
                pinBtn.type = 'button';
                pinBtn.className = 'timeline-pin' + (pin.id === self._selectedTimelinePinId ? ' is-selected' : '');
                pinBtn.setAttribute('data-pin-id', pin.id);
                pinBtn.style.left = (self._timelineTimeToPct(pin.time) * 100).toFixed(4) + '%';
                pinBtn.style.setProperty('--pin-color', self._timelineClassColor(cls));
                pinBtn.title = cls.name + ' @ ' + _fmtTime(pin.time);

                pinBtn.addEventListener('click', function (e) {
                    e.preventDefault();
                    e.stopPropagation();
                    self._selectedTimelinePinId = pin.id;
                    self._renderTimelinePins();
                    var freshPinBtn = self.timelinePinsLayerEl.querySelector('[data-pin-id="' + pin.id + '"]');
                    self._openTimelinePinMenu(pin.id, freshPinBtn);
                });

                pinBtn.addEventListener('contextmenu', function (e) {
                    e.preventDefault();
                    e.stopPropagation();
                    self._selectedTimelinePinId = pin.id;
                    self._renderTimelinePins();
                    var freshPinBtn = self.timelinePinsLayerEl.querySelector('[data-pin-id="' + pin.id + '"]');
                    self._openTimelinePinMenu(pin.id, freshPinBtn, e.clientX, e.clientY);
                });

                self.timelinePinsLayerEl.appendChild(pinBtn);
            });
        };

        proto._beginTimelineDrag = function (evt) {
            if (!this._timelineEnabled()) return;
            evt.preventDefault();
            evt.stopPropagation();

            this.videoEl.pause();
            this._timelineDrag = { kind: 'playhead' };

            this._dragTimelineToClientX(evt.clientX);
        };

        proto._dragTimelineToClientX = function (clientX) {
            if (!this._timelineDrag) return;
            var drag = this._timelineDrag;
            var targetTime = this._timelineTimeFromClientX(clientX);

            if (drag.kind === 'playhead') {
                this._requestSeekTo(targetTime);
                this._updateTemporalTimelineUI();
                return;
            }
        };

        proto._addTimelinePinAt = function (timeSeconds) {
            var activeClass = this._activeTimelineClass();
            if (!activeClass) return;
            var t = this._clampTimelineTime(
                (typeof timeSeconds === 'number') ? timeSeconds : this._currentVideoTime()
            );

            var merged = this.timelinePins.find(function (pin) {
                return Math.abs(pin.time - t) <= TIMELINE_PIN_MERGE_TOLERANCE;
            });

            if (merged) {
                merged.classId = activeClass.id;
                this._selectedTimelinePinId = merged.id;
            } else {
                var id = 'pin-' + Date.now() + '-' + Math.random().toString(36).slice(2);
                this.timelinePins.push({ id: id, dbId: null, time: t, classId: activeClass.id });
                this._selectedTimelinePinId = id;
            }

            this._compactTimelinePins();
            this._refreshTimelineVisuals();
            this._scheduleTimelineMarkersSync();
        };

        proto._deleteTimelinePin = function (pinId) {
            var idx = this.timelinePins.findIndex(function (pin) { return pin.id === pinId; });
            if (idx === -1) return;

            this.timelinePins.splice(idx, 1);
            if (this._selectedTimelinePinId === pinId) this._selectedTimelinePinId = null;
            this._closeTimelinePinMenu();

            this._compactTimelinePins();
            this._refreshTimelineVisuals();
            this._scheduleTimelineMarkersSync();
        };

        proto._setTimelinePinClass = function (pinId, classId) {
            var pin = this.timelinePins.find(function (p) { return p.id === pinId; });
            var cls = this._timelineClassById(classId);
            if (!pin || !cls) return;
            pin.classId = cls.id;
            this.activeTimelineClassId = cls.id;
            this._compactTimelinePins();
            this._refreshTimelineWithClasses();
            this._scheduleTimelineMarkersSync();
        };

        proto._moveTimelinePinToCurrentTime = function (pinId) {
            var pin = this.timelinePins.find(function (p) { return p.id === pinId; });
            if (!pin) return;

            var targetTime = this._clampTimelineTime(this._currentVideoTime());
            var mergeTarget = this.timelinePins.find(function (p) {
                return p.id !== pinId && Math.abs(p.time - targetTime) <= TIMELINE_PIN_MERGE_TOLERANCE;
            });

            if (mergeTarget) {
                mergeTarget.classId = pin.classId;
                this.timelinePins = this.timelinePins.filter(function (p) { return p.id !== pinId; });
                this._selectedTimelinePinId = mergeTarget.id;
            } else {
                pin.time = targetTime;
                this._selectedTimelinePinId = pin.id;
            }

            this._compactTimelinePins();
            this._refreshTimelineVisuals();
            this._scheduleTimelineMarkersSync();
        };

        proto._closeTimelinePinMenu = function () {
            if (this._timelinePinMenuEl) {
                this._timelinePinMenuEl.remove();
                this._timelinePinMenuEl = null;
            }
            if (this._timelinePinMenuCloser) {
                document.removeEventListener('click', this._timelinePinMenuCloser);
                this._timelinePinMenuCloser = null;
            }
        };

        proto._openTimelinePinMenu = function (pinId, anchorEl, clientX, clientY) {
            var self = this;
            var pin = this.timelinePins.find(function (p) { return p.id === pinId; });
            if (!pin) return;

            this._closeTimelinePinMenu();

            var menu = document.createElement('div');
            menu.style.cssText = 'position:fixed;background:#fff;border:1px solid #ccc;border-radius:6px;' +
                'box-shadow:0 8px 24px rgba(0,0,0,0.18);z-index:1200;min-width:220px;padding:0.5rem;';

            var title = document.createElement('div');
            title.className = 'small fw-semibold mb-2';
            title.textContent = 'Marker @ ' + _fmtTime(pin.time);
            menu.appendChild(title);

            var selectWrap = document.createElement('div');
            selectWrap.className = 'mb-2';
            menu.appendChild(selectWrap);

            var select = document.createElement('select');
            select.className = 'form-select form-select-sm';
            this.timelineClasses.forEach(function (cls) {
                var opt = document.createElement('option');
                opt.value = cls.id;
                opt.textContent = cls.name + (cls.visible ? '' : ' (hidden)');
                select.appendChild(opt);
            });
            select.value = pin.classId;
            select.addEventListener('change', function () {
                self._setTimelinePinClass(pinId, select.value);
                self._closeTimelinePinMenu();
            });
            selectWrap.appendChild(select);

            var moveBtn = document.createElement('button');
            moveBtn.className = 'btn btn-sm btn-outline-secondary w-100 mb-2';
            moveBtn.innerHTML = '<i class="fas fa-crosshairs me-1"></i>Move To Cursor';
            moveBtn.addEventListener('click', function () {
                self._moveTimelinePinToCurrentTime(pinId);
                self._closeTimelinePinMenu();
            });
            menu.appendChild(moveBtn);

            var deleteBtn = document.createElement('button');
            deleteBtn.className = 'btn btn-sm btn-outline-danger w-100';
            deleteBtn.innerHTML = '<i class="fas fa-trash-alt me-1"></i>Delete Marker';
            deleteBtn.addEventListener('click', function () {
                self._deleteTimelinePin(pinId);
                self._closeTimelinePinMenu();
            });
            menu.appendChild(deleteBtn);

            document.body.appendChild(menu);

            var left;
            var top;

            if (typeof clientX === 'number' && typeof clientY === 'number') {
                left = clientX + 8;
                top = clientY + 8;
            } else if (anchorEl) {
                var anchorRect = anchorEl.getBoundingClientRect();
                left = anchorRect.right + 8;
                top = anchorRect.top + (anchorRect.height / 2) - (menu.offsetHeight / 2);
            } else {
                left = 12;
                top = 12;
            }

            left = Math.max(8, Math.min(window.innerWidth - menu.offsetWidth - 8, left));
            top = Math.max(8, Math.min(window.innerHeight - menu.offsetHeight - 8, top));

            menu.style.left = left + 'px';
            menu.style.top = top + 'px';

            this._timelinePinMenuEl = menu;
            this._timelinePinMenuCloser = function (e) {
                if (!menu.contains(e.target)) self._closeTimelinePinMenu();
            };
            setTimeout(function () {
                document.addEventListener('click', self._timelinePinMenuCloser);
            }, 0);
        };

        proto._promptNewTimelineClass = function () {
            if (!this.isAdmin) return;
            var name = String(this.timelineClasses.length + 1);
            var cls = this.addTimelineClass(name);
            this.activeTimelineClassId = cls.id;
            this._startTimelineClassEdit(cls.id);
            this._persistTimelineClass(cls);
        };

        proto._updateTemporalTimelineUI = function () {
            if (!this._timelineEnabled()) return;

            var duration = this._videoDuration();
            var current = this._clampTimelineTime(this._currentVideoTime());
            var pct = this._timelineTimeToPct(current);

            if (this.timelinePlayheadEl) {
                this.timelinePlayheadEl.style.left = 'calc(8px + (100% - 16px) * ' + pct.toFixed(6) + ')';
            }
            if (this.timelineCurrentTimeEl) {
                this.timelineCurrentTimeEl.textContent = _fmtTime(current);
            }
            if (this.timelineDurationEl) {
                this.timelineDurationEl.textContent = _fmtTime(duration);
            }

            if (this.timelineActiveClassEl) {
                var currentClass = this._timelineClassAt(current);
                var currentLabel = currentClass ? currentClass.name : '-';
                this.timelineActiveClassEl.textContent = 'Current: ' + currentLabel;
                this.timelineActiveClassEl.style.backgroundColor = this._timelineClassColor(currentClass);
                this.timelineActiveClassEl.style.color = '#fff';
            }
        };

        proto._initTemporalClassification = function () {
            if (!this._timelineEnabled()) return;
            var self = this;

            this.timelinePins = [];
            this._addDefaultTimelineClass();
            this._refreshTimelineWithClasses();

            if (this.timelineAddPinBtnEl) {
                this.timelineAddPinBtnEl.addEventListener('click', function () {
                    self._addTimelinePinAt(self._currentVideoTime());
                });
            }

            if (this.timelineAddClassBtnEl) {
                this.timelineAddClassBtnEl.addEventListener('click', function () {
                    if (!self.isAdmin) return;
                    self._promptNewTimelineClass();
                });
            }

            if (this.timelinePlayheadEl) {
                this.timelinePlayheadEl.addEventListener('mousedown', function (e) {
                    if (e.button !== 0) return;
                    self._beginTimelineDrag(e);
                });
            }

            if (this.timelineTrackWrapEl) {
                this.timelineTrackWrapEl.addEventListener('mousedown', function (e) {
                    if (e.button !== 0) return;

                    var target = e.target;
                    var isPin = !!(target && target.closest && target.closest('.timeline-pin'));
                    var isPlayhead = target === self.timelinePlayheadEl;
                    if (isPin || isPlayhead) return;
                    e.preventDefault();

                    self._closeTimelinePinMenu();

                    self._beginTimelineDrag(e);
                });
            }

            var TL = this._timelineListeners;
            TL.winMove = function (e) {
                if (!self._timelineDrag) return;
                e.preventDefault();
                self._dragTimelineToClientX(e.clientX);
            };
            TL.winUp = function () {
                if (!self._timelineDrag) return;
                if (self._timelineDrag.kind === 'playhead') {
                    var snapped = self._clampTimelineTime(Math.round(self._currentVideoTime()));
                    self._requestSeekTo(snapped);
                }
                self._timelineDrag = null;
                self._updateTemporalTimelineUI();
            };
            window.addEventListener('mousemove', TL.winMove);
            window.addEventListener('mouseup', TL.winUp);
        };
}
