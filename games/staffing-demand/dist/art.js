(function () {
  "use strict";

  const W = 480;
  const H = 600;
  const C = {
    room: "#112f35",
    deep: "#0c242a",
    wall: "#173b42",
    desk: "#17424a",
    deskTop: "#315e65",
    mint: "#83e5ca",
    mintDark: "#306e63",
    paper: "#fffdf3",
    paperShade: "#d8e7df",
    ink: "#173d42",
    muted: "#9eb9ba",
    coral: "#fa8f7e",
    seal: "#e66652",
    skin: "#e6bfa6",
    suit: "#345763",
    line: "#43666b"
  };
  const FONT = '"Noto Sans JP", "Yu Gothic", "Hiragino Kaku Gothic ProN", sans-serif';

  function value(n, fallback) {
    return typeof n === "number" && Number.isFinite(n) ? n : fallback;
  }

  function clamp(n, lo, hi) {
    return Math.max(lo, Math.min(hi, n));
  }

  function rounded(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function circle(ctx, x, y, radius, fill) {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
  }

  function label(ctx, text, x, y, size, color, align) {
    ctx.font = "500 " + size + "px " + FONT;
    ctx.textAlign = align || "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  function strokeLine(ctx, x1, y1, x2, y2, color, width) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  }

  const skies = [
    ['#27264e', '#b96e77', '#2c345b', '#161d36'],
    ['#11263f', '#449c9e', '#224058', '#141d34'],
    ['#29224a', '#926eaa', '#383457', '#1a1934']
  ];

  // Rasterize the stationary board once per stage; traces and sprites remain live.
  const roomCache = [];
  function drawRoom(ctx, stage) {
    if (!roomCache[stage]) {
      const tile = document.createElement('canvas');
      tile.width = W; tile.height = H;
      const g = tile.getContext('2d'), colors = skies[stage];
      const sky = g.createLinearGradient(0, 0, 0, 126);
      sky.addColorStop(0, colors[0]); sky.addColorStop(1, colors[1]);
      g.fillStyle = sky; g.fillRect(0, 0, W, 139);
      g.fillStyle = stage === 1 ? '#b1dec9' : '#dda485';
      g.fillRect(371, 23, 25, 33); g.fillRect(367, 27, 33, 25);
      for (let n = 0; n < 31; n++) {
        const x = (n * 59 + stage * 15) % W, y = (n * 37 + 6) % 81;
        g.fillStyle = '#f3dec2'; g.fillRect(x, y, 2, 2);
      }
      for (let n = 0; n < 18; n++) {
        const x = n * 29 - 8, y = 66 + (n * 29 + stage * 21) % 39;
        g.fillStyle = colors[2]; g.fillRect(x, y, 26, 138 - y);
        g.fillRect(x + 5, y - 5, 17, 6);
        g.fillStyle = '#eac599';
        for (let h = y + 6; h < 132; h += 9) {
          for (let w = 4; w < 24; w += 7) if ((n + h + w) % 4 !== 0) g.fillRect(x + w, h, 3, 3);
        }
      }
      g.fillStyle = '#111a30';
      for (const x of [8, 110, 366, 467]) g.fillRect(x, 0, 4, 138);
      g.fillRect(0, 58, W, 3); g.fillRect(0, 132, W, 8);
      const floor = g.createLinearGradient(0, 140, 0, H);
      floor.addColorStop(0, colors[3]); floor.addColorStop(1, '#101c34');
      g.fillStyle = floor; g.fillRect(0, 140, W, 460);
      for (let i = -6; i <= 6; i++) strokeLine(g, 240 + 42*i, 143, 240 + 77*i, H, '#27304a', 1);
      for (const y of [198, 224, 257, 297, 346, 406, 476, 562]) strokeLine(g, 0, y, W, y, '#263147', 1);
      g.fillStyle = '#71dbc50d'; g.fillRect(0, 512, W, 39);
      g.setLineDash([4,8]); strokeLine(g, 0, 530, W, 530, '#70b6ba4a', 1); g.setLineDash([]);
      for (let x = 10; x < W; x += 12) g.fillRect(x, 584, 5, 2);
      roomCache[stage] = tile;
    }
    ctx.drawImage(roomCache[stage], 0, 0);
  }

  function drawDirector(ctx, closed) {
    ctx.save();

    rounded(ctx, 202, 10, 76, 91, 18);
    ctx.fillStyle = "#153037";
    ctx.fill();
    ctx.strokeStyle = "rgba(174,205,201,0.20)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    rounded(ctx, 208, 62, 64, 45, 17);
    ctx.fillStyle = C.suit;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(231, 63);
    ctx.lineTo(240, 91);
    ctx.lineTo(249, 63);
    ctx.closePath();
    ctx.fillStyle = C.paperShade;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(238, 69);
    ctx.lineTo(243, 69);
    ctx.lineTo(245, 87);
    ctx.lineTo(240, 93);
    ctx.lineTo(236, 87);
    ctx.closePath();
    ctx.fillStyle = "#25443f";
    ctx.fill();

    circle(ctx, 240, 43, 19, C.skin);
    ctx.beginPath();
    ctx.moveTo(221, 42);
    ctx.quadraticCurveTo(217, 20, 240, 21);
    ctx.quadraticCurveTo(261, 20, 259, 42);
    ctx.lineTo(255, 36);
    ctx.quadraticCurveTo(243, 35, 237, 30);
    ctx.quadraticCurveTo(232, 36, 224, 37);
    ctx.closePath();
    ctx.fillStyle = "#293d41";
    ctx.fill();
    strokeLine(ctx, 221.5, 34, 223, 43, "#a0a8a3", 3);
    strokeLine(ctx, 258, 33, 257, 43, "#a0a8a3", 3);

    ctx.strokeStyle = "#4a5551";
    ctx.lineWidth = 1.35;
    rounded(ctx, 227, 40, 11, 7, 2);
    ctx.stroke();
    rounded(ctx, 242, 40, 11, 7, 2);
    ctx.stroke();
    strokeLine(ctx, 238, 43, 242, 43, "#4a5551", 1.35);
    circle(ctx, 233, 43.5, 1, "#293b3d");
    circle(ctx, 247, 43.5, 1, "#293b3d");
    ctx.beginPath();
    ctx.moveTo(235, 52);
    ctx.quadraticCurveTo(240, 54, 245, 52);
    ctx.strokeStyle = "#a47762";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.lineCap = "round";
    strokeLine(ctx, 213, 79, 226, 93, C.suit, 11);
    strokeLine(ctx, 267, 79, 255, 93, C.suit, 11);
    rounded(ctx, 226, closed ? 89 : 82, 29, closed ? 6 : 20, 2);
    ctx.fillStyle = C.paper;
    ctx.fill();
    if (!closed) strokeLine(ctx, 231, 88, 249, 88, "#bdcec7", 1.5);
    strokeLine(ctx, 231, 93, 247, 93, "#bdcec7", 1.5);
    circle(ctx, 226, 93, 4.5, C.skin);
    circle(ctx, 255, 93, 4.5, C.skin);

    rounded(ctx, 118, 97, 244, 43, 9);
    ctx.fillStyle = C.desk;
    ctx.fill();
    rounded(ctx, 113, 94, 254, 10, 5);
    ctx.fillStyle = C.deskTop;
    ctx.fill();
    strokeLine(ctx, 130, 135, 350, 135, "rgba(168,207,201,0.15)", 1);
    ctx.restore();
  }

  function drawTelegraphs(ctx, telegraphs) {
    if (!Array.isArray(telegraphs)) return;
    ctx.save();
    for (const t of telegraphs) {
      if (!t) continue;
      const progress = 1 - clamp(value(t.remaining, 1) / Math.max(.001, value(t.total, 1)), 0, 1);
      const alpha = .10 + progress * .07;
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(250,143,126," + (.45 + progress * .4) + ")";
      ctx.fillStyle = "rgba(250,143,126," + alpha + ")";

      if (t.kind === 'corridor') {
        const y = 199, x = t.gapX, next = t.nextX;
        const safe = t.radius - 18;
        ctx.fillStyle = '#80edcd20'; ctx.fillRect(x - safe, y, 2 * safe, 42);
        ctx.strokeStyle = '#a1f5df'; ctx.lineWidth = 2;
        ctx.strokeRect(x - safe, y, 2 * safe, 42);
        label(ctx, '通路', x, y + 13, 14, '#d7fff1');
        if (next !== x) {
          const sign = Math.sign(next - x);
          strokeLine(ctx, x - 8*sign,y+31,x+8*sign,y+31,'#9cebd7',2);
          strokeLine(ctx, x + 8*sign,y+31,x+3*sign,y+26,'#9cebd7',2);
          strokeLine(ctx, x + 8*sign,y+31,x+3*sign,y+36,'#9cebd7',2);
        }
        continue;
      }
      if (Array.isArray(t.lanes)) {
        for (const rawX of t.lanes) {
          const x = value(rawX, NaN);
          if (!Number.isFinite(x)) continue;
          rounded(ctx, x - 20, 190, 40, 370, 9);
          ctx.fill();
          ctx.setLineDash([8, 9]);
          strokeLine(ctx, x, 194, x, 557, "rgba(250,143,126," + (.40 + progress * .35) + ")", 2);
          ctx.setLineDash([]);
          ctx.beginPath();
          ctx.moveTo(x - 8, 203);
          ctx.lineTo(x, 213);
          ctx.lineTo(x + 8, 203);
          ctx.stroke();
        }
      } else if (t.kind === "aim") {
        const fromX = value(t.fromX, 240);
        const fromY = value(t.fromY, 190);
        const targetX = value(t.targetX, 240);
        const targetY = value(t.targetY, 530);
        ctx.setLineDash([7, 8]);
        for (const endX of t.targets || [targetX]) {
          strokeLine(ctx, fromX, fromY, endX, 530, "rgba(255,157,125," + (.55 + progress * .35) + ")", 2);
        }
        ctx.setLineDash([]);
        circle(ctx, targetX, targetY, 19);
        ctx.strokeStyle = C.coral;
        ctx.lineWidth = 2;
        ctx.stroke();
        for (const delta of [-1, 1]) {
          strokeLine(ctx, targetX + delta * 23, targetY, targetX + delta * 28, targetY, C.coral, 2);
          strokeLine(ctx, targetX, targetY + delta * 23, targetX, targetY + delta * 28, C.coral, 2);
        }

      }
    }
    ctx.restore();
  }

  function drawWindow(ctx, win, active, completed) {
    const x = value(win && win.x, 240);
    const y = value(win && win.y, 110);
    const width = Math.max(50, value(win && win.width, 96));
    ctx.save();
    if (active && !completed) {
      ctx.fillStyle = "rgba(131,229,202,0.055)";
      ctx.fillRect(x - width / 2, y + 25, width, 530 - y - 25);
      ctx.setLineDash([4, 10]);
      strokeLine(ctx, x, y + 24, x, 508, "rgba(131,229,202,0.42)", 1.4);
      ctx.setLineDash([]);
      rounded(ctx, x - width / 2 - 5, y - 23, width + 10, 46, 8);
      ctx.strokeStyle = "rgba(131,229,202,0.20)";
      ctx.lineWidth = 4;
      ctx.stroke();
    }
    rounded(ctx, x - width / 2, y - 19, width, 38, 6);
    ctx.fillStyle = active ? "#1b4f48" : C.deep;
    ctx.fill();
    ctx.strokeStyle = active ? C.mint : "#62817e";
    ctx.lineWidth = active ? 2.5 : 1.5;
    ctx.stroke();
    label(ctx, "提出口", x, y + .5, 22, active ? C.paper : "#a4bcb4");
    if (completed) {
      ctx.save();
      ctx.translate(x + width / 2 - 3, y - 13);
      ctx.rotate(.16);
      rounded(ctx, -19, -17, 38, 34, 3);
      ctx.fillStyle = C.paper;
      ctx.fill();
      ctx.strokeStyle = C.seal;
      ctx.lineWidth = 2.4;
      ctx.stroke();
      label(ctx, "済", 0, 0, 24, C.seal);
      ctx.restore();
    }
    ctx.restore();
  }

  function drawBarrier(ctx, barrier) {
    if (!barrier) return;
    const hp = value(barrier.hp, 0);
    if (hp <= 0) return;
    const maxHp = Math.max(.001, value(barrier.maxHp, hp));
    const ratio = clamp(hp / maxHp, 0, 1);
    const y = value(barrier.y, 170);
    const weak = !!barrier.weak;
    ctx.save();
    rounded(ctx, 28, y - 18, 424, 36, 8);
    ctx.fillStyle = weak ? "rgba(101,169,154,0.17)" : "rgba(103,135,144,0.34)";
    ctx.fill();
    ctx.strokeStyle = weak ? "rgba(131,229,202,0.65)" : "#73999e";
    ctx.lineWidth = weak ? 1.5 : 2;
    if (weak) ctx.setLineDash([7, 6]);
    ctx.stroke();
    ctx.setLineDash([]);

    strokeLine(ctx, 38, y - 12, 38 + 404 * ratio, y - 12, weak ? C.mint : "#a7c2c2", 2);
    if (weak) {
      const cracks = [
        [91, -17, 100, -5, 94, 3, 108, 17],
        [168, -17, 158, -5, 170, 5, 164, 17],
        [311, -17, 323, -3, 314, 7, 326, 17],
        [388, -17, 379, -7, 391, 3, 382, 17]
      ];
      const count = 2 + Math.floor((1 - ratio) * 2);
      for (let i = 0; i < count; i++) {
        const p = cracks[i];
        ctx.beginPath();
        ctx.moveTo(p[0], y + p[1]);
        ctx.lineTo(p[2], y + p[3]);
        ctx.lineTo(p[4], y + p[5]);
        ctx.lineTo(p[6], y + p[7]);
        ctx.strokeStyle = "rgba(131,229,202,0.80)";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    } else {
      for (const x of [126, 227, 328]) {
        strokeLine(ctx, x, y - 8, x, y + 12, "rgba(168,200,202,0.18)", 1);
      }
    }
    rounded(ctx, 210, y - 14, 60, 28, 4);
    ctx.fillStyle = C.room;
    ctx.fill();
    label(ctx, "反論", 240, y + 1, 22, weak ? C.mint : C.paperShade);
    ctx.restore();
  }

  function paper(ctx, x, y, width, height, withText) {
    const left = x - width / 2;
    const top = y - height / 2;
    const fold = Math.min(12, width * .2);
    ctx.beginPath();
    ctx.moveTo(left + 3, top);
    ctx.lineTo(left + width - fold, top);
    ctx.lineTo(left + width, top + fold);
    ctx.lineTo(left + width, top + height - 3);
    ctx.quadraticCurveTo(left + width, top + height, left + width - 3, top + height);
    ctx.lineTo(left + 3, top + height);
    ctx.quadraticCurveTo(left, top + height, left, top + height - 3);
    ctx.lineTo(left, top + 3);
    ctx.quadraticCurveTo(left, top, left + 3, top);
    ctx.closePath();
    ctx.fillStyle = C.paper;
    ctx.fill();
    ctx.strokeStyle = "#c2d9d0";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(left + width - fold, top);
    ctx.lineTo(left + width - fold, top + fold);
    ctx.lineTo(left + width, top + fold);
    ctx.closePath();
    ctx.fillStyle = C.paperShade;
    ctx.fill();
    if (withText) {
      label(ctx, "資料", x, y + 5, 21, C.ink);
      strokeLine(ctx, left + 11, top + 14, left + width - fold - 5, top + 14, "#7a9c91", 2);
      strokeLine(ctx, left + 11, top + height - 12, left + width - 11, top + height - 12, "#b1c7bd", 2);
    } else {
      strokeLine(ctx, left + 6, top + 10, left + width - 8, top + 10, "#8aa89b", 1.7);
      strokeLine(ctx, left + 6, top + 16, left + width - 8, top + 16, "#bccfc6", 1.7);
    }
  }

  function drawDocument(ctx, doc, clock) {
    if (!doc || !doc.visible || doc.collected) return;
    const x = doc.x, y = doc.y + Math.sin(clock * 4) * 2;
    ctx.save();
    ctx.fillStyle = '#ffce6a1f'; ctx.fillRect(x - 26, y - 30, 52, 60);
    paper(ctx, x, y, 35, 42, false);
    ctx.fillStyle = '#c87826'; ctx.fillRect(x - 11, y + 5, 19, 7);
    for (const dir of [-1, 1]) {
      strokeLine(ctx, x + dir * 26, y - 30, x + dir * 15, y - 30, '#ffcf64', 3);
      strokeLine(ctx, x + dir * 26, y + 29, x + dir * 15, y + 29, '#ffcf64', 3);
    }
    label(ctx, '資料', x, y - 46, 17, '#ffdc89');
    ctx.restore();
  }

  function drawShots(ctx, shots) {
    if (!Array.isArray(shots)) return;
    ctx.save();
    for (const shot of shots) {
      if (!shot) continue;
      const x = value(shot.x, -30);
      const y = value(shot.y, -30);
      rounded(ctx, x - 3, y - 7, 6, 14, 1.5);
      ctx.fillStyle = C.mint;
      ctx.fill();
      strokeLine(ctx, x - 1, y - 4, x + 1, y - 4, C.paper, 1);
    }
    ctx.restore();
  }

  function drawBullets(ctx, bullets) {
    if (!Array.isArray(bullets)) return;
    ctx.save();
    for (const bullet of bullets) {
      if (!bullet) continue;
      const x = value(bullet.x, -30);
      const y = value(bullet.y, -30);
      const radius = Math.max(1, value(bullet.r, 8));
      circle(ctx, x, y, radius, bullet.kind === 'corridor' ? '#ff946d' : C.coral);
      ctx.strokeStyle = "rgba(255,231,218,0.60)";
      ctx.lineWidth = 1;
      ctx.stroke();
      circle(ctx, x - radius * .24, y - radius * .28, Math.max(1.2, radius * .20), "rgba(255,247,231,0.60)");
    }
    ctx.restore();
  }

  function drawDemand(ctx, demand) {
    if (!demand) return;
    const x = value(demand.x, 240);
    const y = value(demand.y, 400);
    ctx.save();
    paper(ctx, x, y, 31, 41, false);
    circle(ctx, x + 4, y + 9, 5, "rgba(230,102,82,0.88)");
    ctx.restore();
  }

  function polygon(ctx, points, color) {
    ctx.beginPath();
    points.forEach(([x,y], i) => i ? ctx.lineTo(x,y) : ctx.moveTo(x,y));
    ctx.closePath(); ctx.fillStyle = color; ctx.fill();
  }

  function drawPlayer(ctx, player, invulnerable) {
    if (!player) return;
    ctx.save(); ctx.translate(player.x, player.y);
    if (invulnerable > 0) {
      circle(ctx, 0, 0, 29); ctx.strokeStyle = '#ffbb91'; ctx.lineWidth = 2; ctx.stroke();
      ctx.globalAlpha = 0.65 + 0.2 * Math.sin(invulnerable * 15);
    }
    polygon(ctx, [[0,-25],[25,19],[7,14],[2,22],[-2,22],[-6,14],[-25,19]], '#18213a');
    polygon(ctx, [[0,-22],[22,16],[4,11]], '#fff2d2');
    polygon(ctx, [[0,-22],[-22,16],[-4,11]], '#acd3d2');
    polygon(ctx, [[0,-22],[-4,11],[0,19],[4,11]], '#5a869a');
    ctx.fillStyle = '#f29d69'; ctx.fillRect(-4,-10,8,7);
    ctx.fillStyle = '#243350'; ctx.fillRect(-5,-13,10,5); ctx.fillRect(-6,-10,3,5);
    ctx.fillStyle = '#3dbca7'; ctx.fillRect(-6,-3,12,11);
    ctx.fillStyle = '#ffce7b'; ctx.fillRect(4,0,5,7);
    circle(ctx, 0, 0, player.r, '#7ff2da25');
    ctx.lineWidth = 1; ctx.strokeStyle = '#b9fff5'; ctx.stroke();
    circle(ctx, 0, 0, 3, '#fff8ce');
    ctx.restore();
  }

  function drawWeakPoint(ctx, barrier) {
    if (!barrier.weak || barrier.hp <= 0) return;
    const x = barrier.targetX, w = Math.min(442, barrier.width), y = barrier.y;
    ctx.save();
    const gradient = ctx.createLinearGradient(0, y, 0, 530);
    gradient.addColorStop(0, '#ffcf6d27'); gradient.addColorStop(1, '#ffcf6d0b');
    ctx.fillStyle = gradient; ctx.fillRect(x - w/2, y + 15, w, 530-y-15);
    ctx.fillStyle = '#3d3340'; ctx.fillRect(x - w/2, y-15, w, 30);
    ctx.strokeStyle = '#ffd576'; ctx.lineWidth = 2; ctx.strokeRect(x-w/2, y-15, w, 30);
    label(ctx, '弱点', x, y+1, 17, '#ffe5a0');
    ctx.setLineDash([5, 10]);
    for (const edge of [x - w/2, x + w/2]) strokeLine(ctx, edge,y+16,edge,516,'#ffcd7060',1);
    ctx.setLineDash([]);
    const barWidth = 120, barY = y - 28;
    ctx.fillStyle = '#101727'; ctx.fillRect(240-barWidth/2-2, barY-2, barWidth+4, 9);
    const hitsPerPoint = barrier.maxHp/3;
    for (let i=0; i<3; i++) {
      const left = 240-barWidth/2+i*40;
      ctx.fillStyle = '#46465b'; ctx.fillRect(left,barY,37,5);
      ctx.fillStyle = '#ffcc72';
      ctx.fillRect(left,barY,37*clamp((barrier.hp-i*hitsPerPoint)/hitsPerPoint,0,1),5);
    }
    if (barrier.impact > 0) {
      const ix = barrier.impactX;
      strokeLine(ctx, ix-6, y+15, ix+6, y+15, '#fff1ac', 3);
      strokeLine(ctx, ix, y+10, ix, y+21, '#fff1ac', 3);
    }
    ctx.restore();
  }

  function drawStamp(ctx, adopted) {
    ctx.save();
    ctx.translate(240, 300);
    ctx.rotate(-.08);
    rounded(ctx, -91, -45, 182, 90, 9);
    ctx.fillStyle = "rgba(255,253,243,0.96)";
    ctx.fill();
    rounded(ctx, -81, -35, 162, 70, 5);
    ctx.strokeStyle = C.seal;
    ctx.lineWidth = 3;
    ctx.stroke();
    label(ctx, adopted ? "要求採択" : "交渉前進", 0, 0, 31, C.seal);
    ctx.restore();
  }

  function draw(ctx, state, clock) {
    if (!ctx) return;
    const s = state || {};
    const phase = s.phase || "collect";
    const barrier = s.barrier || { hp: 3, maxHp: 3, weak: false, y: 170 };
    const completed = phase === "stageClear" || phase === "adopted";
    const submitActive = phase === "submit" || phase === "submission" ||
      (phase === "guide" && value(barrier.hp, 1) <= 0) || completed;

    ctx.save();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.setLineDash([]);
    ctx.clearRect(0, 0, W, H);
    drawRoom(ctx, s.stage || 0);
    drawTelegraphs(ctx, s.telegraphs);
    if (s.stage === 0 && s.document.collected) {
      for (const [x, unit, answer] of [[14, '病棟・夜勤', '休憩に入れず'], [348, '外来・日勤', '応援を要請']]) {
        ctx.fillStyle = '#dedecd'; ctx.fillRect(x, 40, 118, 48);
        ctx.fillStyle = '#68c5ad'; ctx.fillRect(x, 40, 4, 48);
        label(ctx, unit, x + 59, 54, 13, '#28463e');
        label(ctx, answer, x + 59, 73, 15, '#182b35');
      }
    }
    drawDirector(ctx, phase === 'minutes');
    drawWindow(ctx, s.window, submitActive, completed);
    drawBarrier(ctx, barrier);
    drawWeakPoint(ctx, barrier);
    drawDocument(ctx, s.document, clock);
    drawShots(ctx, s.shots);
    drawBullets(ctx, s.bullets);
    drawDemand(ctx, s.demand);
    drawPlayer(ctx, s.player, Math.max(0, value(s.invulnerable, 0)));
    if (completed) drawStamp(ctx, phase === "adopted");
    ctx.restore();
  }

  globalThis.StaffingArt = Object.freeze({ draw });
})();
