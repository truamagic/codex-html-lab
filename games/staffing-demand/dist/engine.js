(function (root) {
  'use strict';

  const CONFIG = Object.freeze({
    width: 480, height: 600, playerY: 530, playerRadius: 11,
    playerSpeed: 260, playerMargin: 22, playerTop: 238, playerBottom: 570,
    shotSpeed: 560, shotInterval: 0.18, shotRadius: 3,
    barrierY: 170,
    bulletRadius: 6, bulletSpawnY: 138,
    documentSpawnAt: 3.2, documentPickupRadius: 28,
    initialAttackDelay: 1.4, invulnerabilitySeconds: 1,
    submissionSpeed: 460, windowY: 110, windowWidth: 96,
    physicsStep: 1 / 120, maximumFrameSeconds: 30,
    gradeThresholds: Object.freeze({ S: 0, A: 4, B: 12 })
  });

  const DIFFICULTIES = Object.freeze({
    easy: Object.freeze({ id: 'easy', label: 'やさしい', bulletSpeed: 135,
      warningTime: 1.1, burstInterval: 0.28, burstCount: 2, restTime: 2.1, barrierHp: 18, weakWidth: 480 }),
    normal: Object.freeze({ id: 'normal', label: 'ふつう', bulletSpeed: 195,
      warningTime: 0.8, burstInterval: 0.22, burstCount: 3, restTime: 1.35, barrierHp: 27, weakWidth: 148 }),
    hard: Object.freeze({ id: 'hard', label: 'むずかしい', bulletSpeed: 270,
      warningTime: 0.58, burstInterval: 0.16, burstCount: 5, restTime: 1.05, barrierHp: 45, weakWidth: 84 })
  });

  const STAGES = Object.freeze([
    Object.freeze({
      title: '増員の必要性', shortTitle: '必要性',
      objection: 'それは一部の職員の声では？',
      documentTitle: '職場アンケート',
      documentSummary: '病棟と外来が持ち寄った、日勤・夜勤の応援記録と回答。',
      documentPoints: Object.freeze(['業務が集中する時間帯', '担当業務と配置状況', '増員が必要な理由']),
      attackHint: '予告された列を避け、弾が通り過ぎた隙に資料を取りましょう。',
      agreement: '増員の必要性を確認しました。次に費用と効果を検討します。',
      agreementTitle: '必要性を確認', documentX: 350, windowX: 240
    }),
    Object.freeze({
      title: '費用と効果', shortTitle: '費用・効果',
      objection: 'では、期間限定の応援配置でどうでしょう。',
      documentTitle: '費用・効果資料',
      documentSummary: '増員に伴う費用と、見込まれる業務改善を整理した資料。',
      documentPoints: Object.freeze(['増員に必要な費用', '期待する業務改善', '効果を確かめる方法']),
      attackHint: '狙われた位置を確認してから横へ移動。発射後の弾は追尾しません。',
      agreement: '費用と効果を確認しました。予算調整と実施計画を進めましょう。',
      agreementTitle: '費用・効果を確認', documentX: 125, windowX: 160
    }),
    Object.freeze({
      title: '実施計画', shortTitle: '実施計画',
      objection: '採用後の配置と、受入れの計画を確認させてください。',
      documentTitle: '採用・配置計画',
      documentSummary: '採用、配置、受入れまでの進め方を整理した資料。',
      documentPoints: Object.freeze(['採用と配置の進め方', '受入れ・育成の準備', '実施後の確認方法']),
      attackHint: '左右交互の予告を見て、弾が通り過ぎてから次の側へ移動しましょう。',
      agreement: '必要性と実施条件を確認しました。人員増の要求を採択します。',
      agreementTitle: '人員増の要求を採択', documentX: 350, windowX: 320
    })
  ]);

  const GUIDES = Object.freeze({
    move: Object.freeze({ id: 'move', title: 'まずは前後左右に移動',
      body: 'スマホは下のパッドを上下左右にスライド。上で前進、下で後退し、指を離すと止まります。PCは矢印キーかWASD。ショットは自動です。' }),
    document: Object.freeze({ id: 'document', title: '根拠資料を集めよう',
      body: '下側に資料が現れました。弾が通り過ぎた隙に、紙飛行機を資料に重ねましょう。資料は取るまで消えません。' }),
    barrier: Object.freeze({ id: 'barrier', title: '資料で反論が弱まった',
      body: '根拠がそろい、反論の壁にショットが届くようになりました。弾を避けながら、自動ショットで壁を崩しましょう。' }),
    submit: Object.freeze({ id: 'submit', title: '位置を合わせて、要求書を提出',
      body: '提出窓の真下に移動し、提出ボタンかSpaceを押しましょう。外しても資料と突破の成果は残り、提出だけ再挑戦できます。' })
  });

  const HIT_LINES = Object.freeze([
    '何を言いたいのですか？', '根拠はありますか？',
    'その数字、いつのものです？', '「みんな」とは、何人です？',
    'それ、議事録に残しますよ？', '前回もそうおっしゃいましたね。',
    'その「少し」は何人分です？', 'で、予算はどこから？',
    'その資料、何ページです？', '今のは質問ですか、要望ですか？'
  ]);
  const minuteQuestions = ['いつから配置しますか？', '誰が受け入れを担当しますか？', '何人を配置しますか？'];

  const activePhases = new Set(['collect', 'break', 'questions', 'submit', 'submission']);
  const combatPhases = new Set(['collect', 'break', 'questions']);
  const laneXs = [48, 144, 240, 336, 432];
  const lanePatterns = [[0, 2, 4], [1, 3], [0, 1, 3, 4], [0, 2, 4], [1, 2, 3]];
  // Gap coordinates are in player-lane space. Every row travels straight down.
  const challengePatterns = [
    { rows: 6, spacing: .22, speed: 315, radius: 53, shift: 25, rest: .48 },
    { rows: 9, spacing: .19, speed: 345, radius: 47, shift: 27, rest: .37 },
    { rows: 12, spacing: .17, speed: 375, radius: 42, shift: 28, rest: .32 }
  ];
  function corridorRows(stage, start, sign) {
    const spec = challengePatterns[stage];

    let x = start;
    const rows = [x];
    for (let i = 0; i < spec.rows - 1; i++) {
      const reversed = (stage === 1 && i >= 4) || (stage === 2 && i >= 3 && i < 7);
      const relative = reversed ? -1 : 1;
      let next = x + relative * sign * spec.shift;
      if (next < 40 || next > 440) {
        sign *= -1;
        next = x + relative * sign * spec.shift;
      }
      rows.push(next);
      x = next;
    }
    return rows;
  }

  const weakPositions = [[120, 352, 218], [350, 138, 292], [112, 368, 176]];
  function makeBarrier(difficulty, stage) {
    const config = DIFFICULTIES[difficulty];
    return { hp: config.barrierHp, maxHp: config.barrierHp, weak: false, y: CONFIG.barrierY,
      targetX: difficulty === 'easy' ? 240 : weakPositions[stage][0], width: config.weakWidth,
      section: 0, impact: 0, impactX: 240 };
  }
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  class Game {
    constructor(options) {
      options = options || {};
      this._difficulty = Object.prototype.hasOwnProperty.call(DIFFICULTIES, options.difficulty)
        ? options.difficulty : 'normal';
      this._tutorial = options.tutorial !== false;
      this._events = [];
      this._started = false;
      this.state = this._newState();
    }

    _newState() {
      return {
        stage: 0, phase: 'collect', paused: false, pauseReason: '',
        difficulty: this._difficulty, tutorial: this._tutorial, guide: null,
        player: { x: CONFIG.width / 2, y: CONFIG.playerY, r: CONFIG.playerRadius },
        bullets: [], shots: [], telegraphs: [], demand: null,
        document: { x: STAGES[0].documentX, y: CONFIG.playerY, visible: false, collected: false },
        barrier: makeBarrier(this._difficulty, 0),
        window: { x: STAGES[0].windowX, y: CONFIG.windowY, width: CONFIG.windowWidth },
        hits: 0, elapsed: 0, stageElapsed: 0, stageHits: [0, 0, 0], stageTimes: [0, 0, 0],
        attempts: 0, misses: 0, stageAttempts: [0, 0, 0], stageMisses: [0, 0, 0],
        invulnerable: 0, attackPhase: 'rest', attackCycle: 0
      };
    }

    start() {
      this.state = this._newState();
      this._events = [];
      this._started = true;
      this._guideSeen = new Set();
      this._hitDeck = [];
      this._lastHitLine = null;
      this._guideResumePhase = null;
      this._beginStage();
      this._emit('started');
      this._showGuide('move', 'collect');
      return this.state;
    }

    _beginStage() {
      const s = this.state;
      const stage = STAGES[s.stage];
      s.phase = s.stage === 1 ? 'caucus' : 'collect';
      s.hitLine = '';
      s.hitLineUntil = 0;
      s.cue = '';
      s.guide = null;
      s.stageElapsed = 0;
      s.player = { x: CONFIG.width / 2, y: CONFIG.playerY, r: CONFIG.playerRadius };
      s.bullets = [];
      s.shots = [];
      s.telegraphs = [];
      s.demand = null;
      s.document = { x: stage.documentX, y: CONFIG.playerY, visible: false, collected: false };
      s.barrier = makeBarrier(s.difficulty, s.stage);
      s.window = { x: stage.windowX, y: CONFIG.windowY, width: CONFIG.windowWidth };
      s.invulnerable = 0;
      s.attackPhase = 'rest';
      s.attackCycle = 0;
      this._shotClock = 0;
      this._attackAge = s.stage === 1 ? -0.15 : -CONFIG.initialAttackDelay;
      this._cycleIndex = 0;
      this._attack = null;
      this._corridor = null;
      this._corridorClock = 0;
      this._corridorCount = 0;
      this._guideResumePhase = null;
      this._emit('stageStart');
    }

    _emit(type, detail) {
      this._events.push(Object.assign({ type, stage: this.state.stage, at: this.state.elapsed }, detail || {}));
    }

    drainEvents() {
      const events = this._events;
      this._events = [];
      return events;
    }

    _showGuide(id, resumePhase) {
      const s = this.state;
      if (s.stage !== 0 || !s.tutorial || this._guideSeen.has(id)) return false;
      this._guideSeen.add(id);
      this._guideResumePhase = resumePhase;
      s.phase = 'guide';
      s.guide = Object.assign({}, GUIDES[id]);
      if (id === 'barrier' && s.difficulty !== 'easy') {
        s.guide.body = '金色の弱点の真下に入り、自動ショットを当てましょう。根拠を一つ示すたびに、次の弱点が開きます。';
      }
      if (id === 'barrier' && s.difficulty === 'hard') {
        s.guide.body = '弾の列には一つだけ通路があります。緑の枠が次に出る列の通路を予告します。迫ってくる弾の隙間を優先し、金色の弱点の下へ戻って撃ちましょう。';
      }
      this._emit('guide', { id });
      return true;
    }

    continueGuide() {
      const s = this.state;
      if (!this._started || s.phase !== 'guide' || s.paused) return false;
      const id = s.guide.id;
      s.phase = this._guideResumePhase || 'collect';
      s.guide = null;
      this._guideResumePhase = null;
      this._emit('guideClosed', { id });
      return true;
    }

    skipTutorial() {
      const s = this.state;
      if (!this._started || s.paused) return false;
      s.tutorial = false;
      if (s.phase === 'guide') {
        s.phase = this._guideResumePhase || 'collect';
        s.guide = null;
        this._guideResumePhase = null;
      }
      this._emit('tutorialSkipped');
      return true;
    }

    continueNegotiation() {
      const s = this.state;
      if (!this._started || s.paused) return false;
      if (s.phase === 'caucus') {
        s.phase = 'collect';
      } else if (s.phase === 'minutes') {
        s.phase = 'questions';
        this._cycleIndex = 0;
        this._attackAge = 0;
        this._beginAttackCycle();
      } else return false;
      return true;
    }

    _nextHitLine() {
      if (this._hitDeck.length === 0) {
        const deck = HIT_LINES.slice();
        for (let i = deck.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [deck[i], deck[j]] = [deck[j], deck[i]];
        }
        const last = deck.length - 1;
        if (deck[last] === this._lastHitLine) [deck[last], deck[0]] = [deck[0], deck[last]];
        this._hitDeck = deck;
      }
      this._lastHitLine = this._hitDeck.pop();
      return this._lastHitLine;
    }

    pause(reason) {
      if (!this._started || this.state.phase === 'adopted' || this.state.paused) return false;
      this.state.paused = true;
      this.state.pauseReason = reason || '一時停止';
      this._emit('paused');
      return true;
    }

    resume() {
      if (!this._started || !this.state.paused) return false;
      this.state.paused = false;
      this.state.pauseReason = '';
      this._emit('resumed');
      return true;
    }

    step(dt, input) {
      if (!this._started || this.state.paused || !activePhases.has(this.state.phase)) return;
      if (!Number.isFinite(dt) || dt <= 0) return;
      // The browser pauses on focus loss. This guard also bounds accidental huge caller inputs.
      let remaining = Math.min(dt, CONFIG.maximumFrameSeconds);
      const controls = input || {};
      while (remaining > 1e-10 && !this.state.paused && activePhases.has(this.state.phase)) {
        const h = Math.min(remaining, CONFIG.physicsStep);
        this._stepSlice(h, controls);
        remaining -= h;
      }
    }

    _stepSlice(dt, input) {
      const s = this.state;
      s.elapsed += dt;
      s.stageElapsed += dt;
      if (s.hitLine && s.elapsed >= s.hitLineUntil) s.hitLine = '';
      s.invulnerable = Math.max(0, s.invulnerable - dt);
      s.barrier.impact = Math.max(0, s.barrier.impact - dt);

      const limit = CONFIG.playerSpeed * dt;
      const {player} = s;
      const dx = Number.isFinite(input.targetX)
        ? clamp(input.targetX, CONFIG.playerMargin, CONFIG.width - CONFIG.playerMargin) - player.x
        : (Number.isFinite(input.axis) ? clamp(input.axis, -1, 1) : 0) * limit;
      const dy = Number.isFinite(input.targetY)
        ? clamp(input.targetY, CONFIG.playerTop, CONFIG.playerBottom) - player.y
        : (Number.isFinite(input.axisY) ? clamp(input.axisY, -1, 1) : 0) * limit;
      const distance = Math.hypot(dx, dy);
      const fraction = distance > limit ? limit / distance : 1;
      player.x = clamp(player.x + dx * fraction, CONFIG.playerMargin, CONFIG.width - CONFIG.playerMargin);
      player.y = clamp(player.y + dy * fraction, CONFIG.playerTop, CONFIG.playerBottom);

      if (s.phase === 'submission') {
        s.demand.y -= CONFIG.submissionSpeed * dt;
        if (s.demand.y <= s.window.y) this._resolveSubmission();
        return;
      }
      if (s.phase === 'submit') return;
      if (s.phase === 'questions') {
        this._updateAttack(dt);
        this._moveBullets(dt);
        if (this._cycleIndex === 2 && this._attack.nextBurst === this._attack.burstCount && !s.bullets.length) {
          s.phase = 'submit';
          s.cue = '';
          s.telegraphs = [];
          s.attackPhase = 'rest';
          this._emit('minutesRecorded');
        }
        return;
      }

      if (!s.document.visible && !s.document.collected && s.stageElapsed >= CONFIG.documentSpawnAt) {
        s.document.visible = true;
        this._emit('docSpawn');
        if (this._showGuide('document', 'collect')) return;
      }

      if (s.difficulty === 'hard' && s.phase === 'break') this._updateCorridor(dt);
      else this._updateAttack(dt);
      this._moveBullets(dt);

      if (s.document.visible && !s.document.collected &&
          Math.hypot(s.player.x - s.document.x, s.player.y - s.document.y) <= CONFIG.documentPickupRadius) {
        s.document.collected = true;
        s.document.visible = false;
        s.barrier.weak = true;
        s.phase = 'break';
        s.cue = '';
        if (s.difficulty === 'hard') {
          s.telegraphs = [];
          s.attackPhase = s.bullets.length ? 'firing' : 'rest';
        }
        this._emit('docCollected');
        if (this._showGuide('barrier', 'break')) return;
      }

      this._shotClock -= dt;
      while (this._shotClock <= 0) {
        s.shots.push({ x: s.player.x, y: s.player.y - 24, r: CONFIG.shotRadius });
        this._shotClock += CONFIG.shotInterval;
      }
      const survivingShots = [];
      for (const shot of s.shots) {
        shot.y -= CONFIG.shotSpeed * dt;
        if (shot.y <= s.barrier.y + 8) {
          const barrier = s.barrier;
          if (barrier.weak && barrier.hp > 0 && Math.abs(shot.x - barrier.targetX) <= barrier.width / 2) {
            barrier.hp -= 1;
            barrier.impact = 0.12;
            barrier.impactX = shot.x;
            const section = Math.min(2, Math.floor((barrier.maxHp - barrier.hp) * 3 / barrier.maxHp));
            if (section !== barrier.section) {
              barrier.section = section;
              if (s.difficulty !== 'easy') barrier.targetX = weakPositions[s.stage][section];
              this._emit('pointCleared', { section });
            }
          }
        } else if (shot.y >= -20) {
          survivingShots.push(shot);
        }
      }
      s.shots = survivingShots;
      if (s.barrier.weak && s.barrier.hp <= 0) {
        s.barrier.hp = 0;
        s.bullets = [];
        s.shots = [];
        s.telegraphs = [];
        s.attackPhase = 'rest';
        s.phase = s.stage === 2 ? 'minutes' : 'submit';
        s.cue = '';
        this._emit('barrierBroken');
        this._showGuide('submit', 'submit');
      }
    }

    _updateCorridor(dt) {
      const s = this.state, spec = challengePatterns[s.stage];
      s.telegraphs = [];
      if (!this._corridor) {
        // Finish the previous pattern before scheduling the first corridor.
        if (s.bullets.length) { s.attackPhase = 'firing'; return; }
        this._corridorClock -= dt;
        if (this._corridorClock > 0) { s.attackPhase = 'rest'; return; }
        const from = s.player.x;
        const direction = from < 190 ? 1 : from > 290 ? -1 : this._corridorCount % 2 ? -1 : 1;
        const offset = [86, 98, 110][s.stage];
        const first = clamp(from + direction * offset, 42, 438);
        const towardCore = s.barrier.targetX >= first ? 1 : -1;
        this._corridor = { age: 0, row: 0, gaps: corridorRows(s.stage, first, towardCore) };
        this._corridorCount++;
        this._emit('corridorStarted', { number: this._corridorCount });
      }
      const attack = this._corridor;
      attack.age += dt;
      const warning = .52;
      if (attack.row < spec.rows) {
        const until = warning + attack.row * spec.spacing - attack.age;
        s.telegraphs = [{ kind:'corridor', gapX:attack.gaps[attack.row], radius:spec.radius,
          nextX:attack.gaps[Math.min(attack.row+1, spec.rows-1)], remaining:Math.max(0,until),
          total:attack.row === 0 ? warning : spec.spacing }];
        s.attackPhase = 'warning';
        if (until > 0) return;
        const gap = attack.gaps[attack.row++];
        const add = x => s.bullets.push({ x, y:CONFIG.bulletSpawnY, r:7, vx:0, vy:spec.speed, kind:'corridor' });
        for (let x = gap - spec.radius; x >= -8; x -= 24) add(x);
        for (let x = gap + spec.radius; x <= CONFIG.width + 8; x += 24) add(x);
      } else {
        s.attackPhase = 'firing';
        if (!s.bullets.length) {
          this._corridor = null;
          this._corridorClock = spec.rest;
          s.attackPhase = 'rest';
        }
      }
    }

    _beginAttackCycle() {
      const s = this.state;
      const difficulty = DIFFICULTIES[s.difficulty];
      const cycle = {
        kind: s.stage === 0 ? 'lanes' : s.stage === 1 ? 'aim' : 'wave',
        burstCount: difficulty.burstCount, nextBurst: 0, targetX: s.player.x, targetY: s.player.y,
        duration: difficulty.warningTime + (difficulty.burstCount - 1) * difficulty.burstInterval +
          600 / difficulty.bulletSpeed + difficulty.restTime
      };
      const openingQuestion = s.stage === 0 && this._cycleIndex === 0;
      const transfer = s.stage === 1 && this._cycleIndex < 2;
      const minutes = s.phase === 'questions';
      const index = this._cycleIndex;
      s.cue = '';
      if (openingQuestion) {
        cycle.kind = 'aim';
        cycle.targets = [cycle.targetX];
        cycle.burstCount = 3;
      } else if (transfer) {
        cycle.kind = 'wave';
        cycle.side = index === 0 ? 'left' : 'right';
        const lanes = s.difficulty === 'easy' ? [44, 108, 172, 232, 412] : [32, 68, 104, 140, 176, 212, 248, 410];
        cycle.lanes = lanes.map(x => index === 0 ? x : CONFIG.width - x);
        cycle.burstCount = 1;
        if (index === 0) cycle.duration = difficulty.warningTime + 0.38;
        s.cue = index === 0 ? '応援を出す病棟に負担が集中' : '応援元と応援先が交代';
      } else if (minutes) {
        s.cue = minuteQuestions[index];
        cycle.kind = index === 1 ? 'aim' : 'lanes';
        cycle.burstCount = 1;
        if (index === 0) cycle.lanes = [64, 152, 240, 328, 416];
        else if (index === 1) cycle.targets = [cycle.targetX - 48, cycle.targetX, cycle.targetX + 48];
        else cycle.lanes = [32, 62, 92, 176, 206, 236, 320, 350, 380];
        cycle.duration = difficulty.warningTime + 600 / difficulty.bulletSpeed + 0.3;
      } else if (cycle.kind === 'lanes') {
        if (s.difficulty === 'easy') {
          cycle.lanes = lanePatterns[this._cycleIndex % lanePatterns.length].map(i => laneXs[i]);
        } else {
          const spacing = s.difficulty === 'hard' ? 27 : 43;
          const gapWidth = s.difficulty === 'hard' ? 47 : 64;
          const gapX = [111, 335, 183, 390, 245][this._cycleIndex % 5];
          cycle.lanes = [];
          for (let x = 22 + (this._cycleIndex % 2) * 8; x < 480; x += spacing) {
            if (Math.abs(x - gapX) > gapWidth) cycle.lanes.push(x);
          }
        }
      } else if (cycle.kind === 'wave') {
        cycle.side = this._cycleIndex % 2 === 0 ? 'left' : 'right';
        const spacing = s.difficulty === 'hard' ? 26 : s.difficulty === 'normal' ? 39 : 56;
        const end = s.difficulty === 'hard' ? 298 : 224;
        cycle.lanes = [];
        for (let x = 22; x < end; x += spacing) cycle.lanes.push(cycle.side === 'left' ? x : 480 - x);
      }
      if (cycle.kind === 'aim' && !cycle.targets) {
        const offsets = s.difficulty === 'hard' ? [0, -96, -48, 48, 96] : s.difficulty === 'normal' ? [0, -56, 56] : [0];
        cycle.targets = offsets.map(offset => cycle.targetX + offset);
      }
      // A separate, telegraphed aimed reply punishes camping after a hard-mode volley.
      if (s.difficulty === 'hard' && !minutes && !openingQuestion && !transfer) {
        cycle.replyAt = difficulty.warningTime + (difficulty.burstCount - 1) * difficulty.burstInterval + 0.12;
        cycle.duration += 0.95;
      }
      this._attack = cycle;
      s.attackCycle = this._cycleIndex;
    }

    _updateAttack(dt) {
      const s = this.state;
      if (!combatPhases.has(s.phase)) return;
      const difficulty = DIFFICULTIES[s.difficulty];
      this._attackAge += dt;
      if (this._attackAge < 0) {
        s.attackPhase = 'rest';
        s.telegraphs = [];
        return;
      }
      if (!this._attack) this._beginAttackCycle();
      while (this._attackAge >= this._attack.duration && !(s.phase === 'questions' && this._cycleIndex === 2)) {
        this._attackAge -= this._attack.duration;
        this._cycleIndex += 1;
        this._beginAttackCycle();
      }
      const attack = this._attack;
      while (attack.nextBurst < attack.burstCount &&
          this._attackAge + 1e-9 >= difficulty.warningTime + attack.nextBurst * difficulty.burstInterval) {
        this._fireBurst(attack, difficulty);
        attack.nextBurst += 1;
      }
      if (this._attackAge < difficulty.warningTime) {
        const warning = {
          kind: attack.kind, remaining: difficulty.warningTime - this._attackAge,
          total: difficulty.warningTime
        };
        if (attack.kind === 'aim') {
          Object.assign(warning, { fromX: CONFIG.width / 2, fromY: CONFIG.bulletSpawnY,
            targetX: attack.targetX, targets: attack.targets, targetY: attack.targetY });
        } else {
          warning.lanes = attack.lanes.slice();
          if (attack.side) warning.side = attack.side;
        }
        s.telegraphs = [warning];
        s.attackPhase = 'warning';
      } else {
        s.telegraphs = [];
        s.attackPhase = s.bullets.length > 0 || attack.nextBurst < attack.burstCount ? 'firing' : 'rest';
      }
      if (attack.replyAt !== undefined && this._attackAge >= attack.replyAt && !attack.replyFired) {
        if (attack.replyX === undefined) {
          attack.replyX = s.player.x;
          attack.replyY = s.player.y;
        }
        const delay = 0.60;
        const targets = [attack.replyX, attack.replyX - 38, attack.replyX + 38];
        if (this._attackAge < attack.replyAt + delay) {
          s.telegraphs.push({ kind: 'aim', fromX: 240, fromY: CONFIG.bulletSpawnY, targetX: attack.replyX,
            targetY: attack.replyY, targets, total: delay, remaining: attack.replyAt + delay - this._attackAge });
          s.attackPhase = 'warning';
        } else {
          this._fireAimed(targets, attack.replyY, difficulty.bulletSpeed);
          attack.replyFired = true;
        }
      }
    }

    _fireBurst(attack, difficulty) {
      const s = this.state;
      if (attack.kind === 'aim') {
        this._fireAimed(attack.targets, attack.targetY, difficulty.bulletSpeed);
      } else {
        for (const x of attack.lanes) {
          s.bullets.push({ x, y: CONFIG.bulletSpawnY, r: CONFIG.bulletRadius,
            vx: 0, vy: difficulty.bulletSpeed, kind: attack.kind, side: attack.side || null });
        }
      }
    }

    _fireAimed(targets, targetY, speed) {
      for (const targetX of targets) {
        const dx = targetX - CONFIG.width / 2;
        const dy = targetY - CONFIG.bulletSpawnY;
        const length = Math.hypot(dx, dy);
        this.state.bullets.push({ x: CONFIG.width / 2, y: CONFIG.bulletSpawnY, r: CONFIG.bulletRadius,
          vx: dx / length * speed, vy: dy / length * speed, kind: 'aim', targetX });
      }
    }

    _moveBullets(dt) {
      const s = this.state;
      const remaining = [];
      for (const bullet of s.bullets) {
        bullet.x += bullet.vx * dt;
        bullet.y += bullet.vy * dt;
        const hit = Math.hypot(bullet.x - s.player.x, bullet.y - s.player.y) <= bullet.r + s.player.r;
        if (hit) {
          if (s.invulnerable <= 1e-9) {
            s.hits += 1;
            s.stageHits[s.stage] += 1;
            s.invulnerable = CONFIG.invulnerabilitySeconds;
            s.hitLine = this._nextHitLine();
            s.hitLineUntil = s.elapsed + 2.6;
            this._emit('hit', { hits: s.hits, line: s.hitLine });
          }
        } else if (bullet.y <= CONFIG.height + 24 && bullet.x >= -32 && bullet.x <= CONFIG.width + 32) {
          remaining.push(bullet);
        }
      }
      s.bullets = remaining;
    }

    submit() {
      const s = this.state;
      if (!this._started || s.paused || s.phase !== 'submit' || s.demand) return false;
      s.attempts += 1;
      s.stageAttempts[s.stage] += 1;
      s.demand = { x: s.player.x, y: s.player.y - 24, width: 18, height: 24 };
      s.phase = 'submission';
      this._emit('submitted', { x: s.demand.x });
      return true;
    }

    _resolveSubmission() {
      const s = this.state;
      const success = Math.abs(s.demand.x - s.window.x) <= s.window.width / 2;
      s.demand = null;
      if (!success) {
        s.misses += 1;
        s.stageMisses[s.stage] += 1;
        s.phase = 'submit';
        this._emit('submitMiss');
        return;
      }
      s.stageTimes[s.stage] = s.stageElapsed;
      if (s.stage < STAGES.length - 1) {
        s.phase = 'stageClear';
        this._emit('stageSuccess');
      } else {
        s.phase = 'adopted';
        this._emit('adopted');
      }
    }

    advanceStage() {
      const s = this.state;
      if (!this._started || s.paused || s.phase !== 'stageClear' || s.stage >= STAGES.length - 1) return false;
      s.stage += 1;
      this._beginStage();
      return true;
    }

    getResults() {
      const s = this.state;
      const rank = s.hits === 0 ? 'S' : s.hits <= CONFIG.gradeThresholds.A ? 'A'
        : s.hits <= CONFIG.gradeThresholds.B ? 'B' : 'C';
      const comments = {
        S: '反論を見極め、被弾なしで要求を通しました。',
        A: '落ち着いた対応で、要求を通しました。',
        B: '反論を乗り越え、最後まで要求を通しました。',
        C: '粘り強く交渉を重ね、要求を通しました。'
      };
      return {
        completed: s.phase === 'adopted', difficulty: s.difficulty,
        difficultyLabel: DIFFICULTIES[s.difficulty].label,
        hits: s.hits, elapsed: s.elapsed, stageHits: s.stageHits.slice(), stageTimes: s.stageTimes.slice(),
        attempts: s.attempts, misses: s.misses,
        stageAttempts: s.stageAttempts.slice(), stageMisses: s.stageMisses.slice(),
        rank, comment: comments[rank]
      };
    }
  }

  const api = Object.freeze({ Game, STAGES, DIFFICULTIES, CONFIG });
  root.StaffingEngine = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
