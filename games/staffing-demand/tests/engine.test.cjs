'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Game, STAGES, DIFFICULTIES, CONFIG } = require('../dist/engine.js');

function runFor(game, seconds, input = {}) {
  let left = seconds;
  while (left > 1e-9) {
    const dt = Math.min(left, 1 / 60);
    game.step(dt, typeof input === 'function' ? input(game.state) : input);
    left -= dt;
  }
}

function until(game, condition, input = {}, maxSeconds = 30) {
  for (let n = 0; n < Math.ceil(maxSeconds * 60); n += 1) {
    if (condition(game.state)) return;
    game.step(1 / 60, typeof input === 'function' ? input(game.state) : input);
  }
  assert.ok(condition(game.state), `condition not reached: ${game.state.stage}/${game.state.phase}`);
}

function attackTarget(s) {
  const next = s.document.items.find(item => !item.collected);
  return next ? {targetX: next.x, targetY: next.y} : {targetX: s.barrier.targetX};
}

function reachSubmission(game) {
  until(game, s => s.phase === 'submit', s => {
    if (s.phase === 'caucus' || s.phase === 'minutes') game.continueNegotiation();
    return attackTarget(s);
  }, 65);
  assert.equal(game.state.document.collected, true);
  assert.equal(game.state.barrier.hp, 0);
  assert.equal(game.state.bullets.length, 0);
}

function submitSuccessfully(game) {
  until(game, s => Math.abs(s.player.x - s.window.x) < 1, s => ({ targetX: s.window.x }));
  assert.equal(game.submit(), true);
  until(game, s => s.phase === 'stageClear' || s.phase === 'adopted');
}

function enterStage(game, stage) {
  while (game.state.stage < stage) {
    reachSubmission(game);
    submitSuccessfully(game);
    assert.equal(game.advanceStage(), true);
  }
}

for (const difficulty of Object.keys(DIFFICULTIES)) {
  test(`${difficulty}: all three stages, deliberate miss and submission-only retry`, () => {
    const game = new Game({ difficulty, tutorial: false });
    game.start();
    for (let stage = 0; stage < 3; stage += 1) {
      assert.equal(game.state.stage, stage);
      assert.equal(game.state.document.collected, false);
      assert.equal(game.state.barrier.hp, DIFFICULTIES[difficulty].barrierHp);
      reachSubmission(game);
      if (stage === 0) {
        until(game, s => s.player.x < 34, { targetX: 28 });
        assert.ok(Math.abs(game.state.player.x - game.state.window.x) > game.state.window.width / 2);
        assert.equal(game.submit(), true);
        assert.equal(game.submit(), false, 'held/repeated submission cannot duplicate an in-flight request');
        until(game, s => s.phase === 'submit');
        assert.equal(game.state.misses, 1);
        assert.equal(game.state.document.collected, true);
        assert.equal(game.state.barrier.hp, 0);
        assert.equal(game.state.bullets.length, 0);
      }
      submitSuccessfully(game);
      if (stage < 2) {
        assert.equal(game.state.phase, 'stageClear');
        const time = game.state.elapsed;
        runFor(game, 2, { axis: 1 });
        assert.equal(game.state.elapsed, time);
        assert.equal(game.advanceStage(), true);
      }
    }
    assert.equal(game.state.phase, 'adopted');
    assert.equal(game.advanceStage(), false);
    const result = game.getResults();
    assert.equal(result.completed, true);
    assert.equal(result.difficulty, difficulty);
    assert.equal(result.attempts, 4);
    assert.equal(result.misses, 1);
    assert.equal(result.hits, result.stageHits.reduce((a, b) => a + b, 0));
    assert.ok(result.elapsed > 0);
    const frozen = JSON.stringify(game.state);
    runFor(game, 3, { axis: -1 });
    assert.equal(JSON.stringify(game.state), frozen);
    const events = game.drainEvents();
    assert.equal(events.filter(e => e.type === 'stageSuccess').length, 2);
    assert.equal(events.filter(e => e.type === 'adopted').length, 1);
    assert.equal(game.drainEvents().length, 0);
  });
}

test('four tutorial checkpoints freeze simulation and never submit automatically', () => {
  const game = new Game({ tutorial: true });
  game.start();
  const guides = [];
  for (const expected of ['move', 'document', 'barrier', 'submit']) {
    until(game, s => s.phase === 'guide', attackTarget);
    assert.equal(game.state.guide.id, expected);
    guides.push(game.state.guide.id);
    const frozen = JSON.stringify(game.state);
    runFor(game, 4, { axis: 1 });
    assert.equal(JSON.stringify(game.state), frozen);
    assert.equal(game.submit(), false);
    assert.equal(game.continueGuide(), true);
  }
  assert.deepEqual(guides, ['move', 'document', 'barrier', 'submit']);
  assert.equal(game.state.phase, 'submit');
  assert.equal(game.state.attempts, 0);
});

