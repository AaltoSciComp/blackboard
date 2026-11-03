/**
 * Wet-ink renderer for the Line tool: draws the in-progress stroke on a plain
 * 2D canvas overlay, incrementally (only the newest segment per pointer move),
 * bypassing Konva's scene-graph redraw entirely. This removes the visual lag
 * between the pen and the line: no full-canvas clear, no rAF batching, no
 * React — just one stroke() call per move.
 *
 * Fidelity contract: the overlay must render the SAME curve Konva will render
 * for the committed shape, so the user sees exactly the line they get. Konva
 * Line with tension (the app's default: tension 0.3, >4 points) draws a
 * Catmull-Rom-style spline via quadraticCurveTo per segment, with control
 * points from getControlPoints() below (mirrors konva/lib/shapes/Line.js).
 * With <=4 points (or tension 0) it falls back to straight lineTo segments.
 *
 * On penUp the caller commits the same points to a Konva Line as usual and
 * calls clear() — the committed shape replaces the wet stroke 1:1.
 *
 * Coordinate system: the overlay covers the stage area 1:1 (CSS pixels);
 * callers pass the same client coordinates they feed Konva, minus the
 * toolbar offset (i.e. stage-local coordinates).
 */

/**
 * Catmull-Rom control points for the segment p0 -> p1 -> p2, exactly as
 * Konva's Line#getControlPoints (konva/lib/shapes/Line.js).
 */
export function getControlPoints(x0, y0, x1, y1, x2, y2, t) {
    const d01 = Math.sqrt(Math.pow(x1 - x0, 2) + Math.pow(y1 - y0, 2));
    const d12 = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
    const dSum = d01 + d12;
    // all three points are the same -> control points collapse into that point
    if (dSum === 0) {
        return [x1, y1, x1, y1];
    }
    const fa = (t * d01) / dSum;
    const fb = (t * d12) / dSum;
    const p1x = x1 - fa * (x2 - x0);
    const p1y = y1 - fa * (y2 - y0);
    const p2x = x1 + fb * (x2 - x0);
    const p2y = y1 + fb * (y2 - y0);
    return [p1x, p1y, p2x, p2y];
}

/**
 * Create a wet-ink session bound to an overlay canvas.
 *
 * @param {HTMLCanvasElement} canvas Overlay canvas covering the stage 1:1.
 * @param {object} style Stroke style: { stroke, strokeWidth, lineCap }.
 * @returns session object with addPoint(), redrawAll(), clear().
 */
