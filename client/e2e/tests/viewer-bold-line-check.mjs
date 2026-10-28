import { chromium } from '@playwright/test';

// Regression check for the "line looks bolder after finish" bug (viewer).
//
// Bug: the animated draw path painted the growing line with per-point
// thisShape.draw() calls, which paint WITHOUT clearing the canvas. The
// repeated paints stacked anti-aliased edge alpha, so a finished short line
// looked ~24% bolder until the next shape forced a full layer repaint.
//
// Invariant: ink density (alpha sum) over a finished line's region must be
// the same right after the line finishes as it is after later shapes are
// drawn (i.e. no accumulation that only a later repaint heals).

const PREVIEW = 'http://127.0.0.1:4173';
const API = 'http://127.0.0.1:8080';

async function createSession() {
    const res = await fetch(`${API}/login/0`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ viewerpw: '', presenterpw: 'pw', sessionname: 'bold-line-regression', ispublic: true }),
    });
    if (!res.ok) throw new Error('create session failed: ' + res.status);
    return Number((await res.json()).sessionInfo.id);
}

const sid = await createSession();
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', (e) => { console.log('PAGEERROR:', String(e)); process.exitCode = 2; });

await page.goto(`${PREVIEW}/viewer.html?s=${sid}&insecure=1&v=${Date.now()}`);
await page.waitForFunction(() => window.viewerDebug?.gotSettings === true, null, { timeout: 10000 });

const fire = (event, payload) => page.evaluate(({ event, payload }) => {
    const cbs = window.viewerDebug.socket._callbacks['$' + event];
    cbs.forEach((fn) => fn(payload));
}, { event, payload });

const regionInk = (x0, y0, x1, y1) => page.evaluate(({ x0, y0, x1, y1 }) => {
    const layer = window.viewerDebug.layer.main[1];
    const canvas = layer.getCanvas()._canvas;
    const ctx = canvas.getContext('2d');
    const sx = Math.floor(canvas.width * x0), sy = Math.floor(canvas.height * y0);
    const sw = Math.floor(canvas.width * (x1 - x0)), sh = Math.floor(canvas.height * (y1 - y0));
    const img = ctx.getImageData(sx, sy, sw, sh).data;
    let alphaSum = 0;
    for (let i = 3; i < img.length; i += 4) alphaSum += img[i];
    return alphaSum;
}, { x0, y0, x1, y1 });

// Short line with staggered point times (like a real ~1s stroke)
const line = (shapeid, xFrac, yFrac) => ({
    shapetype: 'Line',
    id: shapeid,
    stroke: '#ffffff',
    fill: '',
    starttime: String(Date.now()),
    x: xFrac.toFixed(5), y: yFrac.toFixed(5),
    boardid: 1,
    shapedetails: { strokeWidth: 0.3, strokeEnabled: true, bezier: false, closed: false, tension: 0, fillEnabled: false },
    shapedata: Array.from({ length: 25 }, (_, i) => [i * 40, i * 0.004, (i % 2) * 0.004]),
});

await fire('draw_shape', line(77, 0.10, 0.10));
await page.waitForTimeout(1600);
const inkAfterLine1 = await regionInk(0.08, 0.08, 0.20, 0.14);

await fire('draw_shape', line(78, 0.55, 0.55));
await page.waitForTimeout(1600);
const inkAfterLine2 = await regionInk(0.08, 0.08, 0.20, 0.14);

await browser.close();

if (inkAfterLine1 === 0) { console.log('FAIL: line 1 never rendered'); process.exit(1); }
const drift = Math.abs(inkAfterLine1 - inkAfterLine2) / inkAfterLine2;
console.log(`ink after line1=${inkAfterLine1}, after line2=${inkAfterLine2}, drift=${(drift * 100).toFixed(1)}%`);
if (drift > 0.05) {
    console.log('FAIL: line ink changed after later shapes were drawn (paint accumulation)');
    process.exit(1);
}
console.log('PASS: no paint accumulation on animated line draw');
