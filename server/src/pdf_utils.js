/**
 * PDF creation utils
 * Bezier creation code adapted from Konva's line.ts
 * (https://github.com/konvajs/konva/blob/master/src/shapes/Line.ts)
 */
function pdf_getControlPoints(x0, y0, x1, y1, x2, y2, t) {
    var d01 = Math.sqrt(Math.pow(x1 - x0, 2) + Math.pow(y1 - y0, 2)),
      d12 = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2)),
      fa = (t * d01) / (d01 + d12),
      fb = (t * d12) / (d01 + d12),
      p1x = x1 - fa * (x2 - x0),
      p1y = y1 - fa * (y2 - y0),
      p2x = x1 + fb * (x2 - x0),
      p2y = y1 + fb * (y2 - y0);
  
    return [p1x, p1y, p2x, p2y];
}

function pdf_expandPoints(p, tension) {
    var len = p.length,
      allPoints = [],
      n,
      cp;
  
    for (n = 2; n < len - 2; n += 2) {
      cp = pdf_getControlPoints(
        p[n - 2],
        p[n - 1],
        p[n],
        p[n + 1],
        p[n + 2],
        p[n + 3],
        tension
      );
      if (isNaN(cp[0])) {
        continue;
      }
      allPoints.push(cp[0]);
      allPoints.push(cp[1]);
      allPoints.push(p[n]);
      allPoints.push(p[n + 1]);
      allPoints.push(cp[2]);
      allPoints.push(cp[3]);
    }
  
    return allPoints;
}

function pdf_getTensionPoints(p, tension) {
    var len = p.length,
        allPoints = [],
        n,
        cp;

    for (n = 2; n < len - 2; n += 2) {
        cp = pdf_getControlPoints(
        p[n - 2],
        p[n - 1],
        p[n],
        p[n + 1],
        p[n + 2],
        p[n + 3],
        tension
        );
        if (isNaN(cp[0])) {
        continue;
        }
        allPoints.push(cp[0]);
        allPoints.push(cp[1]);
        allPoints.push(p[n]);
        allPoints.push(p[n + 1]);
        allPoints.push(cp[2]);
        allPoints.push(cp[3]);
    }

    return allPoints;
}

function pdf_getTensionPointsClosed(p, tension) {
      len = p.length,
      firstControlPoints = pdf_getControlPoints(
        p[len - 2],
        p[len - 1],
        p[0],
        p[1],
        p[2],
        p[3],
        tension
      ),
      lastControlPoints = pdf_getControlPoints(
        p[len - 4],
        p[len - 3],
        p[len - 2],
        p[len - 1],
        p[0],
        p[1],
        tension
      ),
      middle = pdf_expandPoints(p, tension),
      tp = [firstControlPoints[2], firstControlPoints[3]]
        .concat(middle)
        .concat([
          lastControlPoints[0],
          lastControlPoints[1],
          p[len - 2],
          p[len - 1],
          lastControlPoints[2],
          lastControlPoints[3],
          firstControlPoints[0],
          firstControlPoints[1],
          p[0],
          p[1],
        ]);

    return tp;
}

