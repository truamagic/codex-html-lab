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
  return { targetX: s.document.collected ? s.barrier.targetX : s.document.x };
}

function reachSubmission(game) {
  until(game, s => s.phase === 'submit', attackTarget);
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
  until(game, s => s.phase === 'break', s => ({ targetX: s.document.x }));
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
  until(game, s => s.telegraphs.length > 0);
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
        return { targetX: s.document.x < 240 ? 440 : 30 };
      });
      const longestTripToDocument = Math.max(STAGES[stage].documentX - CONFIG.playerMargin,
        CONFIG.width - CONFIG.playerMargin - STAGES[stage].documentX) / CONFIG.playerSpeed;
      assert.ok(longestRecovery > longestTripToDocument,
        `${difficulty}, stage ${stage + 1}: recovery ${longestRecovery} must allow document trip ${longestTripToDocument}`);
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
    until(game, s => s.bullets.length > 0, { targetX: 30 });
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
  until(game, s => s.telegraphs.some(t => t.kind === 'aim'));
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

test('hard v1.1 has a no-damage route through all three stages using only legal inputs', () => {
  // Deterministic reference run. Each pair is [movement axis, number of 40 ms input frames].
  const inputRuns = [
    [1, 10], [0.5, 1], [0, 55], [-0.5, 1], [-1, 17], [-0.5, 1], [0, 2], [0.5, 1], [-0.5, 1],
    [0, 2], [0.5, 1], [-0.5, 1], [0, 2], [0.5, 1], [-0.5, 1], [0, 2], [0.5, 1], [-0.5, 1],
    [0, 2], [1, 13], [-1, 3], [0, 1], [0.5, 1], [1, 5], [-1, 19], [-0.5, 1], [0, 8],
    [1, 20], [0, 1], [-0.5, 1], [-1, 2], [-0.5, 1], [0.5, 1], [0, 1], [-1, 3], [0.5, 2],
    [-0.5, 1], [-1, 3], [1, 1], [0, 1], [-1, 3], [0, 1], [0.5, 1], [-0.5, 1], [-1, 2],
    [-0.5, 1], [0.5, 1], [0, 1], [-1, 8], [0, 48], [0.5, 1], [1, 5], [0, 1], [-0.5, 1],
    [-1, 2], [-0.5, 1], [0.5, 1], [0, 1], [1, 3], [0.5, 1], [-0.5, 1], [0.5, 1], [0, 1],
    [-1, 3], [0.5, 2], [-1, 3], [0, 3], [-1, 2], [-0.5, 1], [0, 1], [1, 23], [0.5, 1],
    [0, 28], [-1, 10], [0, 1], [0.5, 1], [1, 2], [0.5, 1], [-0.5, 1], [0, 1], [1, 3],
    [-0.5, 2], [0.5, 1], [1, 3], [-1, 1], [0, 1], [1, 3], [0, 1], [-0.5, 1], [0.5, 1],
    [0, 36], [-1, 13], [0, 16], [1, 2], [0, 1], [-0.5, 1], [0.5, 1], [1, 2], [0.5, 1],
    [0, 1], [-1, 1], [1, 3], [0.5, 1], [-0.5, 1], [0, 1], [1, 3], [-0.5, 2], [1, 3],
    [0, 3], [1, 2], [0.5, 1], [0, 1], [-1, 14], [0, 42], [0.5, 1], [1, 4], [-1, 2],
    [-0.5, 1], [0, 21], [-1, 11], [0, 70], [1, 3], [0, 1], [-0.5, 1], [0, 1], [0.5, 1],
    [0, 1], [-0.5, 1], [0, 1], [0.5, 1], [0, 1], [-0.5, 1], [0, 1], [0.5, 1], [0, 1],
    [-0.5, 1], [0, 1], [0.5, 1], [0, 1], [-0.5, 1], [0, 1], [0.5, 1], [1, 18], [0.5, 1],
    [0, 21], [-0.5, 1], [-1, 12], [-0.5, 1], [0.5, 1], [1, 2], [0, 2], [1, 3], [-0.5, 1],
    [0.5, 1], [1, 3], [-0.5, 1], [0, 1], [1, 3], [-0.5, 1], [0.5, 1], [-1, 3], [0, 2],
    [-1, 3], [0.5, 1], [0, 1], [-1, 3], [0.5, 1], [-0.5, 1], [-1, 2], [-0.5, 1], [0.5, 1],
    [1, 12], [0.5, 1], [0, 36], [-1, 7], [-0.5, 1], [-1, 2], [-0.5, 1], [1, 1], [0, 2],
    [1, 2], [0.5, 1], [0, 1], [0.5, 1], [1, 2], [0.5, 1], [-0.5, 1], [0.5, 1], [1, 2],
    [0.5, 1], [-0.5, 1], [-1, 2], [-0.5, 1], [0, 1], [-1, 3], [0.5, 1], [0, 1], [-1, 3],
    [0.5, 1], [-0.5, 1], [-1, 2], [-0.5, 1], [0.5, 1], [-0.5, 1], [-1, 8], [-0.5, 1], [0, 39],
    [0.5, 1], [1, 7], [-0.5, 1], [-1, 3], [0.5, 1], [0, 1], [-1, 3], [0.5, 1], [0, 1],
    [-1, 2], [0, 13], [0.5, 1], [1, 1], [0.5, 1], [0, 1], [0.5, 1], [1, 2], [0.5, 1],
    [-1, 1], [1, 3], [0.5, 1], [-1, 1], [1, 8], [0.5, 1], [0, 39], [-0.5, 1], [-1, 7],
    [0.5, 1], [1, 2], [0.5, 1], [-0.5, 1], [0.5, 1], [1, 2], [0.5, 1], [0, 1], [0.5, 1],
    [1, 1], [0.5, 1], [0, 13], [-1, 2], [0, 1], [0.5, 1], [-1, 3], [0, 2], [-1, 8],
    [0, 22], [1, 10], [0.5, 1], [0, 70], [-1, 4], [0, 1], [-0.5, 2], [1, 1], [0, 1],
    [-0.5, 2], [1, 1], [0, 1], [-0.5, 2], [1, 1], [0, 1], [-0.5, 2], [1, 1], [0, 1],
    [-0.5, 1], [-1, 18], [-0.5, 1], [0, 7], [0.5, 1], [1, 19], [0, 1], [-1, 3], [0.5, 1],
    [-0.5, 1], [-1, 2], [0, 1], [-0.5, 1], [-1, 2], [-0.5, 1], [0, 1], [0.5, 1], [1, 2],
    [0.5, 1], [0, 1], [1, 2], [0.5, 1], [0, 1], [1, 2], [0.5, 1], [0, 1], [1, 3],
    [-0.5, 1], [-1, 2], [-0.5, 1], [0, 1], [-0.5, 1], [-1, 2], [0, 1], [-0.5, 1], [-1, 2],
    [0, 1], [-0.5, 1], [-1, 2], [-0.5, 1], [0, 1], [-1, 11], [-0.5, 1], [0, 31], [1, 9],
    [0, 1], [-1, 3], [0.5, 1], [-1, 3], [0, 1], [-0.5, 1], [-1, 2], [0, 1], [-0.5, 1],
    [1, 3], [0, 1], [0.5, 1], [1, 2], [0.5, 1], [0, 1], [1, 2], [0.5, 1], [-0.5, 1],
    [1, 3], [0, 1], [-1, 1], [1, 2], [-0.5, 1], [0, 1], [-1, 2], [-0.5, 1], [0, 1],
    [-1, 2], [-0.5, 1], [0, 1], [-1, 3], [0.5, 1], [1, 20], [0.5, 1], [0, 15], [-0.5, 1],
    [-1, 15], [0, 1], [1, 3], [-0.5, 1], [0.5, 1], [1, 2], [0, 1], [0.5, 1], [1, 2],
    [0.5, 1], [0, 1], [-0.5, 1], [-1, 2], [-0.5, 1], [0, 1], [-1, 2], [-0.5, 1], [0, 1],
    [-1, 2], [-0.5, 1], [0, 1], [-1, 3], [0.5, 1], [1, 2], [0.5, 1], [0, 1], [0.5, 1],
    [1, 2], [0, 1], [0.5, 1], [1, 2], [0, 1], [0.5, 1], [1, 2], [0.5, 1], [0, 1],
    [1, 7], [0.5, 1], [0, 35], [-1, 9], [0, 1], [1, 2], [-1, 2], [-0.5, 1], [1, 2],
    [0.5, 1], [0, 1], [1, 3], [-0.5, 1], [-1, 2], [-0.5, 1], [0, 1], [-0.5, 1], [-1, 2],
    [0, 1], [-0.5, 1], [-1, 2], [0, 1], [-0.5, 1], [-1, 2], [-0.5, 1], [0, 1], [0.5, 1],
    [1, 2], [0.5, 1], [0, 1], [1, 2], [0.5, 1], [0, 1], [1, 2], [0.5, 1], [0, 1],
    [1, 3], [-0.5, 1], [-1, 14], [0, 29], [1, 9], [0, 1], [-1, 3], [0.5, 1], [-0.5, 1],
    [-1, 2], [0, 1], [-0.5, 1], [-1, 2], [-0.5, 1], [0, 1], [0.5, 1], [1, 2], [0.5, 1],
    [0, 1], [1, 2], [0.5, 1], [0, 1], [1, 2], [0.5, 1], [0, 1], [1, 3], [-0.5, 1],
    [-1, 2], [-0.5, 1], [0, 1], [-0.5, 1], [-1, 2], [0, 1], [-0.5, 1], [-1, 2], [0, 1],
    [-0.5, 1], [-1, 2], [-0.5, 1], [0, 1], [-1, 1], [0, 34], [1, 13], [0.5, 1], [0, 21],

  ];
  const game = new Game({difficulty:'hard', tutorial:false});
  game.start();
  for (const [axis, count] of inputRuns) {
    for (let frame = 0; frame < count; frame++) {
      const s = game.state;
      if (s.phase === 'stageClear') game.advanceStage();
      if (s.phase === 'submit' && Math.abs(s.window.x - s.player.x) < 10) game.submit();
      game.step(.04, {axis});
    }
  }
  assert.equal(game.getResults().completed, true);
  assert.deepEqual(game.state.stageHits, [0, 0, 0]);
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
