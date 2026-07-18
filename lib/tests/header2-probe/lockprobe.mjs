import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
const srv = createServer((q,s)=>{ let p='/home/claude/hdrfix'+q.url.split('?')[0];
  if(!existsSync(p)){s.statusCode=404;return s.end();}
  s.setHeader('content-type', p.endsWith('.js')?'text/javascript':'text/html'); s.end(readFileSync(p)); });
await new Promise(r=>srv.listen(8936,r));
const br = await chromium.launch();
let allPass = true;
for (const W of [1919, 1200, 900, 688, 380]){
  const pg = await br.newPage({ viewport:{ width:W, height:800 } });
  await pg.goto('http://localhost:8936/harness3.html');   // includes backdrop-filter wrapper (worst case)
  await pg.evaluate(()=>{ const h=document.querySelector('.app-header');
    h.style.backdropFilter='none'; h.style.filter='none'; });  // simulate the shipped frt.css fix
  await pg.waitForFunction('window.__ready'); await pg.waitForTimeout(250);
  const r = await pg.evaluate(() => {
    const root = document.getElementById('hdr-mount').shadowRoot;
    const logo = root.querySelector('.logo').getBoundingClientRect();
    const title = root.querySelector('.title');
    const tw = title.getBoundingClientRect().width;
    const cloud = root.querySelector('.cloud');
    const cloudVis = getComputedStyle(cloud).display !== 'none' && cloud.getBoundingClientRect().width > 0;
    let overlap = null;
    root.querySelectorAll('.actions > *').forEach(n => {
      if (getComputedStyle(n).display === 'none' || n.classList.contains('hide')) return;
      const b = n.getBoundingClientRect();
      if (b.left < logo.right - 1 && b.right > logo.left + 1) overlap = (n.getAttribute('title')||n.className).slice(0,20);
    });
    const shown = [...root.querySelectorAll('.actions > *')].filter(n=>!n.classList.contains('hide')&&getComputedStyle(n).display!=='none').length;
    const more = root.querySelector('.more');
    return { overlap, titleW: Math.round(tw), cloudVis, shown, moreVis: getComputedStyle(more).display !== 'none' };
  });
  const ok = !r.overlap && (r.titleW >= 63) && r.cloudVis;
  allPass &&= ok;
  console.log(`W=${W}: ${ok?'✓':'✗'} overlap=${r.overlap||'none'} titleW=${r.titleW} cloud=${r.cloudVis} actions=${r.shown} hamb=${r.moreVis}`);
  await pg.screenshot({ path:`/home/claude/hdrfix/lock_${W}.png` });
  await pg.close();
}
console.log(allPass ? '═══ ALL LOCK ASSERTIONS PASS ═══' : '═══ FAILURES ═══');
await br.close(); srv.close();