function pdf_drawLine(doc, options, points) {
    var length = points.length;
    var tension = options.tension;
    var closed = options.closed;
    var bezier = options.bezier;
    var tp;
    var len;
    var n;
    const x = options.x;
    const y = options.y;

    if (!length) {
      return;
    }

    doc.beginPath();
    doc.strokeStyle = options.stroke; // set line color
    //doc.moveTo(points[0], points[1]);
    doc.moveTo(x, y);

    // tension
    if (tension !== 0 && length > 4) {
        tp = closed ? pdf_getTensionPointsClosed(points, tension) : pdf_getTensionPoints(points, tension);
        len = tp.length;
        n = closed ? 0 : 4;

        if (!closed) {
            doc.quadraticCurveTo(tp[0], tp[1], tp[2], tp[3]);
        }

        while (n < len - 2) {
            doc.bezierCurveTo(
            tp[n++],
            tp[n++],
            tp[n++],
            tp[n++],
            tp[n++],
            tp[n++]
            );
        }

        if (!closed) {
            doc.quadraticCurveTo(
            tp[len - 2],
            tp[len - 1],
            points[length - 2],
            points[length - 1]
            );
        }
    } else if (bezier) {
        // no tension but bezier
        n = 2;

        while (n < length) {
            doc.bezierCurveTo(
            points[n++],
            points[n++],
            points[n++],
            points[n++],
            points[n++],
            points[n++]
            );
        }
    } else {
        // no tension
        for (n = 2; n < length; n += 2) {
            doc.lineTo(points[n], points[n + 1]);
        }
    }

    // closed e.g. polygons and blobs
    if (closed) {
        doc.closePath();
        doc.fill();
        if(options.strokeEnabled) doc.stroke();
    } else {
        // open e.g. lines and splines
        if(options.strokeEnabled) doc.stroke();
    }

    if (options.pointerAtEnding && !closed) {
        const PI2 = Math.PI * 2;
        let dy, dx, radians;
        // For arrows, first coordinate is 0,0 and the other is not relative
        // to it, but relative to the canvas origin, so we need to use the
        // same coordinate system for both to find dx and dy! 
        if(length <= 4) {
            dx = points[length - 2] - options.x;
            dy = points[length - 1] - options.y;
        } else {
            if (tension !== 0) {
                // Need lots of Konva code to implement correctly rotated arrowheads for beziers
                // Find a better way if this will be done in the future
                /*const lp = [
                    tp[tp.length - 4],
                    tp[tp.length - 3],
                    tp[tp.length - 2],
                    tp[tp.length - 1],
                    points[n - 2],
                    points[n - 1],
                ];
                const lastLength = Path.calcLength(
                    tp[tp.length - 4],
                    tp[tp.length - 3],
                    'C',
                    lp
                );
                const previous = Path.getPointOnQuadraticBezier(
                    Math.min(1, 1 - length / lastLength),
                    lp[0],
                    lp[1],
                    lp[2],
                    lp[3],
                    lp[4],
                    lp[5]
                );
            
                dx = points[n - 2] - previous.x;
                dy = points[n - 1] - previous.y;*/
                dx = 0;
                dy = 0;
            } else {
                dx = points[length - 2] - points[length - 4];
                dy = points[length - 1] - points[length - 3];
            }
        }
        radians = (Math.atan2(dy, dx) + PI2) % PI2;

        doc.save();
        doc.strokeStyle = options.stroke; // set line color
        doc.beginPath();
        doc.translate(points[length - 2], points[length - 1]);
        doc.rotate(radians);
        //console.info('rotated rad:', radians, ' deg: ', radians * (180/Math.PI));
        doc.moveTo(0, 0);
        doc.lineTo(-options.pointerLength, options.pointerWidth / 2);
        doc.lineTo(-options.pointerLength, -options.pointerWidth / 2);
        doc.closePath();
        doc.stroke();
        doc.fill();
        doc.restore();
    }
}

// Konva custom sceneFunc to make a grid
function pdf_makeKonvaGrid(context, shape, xmult, ymult) {
    const width = shape.shapedetails.width*xmult;
    const height = shape.shapedetails.height*ymult;
    const hspacing = shape.shapedetails.hspacing > 0 ? shape.shapedetails.hspacing*xmult : width / 10;
    const vspacing = shape.shapedetails.vspacing > 0 ? shape.shapedetails.vspacing*ymult : height / 10;
    //console.info('width: ', width, ', height: ', height, ', hspacing: ', hspacing, ', vspacing: ', vspacing);
    let vLines, hLines;
    if(hspacing > 0) {
        const realVLines = width / hspacing;
        vLines = Math.floor(realVLines);
        // Avoid missing borderlines due to rounding errors when snapped to grid
        if(realVLines - vLines > 0.99) vLines++;
    } else vLines = 1;
    if(vspacing > 0) {
        const realHLines = height / vspacing;
        hLines = Math.floor(realHLines);
        // Avoid missing borderlines due to rounding errors when snapped to grid
        if(realHLines - hLines > 0.99) hLines++;
    } else hLines = 1;
    
    // Save existing context2d settings
    context.save();

    // Translate into origin of grid
    context.translate(Number(shape.x) * xmult * 100, Number(shape.y) * ymult * 100);
    //console.info('translating to ',Number(shape.x) * xmult * 100, Number(shape.y) * ymult * 100);
    //console.info('hLines: ', hLines, ', vLines: ', vLines);

    context.strokeStyle = shape.stroke; // set line color

    // Vertical grid lines
    for(var i = 0; i<=vLines; i++) {
        context.beginPath();
        context.moveTo(hspacing * i, 0);
        context.lineTo(hspacing * i, height);
        context.closePath();
        context.stroke();
        context.fill();
    }
    
    // Horizontal grid lines
    for(var j = 0; j<=hLines; j++) {
        context.beginPath();
        context.moveTo(0, vspacing * j);
        context.lineTo(width, vspacing * j);
        context.closePath();
        context.stroke();
        context.fill();
    }

    // Restore earlier context2d settings
    context.restore();
}

exports.pdf_drawLine = pdf_drawLine;
exports.pdf_makeKonvaGrid = pdf_makeKonvaGrid;
