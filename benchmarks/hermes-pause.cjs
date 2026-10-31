const { chromium } = require('playwright');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const BENCH = __dirname;
const ps = (s,a=[]) => execFileSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(BENCH,s),...a],{encoding:'utf8'});
function win(){const t=ps('window-info.ps1',['-ProcessName','Hermes']);const m=t.match(/CLIENT=(-?\d+),(-?\d+),(\d+),(\d+)/);return {x:+m[1],y:+m[2],w:+m[3],h:+m[4]}}
(async()=>{
 const b=await chromium.connectOverCDP('http://127.0.0.1:9222');const p=b.contexts()[0].pages()[0];
 const info=await p.evaluate(()=>({
   url:location.href,
   body:(document.body.innerText||'').slice(-700),
   siri:[...document.querySelectorAll('[data-testid="siri-play"]')].map(e=>{const r=e.getBoundingClientRect();return{aria:e.getAttribute('aria-label'),x:r.x,y:r.y,w:r.width,h:r.height,vis:r.width>0&&r.height>0}}),
 }));
 console.log(JSON.stringify(info,null,2));
 const target=info.siri.find(s=>s.vis && /pause/i.test(s.aria||''));
 if(target){const w=win();const iw=await p.evaluate(()=>innerWidth),ih=await p.evaluate(()=>innerHeight);const x=w.x+(target.x+target.w/2)*(w.w/iw),y=w.y+(target.y+target.h/2)*(w.h/ih);console.log(ps('os-click.ps1',['-ProcessName','Hermes','-X',String(Math.round(x)),'-Y',String(Math.round(y))]));}
 process.exit(0);
})().catch(e=>{console.error(e);process.exit(1)});
