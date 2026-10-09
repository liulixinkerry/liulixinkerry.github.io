(() => {
  'use strict';
  document.documentElement.classList.add('js-anim');
  const $ = (id) => document.getElementById(id);
  const esc = (value) =>
    String(value).replace(
      /[&<>"']/g,
      (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch],
    );
  const fmt = (value, digits = 2) =>
    Number(value).toLocaleString('en-US', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
  const REDUCE = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const C = {
    upstream: '#c4c7cc',
    base: '#8a8f98',
    lossless: '#007f79',
    losslessMid: '#86c8c1',
    losslessText: '#006a65',
    approximate: '#c75b23',
    approximateText: '#a8481a',
    ink: '#111418',
    text: '#2f353d',
    muted: '#667085',
    grid: '#ecebe7',
    track: '#dcdad4',
  };
  const AGENTS = { Sol: 'GPT-5.6-sol', Opus: 'Claude-opus-5', Astra: 'GPT-6-astra' };
  const clamp01 = (t) => Math.max(0, Math.min(1, t));
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const text = (x, y, value, attrs = '') => `<text x="${x}" y="${y}" ${attrs}>${esc(value)}</text>`;

  function whenVisible(el, callback, threshold = 0.3) {
    if (!('IntersectionObserver' in window)) return callback();
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          callback();
        }
      },
      { threshold },
    );
    observer.observe(el);
  }
  // Calls back when the element comes back into view after having left it completely.
  function onReturn(el, callback, threshold = 0.5) {
    if (!('IntersectionObserver' in window)) return;
    let away = false;
    new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) away = true;
          else if (away && entry.intersectionRatio >= threshold) {
            away = false;
            callback();
          }
        });
      },
      { threshold: [0, threshold] },
    ).observe(el);
  }
  function tween(ms, onFrame) {
    if (REDUCE) {
      onFrame(1);
      return;
    }
    const start = performance.now();
    const step = (now) => {
      const p = clamp01((now - start) / ms);
      onFrame(p);
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /* ---------- Motivation figure ---------- */
  function initMotivation() {
    const root = $('mot');
    const svg = root.querySelector('svg');
    const boxes = [...svg.querySelectorAll('[data-loop]')];
    const dot = $('m-dot'),
      loopPath = $('m-loop-path'),
      loopLength = loopPath.getTotalLength();
    const node = (attr, i) => svg.querySelector(`[data-${attr}="${i}"]`);
    const links = new Map(
      [...svg.querySelectorAll('[data-link]')].map((el) => [el.dataset.link, el]),
    );
    // WAM × GPU × agent combinations highlighted in turn (indices into each column).
    const combos = [
      [0, 0, 0],
      [1, 1, 1],
      [2, 1, 2],
      [1, 0, 2],
      [0, 1, 1],
      [2, 0, 0],
    ];
    const LOOP_START = 1.8,
      STEP = 0.9,
      COMBO_START = 7.2,
      COMBO_EVERY = 1.6;
    let elapsed = 0,
      last = null,
      running = false,
      visible = false,
      started = false,
      comboShown = null;
    const setLoop = (t) => {
      let index = -1,
        p = null;
      if (t >= LOOP_START) {
        const c = (t - LOOP_START) % (STEP * 4);
        index = Math.floor(c / STEP);
        if (index === 3) p = (c - 3 * STEP) / STEP;
      }
      boxes.forEach((box, i) => box.classList.toggle('on', i === index));
      dot.classList.toggle('on', p !== null);
      if (p !== null) {
        const point = loopPath.getPointAtLength(loopLength * easeInOut(p));
        dot.setAttribute('cx', point.x);
        dot.setAttribute('cy', point.y);
      }
    };
    const setCombo = (index) => {
      if (index === comboShown) return;
      comboShown = index;
      svg.querySelectorAll('.m-node.on, .m-link.on').forEach((el) => el.classList.remove('on'));
      if (index < 0) return;
      const [w, g, a] = combos[index];
      [
        node('w', w),
        node('g', g),
        node('a', a),
        links.get(`w${w}-g${g}`),
        links.get(`g${g}-a${a}`),
      ].forEach((el) => el.classList.add('on'));
    };
    const frame = (now) => {
      if (!running) return;
      if (last !== null) elapsed += (now - last) / 1000;
      last = now;
      setLoop(elapsed);
      setCombo(
        elapsed >= COMBO_START
          ? Math.floor((elapsed - COMBO_START) / COMBO_EVERY) % combos.length
          : -1,
      );
      requestAnimationFrame(frame);
    };
    const pauseButton = $('mot-pause');
    let paused = false;
    const sync = () => {
      const go = started && visible && !paused;
      if (go && !running) {
        running = true;
        last = null;
        requestAnimationFrame(frame);
      } else if (!go) running = false;
    };
    const setPaused = (value) => {
      paused = value;
      root.classList.toggle('paused', paused);
      pauseButton.textContent = paused ? 'Play' : 'Pause';
      sync();
    };
    const play = () => {
      root.classList.remove('play');
      root.classList.add('pending');
      void root.offsetWidth;
      root.classList.remove('pending');
      root.classList.add('play');
      elapsed = 0;
      started = true;
      setLoop(0);
      setCombo(-1);
      setPaused(false);
    };
    if (REDUCE) return;
    root.classList.add('pending');
    const replay = $('mot-replay');
    replay.hidden = false;
    pauseButton.hidden = false;
    replay.addEventListener('click', play);
    pauseButton.addEventListener('click', () => (started ? setPaused(!paused) : play()));
    if ('IntersectionObserver' in window) {
      new IntersectionObserver((entries) => {
        visible = entries.some((entry) => entry.isIntersecting);
        sync();
      }).observe(root);
    } else visible = true;
    whenVisible(root, play, 0.35);
  }

  /* ---------- Search milestone labels (shared by the loop and search replays) ---------- */
  const HIGHLIGHTS = {
    dreamzero: {
      dz1: 'Fuse RoPE with FP64 intermediates and the original BF16 rounding',
      dz2: 'Fuse RMSNorm pointwise operations around the unchanged native reduction',
      dz3: 'Prepare the token-major prefill layout once',
      dz4: 'Tune launch block sizes for scale/shift and RMS scaling kernels',
      dz5: 'Combine CUDA Graphs, an append-only K/V arena, scheduler reuse and native-order RMSNorm',
      dz6: 'Fuse gated self-attention and cross-attention residuals with normalization, scaling and shifting',
      dz7: 'Dynamic FP8 for DiT linear projections with per-channel weight scales and per-token activation scales',
      dz8: 'NVFP4 for FFN projections and dynamic FP8 for the other linear projections; retain BF16 attention',
      dz9: 'Fuse scale/shift and gated residual operations while preserving BF16 rounding',
      dz10: 'Fuse RMSNorm square and reduction operations while preserving accumulation order',
      dz11: 'Reuse exact CLIP/VAE outputs for identical observations; invalidate cached outputs when inputs change',
      dz12: 'Reuse exact conditioning projections within each inference call',
      dz13: 'Avoid unused denoising K/V materialization and concatenate attention inputs once',
      dz14: 'Use whole-CFG CUDA Graphs and an append-only K/V arena while preserving the inference schedule',
      dz15: 'Fuse residual addition with normalization',
      dz16: 'Stream independent RMSNorm accumulators while preserving the native reduction order',
    },
    openwam: {
      ow1: 'CUDA Graph joint inference with shared timesteps',
      ow2: 'Fuse RoPE with FP64 intermediates',
      ow3: 'Reuse timestep features in the native BF16 configuration',
      ow4: 'Skip redundant recursive evaluation-mode assignments',
      ow5: 'Fuse tanh-GELU and overlap independent video and action experts',
      ow6: 'Use equivalent single-frame VAE convolutions and exact RGB transfer',
      ow7: 'Dynamic row-scaled FP8 for video FFN-up projections only',
      ow8: 'Combine cache-decision reuse, batched graph-input copies and compiled FP32 cosine calculations with FP8 projections',
      ow9: 'Reuse conditioning and remove fully masked context',
      ow10: 'CUDA Graphs for conditioning and single-frame VAE inference',
      ow11: 'Fuse packed-QKV normalization and FP64 RoPE',
      ow12: 'Pack QKV and store video weights in column-major layout',
      ow13: 'Decode camera images in parallel and reuse the structural black canvas',
      ow14: 'Combine accepted cache-decision reuse with native cuBLASLt GEMMs using a larger workspace',
    },
    longwam: {
      lw1: 'Extend CUDA Graph replay to the video expert and observation VAE',
      lw2: 'Tune Blackwell GEMM tiles and quantizer warps, and use FlexAttention for video attention',
      lw3: 'Pack video QKV projections into one GEMM and tune causal attention tiles',
      lw4: 'Combine packed projections, reusable K/V buffers, constant reuse and equivalent first-frame VAE convolutions',
      lw5: 'Use FlexAttention for video cross-attention and tune quantization tiles',
      lw6: 'Skip redundant recursive evaluation-mode assignments',
      lw7: 'Expand the cuDNN kernel search for the observation VAE',
      lw8: 'Replace global maximum atomics and resets with partial-maximum reductions',
      lw9: 'Capture the full inference pipeline in a CUDA Graph with refreshed inputs and seeded noise',
      lw10: 'Autotune VAE kernels inside full-pipeline CUDA Graph replay',
      lw11: 'Factor the common reconstruction scale in the existing NVFP4 quantizer without changing its reconstruction candidates',
      lw12: 'Combine distinct timestep computation, larger causal VAE chunks and factored quantizer scales',
      lw13: 'Compute exact quantizer statistics from the materialized BF16 inputs',
      lw14: 'Merge duplicate text rows while preserving their multiplicity in action attention',
      lw15: 'Flatten exact BF16 quantizer statistics alongside full-pipeline replay, causal VAE batching and duplicate-context aggregation',
    },
  };
  const ANNOTATIONS = {
    dreamzero: {
      dz1: { x: 130, y: 369, inline: true, lines: ['Fuse RoPE'] },
      dz2: {
        x: 72,
        y: 175,
        lines: ['Fuse RMSNorm', 'pointwise ops'],
      },
      dz3: { x: 175, y: 289, inline: true, lines: ['Prepare prefill layout once'] },
      dz4: {
        x: 177,
        y: 168,
        lines: ['Tune kernel', 'launch blocks'],
      },
      dz5: {
        x: 395,
        y: 85,
        digits: 3,
        lines: ['Graphs + scheduler reuse'],
      },
      dz6: { x: 880, y: 238, lines: ['Fuse gated residuals', 'with normalization'] },
      dz7: { x: 687, y: 86, lines: ['Dynamic FP8'] },
      dz8: {
        x: 891,
        y: 65,
        lines: ['NVFP4 FFN;', 'FP8 other linears'],
      },
      dz9: {
        x: 175,
        y: 314,
        inline: true,
        connectorY: 309,
        lines: ['Fuse scale/shift + residuals'],
      },
      dz10: {
        x: 410,
        y: 285,
        inline: true,
        connectorY: 280,
        connectorBend: true,
        lines: ['Fuse RMSNorm reductions'],
      },
      dz11: { x: 510, y: 129, lines: ['Reuse CLIP/VAE for', 'identical observations'] },
      dz12: { x: 151, y: 401, inline: true, lines: ['Reuse conditioning'] },
      dz13: { x: 145, y: 340, inline: true, lines: ['Skip unused K/V copies'] },
      dz14: { x: 410, y: 221, lines: ['CFG CUDA Graphs + K/V arena'] },
      dz15: { x: 730, y: 280, lines: ['Fuse residual addition', 'and normalization'] },
      dz16: { x: 235, y: 120, digits: 3, lines: ['Parallel RMSNorm'] },
    },
    openwam: {
      ow1: { x: 215, y: 386, lines: ['CUDA Graph joint inference'] },
      ow2: { x: 120, y: 238, lines: ['Fuse RoPE'] },
      ow3: { x: 237, y: 248, lines: ['Reuse timestep', 'features'] },
      ow4: { x: 285, y: 192, lines: ['Skip redundant work'] },
      ow5: { x: 430, y: 283, lines: ['Fuse GELU; overlap', 'video/action experts'] },
      ow6: { x: 645, y: 61, lines: ['Single-frame VAE;', 'exact RGB transfer'] },
      ow7: { x: 712, y: 174, lines: ['FP8 for video FFN-up'] },
      ow8: {
        x: 874,
        y: 57,
        lines: ['Batch graph copies;', 'compile cache cosine'],
      },
      ow9: { x: 155, y: 333, lines: ['Reuse conditioning'] },
      ow10: { x: 355, y: 124, lines: ['CUDA Graphs for', 'conditioning and VAE'] },
      ow11: { x: 493, y: 220, lines: ['Fuse QKV normalization', 'and RoPE'] },
      ow12: { x: 410, y: 342, inline: true, lines: ['Pack QKV; reorder video weights'] },
      ow13: { x: 515, y: 100, lines: ['Decode cameras', 'in parallel'] },
      ow14: { x: 887, y: 199, lines: ['Reuse cache decisions;', 'expand GEMM workspace'] },
    },
    longwam: {
      lw1: { x: 125, y: 398, inline: true, lines: ['Extend CUDA Graph replay'] },
      lw2: { x: 180, y: 373, inline: true, lines: ['Tune GEMMs + quantizer'] },
      lw3: { x: 200, y: 345, inline: true, lines: ['Pack video QKV'] },
      lw4: { x: 85, y: 214, lines: ['Pack projections;', 'reuse K/V buffers'] },
      lw5: { x: 175, y: 157, lines: ['Tune cross-attention'] },
      lw6: { x: 335, y: 296, lines: ['Skip repeated work'] },
      lw7: { x: 310, y: 100, lines: ['Tune VAE kernels'] },
      lw8: { x: 535, y: 382, inline: true, lines: ['Use partial-max reductions'] },
      lw9: { x: 425, y: 140, lines: ['CUDA Graph the', 'full pipeline'] },
      lw10: { x: 440, y: 60, lines: ['Autotune VAE kernels', 'inside CUDA Graph'] },
      lw11: { x: 590, y: 102, lines: ['Factor quantizer scales'] },
      lw12: { x: 580, y: 215, lines: ['Compact timesteps;', 'batch causal VAE work'] },
      lw13: { x: 745, y: 329, lines: ['Exact quantizer statistics'] },
      lw14: { x: 760, y: 66, lines: ['Merge duplicate', 'text rows'] },
      lw15: { x: 885, y: 172, lines: ['Flatten quantizer', 'statistics'] },
    },
  };

  /* ---------- Workflow replay ---------- */
  function initWorkflow() {
    // H100 replays: every kept change from the lossless runs (R1/R2 rounds).
    const B200_UPSTREAM_MS = {
      dreamzero: DATA.architecture.find((r) => r.WAM === 'DreamZero' && r.GPU === 'B200')
        .baseline_ms,
      openwam: 87.25, // OpenWAM upstream latency on B200, as in the OpenWAM table
      longwam: 108.9248,
    };
    const REPLAYS = {};
    Object.entries(DATA.optimizationStages).forEach(([k, m]) => {
      REPLAYS[k] = {
        name: m.name,
        gpu: 'H100',
        baseline_ms: m.baseline_ms,
        rounds: true,
        approximate: false,
        stages: m.stages,
      };
    });
    ['dreamzero', 'openwam', 'longwam'].forEach((k) => {
      const baseline = B200_UPSTREAM_MS[k];
      REPLAYS[`${k}-b200`] = {
        name: { dreamzero: 'DreamZero', openwam: 'OpenWAM', longwam: 'Long-WAM (V4/A4)' }[k],
        gpu: 'B200',
        baseline_ms: baseline,
        rounds: k === 'longwam',
        approximate: k !== 'longwam',
        stages: DATA.search[k].trials
          .filter((t) => t.with_wamjet === '1' && HIGHLIGHTS[k][t.trial_id])
          .sort((a, b) => a.method_search_hours - b.method_search_hours)
          .map((t) => ({
            label: ANNOTATIONS[k][t.trial_id].lines.join(' '),
            detail: HIGHLIGHTS[k][t.trial_id],
            latency_ms: baseline / t.speedup,
            approx: t.precision === 'lossy',
            endpoint: k === 'longwam' ? { lw10: 'R1', lw15: 'R2' }[t.trial_id] : undefined,
          })),
      };
    });
    const svg = $('wf-svg');
    const token = $('wf-token');
    const cards = [...svg.querySelectorAll('.wf-card')];
    const paths = {
      t01: $('wf-t01'),
      t12: $('wf-t12'),
      t23: $('wf-t23'),
      t34: $('wf-t34'),
      bypass: $('wf-bypass'),
      loop: $('wf-loop'),
    };
    const log = $('wf-log');
    const playButton = $('wf-play');
    const chips = [...document.querySelectorAll('[data-wf]')];
    const CANCEL = Symbol('cancel');
    let key = 'lingbot-va',
      run = 0,
      paused = false,
      state = 'idle';
    $('wf-controls').hidden = false;

    const wait = (ms, id) =>
      new Promise((resolve, reject) => {
        let elapsed = 0,
          last = performance.now();
        const step = (now) => {
          if (id !== run) return reject(CANCEL);
          if (!paused) elapsed += now - last;
          last = now;
          if (elapsed >= ms) resolve();
          else requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });
    const move = (path, ms, id) =>
      new Promise((resolve, reject) => {
        const length = path.getTotalLength();
        let elapsed = 0,
          last = performance.now();
        token.classList.add('moving');
        const step = (now) => {
          if (id !== run) {
            token.classList.remove('moving');
            return reject(CANCEL);
          }
          if (!paused) elapsed += now - last;
          last = now;
          const p = clamp01(elapsed / ms);
          const point = path.getPointAtLength(length * easeInOut(p));
          token.setAttribute('transform', `translate(${point.x} ${point.y})`);
          if (p < 1) requestAnimationFrame(step);
          else {
            token.classList.remove('moving');
            resolve();
          }
        };
        requestAnimationFrame(step);
      });
    const restartClass = (el, cls) => {
      el.classList.remove(cls);
      void el.getBoundingClientRect();
      el.classList.add(cls);
    };
    const activate = (index) => {
      cards.forEach((card, i) => card.classList.toggle('is-active', i === index));
      if (index === 1) restartClass(cards[1], 'scan');
      if (index === 4) restartClass(cards[4], 'checking');
    };
    const model = () => REPLAYS[key];
    const setReadout = (latency, kept, phase) => {
      const m = model();
      $('wf-lat').textContent = fmt(latency, 1);
      $('wf-speed').textContent = `${(m.baseline_ms / latency).toFixed(2)}×`;
      $('wf-bar').style.width = `${(latency / m.baseline_ms) * 100}%`;
      $('wf-count').textContent =
        `${kept} of ${m.stages.length} ${m.gpu === 'H100' ? 'changes kept' : 'labeled milestones'}`;
      $('wf-round').textContent = phase;
    };
    const animateReadout = (from, to, kept, round) => {
      tween(420, (p) => setReadout(from + (to - from) * easeOut(p), kept, round));
    };
    const item = (i, pending) => {
      const m = model(),
        stage = m.stages[i],
        previous = i ? m.stages[i - 1].latency_ms : m.baseline_ms;
      const li = document.createElement('li');
      li.className = `log-item${pending ? ' pending' : ''}${stage.approx ? ' approx' : ''}`;
      if (stage.detail) li.title = stage.detail;
      li.innerHTML = `<span class="log-k">${i + 1}</span><span class="log-label">${esc(stage.label)}${stage.approx ? ' <span class="log-tag">approx.</span>' : ''}</span><span class="log-ms">${pending ? 'trying…' : `${fmt(stage.latency_ms, 1)} ms`}</span><span class="log-gain">${pending ? '' : `${(previous / stage.latency_ms).toFixed(2)}×`}</span><span class="log-total">${pending ? '' : `${(m.baseline_ms / stage.latency_ms).toFixed(2)}×`}</span>`;
      return li;
    };
    const note = (value, approx) => {
      const li = document.createElement('li');
      li.className = `log-round${approx ? ' approx' : ''}`;
      li.textContent = value;
      return li;
    };
    const noteBefore = (i) => {
      const m = model(),
        stage = m.stages[i];
      if (!stage.approx || (i && m.stages[i - 1].approx)) return null;
      const previous = i ? m.stages[i - 1].latency_ms : m.baseline_ms;
      return note(
        `Approximation from here · best lossless so far ${(m.baseline_ms / previous).toFixed(2)}×`,
        true,
      );
    };
    const noteAfter = (i) => {
      const m = model(),
        stage = m.stages[i],
        total = `${fmt(stage.latency_ms, 1)} ms · ${(m.baseline_ms / stage.latency_ms).toFixed(2)}× vs upstream`;
      if (stage.endpoint)
        return note(
          `${stage.endpoint === 'R1' ? 'Round 1' : 'Round 2'} complete · ${stage.endpoint} = ${total}`,
        );
      if (!m.rounds && i === m.stages.length - 1)
        return note(`Search complete · ${total}`, stage.approx);
      return null;
    };
    const firstPhase = () => (model().rounds ? 'round 1' : 'lossless phase');
    const phaseAfter = (i, current) => {
      const m = model(),
        stage = m.stages[i];
      if (m.rounds)
        return stage.endpoint === 'R1'
          ? 'round 2'
          : stage.endpoint === 'R2'
            ? 'both rounds done'
            : current;
      return i === m.stages.length - 1
        ? 'search done'
        : stage.approx
          ? 'approximate phase'
          : 'lossless phase';
    };
    const append = (li) => {
      if (!li) return false;
      log.appendChild(li);
      log.scrollTop = log.scrollHeight;
      return true;
    };
    const reset = () => {
      const m = model();
      log.innerHTML = '';
      $('wf-model').textContent = `${m.name} · ${m.gpu} · GPT-6-astra`;
      $('wf-upstream').textContent = fmt(m.baseline_ms, 1);
      $('wf-lossless').textContent = m.approximate ? 'Lossless allowed' : 'Lossless only';
      $('wf-approximate').hidden = !m.approximate;
      cards[3].classList.toggle('is-off', !m.approximate);
      setReadout(m.baseline_ms, 0, firstPhase());
      activate(-1);
      token.classList.remove('moving');
    };
    const showAll = () => {
      run++;
      paused = false;
      const m = model();
      reset();
      let phase = firstPhase();
      m.stages.forEach((stage, i) => {
        append(noteBefore(i));
        append(item(i, false));
        append(noteAfter(i));
        phase = phaseAfter(i, phase);
      });
      log.scrollTop = 0;
      setReadout(m.stages.at(-1).latency_ms, m.stages.length, phase);
      state = 'done';
      updateButton();
    };
    const updateButton = () => {
      playButton.textContent =
        state === 'running' ? (paused ? 'Resume' : 'Pause') : state === 'done' ? 'Replay' : 'Play';
    };
    async function play() {
      const id = ++run;
      paused = false;
      state = 'running';
      updateButton();
      reset();
      const m = model();
      try {
        activate(0);
        await wait(900, id);
        await move(paths.t01, 380, id);
        let latency = m.baseline_ms,
          phase = firstPhase();
        for (let i = 0; i < m.stages.length; i++) {
          const stage = m.stages[i],
            f = i < 2 ? 1 : 0.6;
          activate(1);
          await wait(520 * f, id);
          await move(paths.t12, 300 * f, id);
          if (append(noteBefore(i))) await wait(500, id);
          const pending = item(i, true);
          if (stage.approx) {
            // Lossless options are tried first; the kept change comes from step 3.
            activate(2);
            await wait(220 * f, id);
            await move(paths.t23, 280 * f, id);
            activate(3);
            append(pending);
            await wait(620 * f, id);
            await move(paths.t34, 280 * f, id);
          } else {
            activate(2);
            append(pending);
            await wait(560 * f, id);
            await move(paths.bypass, 560 * f, id);
          }
          activate(4);
          pending.querySelector('.log-ms').textContent = 'validating…';
          await wait(620 * f, id);
          pending.replaceWith(item(i, false));
          phase = phaseAfter(i, phase);
          animateReadout(latency, stage.latency_ms, i + 1, phase);
          latency = stage.latency_ms;
          if (append(noteAfter(i))) await wait(800, id);
          if (i < m.stages.length - 1) {
            activate(-1);
            await move(paths.loop, 560 * f, id);
          }
        }
        activate(-1);
        state = 'done';
        updateButton();
      } catch (error) {
        if (error !== CANCEL) throw error;
      }
    }
    let touched = false;
    chips.forEach((chip) =>
      chip.addEventListener('click', () => {
        touched = true;
        key = chip.dataset.wf;
        chips.forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
        if (REDUCE) showAll();
        else play();
      }),
    );
    playButton.addEventListener('click', () => {
      touched = true;
      if (state === 'running') {
        paused = !paused;
        updateButton();
      } else play();
    });
    $('wf-skip').addEventListener('click', () => {
      touched = true;
      showAll();
    });
    if (REDUCE) showAll();
    else {
      reset();
      whenVisible($('wf-figure'), play, 0.45);
      onReturn(
        $('wf-figure'),
        () => {
          if (!touched && state === 'done') play();
        },
        0.45,
      );
    }
  }

  /* ---------- Latency explorer ---------- */
  function initExplorer() {
    const { POINTS, EXAMPLES } = EXPLORER;
    const currentExamples = { compiler: 'breaks', sync: 'sync' };
    let current = 'host';
    const content = (key) => EXAMPLES[key]?.[currentExamples[key]] || POINTS[key];
    const KEYWORDS = /^(def|return|if|else|with|as|for|in|True|False|None)$/;
    function highlight(code) {
      const re =
        /("[^"\n]*"|'[^'\n]*'|\b(?:def|return|if|else|with|as|for|in|True|False|None)\b|\b\d+(?:\.\d+)?\b|\b[A-Za-z_]\w*(?=\())/g;
      let out = '',
        last = 0;
      for (const match of code.matchAll(re)) {
        out += esc(code.slice(last, match.index));
        const word = match[0];
        const kind = /^["']/.test(word)
          ? 'string'
          : /^\d/.test(word)
            ? 'num'
            : KEYWORDS.test(word)
              ? 'key'
              : 'call';
        out += `<span class="tok-${kind}">${esc(word)}</span>`;
        last = match.index + word.length;
      }
      return out + esc(code.slice(last));
    }
    function pipelineSVG(point) {
      const compact = $('xp-pipeline').clientWidth < 440;
      const width = compact ? 420 : 520,
        left = compact ? 66 : 80,
        track = width - left - 6;
      const step = 40,
        barHeight = 28,
        header = 46,
        groupHeight = header + point.lanes.length * step + 24;
      const height = groupHeight * 2 + 14,
        font = compact ? 13.5 : 12.5;
      const palette = {
        cpu: ['#dce7fb', '#1d3f78'],
        gpu: ['#cdeee6', '#0d5c54'],
        transfer: ['#fde2c9', '#7c4417'],
        wait: ['url(#pw-hatch)', '#7a6250'],
      };
      const x = (v) => left + (v / 100) * track;
      const label = (px, py, value, size, color, anchor = 'start', weight = 400) =>
        `<text x="${px}" y="${py}" fill="${color}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" font-family="var(--sans)">${esc(value)}</text>`;
      let svg = `<svg class="pipe-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(point.diagramLabel)}"><defs><pattern id="pw-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#f3eee8"/><rect width="2.2" height="6" fill="#ddd1c4"/></pattern><marker id="pw-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L8 4L0 8Z" fill="#8f98a3"/></marker></defs>`;
      [point.beforeScene, point.afterScene].forEach((scene, index) => {
        const top = index * groupHeight;
        const row = (lane) => top + header + lane * step;
        svg += `<text x="2" y="${top + 14}" fill="${index ? '#0f766e' : '#667085'}" font-size="11" font-weight="600" letter-spacing=".06em" font-family="var(--mono)">${index ? 'AFTER' : 'BEFORE'}</text>`;
        svg += label(2, top + 33, scene.caption, font, C.ink, 'start', 500);
        point.lanes.forEach((lane, i) => {
          svg += label(2, row(i) + 19, lane, font - 1, C.muted);
          svg += `<rect x="${left}" y="${row(i)}" width="${track}" height="${barHeight}" rx="6" fill="#fff" stroke="#e5e2db"/>`;
        });
        scene.bars.forEach(([lane, start, duration, value, kind]) => {
          const [fill, ink] = palette[kind],
            span = (duration / 100) * track;
          svg += `<g class="pb" style="--d:${((start / 100) * 1.2).toFixed(3)}s"><rect x="${x(start)}" y="${row(lane) + 2}" width="${span}" height="${barHeight - 4}" rx="4" fill="${fill}"/><title>${esc(value || 'Waiting for the next launch')}</title>${label(x(start) + span / 2, row(lane) + 19, value, font, ink, 'middle', 500)}</g>`;
        });
        (scene.notes || []).forEach(([lane, position, value]) => {
          svg += `<g class="pb-late" style="--d:1.1s">${label(x(position), row(lane) + 19, value, font - 1, '#8a8f98', 'middle')}</g>`;
        });
        (scene.arrows || []).forEach(([fromLane, from, toLane, to]) => {
          const down = toLane > fromLane;
          const y1 = row(fromLane) + (down ? barHeight + 1 : -2),
            y2 = row(toLane) + (down ? -3 : barHeight + 3);
          svg += `<path class="pb-late" style="--d:${((Math.max(from, to) / 100) * 1.2).toFixed(3)}s" d="M${x(from)} ${y1}L${x(to)} ${y2}" stroke="#8f98a3" stroke-width="1.2" fill="none" marker-end="url(#pw-arrow)"/>`;
        });
        (scene.brackets || []).forEach(([lane, start, end, value]) => {
          const y = row(lane) + barHeight + 7;
          svg += `<g class="pb-late" style="--d:1.25s"><path d="M${x(start)} ${y}v5H${x(end)}v-5" stroke="#5aa59a" fill="none"/>${label((x(start) + x(end)) / 2, y + 21, value, font - 1, '#2f7d72', 'middle')}</g>`;
        });
      });
      svg += `<path d="M${left} ${height - 6}H${width - 8}" stroke="#c9ccd1" fill="none" marker-end="url(#pw-arrow)"/>`;
      svg += label(width - 10, height - 12, point.axis || 'Time', font - 2, C.muted, 'end');
      return svg + '</svg>';
    }
    function select(key, focus = false) {
      current = key;
      const p = content(key);
      document.querySelectorAll('[data-point]').forEach((tab) => {
        const active = tab.dataset.point === key;
        tab.setAttribute('aria-selected', String(active));
        tab.tabIndex = active ? 0 : -1;
        if (active && focus) tab.focus();
      });
      $('xp-panel').setAttribute('aria-labelledby', `xp-tab-${key}`);
      const examples = EXAMPLES[key];
      $('xp-examples').hidden = !examples;
      $('xp-examples').innerHTML = examples
        ? Object.entries(examples)
            .map(
              ([id, example]) =>
                `<button class="xp-example" type="button" data-example="${id}" aria-pressed="${currentExamples[key] === id}">${esc(example.example)}</button>`,
            )
            .join('')
        : '';
      $('xp-title').textContent = p.title;
      $('xp-desc').textContent = p.description;
      $('xp-effect').textContent = p.effect;
      const tier = $('xp-tier');
      tier.textContent = p.startup ? 'Fast startup' : p.approximate ? 'Approximate' : 'Lossless';
      tier.classList.toggle('approximate', !!p.approximate);
      tier.classList.toggle('startup', !!p.startup);
      $('xp-before').innerHTML = highlight(p.before);
      $('xp-after').innerHTML = highlight(p.after);
      $('xp-pipeline').innerHTML = pipelineSVG(p);
    }
    $('xp-examples').addEventListener('click', (event) => {
      const button = event.target.closest('[data-example]');
      if (!button) return;
      currentExamples[current] = button.dataset.example;
      select(current);
      document
        .querySelector(`[data-example="${button.dataset.example}"]`)
        ?.focus({ preventScroll: true });
    });
    const tabs = [...document.querySelectorAll('[data-point]')];
    tabs.forEach((tab) => {
      tab.addEventListener('click', () => select(tab.dataset.point));
      tab.addEventListener('keydown', (event) => {
        const keys = tabs.map((t) => t.dataset.point),
          i = keys.indexOf(current);
        let next;
        if (event.key === 'ArrowRight') next = (i + 1) % keys.length;
        if (event.key === 'ArrowLeft') next = (i + keys.length - 1) % keys.length;
        if (event.key === 'Home') next = 0;
        if (event.key === 'End') next = keys.length - 1;
        if (next !== undefined) {
          event.preventDefault();
          select(keys[next], true);
        }
      });
    });
    select(current);
    let compact = $('xp-pipeline').clientWidth < 440;
    window.addEventListener('resize', () => {
      const next = $('xp-pipeline').clientWidth < 440;
      if (next !== compact) {
        compact = next;
        select(current);
      }
    });
  }

  /* ---------- Lossless dumbbells ---------- */
  function initLossless() {
    const grid = $('ll-grid');
    const compact = grid.clientWidth < 600;
    const W = compact ? 360 : 500,
      L = compact ? 102 : 112,
      R = compact ? 302 : 440,
      rowGap = 34,
      top = 20;
    const H = top + 3 * rowGap + 26;
    const lx = (v) => L + (Math.log(v) / Math.log(11)) * (R - L);
    const ticks = compact ? [1, 2, 3, 5, 10] : [1, 1.5, 2, 3, 5, 10];
    const CITES = { FastWAM: 2, 'Cosmos-Policy-Predict2-2B': 4, DreamZero: 1, 'LingBot-VA': 3 };
    const rows = [];
    grid.innerHTML = DATA.lossless
      .map((model, mi) => {
        let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(model.name)} lossless speedup on H100. ${model.agents
          .map(
            (a) =>
              `${AGENTS[a.name]}: without WAMJET ${(model.baseline / a.without).toFixed(2)} times, round 1 ${(model.baseline / a.round1).toFixed(2)} times, round 2 ${(model.baseline / a.with).toFixed(2)} times.`,
          )
          .join(' ')}">`;
        ticks.forEach((t) => {
          svg += `<line x1="${lx(t)}" x2="${lx(t)}" y1="4" y2="${H - 22}" stroke="${t === 1 ? C.upstream : C.grid}" stroke-width="${t === 1 ? 1.5 : 1}"/>`;
          svg += text(
            lx(t),
            H - 6,
            `${t}×`,
            `text-anchor="middle" font-size="11.5" fill="${C.muted}"`,
          );
        });
        model.agents.forEach((agent, i) => {
          const y = top + i * rowGap + 6;
          const values = {
            without: model.baseline / agent.without,
            round1: model.baseline / agent.round1,
            with: model.baseline / agent.with,
          };
          const name = AGENTS[agent.name];
          svg += text(0, y + 4.5, name, `font-size="13" fill="${C.text}"`);
          svg += `<line data-r="${mi}-${i}" class="trk" x1="${lx(1)}" x2="${lx(1)}" y1="${y}" y2="${y}" stroke="${C.track}" stroke-width="2.5" stroke-linecap="round"/>`;
          svg += `<circle data-r="${mi}-${i}" class="d1" cx="${lx(1)}" cy="${y}" r="5" fill="${C.losslessMid}" stroke="#fff" stroke-width="1.5"><title>${esc(name)} WAMJET R1: ${fmt(agent.round1, 1)} ms, ${values.round1.toFixed(2)}×</title></circle>`;
          svg += `<circle data-r="${mi}-${i}" class="dw" cx="${lx(1)}" cy="${y}" r="5" fill="#fff" stroke="${C.base}" stroke-width="2"><title>${esc(name)} without WAMJET: ${fmt(agent.without, 1)} ms, ${values.without.toFixed(2)}×</title></circle>`;
          svg += `<circle data-r="${mi}-${i}" class="d2" cx="${lx(1)}" cy="${y}" r="6.5" fill="${C.lossless}" stroke="#fff" stroke-width="2"><title>${esc(name)} WAMJET R2: ${fmt(agent.with, 1)} ms, ${values.with.toFixed(2)}×</title></circle>`;
          svg += `<text data-r="${mi}-${i}" class="vt" x="${lx(1) + 12}" y="${y + 4.5}" font-size="12.5" font-weight="600" fill="${C.ink}" opacity="0">${values.with.toFixed(2)}×</text>`;
          rows.push({ id: `${mi}-${i}`, values, delay: (mi * 3 + i) * 0.035 });
        });
        svg += '</svg>';
        const cite = CITES[model.name]
          ? `<a class="cite" href="#ref-${CITES[model.name]}">[${CITES[model.name]}]</a>`
          : '';
        return `<div class="facet"><div class="facet-head"><h3>${esc(model.name)}${cite}</h3><span>upstream ${fmt(model.baseline, 1)} ms</span></div>${svg}</div>`;
      })
      .join('');
    rows.forEach((row) => {
      const q = (cls) => grid.querySelector(`.${cls}[data-r="${row.id}"]`);
      Object.assign(row, { trk: q('trk'), dw: q('dw'), d1: q('d1'), d2: q('d2'), vt: q('vt') });
    });
    const span = Math.max(...rows.map((row) => row.delay)) + 1;
    const draw = (p) => {
      const now = p * span;
      rows.forEach((row) => {
        const k = (offset) => easeOut(clamp01((now - row.delay - offset) / 0.5));
        const xw = lx(1) + (lx(row.values.without) - lx(1)) * k(0),
          x1 = lx(1) + (lx(row.values.round1) - lx(1)) * k(0.14),
          x2 = lx(1) + (lx(row.values.with) - lx(1)) * k(0.28);
        row.dw.setAttribute('cx', xw);
        row.d1.setAttribute('cx', x1);
        row.d2.setAttribute('cx', x2);
        row.trk.setAttribute('x1', Math.min(xw, x1, x2));
        row.trk.setAttribute('x2', Math.max(xw, x1, x2));
        row.vt.setAttribute('x', Math.max(xw, x1, x2) + 12);
        row.vt.setAttribute('opacity', clamp01((now - row.delay - 0.78) / 0.2));
      });
    };
    draw(REDUCE ? 1 : 0);
    whenVisible(grid, () => tween(2300, draw), 0.25);

    const head =
      '<thead><tr><th scope="col">WAM · upstream</th><th scope="col">Agent</th><th scope="col" class="num">Without WAMJET</th><th scope="col" class="num">WAMJET R1</th><th scope="col" class="num">WAMJET R2</th></tr></thead>';
    const cell = (model, ms, bold) =>
      `<td class="num${bold ? ' best' : ''}">${fmt(ms, 1)} ms<span class="sub">${(model.baseline / ms).toFixed(2)}×</span></td>`;
    const body = DATA.lossless
      .map((model) =>
        model.agents
          .map(
            (agent, i) =>
              `<tr>${i === 0 ? `<th scope="rowgroup" rowspan="${model.agents.length}">${esc(model.name)}<span class="sub">${fmt(model.baseline, 1)} ms</span></th>` : ''}<td>${AGENTS[agent.name]}</td>${cell(model, agent.without)}${cell(model, agent.round1)}${cell(model, agent.with, true)}</tr>`,
          )
          .join(''),
      )
      .join('');
    $('ll-table').innerHTML = `<table class="data">${head}<tbody>${body}</tbody></table>`;
  }

  /* ---------- GPU architecture bars ---------- */
  function initHardware() {
    const grid = $('hw-grid');
    const compact = grid.clientWidth < 600;
    const W = compact ? 360 : 460,
      L = compact ? 80 : 92,
      R = compact ? 252 : 372,
      vmax = 2.5;
    const hx = (v) => L + (v / vmax) * (R - L);
    const kinds = [
      ['baseline_ms', 'Upstream', C.upstream],
      ['lossless_ms', 'Lossless', C.lossless],
      ['approx_ms', 'Approximate', C.approximate],
    ];
    const bars = [];
    grid.innerHTML = ['H100', 'B200']
      .map((gpu) => {
        const rows = DATA.architecture.filter((r) => r.GPU === gpu);
        const groupH = 100,
          H = rows.length * groupH + 26;
        let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${gpu}: ${rows
          .map(
            (r) =>
              `${r.WAM} upstream ${r.baseline_ms} ms, lossless ${(r.baseline_ms / r.lossless_ms).toFixed(2)} times, approximate ${(r.baseline_ms / r.approx_ms).toFixed(2)} times.`,
          )
          .join(' ')}">`;
        [0, 0.5, 1, 1.5, 2, 2.5].forEach((t) => {
          svg += `<line x1="${hx(t)}" x2="${hx(t)}" y1="22" y2="${H - 22}" stroke="${t === 1 ? C.upstream : C.grid}"/>`;
          svg += text(
            hx(t),
            H - 6,
            `${t}×`,
            `text-anchor="middle" font-size="11.5" fill="${C.muted}"`,
          );
        });
        rows.forEach((r, gi) => {
          const top = gi * groupH;
          svg += text(0, top + 14, r.WAM, `font-size="13" font-weight="600" fill="${C.ink}"`);
          kinds.forEach(([field, name, color], j) => {
            const v = r.baseline_ms / r[field],
              y = top + 26 + j * 22;
            svg += text(0, y + 11.5, name, `font-size="12" fill="${C.muted}"`);
            svg += `<rect class="hb" x="${L}" y="${y}" width="0" height="15" rx="3" fill="${color}"><title>${esc(r.WAM)} ${gpu} ${name.toLowerCase()}: ${fmt(r[field], 1)} ms, ${v.toFixed(2)}×</title></rect>`;
            svg += `<text class="hv" x="${L + 8}" y="${y + 11.5}" font-size="12" fill="${C.text}" opacity="0"><tspan font-weight="600">${v.toFixed(2)}×</tspan> · ${fmt(r[field], 1)} ms</text>`;
            bars.push({ v, delay: gi * 0.12 + j * 0.08 });
          });
        });
        svg += '</svg>';
        return `<div class="facet"><div class="facet-head"><h3>${gpu}</h3><span>${gpu === 'H100' ? 'Hopper' : 'Blackwell'}</span></div>${svg}</div>`;
      })
      .join('');
    const rects = [...grid.querySelectorAll('.hb')],
      labels = [...grid.querySelectorAll('.hv')];
    const draw = (p) => {
      bars.forEach((bar, i) => {
        const k = easeOut(clamp01((p - bar.delay) / 0.6));
        const w = (hx(bar.v) - L) * k;
        rects[i].setAttribute('width', w);
        labels[i].setAttribute('x', L + w + 8);
        labels[i].setAttribute('opacity', clamp01((p - bar.delay - 0.45) / 0.2));
      });
    };
    draw(REDUCE ? 1 : 0);
    whenVisible(grid, () => tween(1500, draw), 0.3);
  }

  function initLatencyTables() {
    document.querySelectorAll('#openwam-table, #longwam-table').forEach((table) => {
      whenVisible(
        table,
        () => table.querySelectorAll('.lat-bar').forEach((bar) => bar.classList.add('go')),
        0.5,
      );
    });
  }

  /* ---------- Search replay ---------- */
  function initSearch() {
    const SECONDS_PER_HOUR = 2.4;
    ['dreamzero', 'openwam', 'longwam'].forEach((model) => {
      const root = document.querySelector(`[data-search-fig="${model}"]`);
      const plot = root.querySelector('.search-plot'),
        controls = root.querySelector('.search-controls'),
        slider = controls.querySelector('input'),
        output = controls.querySelector('output'),
        playButton = controls.querySelector('[data-play]'),
        ticker = root.querySelector('[data-ticker]'),
        bestEl = root.querySelector('[data-best]'),
        aloneEl = root.querySelector('[data-alone]');
      const name = root.querySelector('h3').textContent;
      const data = DATA.search[model],
        trials = data.trials,
        duration = Math.max(...trials.map((t) => t.method_search_hours)),
        xmax = duration * 1.03;
      const left = 64,
        top = 34,
        width = 972,
        height = 397,
        ymin = 0.9,
        ymax = { dreamzero: 2.6, openwam: 3.2, longwam: 2.85 }[model];
      const x = (t) => left + (t / xmax) * width,
        y = (v) => top + height - ((v - ymin) / (ymax - ymin)) * height;
      const uid = `sr-${model}`;
      let svg = `<svg viewBox="0 0 1080 493" role="img" aria-label="${name} optimization progress on B200, with technique labels at ${Object.keys(HIGHLIGHTS[model]).length} milestones. Horizontal axis is displayed method search time; vertical axis is speedup versus upstream.">`;
      const yticks = {
        dreamzero: [1, 1.25, 1.5, 1.75, 2, 2.25, 2.5],
        openwam: [1, 1.5, 2, 2.5, 3],
        longwam: [1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75],
      }[model];
      yticks.forEach((t) => {
        svg += `<line x1="${left}" x2="${left + width}" y1="${y(t)}" y2="${y(t)}" stroke="${t === 1 ? C.upstream : C.grid}" stroke-width="${t === 1 ? 1.5 : 1}"/>`;
        svg += text(
          left - 12,
          y(t) + 4,
          `${t}×`,
          `text-anchor="end" font-size="13" fill="${C.muted}"`,
        );
      });
      const xstep = xmax > 6 ? 1.5 : 1;
      for (let t = 0; t <= xmax; t += xstep) {
        svg += `<line x1="${x(t)}" x2="${x(t)}" y1="${top}" y2="${top + height}" stroke="#f1f0ec"/>`;
        svg += text(
          x(t),
          top + height + 25,
          `${Number(t.toFixed(1))}`,
          `text-anchor="middle" font-size="13" fill="${C.muted}"`,
        );
      }
      svg += text(left, 18, 'Speedup vs upstream', `font-size="13" fill="${C.muted}"`);
      svg += text(
        left + width / 2,
        484,
        'Method search time (display hours)',
        `text-anchor="middle" font-size="13" fill="${C.muted}"`,
      );
      svg += `<defs><clipPath id="${uid}-reveal"><rect id="${uid}-reveal-rect" x="0" y="0" width="1080" height="493"/></clipPath><linearGradient id="${uid}-transition"><stop offset="0%" stop-color="${C.lossless}"/><stop offset="100%" stop-color="${C.approximate}"/></linearGradient></defs><g clip-path="url(#${uid}-reveal)">`;
      const segments = new Map();
      data.lines.forEach((p) => {
        const k = p.with_wamjet + ':' + p.segment;
        if (!segments.has(k)) segments.set(k, []);
        segments.get(k).push(p);
      });
      segments.forEach((points) => {
        points.sort((a, b) => Number(a.point_order) - Number(b.point_order));
        const guided = points[0].with_wamjet === '1',
          kind = points[0].segment,
          color = guided ? (kind === 'curve' ? C.lossless : C.approximate) : C.base;
        if (kind === 'end_marker') {
          const p = points[0],
            xx = x(p.method_search_hours),
            yy = y(p.speedup);
          svg += `<path d="M${xx - 5},${yy - 5}l10,10m0,-10l-10,10" stroke="${color}" stroke-width="2.2"/>`;
          return;
        }
        const stepped = ['curve', 'lossy_curve'].includes(kind);
        let path = '';
        points.forEach((p, i) => {
          const px = x(
              kind === 'dotted_hold' && i === points.length - 1 ? xmax : p.method_search_hours,
            ),
            py = y(p.speedup);
          path += i === 0 ? `M${px},${py}` : stepped ? `H${px}V${py}` : `L${px},${py}`;
        });
        if (guided && (stepped || kind === 'precision_connector')) {
          const first = points[0],
            last = points[points.length - 1],
            fill = kind === 'precision_connector' ? `url(#${uid}-transition)` : color;
          svg += `<path d="${path}L${x(last.method_search_hours)},${top + height}L${x(first.method_search_hours)},${top + height}Z" fill="${fill}" opacity=".07"/>`;
        }
        svg += `<path d="${path}" fill="none" stroke="${color}" stroke-width="${guided ? 2.4 : 1.8}" ${kind === 'dotted_hold' ? 'stroke-dasharray="2 5"' : ''}/>`;
      });
      svg += '</g>';
      trials
        .filter((t) => t.with_wamjet === '1' && !HIGHLIGHTS[model][t.trial_id])
        .forEach((t) => {
          const color = t.precision === 'lossy' ? C.approximate : C.lossless;
          svg += `<circle data-t="${t.method_search_hours}" cx="${x(t.method_search_hours)}" cy="${y(t.speedup)}" r="3.2" fill="${color}" fill-opacity="${t.on_curve === '1' ? '.85' : '.24'}"><title>${fmt(t.speedup)}× at ${t.method_search_hours.toFixed(2)} h</title></circle>`;
        });
      const highlights = trials.filter(
        (t) => t.with_wamjet === '1' && HIGHLIGHTS[model][t.trial_id],
      );
      for (const t of highlights) {
        const a = ANNOTATIONS[model][t.trial_id],
          color = t.precision === 'lossy' ? C.approximate : C.lossless,
          speedup = fmt(t.speedup, a.digits ?? 2),
          badgeWidth = 48 + Math.max(0, speedup.length - 4) * 8;
        const px = x(t.method_search_hours),
          py = y(t.speedup),
          labelWidth = Math.max(
            badgeWidth,
            ...a.lines.map((line) => line.length * 6.3 + (a.inline ? badgeWidth + 6 : 0)),
          ),
          endX = Math.max(a.x - 9, Math.min(px, a.x + labelWidth + 5)),
          endY =
            a.connectorY ??
            Math.max(a.y - 22, Math.min(py, a.y + (a.lines.length - (a.inline ? 1 : 0)) * 16 + 8)),
          points = a.connectorBend
            ? `${px},${py} ${endX - 14},${py} ${endX},${endY}`
            : `${px},${py} ${endX},${endY}`;
        svg += `<polyline data-t="${t.method_search_hours}" points="${points}" fill="none" stroke="${color}" stroke-width="1" stroke-linejoin="round" stroke-opacity=".4"/>`;
      }
      for (const t of highlights) {
        const a = ANNOTATIONS[model][t.trial_id],
          color = t.precision === 'lossy' ? C.approximate : C.lossless,
          speedup = fmt(t.speedup, a.digits ?? 2),
          badgeWidth = 48 + Math.max(0, speedup.length - 4) * 8;
        svg += `<g class="search-milestone" data-t="${t.method_search_hours}"><title>${esc(HIGHLIGHTS[model][t.trial_id])}</title><rect x="${a.x - 4}" y="${a.y - 15}" width="${badgeWidth}" height="20" rx="3" fill="${color}" fill-opacity=".1"/><text x="${a.x}" y="${a.y}" fill="${t.precision === 'lossy' ? C.approximateText : C.losslessText}" font-size="14" font-weight="650">${speedup}×</text>`;
        a.lines.forEach((line, i) => {
          svg += text(
            a.x + (a.inline ? badgeWidth + 6 : 0),
            a.y + (a.inline ? 0 : 17) + i * 16,
            line,
            `font-size="12.5" fill="${C.muted}"`,
          );
        });
        svg += '</g>';
      }
      for (const t of highlights) {
        const color = t.precision === 'lossy' ? C.approximate : C.lossless;
        svg += `<circle data-t="${t.method_search_hours}" cx="${x(t.method_search_hours)}" cy="${y(t.speedup)}" r="4.8" fill="#fff" stroke="${color}" stroke-width="2"><title>${esc(HIGHLIGHTS[model][t.trial_id])}</title></circle>`;
      }
      svg += `<circle cx="${x(0)}" cy="${y(1)}" r="4" fill="#fff" stroke="${C.base}" stroke-width="1.7"/><line class="search-cursor" id="${uid}-cursor" y1="${top}" y2="${top + height}" stroke="${C.ink}" stroke-opacity=".35" stroke-width="1"/></svg>`;
      plot.innerHTML = svg;

      const timed = [...plot.querySelectorAll('[data-t]')].map((el) => ({
        el,
        t: Number(el.dataset.t),
      }));
      const clip = plot.querySelector(`#${uid}-reveal-rect`),
        cursor = plot.querySelector(`#${uid}-cursor`);
      const kept = data.lines
        .filter(
          (p) =>
            p.with_wamjet === '1' &&
            ['curve', 'lossy_curve', 'precision_connector'].includes(p.segment),
        )
        .map((p) => ({ t: p.method_search_hours, v: p.speedup }));
      const alone = data.lines
        .filter((p) => p.with_wamjet === '0' && p.segment === 'curve')
        .map((p) => ({ t: p.method_search_hours, v: p.speedup }));
      const stop = data.lines.find((p) => p.with_wamjet === '0' && p.segment === 'end_marker');
      const milestones = highlights
        .slice()
        .sort((a, b) => a.method_search_hours - b.method_search_hours);
      let shownMilestone;
      const best = (series, t) =>
        Math.max(1, ...series.filter((p) => p.t <= t + 1e-9).map((p) => p.v));
      function setTime(t) {
        const complete = t >= duration - 1e-9;
        clip.setAttribute('width', complete ? 1080 : x(t));
        timed.forEach((item) => item.el.classList.toggle('on', item.t <= t + 1e-9));
        cursor.setAttribute('x1', x(t));
        cursor.setAttribute('x2', x(t));
        cursor.classList.toggle('on', !complete && t > 0);
        slider.value = t;
        slider.style.setProperty('--p', `${(t / duration) * 100}%`);
        output.textContent = `${t.toFixed(2)} h`;
        slider.setAttribute(
          'aria-valuetext',
          `${t.toFixed(2)} of ${duration.toFixed(2)} displayed search hours`,
        );
        bestEl.textContent = `${best(kept, t).toFixed(2)}×`;
        aloneEl.textContent =
          t >= stop.method_search_hours
            ? `stopped at ${stop.method_search_hours.toFixed(2)} h · ${stop.speedup.toFixed(2)}×`
            : `${best(alone, t).toFixed(2)}× · searching`;
        const milestone = milestones.filter((m) => m.method_search_hours <= t + 1e-9).at(-1);
        if (milestone !== shownMilestone) {
          shownMilestone = milestone;
          ticker.innerHTML = milestone
            ? `<span class="tk-badge${milestone.precision === 'lossy' ? ' approx' : ''}">${fmt(milestone.speedup)}×</span><span class="tk-text">${esc(HIGHLIGHTS[model][milestone.trial_id])}</span><span class="tk-time">${milestone.method_search_hours.toFixed(2)} h</span>`
            : '<span class="tk-badge">1.00×</span><span class="tk-text">Starting from the upstream implementation.</span>';
        }
      }
      let playing = false,
        time = duration,
        last = null;
      const updateButton = () => {
        playButton.textContent = playing ? 'Pause' : time >= duration - 1e-9 ? 'Replay' : 'Play';
      };
      const frame = (now) => {
        if (!playing) return;
        if (last !== null) time = Math.min(duration, time + (now - last) / 1000 / SECONDS_PER_HOUR);
        last = now;
        setTime(time);
        if (time >= duration) {
          playing = false;
          updateButton();
          return;
        }
        requestAnimationFrame(frame);
      };
      const play = () => {
        if (time >= duration - 1e-9) time = 0;
        playing = true;
        last = null;
        updateButton();
        requestAnimationFrame(frame);
      };
      const pause = () => {
        playing = false;
        updateButton();
      };
      slider.max = duration;
      controls.hidden = false;
      let touched = false;
      playButton.addEventListener('click', () => {
        touched = true;
        if (playing) pause();
        else play();
      });
      slider.addEventListener('input', () => {
        touched = true;
        pause();
        time = Number(slider.value);
        setTime(time);
        updateButton();
      });
      if (REDUCE) {
        setTime(duration);
        updateButton();
      } else {
        time = 0;
        setTime(0);
        updateButton();
        whenVisible(plot, play, 0.5);
        onReturn(plot, () => {
          if (!touched && !playing && time >= duration) play();
        });
      }
    });
  }

  /* ---------- Page chrome ---------- */
  function initChrome() {
    const topbar = $('topbar');
    const onScroll = () => topbar.classList.toggle('scrolled', window.scrollY > 8);
    if ('IntersectionObserver' in window)
      new IntersectionObserver(
        (entries) => topbar.classList.toggle('show-brand', !entries[0].isIntersecting),
        { rootMargin: '-60px 0px 0px 0px' },
      ).observe(document.querySelector('h1'));
    else topbar.classList.add('show-brand');
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    const links = [...document.querySelectorAll('.toc a')];
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting)
              links.forEach((a) =>
                a.classList.toggle('active', a.getAttribute('href') === `#${entry.target.id}`),
              );
          });
        },
        { rootMargin: '-20% 0px -70% 0px' },
      );
      links.forEach((a) => {
        const target = document.querySelector(a.getAttribute('href'));
        if (target) observer.observe(target);
      });
    }
    let toastTimer;
    document.querySelectorAll('[data-copy]').forEach((button) =>
      button.addEventListener('click', async () => {
        const value = $(button.dataset.copy).textContent;
        let copied = false;
        try {
          if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(value);
            copied = true;
          }
        } catch (error) {}
        if (!copied) {
          const area = document.createElement('textarea');
          area.value = value;
          area.style.cssText = 'position:fixed;left:-9999px;top:0';
          document.body.appendChild(area);
          area.select();
          try {
            copied = document.execCommand('copy');
          } catch (error) {}
          area.remove();
        }
        const toast = $('toast');
        toast.textContent = copied ? 'Copied.' : 'Copy unavailable. Select the text instead.';
        toast.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toast.classList.remove('show'), 2400);
      }),
    );
    const toggle = $('theme-toggle');
    const applyTheme = (theme, persist) => {
      document.documentElement.dataset.theme = theme;
      document.querySelector('meta[name="theme-color"]').content =
        theme === 'dark' ? '#111417' : '#ffffff';
      toggle.setAttribute(
        'aria-label',
        theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode',
      );
      if (persist)
        try {
          localStorage.setItem('wamjet-theme', theme);
        } catch (error) {}
    };
    applyTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light', false);
    toggle.hidden = false;
    toggle.addEventListener('click', () =>
      applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark', true),
    );
  }

  [
    initChrome,
    initMotivation,
    initWorkflow,
    initExplorer,
    initLossless,
    initHardware,
    initLatencyTables,
    initSearch,
  ].forEach((init) => {
    try {
      init();
    } catch (error) {
      console.error(`${init.name} failed`, error);
    }
  });
})();