test('skipping tutorial resumes from current checkpoint and suppresses later checkpoints', () => {
  const game = new Game({ tutorial: true });
  game.start();
  game.continueGuide();
  until(game, s => s.phase === 'guide');
  assert.equal(game.state.guide.id, 'document');
  assert.equal(game.skipTutorial(), true);
  reachSubmission(game);
  assert.equal(game.state.tutorial, false);
  assert.equal(game.state.guide, null);
  assert.equal(game.state.attempts, 0);
});

test('uncollected documents persist and time has no deadline beyond three minutes', () => {
  const game = new Game({ tutorial: false });
  game.start();
  runFor(game, 205, { targetX: 30 });
  assert.equal(game.state.phase, 'collect');
  assert.equal(game.state.document.visible, true);
  assert.equal(game.state.document.collected, false);
  assert.equal(game.state.barrier.hp, DIFFICULTIES.normal.barrierHp, 'normal fire cannot bypass documents');
  assert.ok(game.state.elapsed > 204.99);
  assert.ok(game.state.bullets.length <= 48);
  assert.ok(game.state.shots.length < 10);
});

test('a real idle player can get hit repeatedly and still continue', () => {
  const game = new Game({ tutorial: false });
  game.start();
  runFor(game, 28);
  assert.ok(game.state.hits >= 2);
  assert.equal(game.state.phase, 'collect');
  reachSubmission(game);
  assert.equal(game.state.document.collected, true);
});

test('edge injection: overlapping bullets count once during invulnerability', () => {
  const game = new Game({ tutorial: false });
  game.start();
  const bullet = () => ({ x: game.state.player.x, y: CONFIG.playerY, r: 6, vx: 0, vy: 1 });
  game.state.bullets.push(bullet(), bullet(), bullet());
  game.step(1 / 60);
  assert.equal(game.state.hits, 1);
  runFor(game, 0.25);
  game.state.bullets.push(bullet());
  game.step(1 / 60);
  assert.equal(game.state.hits, 1);
  runFor(game, 1.1);
  game.state.bullets.push(bullet());
  game.step(1 / 60);
  assert.equal(game.state.hits, 2);
  assert.equal(game.state.phase, 'collect');
});

test('pause freezes state and resuming accepts only newly supplied movement', () => {
  const game = new Game({ tutorial: false });
  game.start();
  until(game, s => s.phase === 'break', attackTarget);
  assert.equal(game.pause('テスト中断'), true);
  const frozen = JSON.stringify(game.state);
  runFor(game, 10, { axis: 1 });
  assert.equal(JSON.stringify(game.state), frozen);
  assert.equal(game.submit(), false);
  assert.equal(game.resume(), true);
  const x = game.state.player.x;
  runFor(game, 0.1);
  assert.equal(game.state.player.x, x);
  assert.equal(game.state.document.collected, true);
});

test('relative movement targets and keyboard share speed cap, and release stops', () => {
  const pointer = new Game({ tutorial: false });
  const keyboard = new Game({ tutorial: false });
  pointer.start(); keyboard.start();
  pointer.step(0.2, { targetX: 10000 });
  keyboard.step(0.2, { axis: 1 });
  assert.ok(Math.abs(pointer.state.player.x - keyboard.state.player.x) < 1e-9);
  const x = pointer.state.player.x;
  pointer.step(0.2, { targetX: null, axis: 0 });
  assert.equal(pointer.state.player.x, x);
  assert.ok(Math.abs(x - (240 + CONFIG.playerSpeed * 0.2)) < 1e-8);
});

test('submission window stays available without rebuilding the barrier', () => {
  const game = new Game({ tutorial: false });
  game.start();
  reachSubmission(game);
  const hits = game.state.hits;
  const time = game.state.elapsed;
  runFor(game, 185);
  assert.equal(game.state.phase, 'submit');
  assert.equal(game.state.document.collected, true);
  assert.equal(game.state.barrier.hp, 0);
  assert.equal(game.state.bullets.length, 0);
  assert.equal(game.state.hits, hits);
  assert.ok(game.state.elapsed - time > 184.99);
  submitSuccessfully(game);
});

