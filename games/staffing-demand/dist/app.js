(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  if (!globalThis.StaffingEngine || !globalThis.StaffingArt) {
    $('menuView').innerHTML = '<div class="error-panel">ゲームの読み込みに失敗しました。ページを再読み込みしてください。</div>';
    return;
  }
  const { Game, STAGES } = globalThis.StaffingEngine;
  const Art = globalThis.StaffingArt;
  const labels = { easy: 'やさしい', normal: 'ふつう', hard: 'むずかしい' };
  const phaseLabels = { guide: '操作ガイド', collect: '資料回収', break: '反論突破', submit: '提出待ち', submission: '提出中', stageClear: '合意成立', adopted: '採択' };
  const feedback = window.ArcadeFeedback;
  const canvas = $('arena'), ctx = canvas.getContext('2d');
  let newBest = false;
  function refreshMenu() {
    const selected = document.querySelector('input[name="difficulty"]:checked').value;
    const remarks = { easy: '広い弱点とゆっくりした弾で、交渉の流れを体験。', normal: '弱点を狙い、弾の切れ目で位置を変えよう。', hard: '資料回収後は動く弾の通路へ。折り返しを読みながら弱点を狙おう。' };
    $('difficultyInfo').textContent = remarks[selected];
    const record = feedback.best(selected);
    $('menuRecord').textContent = record === null ? 'ベスト記録　―' : '最少被弾　' + record + ' 回';
  }
  function soundState() {
    $('soundLabel').textContent = feedback.enabled ? '音あり' : '消音';
    $('soundButton').setAttribute('aria-pressed', String(feedback.enabled));
    $('soundButton').setAttribute('aria-label', feedback.enabled ? 'サウンドをオフにする' : 'サウンドをオンにする');
  }
  $('soundButton').addEventListener('click', () => { feedback.toggle(); soundState(); if (feedback.enabled) feedback.cue('submitted'); });
  document.querySelectorAll('input[name="difficulty"]').forEach(el => el.addEventListener('change', refreshMenu));
  refreshMenu(); soundState();
  const dialog = $('gameDialog');
  const keys = new Set();
  let game = null, mode = 'menu', modalKind = null, lastPhase = null;
  let movePointer = null, lastPointerX = 0, targetX = null, submitArmed = false;
  let helpReturn = null, toastUntil = 0, priorFrame = performance.now(), artClock = 0;
  let lastOrientation = innerWidth > innerHeight;
  let lastHud = '', lastAria = '';
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  function resetInput() {
    keys.clear(); targetX = null; submitArmed = false;
    if (movePointer !== null) {
      try { if ($('moveStrip').hasPointerCapture(movePointer)) $('moveStrip').releasePointerCapture(movePointer); } catch (_) {}
    }
    movePointer = null;
    $('moveStrip').classList.remove('active');
  }
  function resizeCanvas(c, context) {
    const rect = c.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(rect.width * scale), h = Math.round(rect.height * scale);
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    context.setTransform(w / 480, 0, 0, h / 600, 0, 0);
  }
  function closeDialog() { if (dialog.open) dialog.close(); modalKind = null; }
  function showDialog(kind, html) {
    resetInput();
    modalKind = kind;
    $('dialogContent').innerHTML = html;
    if (!dialog.open) dialog.showModal();
    const first = dialog.querySelector('[autofocus], .primary-button, button');
    if (first) first.focus({ preventScroll: true });
  }
  const button = (action, text, primary = false) => `<button type="button" class="${primary ? 'primary-button' : 'secondary-button'}" data-action="${action}">${text}</button>`;
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  function stageData() { return STAGES[game?.state.stage || 0]; }

  function startGame(difficulty, tutorial) {
    closeDialog(); resetInput();
    feedback.unlock(); newBest = false;
    game = new Game({ difficulty, tutorial });
    game.start(); mode = 'play'; lastPhase = null; lastHud = ''; toastUntil = 0;
    $('toast').classList.remove('show');
    $('menuView').hidden = true; $('menuFooter').hidden = true;
    $('gameView').hidden = false; $('pauseButton').hidden = false;
    priorFrame = performance.now(); artClock = 0;
    resizeCanvas(canvas, ctx); updateHud(); syncPhase();
    if (!dialog.open) canvas.focus({ preventScroll: true });
  }
  function toMenu() {
    resetInput(); closeDialog(); game = null; mode = 'menu'; lastPhase = null;
    $('menuView').hidden = false; $('menuFooter').hidden = false;
    $('gameView').hidden = true; $('pauseButton').hidden = true;
    $('startButton').focus({ preventScroll: true });
    refreshMenu();
  }
  function notify(message) {
    $('toast').textContent = message; $('toast').classList.add('show');
    toastUntil = performance.now() + 2400;
  }
  function showGuide() {
    const g = game.state.guide || {};
    const ids = ['move','document','barrier','submit'];
    const index = Math.max(0, ids.indexOf(g.id));
    showDialog('guide', `<div class="dialog-body"><div class="guide-steps" aria-hidden="true">${ids.map((_, i) => `<span class="${i <= index ? 'on' : ''}"></span>`).join('')}</div><p class="dialog-eyebrow">操作ガイド　${index + 1} / 4</p><h2 id="dialogTitle">${esc(g.title)}</h2><p class="dialog-copy">${esc(g.body)}</p><div class="dialog-actions">${button('continueGuide', index === 0 ? '動かしてみる' : 'やってみる', true)}<button class="text-button" type="button" data-action="skipGuide">残りのガイドをスキップ</button></div></div>`);

  }
  function showStageClear() {
    const i = game.state.stage, stage = stageData();
    showDialog('stageClear', `<div class="dialog-body"><div class="success-mark" aria-hidden="true">✓</div><p class="dialog-eyebrow">第${i + 1}段階を通過</p><h2 id="dialogTitle">${i === 0 ? '増員の必要性を確認。' : '費用と効果を確認。'}</h2><p class="dialog-copy">${esc(stage.agreement)}</p><p class="next-stage-note">次の確認：${i === 0 ? '増員に必要な費用と、見込まれる効果。' : '採用後の配置と、受入れの計画。'}</p><div class="dialog-actions">${button('advanceStage', `第${i + 2}段階へ進む`, true)}</div></div>`);
  }
  function showAdoption() {
    showDialog('adopted', `<div class="adoption-body"><p class="adoption-head">3つの条件を確認しました</p><div class="demand-paper"><p class="paper-meta">職員一同からの要求</p><h2 id="dialogTitle">要求書</h2><div class="paper-rule"></div><h3>件名：人員増について</h3><ul class="paper-checks"><li>増員の必要性</li><li>費用と見込まれる効果</li><li>採用・配置・受入れの計画</li></ul><div class="adoption-stamp" aria-label="採択">採択</div><p class="paper-footer">3段階の確認を経て、要求を採択する。</p></div><p class="adoption-line">「必要性と実施条件を確認しました。<br>人員増の要求を採択します。」</p>${button('results', '結果を見る', true)}</div>`);
  }
  function formatTime(seconds) { const n = Math.max(0, Math.floor(seconds)); return `${Math.floor(n / 60)}分${String(n % 60).padStart(2, '0')}秒`; }
  function showResults() {
    const r = game.getResults();
    const comments = { S: '反論を見極め、被弾ゼロで要求を通しました。', A: '根拠をそろえ、落ち着いた交渉で採択へ進みました。', B: '反論を乗り越え、人員増の要求を通しました。', C: '粘り強く資料を届け、最後まで交渉を通しました。' };
    showDialog('results', `<div class="dialog-body"><p class="dialog-eyebrow">交渉結果 / ${esc(labels[r.difficulty] || labels[game.state.difficulty])}</p><div class="results-head"><div><h2 id="dialogTitle">人員増、採択。</h2><span class="stage-clear-label">全3段階クリア${newBest ? ' ・ 自己ベスト記録' : ''}</span></div><div><p class="rank-label">クリア評価</p><div class="result-rank">${esc(r.rank)}</div></div></div><p class="result-summary">${esc(comments[r.rank] || r.comment)}</p><div class="result-stats"><div class="result-stat"><span>被弾回数</span><strong>${r.hits}<small> 回</small></strong></div><div class="result-stat time"><span>プレイ時間（参考）</span><strong>${formatTime(r.elapsed)}</strong></div></div><ul class="stage-stats">${r.stageHits.map((n, i) => `<li>第${i + 1}段階<strong>${n} 回</strong></li>`).join('')}</ul><p class="evaluation-note">評価は被弾回数から算出。時間は参考記録です。<br>S＝0回／A＝1〜4回／B＝5〜12回／C＝13回以上。</p><div class="dialog-actions">${button('retry', '同じ難易度でもう一度', true)}${button('menu', '難易度を選び直す')}</div></div>`);
  }
  function syncPhase() {
    if (!game || mode !== 'play') return;
    const s = game.state;
    if (s.paused) return;
    const stamp = `${s.stage}:${s.phase}:${s.guide?.id || ''}`;
    if (stamp === lastPhase) return;
    lastPhase = stamp; submitArmed = false;
    if (s.phase === 'guide') showGuide();
    else if (s.phase === 'stageClear') showStageClear();
    else if (s.phase === 'adopted') { $('pauseButton').hidden = true; showAdoption(); }
    else if (modalKind === 'guide' || modalKind === 'stageClear') { closeDialog(); canvas.focus({ preventScroll: true }); }
    updateHud();
  }
  function pauseGame(reason = 'いつでも、この場面から再開できます。') {
    if (!game || mode !== 'play' || game.state.phase === 'adopted' || modalKind === 'stageClear') return;
    resetInput(); game.pause(reason);
    showDialog('pause', `<div class="dialog-body"><p class="dialog-eyebrow">交渉を一時停止</p><h2 id="dialogTitle">ひと息つきましょう。</h2><p class="dialog-copy">${esc(reason)}\n資料と進行状況はそのままです。</p><div class="dialog-actions">${button('resume', '交渉を再開する', true)}${button('help', '遊び方を確認する')}<button class="text-button" type="button" data-action="menu">タイトルへ戻る（最初から）</button></div></div>`);
  }
  function resumeGame() {
    resetInput(); closeDialog(); game.resume(); priorFrame = performance.now(); lastPhase = null;
    syncPhase(); if (!dialog.open) canvas.focus({ preventScroll: true });
  }
  function showHelp() {
    helpReturn = { mode, modalKind, wasPaused: !!game?.state.paused };
    if (game && game.state.phase !== 'adopted') game.pause('遊び方を確認中');
    showDialog('help', `<div class="dialog-body"><p class="dialog-eyebrow">遊び方</p><h2 id="dialogTitle">根拠を集めて、採択へ。</h2><ol class="help-list"><li><strong>資料を回収。</strong> 弾の予告を見てよけながら、白い資料に触れます。資料は取るまで残ります。</li><li><strong>反論を突破。</strong> 資料を取ると金色の弱点が開きます。真下に移動し、自動ショットを当てましょう。ふつう以上では弱点が移ります。</li><li><strong>要求書を提出。</strong> 提出口の真下に移動し、提出ボタンを押します。外したら提出だけ再挑戦できます。</li></ol><div class="help-controls"><p><strong>PC：</strong>左右キー／A・Dで移動、Spaceで提出、Escで一時停止。</p><p><strong>スマホ：</strong>盤面の下の操作帯を左右にスライド。指を離すと止まり、右のボタンで提出。</p></div><p class="dialog-copy">3段階を通すと人員増が採択されます。被弾しても交渉は続き、被弾回数がクリア評価に反映されます。</p><div class="dialog-actions">${button('closeHelp', '戻る', true)}</div></div>`);
  }
  function closeHelp() {
    const back = helpReturn; closeDialog(); helpReturn = null;
    if (!game || back?.mode === 'menu') return;
    if (back?.modalKind === 'results') return showResults();
    if (game.state.phase === 'adopted') return showAdoption();
    if (back?.wasPaused || back?.modalKind === 'pause') return pauseGame();
    game.resume(); lastPhase = null; priorFrame = performance.now(); syncPhase();
  }
  function updateHud() {
    if (!game) return;
    const s = game.state, stage = stageData();
    const value = [s.stage,s.phase,s.hits,s.document.collected,s.document.visible,s.barrier.hp,s.paused].join('|');
    if (value === lastHud) return; lastHud = value;
    $('stageCount').textContent = `第${s.stage + 1}段階 / 3`;
    $('stageTitle').textContent = ['必要性を示す','費用と効果を示す','実施計画を示す'][s.stage];
    $('difficultyBadge').textContent = labels[s.difficulty];
    $('hitCount').textContent = s.hits;
    $('directorLine').textContent = stage.objection;
    $('documentTitle').textContent = stage.documentTitle;
    $('documentSummary').textContent = s.document.collected ? stage.documentPoints.join(' ／ ') : stage.documentSummary;
    const corridor = s.phase === 'break' && s.difficulty === 'hard';
    $('stageTactic').textContent = corridor ? ['弾の列に開いた通路が横へ移ります。紙飛行機をその隙間に入れましょう。','通路が途中で折り返します。先走らず、次の列の隙間を見ましょう。','通路が二度折り返します。金色の弱点から一度離れても、与えたダメージは残ります。'][s.stage] : stage.attackHint;
    $('gameView').dataset.phase = s.phase;
    const compact = matchMedia('(max-width:680px) and (max-height:650px)').matches;
    $('mobileDirectorLine').textContent = compact ? ['理事「不足している業務と時間帯は？」','理事「増員の費用と効果を示してください」','理事「採用後の配置と受入れ計画は？」'][s.stage] : `理事「${stage.objection}」`;
    $('mobileDocumentTitle').textContent = stage.documentTitle;
    $('mobileDocumentStatus').textContent = s.document.collected ? '回収済み' : '未回収';
    $('documentStatus').textContent = s.document.collected ? '回収済み' : '未回収';
    $('documentStatus').classList.toggle('collected', s.document.collected);
    document.querySelectorAll('[data-step]').forEach(el => { const i = Number(el.dataset.step); el.classList.toggle('current', i === s.stage); el.classList.toggle('complete', i < s.stage); el.querySelector('.step-number').textContent = i < s.stage ? '✓' : String(i + 1); });
    $('phaseLabel').textContent = phaseLabels[s.phase] || '';
    const ready = s.phase === 'submit' && !s.paused && !dialog.open;
    $('submitButton').disabled = !ready;
    $('submitHint').textContent = s.phase === 'submission' ? '届くまで待とう' : ready ? (innerWidth <= 680 ? 'タップで提出' : 'Spaceでも提出') : '反論突破後';
    const submitted = ['submit','submission'].includes(s.phase) || (s.phase === 'guide' && s.barrier.hp <= 0);
    $('phaseHint').classList.toggle('ready', submitted);
    $('phaseHint').textContent = submitted ? (s.phase === 'submission' ? '要求書を届けています' : '提出口の真下から提出しよう') : s.document.collected ? (corridor ? '弾の隙間を抜け、弱点を狙おう' : s.difficulty === 'easy' ? '自動ショットで反論を崩そう' : '金色の弱点の真下を狙おう') : s.document.visible ? `${stage.documentTitle}を回収` : '予告を見て、弾をよけよう';
    $('attackHint').textContent = s.phase === 'break' ? stage.documentPoints[s.barrier.section] : '';
    $('attackHint').hidden = s.phase !== 'break';
    const aria = `第${s.stage+1}段階。${phaseLabels[s.phase]}。被弾${s.hits}回。資料${s.document.collected ? '回収済み' : '未回収'}。`;
    if (aria !== lastAria) { canvas.setAttribute('aria-label', aria); lastAria = aria; }
  }
  function trySubmit() {
    if (!game || dialog.open || game.state.paused || game.state.phase !== 'submit') return;
    if (game.submit()) { submitArmed = false; lastHud = ''; updateHud(); }
  }
  $('startButton').addEventListener('click', () => startGame(document.querySelector('input[name="difficulty"]:checked').value, $('tutorialToggle').checked));
  $('helpButton').addEventListener('click', () => { if (!dialog.open) showHelp(); });
  $('pauseButton').addEventListener('click', () => pauseGame());
  dialog.addEventListener('cancel', e => { e.preventDefault(); if (modalKind === 'pause') resumeGame(); else if (modalKind === 'help') closeHelp(); });
  dialog.addEventListener('click', e => {
    const b = e.target.closest('[data-action]'); if (!b) return;
    switch (b.dataset.action) {
      case 'continueGuide': closeDialog(); resetInput(); game.continueGuide(); lastPhase = null; syncPhase(); break;
      case 'skipGuide': closeDialog(); resetInput(); game.skipTutorial(); lastPhase = null; syncPhase(); break;
      case 'advanceStage': closeDialog(); resetInput(); game.advanceStage(); lastPhase = null; syncPhase(); break;
      case 'results': showResults(); break;
      case 'resume': resumeGame(); break;
      case 'help': showHelp(); break;
      case 'closeHelp': closeHelp(); break;
      case 'retry': startGame(game.state.difficulty, false); break;
      case 'menu': toMenu(); break;
    }
    lastHud = ''; updateHud();
  });
  const strip = $('moveStrip');
  strip.addEventListener('pointerdown', e => {
    if (e.button !== 0 || movePointer !== null || !game || dialog.open || game.state.paused) return;
    e.preventDefault(); movePointer = e.pointerId; lastPointerX = e.clientX; targetX = game.state.player.x;
    strip.setPointerCapture(e.pointerId); strip.classList.add('active');
  });
  strip.addEventListener('pointermove', e => {
    if (movePointer !== e.pointerId || !game) return;
    e.preventDefault(); const width = canvas.getBoundingClientRect().width;
    targetX = Math.max(18, Math.min(462, targetX + (e.clientX - lastPointerX) * 480 / width));
    lastPointerX = e.clientX;
  });
  function releasePointer(e) { if (e.pointerId !== movePointer) return; movePointer = null; targetX = null; strip.classList.remove('active'); }
  strip.addEventListener('pointerup', releasePointer); strip.addEventListener('pointercancel', releasePointer); strip.addEventListener('lostpointercapture', releasePointer);
  $('submitButton').addEventListener('pointerdown', () => { submitArmed = !!game && !dialog.open && !game.state.paused && game.state.phase === 'submit'; });
  $('submitButton').addEventListener('pointercancel', () => { submitArmed = false; });
  $('submitButton').addEventListener('click', e => { const allowed = submitArmed || e.detail === 0; submitArmed = false; if (allowed) trySubmit(); });
  document.addEventListener('keydown', e => {
    if (mode !== 'play' || !game) return;
    if (e.target.closest('button') && e.code === 'Space' && e.target !== $('submitButton')) return;
    if (e.code === 'Escape') { if (dialog.open) return; e.preventDefault(); if (!e.repeat) pauseGame(); return; }
    if (dialog.open || game.state.paused) return;
    const controlKeys = ['ArrowLeft','ArrowRight','KeyA','KeyD','Space'];
    if (!controlKeys.includes(e.code) && !(e.code === 'Enter' && e.target === $('submitButton'))) return;
    e.preventDefault();
    if (e.repeat || keys.has(e.code)) return;
    keys.add(e.code);
    if (e.code === 'Space' || e.code === 'Enter') trySubmit();
  });
  document.addEventListener('keyup', e => { keys.delete(e.code); });
  window.addEventListener('blur', () => { resetInput(); if (mode === 'play' && game && !dialog.open) pauseGame('画面の操作が中断されたため、一時停止しました。'); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { resetInput(); if (mode === 'play' && game && !dialog.open) pauseGame('別の画面へ移ったため、一時停止しました。'); } priorFrame = performance.now(); });
  window.addEventListener('resize', () => {
    resizeCanvas(canvas, ctx);
    lastHud = '';
    const orientation = innerWidth > innerHeight;
    if (orientation !== lastOrientation && mode === 'play' && !dialog.open) pauseGame('画面の向きが変わったため、一時停止しました。');
    lastOrientation = orientation;
  });
  function frame(now) {
    const rawDt = (now - priorFrame) / 1000; priorFrame = now;
    if (mode === 'play' && game) {
      if (rawDt > 1 && !dialog.open && !game.state.paused) pauseGame('動作が中断されたため、一時停止しました。');
      const dt = Math.max(0, Math.min(rawDt, 1));
      if (!dialog.open && !game.state.paused) {
        const axis = (keys.has('ArrowRight') || keys.has('KeyD') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('KeyA') ? 1 : 0);
        game.step(dt, { axis, targetX });
        artClock += dt;
      }
      feedback.music(!dialog.open && !game.state.paused && ['collect','break'].includes(game.state.phase), game.state.stage);
      for (const event of game.drainEvents()) {
        feedback.cue(event.type);
        if (event.type === 'adopted') newBest = feedback.finish(game.getResults());
        if (event.type === 'docCollected') notify('根拠資料を回収！');
        else if (event.type === 'barrierBroken') notify('反論を突破！ 要求書を提出しよう');
        else if (event.type === 'submitMiss') notify('届きませんでした。位置を合わせて再提出');
        else if (event.type === 'hit') notify('被弾　' + game.state.hits + ' 回');
      }
      syncPhase(); updateHud();
      Art.draw(ctx, game.state, reducedMotion ? 0 : artClock);
      $('stripThumb').style.left = `${game.state.player.x / 480 * 100}%`;
      if (now > toastUntil) { $('toast').classList.remove('show'); if ($('toast').textContent) $('toast').textContent = ''; }
    }
    requestAnimationFrame(frame);
  }
  resizeCanvas(canvas, ctx);
  requestAnimationFrame(frame);
})();
