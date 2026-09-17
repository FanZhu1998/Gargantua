export function createFallbackRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  let seed = 21;
  const random = () => { seed = (seed*1664525+1013904223) >>> 0; return seed/4294967296; };
  const stars = Array.from({ length: 380 }, () => [random(), random(), random()]);
  return {
    kind: 'illustration',
    resize(w, h) { canvas.width = w; canvas.height = h; },
    draw(state) {
      const w = canvas.width, h = canvas.height, r = h*0.21*state.zoom;
      ctx.fillStyle = '#020608'; ctx.fillRect(0, 0, w, h);
      for (const star of stars) { ctx.fillStyle = 'rgba(205,221,224,' + (0.12 + star[2]*0.4) + ')'; ctx.fillRect(star[0]*w, star[1]*h, 0.5+star[2], 0.5+star[2]); }
      ctx.save(); ctx.translate(w/2, h/2); ctx.rotate(-state.roll);
      ctx.globalCompositeOperation = 'screen';
      const halo = ctx.createRadialGradient(0,0,r*0.9,0,0,r*1.9);
      halo.addColorStop(0, 'rgba(255,218,185,0)'); halo.addColorStop(0.18,'rgba(255,216,185,0.23)'); halo.addColorStop(1,'rgba(255,198,154,0)');
      ctx.fillStyle=halo; ctx.fillRect(-r*2,-r*2,r*4,r*4);
      ctx.globalAlpha=1-Math.exp(-state.glow);
      for (let i=0;i<65;i++) {
        const rr=r*(1.03+i*0.006); ctx.beginPath(); ctx.ellipse(0,0,rr,rr,0,0,Math.PI*2);
        ctx.strokeStyle='rgba(255,230,207,'+(0.12+0.38*Math.exp(-i/17))+')'; ctx.lineWidth=1.5; ctx.stroke();
      }
      const flat=0.035+Math.sin(state.angle*Math.PI/180)*0.72;
      for (let i=0;i<110;i++) {
        const rr=r*(1.03+i*0.022); ctx.beginPath(); ctx.ellipse(0,0,rr,rr*flat,0,0,Math.PI*2);
        const flicker=0.5+0.5*Math.sin(i*2.73+state.time/(0.9+i*0.1));
        ctx.strokeStyle='rgba(255,'+Math.round(179+65*Math.exp(-i/50))+',170,'+(Math.exp(-i/34)*(0.22+flicker*0.48))+')'; ctx.lineWidth=1.4; ctx.stroke();
      }
      ctx.restore();
    }, dispose() {}
  };
}