test('aimed shots retain their locked target after player moves', () => {
  const game = new Game({ tutorial: false });
  game.start();
  enterStage(game, 1);
  game.continueNegotiation();
  until(game, s => s.telegraphs.some(t => t.kind === 'aim'));
  assert.equal(game.state.telegraphs[0].kind, 'aim');
  const targetX = game.state.telegraphs[0].targetX;
  until(game, s => s.bullets.length > 0, { targetX: 440 });
  const shot = game.state.bullets[0];
  const projectedX = shot.x + (CONFIG.playerY - shot.y) / shot.vy * shot.vx;
  assert.ok(Math.abs(projectedX - targetX) < 1e-7);
  const vx = shot.vx;
  runFor(game, 0.3, { targetX: 30 });
  assert.equal(shot.vx, vx);
});

test('each attack pattern at every difficulty has a real bullet-free recovery interval', () => {
  for (const difficulty of Object.keys(DIFFICULTIES)) {
    for (let stage = 0; stage < 3; stage += 1) {
      const game = new Game({ difficulty, tutorial: false });
      game.start();
      enterStage(game, stage);
      if (game.state.phase === 'caucus') game.continueNegotiation();
      let currentRecovery = 0;
      let longestRecovery = 0;
      const waveSides = new Set();
      runFor(game, 25, s => {
        if (s.stageElapsed > 6 && s.attackPhase === 'rest' && s.bullets.length === 0) {
          currentRecovery += 1 / 60;
          longestRecovery = Math.max(longestRecovery, currentRecovery);
        } else {
          currentRecovery = 0;
        }
        for (const warning of s.telegraphs) if (warning.side) waveSides.add(warning.side);
        return { targetX: CONFIG.playerMargin, targetY: CONFIG.playerBottom };
      });
      const nearestTrip = Math.min(...game.state.document.items.map(item =>
        Math.hypot(item.x - CONFIG.playerMargin, item.y - CONFIG.playerBottom) / CONFIG.playerSpeed));
      assert.ok(longestRecovery > nearestTrip,
        `${difficulty}, stage ${stage + 1}: need enough time to fly to the nearest paper`);
      if (stage === 2) assert.deepEqual([...waveSides].sort(), ['left', 'right']);
    }
  }
});

test('difficulty settings alter actual projectile speed and burst count', () => {
  const speeds = [];
  const counts = [];
  for (const difficulty of Object.keys(DIFFICULTIES)) {
    const game = new Game({ difficulty, tutorial: false });
    game.start();
    until(game, s => s.bullets.some(b => b.kind === 'lanes'), { targetX: 30 });
    speeds.push(game.state.bullets[0].vy);
    runFor(game, 0.65, { targetX: 30 });
    counts.push(game.state.bullets.length);
  }
  assert.ok(speeds[0] < speeds[1] && speeds[1] < speeds[2]);
  assert.ok(counts[0] < counts[1] && counts[1] < counts[2]);
});

test('edge injection: ranking depends on hits only, never time or misses', () => {
  const game = new Game({ tutorial: false });
  game.start();
  for (const [hits, rank] of [[0, 'S'], [1, 'A'], [4, 'A'], [5, 'B'], [12, 'B'], [13, 'C'], [500, 'C']]) {
    game.state.hits = hits;
    game.state.elapsed = 10;
    const a = game.getResults().rank;
    game.state.elapsed = 100000;
    game.state.misses = 100;
    assert.equal(a, rank);
    assert.equal(game.getResults().rank, rank);
  }
});

test('restart resets the entire run and requires fresh manual submission', () => {
  const game = new Game({ tutorial: false });
  game.start();
  enterStage(game, 2);
  reachSubmission(game);
  submitSuccessfully(game);
  game.start();
  assert.equal(game.state.stage, 0);
  assert.equal(game.state.phase, 'collect');
  assert.equal(game.state.hits, 0);
  assert.equal(game.state.elapsed, 0);
  assert.equal(game.state.attempts, 0);
  assert.equal(game.state.misses, 0);
  assert.deepEqual(game.state.stageHits, [0, 0, 0]);
  assert.equal(game.state.document.collected, false);
  assert.equal(game.submit(), false);
});