export function createWetInk(canvas, style) {
    const ctx = canvas.getContext('2d');
    // Points in stage-local pixel coordinates, flat [x0, y0, x1, y1, ...]
    let points = [];
    // Live tail: current cursor position (every pointer move, ungated).
    // Rendered as a straight segment from the last recorded point so the
    // line follows the pen 1:1; NOT part of the committed geometry.
    let tail = null;
    let tension = 0;
    let bezier = false;
    // Dirty rectangle (stage-local CSS px) of ink drawn so far this stroke.
    // Redraws clear/redraw only this region; begin/clear reset it.
    let dirtyMinX = 0, dirtyMinY = 0, dirtyMaxX = 0, dirtyMaxY = 0;

    function applyStyle() {
        ctx.strokeStyle = style.stroke;
        ctx.lineWidth = style.strokeWidth;
        ctx.lineCap = style.lineCap || 'round';
        ctx.lineJoin = style.lineJoin || 'round';
    }

    /**
     * Expand points into Konva's tension-point layout: for each interior
     * point, [cp1x, cp1y, pointX, pointY, cp2x, cp2y] (mirrors
     * konva/lib/shapes/Line.js expandPoints).
     */
    function expandPoints(p, t) {
        const len = p.length, all = [];
        for (let n = 2; n < len - 2; n += 2) {
            const cp = getControlPoints(p[n - 2], p[n - 1], p[n], p[n + 1], p[n + 2], p[n + 3], t);
            if (isNaN(cp[0])) continue;
            all.push(cp[0], cp[1], p[n], p[n + 1], cp[2], cp[3]);
        }
        return all;
    }

    /**
     * Trace the tension path over ALL points so far, exactly as Konva's
     * _eachTensionSegment does for an OPEN line:
     *   quadratic(p0 -> tp[0..1] -> tp[2..3])      (first segment, capped)
     *   cubic per segment starting at n=4:          (interior points)
     *     cp1 = tp[n..n+1]  (cp2 of the previous triple)
     *     cp2 = tp[n+2..3]  (cp1 of the next triple)
     *     end = tp[n+4..5]  (the interior point itself)
     *   quadratic(x0 -> tp[len-2..1] -> lastPoint) (last segment, capped)
     *
     * The cubic walk MUST start at n=4 (Konva's value), not at the first
     * triple boundary (6): starting at 6 shifts every read by one field,
     * turning points into control points and control points into endpoints —
     * visible as spikes overshooting tangentially on every turn.
     *
     * NOTE: this must be a FULL trace every time. Catmull-Rom control points
     * depend on each point's neighbors, so adding a point changes the control
     * points of the preceding segments. Drawing incrementally would leave
     * stale curve fragments on the canvas — visible as a second, sharp-cornered
     * line (exactly the bug this replaced). A full trace of one path is still
     * far cheaper than Konva's scene-graph redraw of the whole layer.
     */
    function traceTension() {
        const p = points;
        const tp = expandPoints(p, tension);
        const len = tp.length;
        if (!len) {
            // Only endpoints exist (2 points): straight line
            ctx.moveTo(p[0], p[1]);
            ctx.lineTo(p[2], p[3]);
            return;
        }
        ctx.moveTo(p[0], p[1]);
        ctx.quadraticCurveTo(tp[0], tp[1], tp[2], tp[3]);
        let n = 4;
        while (n < len - 2) {
            const cp1x = tp[n++], cp1y = tp[n++], cp2x = tp[n++], cp2y = tp[n++], x = tp[n++], y = tp[n++];
            ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y);
        }
        ctx.quadraticCurveTo(tp[len - 2], tp[len - 1], p[p.length - 2], p[p.length - 1]);
    }

    /**
     * Konva's bezier path (Line._sceneFunc, `bezier` branch): with bezier
     * enabled but no active tension (tension 0, or <=4 points where
     * _hasTension() is false), Konva consumes the points as cubic segments
     * of 6 values each: bezierCurveTo(p[n], p[n+1], p[n+2], p[n+3], p[n+4],
     * p[n+5]) starting from n=2. This is NOT a straight polyline — missing
     * it made the wet ink diverge from the committed Konva line (visible as
     * a smooth + a rough line on top of each other).
     */
    function traceBezier() {
        const p = points;
        ctx.moveTo(p[0], p[1]);
        let n = 2;
        while (n + 5 < p.length) {
            ctx.bezierCurveTo(p[n++], p[n++], p[n++], p[n++], p[n++], p[n++]);
        }
    }

    function drawSegmentPath() {
        const p = points;
        const n = p.length;
        if (n < 2) return;
        ctx.beginPath();
        if (tension !== 0 && n > 4) {
            // Tension spline (Konva _hasTension: tension!==0 && points>4)
            traceTension();
        } else if (bezier) {
            // Bezier mode without active tension (tension 0 or <=4 points):
            // Konva consumes points as cubic segments of 6 values each.
            traceBezier();
        } else {
            // Straight polyline (smoothing off)
            ctx.moveTo(p[0], p[1]);
            for (let i = 2; i < n; i += 2) {
                ctx.lineTo(p[i], p[i + 1]);
            }
        }
        // Live tail: straight segment from the last recorded point (or the
        // last spline endpoint) to the cursor. Straight on purpose — it is
        // redrawn every move and only spans one threshold interval, so its
        // shape is imperceptible; the committed spline starts from the last
        // recorded point, matching the stable prefix exactly.
        if (tail && points.length >= 2) {
            ctx.lineTo(tail[0], tail[1]);
        }
        ctx.stroke();
    }

    /**
     * Dirty-rect redraw: clears and re-traces only the region around the
     * recently changed geometry (last recorded point + live tail). Cost
     * scales with stroke speed, not canvas size.
     */
    function redrawDirty() {
        const p = points;
        const pad = style.strokeWidth * 2 + 4;
        // Anchor: the last recorded point (the tail pivots around it)
        const ax = p.length >= 2 ? p[p.length - 2] : (tail ? tail[0] : 0);
        const ay = p.length >= 2 ? p[p.length - 1] : (tail ? tail[1] : 0);
        let minX = ax - pad, minY = ay - pad, maxX = ax + pad, maxY = ay + pad;
        if (tail) {
            minX = Math.min(minX, tail[0] - pad);
            minY = Math.min(minY, tail[1] - pad);
            maxX = Math.max(maxX, tail[0] + pad);
            maxY = Math.max(maxY, tail[1] + pad);
        }
        dirtyMinX = Math.min(dirtyMinX, minX);
        dirtyMinY = Math.min(dirtyMinY, minY);
        dirtyMaxX = Math.max(dirtyMaxX, maxX);
        dirtyMaxY = Math.max(dirtyMaxY, maxY);

        ctx.clearRect(dirtyMinX, dirtyMinY, dirtyMaxX - dirtyMinX, dirtyMaxY - dirtyMinY);
        ctx.save();
        ctx.beginPath();
        ctx.rect(dirtyMinX, dirtyMinY, dirtyMaxX - dirtyMinX, dirtyMaxY - dirtyMinY);
        ctx.clip();
        drawSegmentPath();
        ctx.restore();
    }

    return {
        /**
         * Begin a new stroke. Replaces the stroke style and resets points.
         */
        begin(newStyle, newTension, newBezier) {
            points = [];
            tail = null;
            tension = newTension || 0;
            bezier = Boolean(newBezier);
            dirtyMinX = dirtyMinY = Infinity;
            dirtyMaxX = dirtyMaxY = -Infinity;
            applyStyle();
            Object.assign(style, newStyle);
            applyStyle();
        },

        /**
         * Append a RECORDED point (threshold-gated, exactly the points that
         * will be persisted and committed to Konva) and redraw. These form
         * the stable prefix of the stroke: once added, their geometry never
         * changes, so the spline here matches the committed line 1:1.
         */
        addPoint(x, y) {
            tail = null; // a new recorded point absorbs the live tail
            points.push(x, y);
            redrawDirty();
        },

        /**
         * Move the LIVE TAIL to the current cursor position (every pointer
         * move, ungated). The tail is a straight segment from the last
         * recorded point to the cursor — it follows the pen 1:1 but is NOT
         * part of the committed geometry. Redrawn on the same dirty rect as
         * the last recorded point, so cost is bounded by stroke speed.
         */
        setTail(x, y) {
            tail = [x, y];
            redrawDirty();
        },

        /**
         * Full redraw (used on resize / style change / restore).
         */
        redrawAll() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            applyStyle();
            drawSegmentPath();
        },

        /**
         * The RECORDED points so far, flat [x0, y0, ...] — exactly the
         * geometry the committed Konva Line will render (the live tail is
         * deliberately excluded).
         */
        getPoints() {
            return points.slice();
        },

        getPointCount() {
            return points.length / 2;
        },

        /**
         * Clear the overlay for the next stroke.
         */
        clear() {
            points = [];
            tail = null;
            dirtyMinX = dirtyMinY = Infinity;
            dirtyMaxX = dirtyMaxY = -Infinity;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        },

        /**
         * Resize the overlay (device pixels). Clears any wet stroke; callers
         * should redrawAll() if a stroke is in progress.
         */
        resize(cssWidth, cssHeight, pixelRatio) {
            canvas.width = Math.round(cssWidth * pixelRatio);
            canvas.height = Math.round(cssHeight * pixelRatio);
            canvas.style.width = cssWidth + 'px';
            canvas.style.height = cssHeight + 'px';
            ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
            applyStyle();
        },
    };
}
