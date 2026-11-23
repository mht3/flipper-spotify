// Decode the same stock u8g2 glyphs that canvas.c selects on the handheld.
// Coordinates are 128 × 64 LCD pixels. Text anchors are firmware baselines.
import {fontData} from './lcd-fonts.js';

function readFont(encoded) {
  const bytes = Uint8Array.from(atob(encoded), char => char.charCodeAt(0));
  const glyphs = new Map();
  for (let offset = 23; bytes[offset + 1]; offset += bytes[offset + 1]) {
    let bit = (offset + 2) * 8;
    function read(count) {
      let value = 0;
      for (let i = 0; i < count; i++, bit++) {
        value |= ((bytes[bit >> 3] >> (bit & 7)) & 1) << i;
      }
      return value;
    }
    const signed = count => read(count) - (1 << (count - 1));
    const width = read(bytes[4]), height = read(bytes[5]);
    const x = signed(bytes[6]), top = -height - signed(bytes[7]);
    const advance = signed(bytes[8]);
    const runs = [];
    let pixel = 0;
    while (pixel < width * height) {
      const blanks = read(bytes[2]), filled = read(bytes[3]);
      do {
        pixel += blanks;
        let left = filled;
        while (left > 0) {
          const col = pixel % width;
          const length = Math.min(left, width - col);
          runs.push([x + col, top + Math.floor(pixel / width), length]);
          pixel += length;
          left -= length;
        }
      } while (read(1));
    }
    glyphs.set(String.fromCharCode(bytes[offset]), {width, x, advance, runs});
  }
  return glyphs;
}

const fonts = Object.fromEntries(Object.entries(fontData).map(([name,data]) => [name,readFont(data)]));

export function textWidth(value, font = 'secondary') {
  let width = 0, last;
  for (const char of String(value)) {
    const glyph = fonts[font].get(char);
    if (glyph) { width += glyph.advance; last = glyph; }
  }
  return last?.width ? width - last.advance + last.x + last.width : width;
}

export function text(ctx, value, x, baseline, font = 'secondary', align = 'left') {
  let pen = Math.round(x);
  if (align === 'center') pen -= Math.floor(textWidth(value,font) / 2);
  if (align === 'right') pen -= textWidth(value,font);
  for (const char of String(value)) {
    const glyph = fonts[font].get(char);
    if (!glyph) continue;
    for (const [dx,dy,length] of glyph.runs) ctx.fillRect(pen + dx, Math.round(baseline) + dy, length, 1);
    pen += glyph.advance;
  }
}

const icons = {
  left: ['...#','..##','.###','####','.###','..##','...#'],
  right: ['#...','##..','###.','####','###.','##..','#...'],
  center: ['..###..','.#...#.','#.###.#','#.###.#','#.###.#','.#...#.','..###..'],
};

export function button(ctx, side, label) {
  const icon = icons[side];
  const padding = side === 'center' ? 1 : 3;
  const w = textWidth(label) + 2 * padding + icon[0].length + 3;
  const x = side === 'left' ? 0 : side === 'right' ? 128 - w : Math.floor((128 - w)/2);
  ctx.fillRect(x,52,w,12);
  for (let i=0; i<3; i++) {
    if (side !== 'left') ctx.fillRect(x-i-1,52+i,1,12-i);
    if (side !== 'right') ctx.fillRect(x+w+i,52+i,1,12-i);
  }
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  const iconX = side === 'right' ? 121 : x + padding;
  icon.forEach((row,dy) => {
    for (let dx=0; dx<row.length; dx++) if (row[dx]==='#') ctx.fillRect(iconX+dx,54+dy,1,1);
  });
  text(ctx,label,side==='right' ? x+padding : iconX+icon[0].length+3,61);
  ctx.restore();
}

export function submenu(ctx, title, labels, selected = 0) {
  ctx.save();
  ctx.beginPath(); ctx.rect(4,0,86,14); ctx.clip();
  text(ctx,title,4,11,'primary');
  ctx.restore();
  const first = Math.max(0,Math.min(selected-1,labels.length-3));
  labels.slice(first,first+3).forEach((label,i) => {
    const y=16+i*16;
    ctx.save();
    if (selected===first+i) {
      ctx.fillRect(1,y+1,121,14);
      ctx.fillRect(0,y+2,123,12);
      ctx.globalCompositeOperation='destination-out';
    }
    if (textWidth(label)>112) {
      while (label && textWidth(label+'...')>112) label=label.slice(0,-1);
      label+='...';
    }
    text(ctx,label,6,y+12);
    ctx.restore();
  });
  for (let y=16;y<64;y+=2) ctx.fillRect(126,y,1,1);
  if (labels.length) ctx.fillRect(125,16+Math.floor(48*selected/labels.length),3,Math.max(1,Math.floor(48/labels.length)));
}

// u8g2 draws the four corners with its integer midpoint circle algorithm.
export function rounded(ctx, x, y, width, height, radius, solid = false) {
  const rows = Array.from({length:height}, () => new Set());
  const point = (dx,dy) => {
    for (const [a,b] of [[dx,dy],[dy,dx]]) {
      for (const row of [radius-b,height-1-radius+b]) {
        rows[row].add(radius-a);
        rows[row].add(width-1-radius+a);
      }
    }
  };
  let dx=0, dy=radius, error=1-radius;
  point(dx,dy);
  while (dx<dy) {
    if (error>=0) { dy--; error-=2*dy; }
    dx++;
    error+=2*dx+1;
    point(dx,dy);
  }
  for (let i=0;i<height;i++) {
    if (i>=radius && i<height-radius) { rows[i].add(0); rows[i].add(width-1); }
    if (i===0 || i===height-1) for(let col=radius;col<width-radius;col++) rows[i].add(col);
    if (solid) {
      const left=Math.min(...rows[i]), right=Math.max(...rows[i]);
      ctx.fillRect(x+left,y+i,right-left+1,1);
    } else {
      for (const col of rows[i]) ctx.fillRect(x+col,y+i,1,1);
    }
  }
}

export function drawBattery(ctx, charging = false, y = 1, charge = 84) {
  ctx.save();
  ctx.fillStyle = '#432a14';
  rounded(ctx,99,y,24,8,2);
  ctx.fillRect(124,y+3,1,2);
  ctx.fillRect(100,y+1,Math.round(22*charge/100),6);
  ctx.globalCompositeOperation='xor';
  text(ctx,charge+'%',111,y+7,'tiny','center');
  ctx.globalCompositeOperation='source-over';
  if (charging) {
    for (const [dx,dy] of [[3,0],[2,1],[1,2],[1,3],[0,4],[1,4],[2,4],[3,4],[2,5],[2,6],[1,7]]) {
      ctx.fillRect(94+dx,y+dy,1,1);
    }
  }
  ctx.restore();
}

// gui_redraw_fullscreen_battery leaves an occupied corner to the current view.
export function overlayBattery(ctx) {
  const region=ctx.getImageData(94,1,31,8).data;
  for(let i=3;i<region.length;i+=4) if(region[i]) return;
  drawBattery(ctx);
}

