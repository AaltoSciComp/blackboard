import { DEBUG_LEVELS, ENDPOINT, HIT_STROKE_WIDTH } from "./constants.js";
import { log } from "./logging.js";

// Pure helpers shared with the plain-JavaScript viewer live in pixelUtils.js
// (no imports allowed there); re-export them so the rest of the app can keep
// importing everything from Utils.js.
export {
  toRelativeCoords,
  pixelsToPct,
  pctToPixels,
  sleep,
  shallowEqual,
  isValidUrl,
  pointsDistance,
  makeKonvaGrid,
  rgb2hex,
} from "./pixelUtils.js";

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