test('normal and hard require alignment, and each argument opens the next weak point', () => {
  for (const difficulty of ['normal','hard']) {
    const game = new Game({ difficulty, tutorial:false });
    game.start();
    until(game, s => s.phase === 'break', attackTarget);
    const maxHp = game.state.barrier.hp;
    runFor(game, 10, {targetX: 450});
    assert.equal(game.state.barrier.hp, maxHp);
    const first = game.state.barrier.targetX;
    until(game, s => s.barrier.section === 1, {targetX: first});
    assert.notEqual(game.state.barrier.targetX, first);
    const afterFirst = game.state.barrier.hp;
    runFor(game, 5, {targetX:first});
    assert.equal(game.state.barrier.hp, afterFirst);
    reachSubmission(game);
    assert.equal(game.drainEvents().filter(event => event.type === 'pointCleared').length, 2);
  }
});

test('hard-mode follow-up telegraphs its lock before firing a non-homing fan', () => {
  const game = new Game({ difficulty:'hard', tutorial:false });
  game.start();
  until(game, s => s.attackCycle > 0 && s.telegraphs.some(t => t.kind === 'aim'));
  const warning = game.state.telegraphs.find(t => t.kind === 'aim');
  assert.ok(warning.remaining > 0.56);
  runFor(game, .62, {targetX:30});
  assert.deepEqual(game.state.bullets.filter(b => b.kind === 'aim').map(b=>b.targetX), warning.targets);
});

test('submissions cannot start during combat, pause or either success screen', () => {
  const game = new Game({ tutorial:false });
  game.start(); assert.equal(game.submit(),false);
  reachSubmission(game); game.pause(); assert.equal(game.submit(),false); game.resume();
  submitSuccessfully(game); assert.equal(game.submit(),false);
});

test('hard corridor ammunition is confined to combat and leaves an accessible gap', () => {
  const game = new Game({difficulty:'hard', tutorial:false});
  game.start();
  until(game, s => s.telegraphs.some(t => t.kind === 'corridor'), attackTarget);
  const s = game.state;
  assert.equal(s.phase, 'break');
  assert.equal(s.bullets.length, 0);
  const firstGap = s.telegraphs[0].gapX;
  assert.ok(s.telegraphs[0].remaining > .49);
  until(game, s => s.bullets.some(b => b.kind === 'corridor'), attackTarget);
  assert.ok(s.bullets.every(b => Math.abs(b.x-firstGap) >= 53));
  reachSubmission(game);
  assert.deepEqual(s.bullets, []);
  assert.deepEqual(s.telegraphs, []);
});

test('actual damage draws ten distinct remarks per deck without a boundary repeat', () => {
  const game = new Game({tutorial:false});
  game.start();
  const lines = [];
  for (let i = 0; i < 31; i++) {
    const s = game.state;
    s.invulnerable = 0;
    const bullet = {x:s.player.x, y:s.player.y, vx:0, vy:1, r:6};
    s.bullets.push({...bullet}, {...bullet});
    game.step(1/60);
    const hits = game.drainEvents().filter(e => e.type === 'hit');
    assert.equal(hits.length, 1);
    assert.equal(hits[0].line, s.hitLine);
    assert.equal(hits[0].hits, i + 1);
    assert.ok(s.hitLine.length > 0);
    lines.push(s.hitLine);
  }
  for (const start of [0, 10, 20]) {
    assert.equal(new Set(lines.slice(start, start + 10)).size, 10);
    assert.notEqual(lines[start + 9], lines[start + 10]);
  }
  const last = game.state.hitLine;
  game.pause(); game.step(4); assert.equal(game.state.hitLine, last);
  game.resume(); runFor(game, 2.7, {targetX:30}); assert.equal(game.state.hitLine, '');
  game.start(); assert.equal(game.state.hits, 0); assert.equal(game.state.hitLine, '');
});

test('first objection fires three shots at the originally telegraphed position', () => {
  for (const difficulty of Object.keys(DIFFICULTIES)) {
    const game = new Game({difficulty, tutorial:false});
    game.start();
    until(game, s => s.telegraphs.length > 0, {targetX:30});
    const lock = game.state.telegraphs[0].targetX;
    assert.equal(game.state.telegraphs[0].kind, 'aim');
    until(game, s => s.bullets.length === 3, {targetX:300});
    assert.ok(game.state.bullets.every(b => b.targetX === lock));
  }
});

