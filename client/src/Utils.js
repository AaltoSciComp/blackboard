import { HIT_STROKE_WIDTH, ENDPOINT } from "./constants.js"


/**
 * Convert canvas pixel coordinate to relative (0...1) coordinate for database
 */
export function toRelativeCoords(coord, dimension) {
  return Number((coord / dimension).toFixed(5));
}

/**
 * "Screen width to DB width"
 * Convert pixel width to percentage of given (canvas) width
 */
export function pixelsToPct(size, dimension) {
  return Number(((size / dimension) * 100).toFixed(5))
}

/**
 * "DB width to screen width"
 * Convert percentage of given (canvas) width to pixel width
 */
export function pctToPixels(size, dimension) {
  return Number((0.01 * size * dimension).toFixed(2))
}


export function sleep(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

// code from https://dmitripavlutin.com/how-to-compare-objects-in-javascript/
export function shallowEqual(object1, object2) {
    const keys1 = Object.keys(object1);
    const keys2 = Object.keys(object2);
    if (keys1.length !== keys2.length) {
      return false;
    }
    for (let key of keys1) {
      if (object1[key] !== object2[key]) {
        return false;
      }
    }
    return true;
}

export function isValidUrl(url) {
    try {
      new URL(url);
    } catch (e) {
      return false;
    }
    return true;
};

export function pointsDistance(x1, y1, x2, y2) {
  /*const result = Math.sqrt(
    Math.pow(x1-x2, 2) + Math.pow(y1-y2, 2)
  );*/
  // Calculate Manhattan distance instead for better performance
  const result = Math.abs(x1 - x2) + Math.abs(y1 - y2);
  //console.info(result, x1, x2, y1, y2)
  return result;
};

// Konva custom sceneFunc to make a grid
export function makeKonvaGrid(context, shape) {
  const width = shape.width();
  const height = shape.height();
  const hspacing = shape.attrs.hspacing > 0 ? shape.attrs.hspacing : width / 10;
  const vspacing = shape.attrs.vspacing > 0 ? shape.attrs.vspacing : height / 10;
  let vLines, hLines;
  if(hspacing > 0) {
      const realVLines = width / hspacing;
      vLines = Math.floor(realVLines);
      // Avoid missing borderlines due to rounding errors when snapped to grid
      if(realVLines - vLines > 0.95) vLines++;
  } else vLines = 1;
  if(vspacing > 0) {
      const realHLines = height / vspacing;
      hLines = Math.floor(realHLines);
      // Avoid missing borderlines due to rounding errors when snapped to grid
      if(realHLines - hLines > 0.95) hLines++;
  } else hLines = 1;

  // Fill background color if defined
  if (shape.attrs.fill && shape.attrs.fillEnabled) {
    context.fillStyle = shape.attrs.fill;
    context.fillRect(0, 0, width, height);
  }
  
  // Vertical grid lines. Support drawing in both directions.
  for(var i = 0; vLines > 0 ? i<=vLines : i>= vLines; vLines > 0 ? i++ : i--) {
      context.beginPath();
      context.moveTo(hspacing * i, 0);
      context.lineTo(hspacing * i, height);
      context.closePath();
      context.fillStrokeShape(this);
  }
  
  // Horizontal grid lines. Support drawing in both directions.
  for(var j = 0; hLines > 0 ? j<=hLines : j>= hLines; hLines > 0 ? j++ : j--) {
      context.beginPath();
      context.moveTo(0, vspacing * j);
      context.lineTo(width, vspacing * j);
      context.closePath();
      context.fillStrokeShape(this);
  }
}

export function rgb2hex(rgb) {
  rgb = rgb.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
  if(!rgb) return false;

  function hexCode(i) {
      return ("0" + parseInt(i).toString(16)).slice(-2);
  }
  return "#" + hexCode(rgb[1]) + hexCode(rgb[2]) 
          + hexCode(rgb[3]);
}

/**
 * Create a clone on top of a filled shape (outline only) so that we can make the fill part
 * not listen to pointerMove events when batch deleting/recoloring shapes.
 * @param {*} shape Konva shape to create outline clone from
 * @returns the cloned shape if successful, false otherwise
 */
 export const createOutlineClone = (shape) => {
    const outlineClone = shape.clone({clone: true, fillEnabled: false, strokeEnabled: true, opacity: 0});
    if(outlineClone) return outlineClone;
    else {
      log(DEBUG_LEVELS.ERROR, 'Failed to create outline clone from shape');
      return false;
    }
}

/**
 * Fetch colors used in strokes or fills from backend
 * @param {string} type Either stroke or fill
 * @param {integer} sid session id
 * @returns array of color codes
 */
export async function getUsedColors(type, sid) {
  const resp = await fetch(ENDPOINT + `/shapesinfo/` + (type === 'stroke' ? 'stroke' : 'fill') + `/` + sid, {
      method: 'GET',
      headers: {
          'Accept': 'application/json, text/plain, */*',
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + getPresenterToken(sid)
      }
  })
  if(!resp.ok) {
      return Promise.reject('Error (' + resp.status + ') occurred')
  }
  const json = await resp.json();
  return json;
}

/**
 * Retrieves the presenter token from the session storage.
 * @returns {string|null} The presenter token or null if it doesn't exist.
 * @param {integer} sid session id
 */
export const getPresenterToken = ((sid) => {
    return sessionStorage.getItem('presentertoken_' + sid);
});
