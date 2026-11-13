const { app, BrowserWindow } = require('electron');
const fs = require('fs');
app.commandLine.appendSwitch('no-sandbox');
app.whenReady().then(async () => {
  const w = new BrowserWindow({ x: 0, y: 0, width: 1600, height: 1000, frame: false, show: true, fullscreen: !!process.env.FS, webPreferences: { contextIsolation: false } });
  w.webContents.on('console-message', (e) => { const m = e.message ?? e; if (String(m).startsWith('EV ')) fs.appendFileSync(process.env.PROBE_OUT, String(m).slice(3) + '\n'); });
  await w.loadURL('data:text/html,' + encodeURIComponent(`<body style="margin:0;background:#333"><div id=a style="width:100vw;height:100vh;touch-action:none"></div><script>
  const full=(e)=>{const o={};for(const k in e){const v=e[k];if(typeof v==='number'||typeof v==='string'||typeof v==='boolean')o[k]=v}return o};
  const log=(e)=>console.log('EV '+JSON.stringify({all:e.type==='pointerdown'||e.type==='pointerup'?full(e):undefined,t:e.type,pt:e.pointerType,id:e.pointerId,b:e.button,bs:e.buttons,p:+(e.pressure||0).toFixed(2),w:e.width,h:e.height,tx:e.tiltX,ty:e.tiltY,tw:e.twist,x:Math.round(e.clientX),y:Math.round(e.clientY),prim:e.isPrimary}));
  for (const t of ['pointerdown','pointermove','pointerup','pointerenter','pointerleave','pointerover','pointerout','pointercancel','mousedown','mouseup','contextmenu','auxclick']) addEventListener(t,log,true);
  </script>`));
  console.log('ready');
  setTimeout(()=>app.quit(), +process.env.PROBE_MS||40000);
});