test('the caucus suspends the clock and the two staffing waves exchange sides', () => {
  for (const difficulty of Object.keys(DIFFICULTIES)) {
    const game = new Game({difficulty,tutorial:false});
    game.start(); enterStage(game, 1);
    const s = game.state, clock = s.elapsed;
    assert.equal(s.phase, 'caucus');
    game.step(9); assert.equal(s.elapsed, clock);
    assert.equal(game.submit(), false);
    assert.equal(game.continueNegotiation(), true);
    assert.equal(game.continueNegotiation(), false);
    until(game, s => s.telegraphs.length);
    const left = s.telegraphs[0].lanes;
    assert.ok(left.filter(x => x < CONFIG.width / 2).length > left.filter(x => x > CONFIG.width / 2).length);
    until(game, s => s.telegraphs.some(t => t.side === 'right'));
    assert.deepEqual(s.telegraphs[0].lanes, left.map(x => CONFIG.width - x));
  }
});

test('minutes freeze hazards, then require exactly three warned waves before submission', () => {
  const game = new Game({tutorial:false});
  game.start(); enterStage(game, 2);
  until(game, s => s.phase === 'minutes', attackTarget, 60);
  const s = game.state, clock = s.elapsed;
  game.step(10); assert.equal(s.elapsed,clock); assert.equal(s.bullets.length,0);
  assert.equal(game.submit(),false);
  game.continueNegotiation();
  const questions = new Map();
  until(game, s => s.phase === 'submit', s => {
    assert.equal(s.phase, 'questions'); assert.equal(game.submit(),false);
    if (s.telegraphs[0]) questions.set(s.cue, s.telegraphs[0].kind);
    return {axis:0};
  });
  assert.deepEqual([...questions.values()], ['corridor','corridor','corridor']);
  assert.deepEqual([...questions.keys()].map(q => q.slice(0,2)), ['いつ','誰が','何人']);
  assert.equal(s.bullets.length,0); assert.equal(s.telegraphs.length,0);
  assert.equal(game.continueNegotiation(),false);
  until(game, s => s.player.x < 40, {targetX:30});
  game.submit(); until(game,s => s.phase === 'submit');
  assert.equal(game.drainEvents().filter(e => e.type === 'minutesRecorded').length,1);
});

test('free flight shares a speed cap on both axes, including diagonals and touch targets', () => {
  for (const controls of [{axis:1, axisY:-1}, {targetX:440, targetY:330}]) {
    const g = new Game({tutorial:false}); g.start();
    g.step(.2, controls);
    const {x,y} = g.state.player;
    assert.ok(x > 240 && y < CONFIG.playerY);
    assert.ok(Math.abs(Math.hypot(x-240,y-CONFIG.playerY)-CONFIG.playerSpeed*.2) < 1e-7);
    g.step(.2, {}); assert.deepEqual([g.state.player.x, g.state.player.y],[x,y]);
    g.step(2,{axisY:-1}); assert.equal(g.state.player.y,CONFIG.playerTop);
    g.step(2,{targetY:9999}); assert.equal(g.state.player.y,CONFIG.playerBottom);
    g.step(2,{targetY:CONFIG.playerTop+12}); assert.equal(g.state.player.y,CONFIG.playerTop+12);
    g.pause(); g.step(1,{axisY:1}); assert.equal(g.state.player.y,CONFIG.playerTop+12);
  }
});

test('picking up evidence requires contact in both dimensions', () => {
  const g = new Game({tutorial:false}); g.start();
  const s = g.state;
  const {x,y}=s.document.items[0];
  runFor(g,4,{targetX:x,targetY:CONFIG.playerTop});
  assert.equal(s.document.visible,true); assert.equal(s.document.collected,false);
  until(g,s=>s.document.count === 1,{targetX:x,targetY:y});
  assert.ok(Math.hypot(s.player.x-x,s.player.y-y) <= CONFIG.documentPickupRadius);
});

test('aim warnings and bullets retain both coordinates of the original lock', () => {
  const g = new Game({tutorial:false}); g.start();
  until(g,s=>s.telegraphs.some(t=>t.kind==='aim'),{targetX:134,targetY:330});
  const {targetX,targetY}=g.state.telegraphs[0];
  assert.equal(targetY,330); assert.equal(targetX,134);
  until(g,s=>s.bullets.length>0,{targetX:360,targetY:565});
  const b=g.state.bullets[0];
  assert.ok(Math.abs(b.x+(targetY-b.y)*b.vx/b.vy-targetX) < 1e-7);
});

