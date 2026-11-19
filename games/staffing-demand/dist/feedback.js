(() => {
  'use strict';

  const prefix = 'union-arcade.v1.';
  const volatile = new Map();
  function read(key) {
    try { return localStorage.getItem(prefix + key) ?? volatile.get(key); }
    catch { return volatile.get(key); }
  }
  function write(key, value) {
    volatile.set(key, value);
    try { localStorage.setItem(prefix + key, value); } catch { /* Session memory is sufficient in private mode. */ }
  }

  const recordKey = difficulty => difficulty === 'hard' ? 'best.hard.1.1' : 'best.' + difficulty;
  function best(difficulty) {
    const raw = read(recordKey(difficulty));
    if (!raw || !/^\d+$/.test(raw)) return null;
    const n = Number(raw);
    return Number.isSafeInteger(n) ? n : null;
  }
  function finish(result) {
    if (!result.completed) return false;
    const before = best(result.difficulty);
    if (before !== null && before <= result.hits) return false;
    write(recordKey(result.difficulty), String(result.hits));
    return true;
  }

  let enabled = read('sound') !== 'off', context, output;
  let nextBeat = 0, beat = 0;
  function unlock() {
    if (!enabled) return;
    try {
      if (!context) {
        const Audio = window.AudioContext || window.webkitAudioContext;
        if (!Audio) return;
        context = new Audio(); output = context.createGain();
        output.gain.value = 0.52; output.connect(context.destination);
      }
      if (context.state === 'suspended') context.resume().catch(() => {});
    } catch { /* Gameplay works without audio. */ }
  }
  function toggle() {
    enabled = !enabled; write('sound', enabled ? 'on' : 'off');
    if (enabled) unlock();
    if (output) output.gain.setTargetAtTime(enabled ? .52 : 0, context.currentTime, .01);
    return enabled;
  }
  function note(hz, duration, type, volume, delay = 0) {
    if (!enabled || !context || context.state !== 'running') return;
    const t = context.currentTime + delay;
    const source = context.createOscillator(), gain = context.createGain();
    source.type = type; source.frequency.value = hz;
    gain.gain.setValueAtTime(.0001, t); gain.gain.exponentialRampToValueAtTime(volume, t+.009);
    gain.gain.exponentialRampToValueAtTime(.0001, t+duration);
    source.connect(gain); gain.connect(output); source.start(t); source.stop(t+duration+.01);
    source.onended = () => { source.disconnect(); gain.disconnect(); };
  }
  const tunes = {
    started:[330,494,660], docCollected:[523,659,784], pointCleared:[587,784],
    barrierBroken:[392,494,587,784], submitted:[523,784], submitMiss:[294,220],
    stageSuccess:[440,554,659,880], adopted:[392,494,587,784,988,1175], hit:[164,98]
  };
  function cue(name) {
    const pitches = tunes[name];
    if (!pitches) return;
    pitches.forEach((hz,i) => note(hz, name === 'adopted' ? .34 : .16,
      name === 'hit' ? 'sawtooth' : 'triangle', name === 'hit' ? .10 : .22, i*.078));
  }
  const melody = [0,7,12,0, 3,10,7,0, 5,12,7,0, 10,7,3,0];
  function music(active, stage) {
    if (!enabled || !context || context.state !== 'running') return;
    if (!active) { nextBeat = 0; beat = 0; return; }
    if (context.currentTime < nextBeat) return;
    nextBeat = context.currentTime + [.235,.218,.204][stage];
    const base = [146.83,164.81,174.61][stage];
    if (beat % 4 === 0) note(base/2, .32, 'triangle', .09);
    if (beat % 4 !== 3) note(base*2*Math.pow(2,melody[beat]/12), .12, 'triangle', .037);
    beat = (beat+1)%16;
  }

  window.ArcadeFeedback = { best, finish, unlock, toggle, cue, music, get enabled() { return enabled; } };
})();
