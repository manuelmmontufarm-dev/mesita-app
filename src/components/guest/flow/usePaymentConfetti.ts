"use client";

import { useEffect } from "react";

const CONFETTI_COLORS = ["#1A9E62","#2fb37e","#1E9E63","#14794B","#E8F7F0","#FFF1E8"] as const;

interface Particle { x:number; y:number; vx:number; vy:number; w:number; h:number; rot:number; vr:number; color:string; gravity:number; opacity:number; }

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function spawnParticles(ox:number, oy:number, n:number): Particle[] {
  return Array.from({length:n}, () => ({
    x: ox+(Math.random()-0.5)*72, y: oy+(Math.random()-0.5)*36,
    vx:(Math.random()-0.5)*9, vy:Math.random()*-11-3,
    w:Math.random()*8+4, h:Math.random()*6+3,
    rot:Math.random()*Math.PI*2, vr:(Math.random()-0.5)*0.22,
    color:CONFETTI_COLORS[Math.floor(Math.random()*CONFETTI_COLORS.length)]!,
    gravity:0.17+Math.random()*0.09, opacity:1,
  }));
}

function fireConfettiBurst(ox:number, oy:number): void {
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden","true");
  canvas.style.cssText="position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:9999;";
  canvas.width=innerWidth; canvas.height=innerHeight; document.body.appendChild(canvas);
  const ctx=canvas.getContext("2d"); if(!ctx){canvas.remove();return;}
  const parts=spawnParticles(ox,oy,90); let f=0; const max=130;
  const tick=()=>{ctx.clearRect(0,0,canvas.width,canvas.height); let alive=false;
    for(const p of parts){p.vy+=p.gravity;p.x+=p.vx;p.y+=p.vy;p.vx*=0.985;p.rot+=p.vr;
      if(f>max*0.55)p.opacity-=0.018; if(p.opacity<=0||p.y>canvas.height+24)continue; alive=true;
      ctx.save();ctx.globalAlpha=Math.max(0,p.opacity);ctx.translate(p.x,p.y);ctx.rotate(p.rot);
      ctx.fillStyle=p.color;ctx.fillRect(-p.w/2,-p.h/2,p.w,p.h);ctx.restore();}
    f++; if(alive&&f<max)requestAnimationFrame(tick); else canvas.remove();};
  requestAnimationFrame(tick);
}

function confettiOrigin(){const t=document.querySelector(".wait-thanks");
  if(t){const r=t.getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height*0.35};}
  return{x:innerWidth/2,y:innerHeight*0.22};}

export function usePaymentConfetti(): void {
  useEffect(()=>{ if(prefersReducedMotion())return;
    const id=requestAnimationFrame(()=>{const{x,y}=confettiOrigin();fireConfettiBurst(x,y);setTimeout(()=>fireConfettiBurst(x,y-8),220);});
    return()=>cancelAnimationFrame(id); },[]);
}