test('shots, enemy hits and the submitted paper use the current flight position', () => {
  const g = new Game({tutorial:false}); g.start();
  const s=g.state;
  g.step(.5,{axisY:-1});
  assert.ok(s.shots.some(shot=>shot.y<CONFIG.playerY-100));
  const y=s.player.y;
  s.bullets.push({x:s.player.x,y:CONFIG.playerY,r:6,vx:0,vy:1});
  g.step(.01); assert.equal(s.hits,0);
  s.bullets.push({x:s.player.x,y,r:6,vx:0,vy:1});
  g.step(.01); assert.equal(s.hits,1);
  runFor(g,1,{targetY:CONFIG.playerY});
  reachSubmission(g);
  until(g, s=>s.player.y===CONFIG.playerTop && Math.abs(s.player.x-s.window.x)<1,
    s=>({targetX:s.window.x,targetY:CONFIG.playerTop}));
  assert.equal(g.submit(),true); assert.equal(s.demand.y,CONFIG.playerTop-24);
  until(g,s=>s.phase==='stageClear');
});

test('all papers are separated, reachable, persistent, and unlock the barrier only as a set', () => {
  for (const [difficulty,total] of [['easy',2],['normal',3],['hard',4]]) {
    for (const roll of [.01,.5,.99]) {
      const g = new Game({difficulty, tutorial:false, random:() => roll}); g.start();
      for (let stage = 0; stage < 3; stage++) {
        if (g.state.phase === 'caucus') g.continueNegotiation();
        const {document: pack,barrier} = g.state;
        assert.equal(pack.items.length,total);
        until(g,s => s.document.visible);
        assert.equal(barrier.weak,false);
        for (const [i,item] of pack.items.entries()) {
          assert.ok(item.x >= CONFIG.playerMargin && item.x <= CONFIG.width - CONFIG.playerMargin);
          assert.ok(item.y >= CONFIG.playerTop && item.y <= CONFIG.playerBottom);
          assert.ok(item.label);
          for (const other of pack.items.slice(i+1)) {
            assert.ok(Math.hypot(item.x-other.x,item.y-other.y) > 85);
          }
        }
        const depths = pack.items.map(p => p.y);
        assert.ok(Math.max(...depths) - Math.min(...depths) >= [0,0,90,175,220][total]);
        const last = pack.items.findLast(item => !item.collected);
        until(g,() => last.collected,{targetX:last.x,targetY:last.y});
        assert.ok(pack.count < total); assert.equal(barrier.weak,false);
        const before = pack.count;
        runFor(g,1); assert.equal(pack.count,before);
        reachSubmission(g);
        const collected=g.drainEvents().filter(e => e.type === 'docCollected' && e.stage === stage);
        assert.deepEqual(collected.map(e=>e.count),Array.from({length:total},(_,i)=>i+1));
        assert.equal(barrier.weak,true);
        if (stage < 2) {submitSuccessfully(g);g.advanceStage();}
      }
    }
  }
});

test('replaying a stage can change paper positions', () => {
  let roll = .05;
  const g = new Game({tutorial:false, random:() => roll});
  g.start(); const first = g.state.document.items;
  roll=.95; g.start();
  assert.notDeepEqual(g.state.document.items,first);
});

test('every final curtain has a survivable route, and harder settings put more bullets on screen', () => {
  const peakCounts=[];
  for (const difficulty of ['easy','normal','hard']) {
    const g=new Game({difficulty,tutorial:false,random:() => .5}); g.start(); enterStage(g,2);
    until(g,s=>s.phase === 'minutes',attackTarget,60);
    g.continueNegotiation();
    const s=g.state, hits=s.hits, targets=[], waves=new Set();
    let peak=0, lastRow;
    until(g,s=>s.phase === 'submit',s=>{
      const warning=s.telegraphs[0];
      if (warning && s.bullets.some(b=>b.kind === 'finale')) {
        peak=Math.max(peak,s.bullets.length); waves.add(s.attackCycle);
      }
      // Remember the safe spot shown at the muzzle and meet that row at the plane.
      if (warning && (lastRow !== warning.gapX || !targets.length)) {
        const speed = {easy:187,normal:232,hard:286}[difficulty];
        targets.push({at:s.elapsed+warning.remaining+(s.player.y-CONFIG.bulletSpawnY)/speed,x:warning.gapX});
        lastRow=warning.gapX;
      }
      while(targets.length>1 && targets[1].at<s.elapsed+.08) targets.shift();
      return targets.length?{targetX:targets[0].x}:{};
    },40);
    assert.equal(s.hits,hits,`${difficulty} has a no-damage final route`);
    assert.equal(waves.size,3); assert.ok(peak>20);
    assert.equal(s.attempts,2);
    peakCounts.push(peak);
  }
  assert.ok(peakCounts[0] < peakCounts[1] && peakCounts[1] < peakCounts[2]);
});
