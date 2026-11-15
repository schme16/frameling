// Looks for the review page as the other person sees it: opened in a plain browser window (no Frameling), as it arrives,
// then after they have left a note, an answer, a circle and ticked a note. Both themes (the page follows the computer's
// light or dark setting, so the window's theme is what is switched). The page comes from the real app: run the help clip
// first with REVIEW_PAGE_OUT=<file> (see docs/testing.md), then:
//   (THEME=dark or THEME=light for one, which is how to run both: one window per run is steadier)
//   REVIEW_PAGE=<file> OUT=brand/ab/share-review SHOT_SHOW=1 xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/docs/ab-share-review/review-page.cjs
const { app, BrowserWindow, nativeTheme } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const page = process.env.REVIEW_PAGE;
const out = process.env.OUT || 'brand/ab/share-review';
if (!page || !fs.existsSync(page)) throw new Error('Set REVIEW_PAGE to a review page (see the header of this file).');
app.disableHardwareAcceleration();

async function run(theme) {
  nativeTheme.themeSource = theme;
  const win = new BrowserWindow({ width: 1280, height: 860, show: false, paintWhenInitiallyHidden: true, // An in-memory session, so what one run wrote to the page's storage never reaches the next.
    webPreferences: { sandbox: true, backgroundThrottling: false, partition: 'review-' + Date.now() + Math.random() } });
  const wc = win.webContents;
  await win.loadFile(page);
  await sleep(700);
  const ev = (code) => wc.executeJavaScript(code);
  const centre = async (sel, fx = 0.5, fy = 0.5) => ev(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return [Math.round(r.left + r.width * ${fx}), Math.round(r.top + r.height * ${fy})]; })()`);
  const click = async (x, y) => {
    wc.sendInputEvent({ type: 'mouseMove', x, y });
    wc.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
    wc.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
    await sleep(250);
  };
  const drag = async (a, b) => {
    wc.sendInputEvent({ type: 'mouseMove', x: a[0], y: a[1] });
    wc.sendInputEvent({ type: 'mouseDown', x: a[0], y: a[1], button: 'left', clickCount: 1 });
    for (let i = 1; i <= 8; i++) {
      wc.sendInputEvent({ type: 'mouseMove', x: Math.round(a[0] + ((b[0] - a[0]) * i) / 8), y: Math.round(a[1] + ((b[1] - a[1]) * i) / 8) });
      await sleep(30);
    }
    wc.sendInputEvent({ type: 'mouseUp', x: b[0], y: b[1], button: 'left', clickCount: 1 });
    await sleep(250);
  };
  const shot = async (name) => {
    await wc.capturePage();
    await sleep(200);
    const img = await wc.capturePage();
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, `${name}-${theme}.png`), img.toPNG());
  };
  const setVal = (sel, v) => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); e.focus(); e.value = ${JSON.stringify(v)}; e.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);

  // The page as it arrives: Shane's notes and the tools, nothing from the other person yet.
  await shot('page-as-received');

  // Leave a note on the eyes, circle the mouth, answer and tick.
  await setVal('#name', 'Anna');
  await click(...(await centre('[data-tool="note"]')));
  await click(...(await centre('#stage', 0.43, 0.3)));
  await setVal('#list textarea', 'The eyes feel a little far apart');
  await ev(`document.activeElement.blur()`);
  await click(...(await centre('[data-tool="circle"]')));
  await drag(await centre('#stage', 0.36, 0.6), await centre('#stage', 0.66, 0.78));
  await click(...(await centre('[data-tool="look"]')));
  await setVal('[data-note="n-mouth"] input[type=text]', 'A bit, yes. Try 20% narrower?');
  await ev(`document.querySelector('[data-note="n-mouth"] input[type=text]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))`);
  await ev(`(() => { const c = document.querySelector('[data-note="n-eye"] input[type=checkbox]'); c.click(); return true; })()`);
  await ev(`window.scrollTo(0, 0)`);
  await sleep(400);
  await shot('page-commenting');
  win.destroy();
}

app.whenReady().then(async () => {
  try {
    for (const t of process.env.THEME ? [process.env.THEME] : ['dark', 'light']) await run(t);
  } finally {
    app.quit();
  }
});
