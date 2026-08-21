/* =========================================================
   Niall Rooney — "Desktop" Portfolio
   scripts.js
   ---------------------------------------------------------
   Sections:
   1. Wallpaper (canvas strand-fan, drawn and animated here)
   2. Menu bar clock
   3. Drag helper (shared by desktop icons + windows)
   4. Desktop icons — messy layout, select/drag/open, "Tidy Up Desktop"
   5. Windows (open / close / minimize / maximize / stacking / resize)
   6. Vimeo playback control
   7. Dock (magnify effect + actions)
   8. Keyboard shortcuts
   ========================================================= */

document.addEventListener('DOMContentLoaded', () => {

  /* ---------- 1. WALLPAPER ----------
     A tight bundle of thick, cleanly separated pastel "silk" strands
     fanning across an off-white ground, with a subtle current running
     through it: each strand's curve leans on its own phase and bands of
     brightness travel across the bundle, so the sweep is alive without the
     individual strands ever losing their line.
       That current means the strands genuinely have to be re-stroked every
     frame, so the cost is managed deliberately: every strand's fixed
     properties (position, colour, width, phase) are computed once into a
     flat array, the per-frame loop only recomputes the parts that actually
     move, and the buffer is kept at a modest resolution since the graphic
     is soft-edged anyway. It also stops entirely when the tab is hidden or
     when the visitor has asked for reduced motion. */
  (function initWallpaper() {
    const canvas = document.getElementById('wallpaperCanvas');
    if (!canvas || !canvas.getContext) return;
    const ctx = canvas.getContext('2d');

    // Enough to read as a bundle, few enough that the paper still shows
    // between them — and each one costs a stroke every frame.
    const STRANDS = 320;

    // Seeded PRNG — the per-strand jitter has to come out identical on
    // every load and every resize, or the wallpaper would visibly reshuffle
    // itself whenever the window changed size.
    function seeded(seed) {
      let s = seed >>> 0;
      return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 4294967296;
      };
    }

    // Pastel blue → green → orange across the fan, ordered so the ramp
    // travels *around* the colour wheel (blue → cyan → green → yellow →
    // amber → orange) rather than straight across it. Blue and orange are
    // opposites: run them directly into each other and every blend in
    // between desaturates to grey, which reads as a washed-out hole in the
    // middle of the fan. Going the long way keeps every intermediate step
    // a real colour.
    const STOPS = [
      [0.00, [205, 230, 247]], // palest blue, at the white edge
      [0.14, [164, 208, 239]], // pastel blue
      [0.29, [160, 220, 220]], // aqua
      [0.43, [167, 226, 195]], // pastel green
      [0.57, [191, 231, 177]], // green-yellow
      [0.71, [228, 234, 168]], // pale yellow
      [0.86, [255, 218, 155]], // pastel amber
      [1.00, [255, 195, 136]], // light orange
    ];

    function colourAt(u) {
      for (let i = 1; i < STOPS.length; i += 1) {
        if (u <= STOPS[i][0]) {
          const [p0, c0] = STOPS[i - 1];
          const [p1, c1] = STOPS[i];
          const k = (u - p0) / (p1 - p0);
          return [
            Math.round(c0[0] + (c1[0] - c0[0]) * k),
            Math.round(c0[1] + (c1[1] - c0[1]) * k),
            Math.round(c0[2] + (c1[2] - c0[2]) * k),
          ];
        }
      }
      return STOPS[STOPS.length - 1][1];
    }

    // One clean quadratic bow per strand — a single, unbroken curve, so
    // each strand reads as one continuous line. (A sampled-polyline version
    // was tried, which allowed a real undulating wave along each strand's
    // length; it made the bundle look churned rather than combed, so the
    // motion here comes from the whole curve swinging gently instead.)
    let strands = [];
    let w = 0;
    let h = 0;

    // Everything that never changes per frame is worked out once here.
    function build() {
      // Capped at 1.5 rather than the full device ratio: this is a soft,
      // out-of-focus graphic being redrawn continuously, so the extra
      // pixels of a 2x buffer cost real frame time and buy nothing you can
      // see.
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineCap = 'round';

      const rand = seeded(20260821);
      strands = [];

      for (let i = 0; i < STRANDS; i += 1) {
        // Tight bundle: the waist spans a narrow band and the ends sweep
        // through a small arc, so the strands run close and near-parallel
        // instead of spraying across the whole canvas.
        const u = Math.min(1, Math.max(0, i / (STRANDS - 1) + (rand() - 0.5) * 0.014));

        // The fan enters at the top-right corner (the first few strands
        // begin off the right edge, so the bundle wraps the corner rather
        // than dropping out of the middle of the top edge) and hooks round
        // to exit low on the left.
        //   The ends sweep along the bottom edge and then up the left one,
        // but only as far as 0.58h — comfortably below the midline. That cap
        // is the point: an earlier attempt let them climb to 0.46h, and the
        // longest, most saturated strands ended up arcing across the *top*
        // left, which dragged all the weight off the top-right corner. Held
        // low, the same left-edge exits give the sweep somewhere to go
        // without unbalancing it.
        const sx = (1.14 - 0.28 * u) * w;
        const sy = -0.08 * h;

        let ex, ey;
        if (u < 0.45) {
          ex = (0.70 - 0.60 * (u / 0.45)) * w;
          ey = 1.08 * h;
        } else {
          ex = -0.08 * w;
          ey = (1.08 - 0.50 * ((u - 0.45) / 0.55)) * h;
        }

        const [r, g, b] = colourAt(u);
        strands.push({
          u,
          sx, sy, ex, ey,
          // Bow. Holding the control point near the *start's* x but most of
          // the way down to the end's y is what bends each strand properly:
          // it leaves the top heading downward, then turns and runs left
          // into its end — a hooked quarter-sweep rather than the shallow
          // diagonal a mid-chord control point gives. Recomputed per frame
          // with the swing added on top.
          cxBase: sx + (ex - sx) * 0.10 + 0.06 * w,
          cyBase: sy + (ey - sy) * 0.86,
          rgb: `${r},${g},${b}`,
          // Thick: mostly heavy strokes with a scatter of finer ones over
          // the top for grain.
          width: 5 + rand() * rand() * 20,
          // Loosened a little from the fully-packed version: lower opacity
          // per strand lets the off-white ground read *between* the strands
          // rather than everything merging into one solid mass.
          alpha: Math.min(0.78, (0.14 + rand() * 0.27) * (0.72 + 0.55 * u)),
          phase: rand() * Math.PI * 2,
        });
      }
    }

    function render(tMs) {
      const t = tMs / 1000;
      ctx.clearRect(0, 0, w, h);

      for (let i = 0; i < strands.length; i += 1) {
        const s = strands[i];

        // The current, kept deliberately gentle: the strand's single control
        // point drifts, so the whole curve leans and relaxes as one piece
        // and the line stays clean. The `u * 2.6` term staggers neighbours
        // so the motion travels across the bundle rather than every strand
        // moving in lockstep.
        const cx = s.cxBase + Math.sin(t * 0.34 + s.phase + s.u * 2.6) * 0.030 * w;
        const cy = s.cyBase + Math.cos(t * 0.26 + s.phase) * 0.016 * h;

        // A slower wave of brightness crossing the bundle (this keys off
        // `u`, the strand's position in the fan) — most of what reads as
        // flow comes from this rather than from the movement itself.
        const pulse = 0.82 + 0.30 * Math.sin(t * 0.42 - s.u * 5.2);

        ctx.strokeStyle = `rgba(${s.rgb},${Math.min(0.95, s.alpha * pulse).toFixed(3)})`;
        ctx.lineWidth = s.width;
        ctx.beginPath();
        ctx.moveTo(s.sx, s.sy);
        ctx.quadraticCurveTo(cx, cy, s.ex, s.ey);
        ctx.stroke();
      }
    }

    const stillMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let rafId = null;

    function frame(t) {
      render(t);
      rafId = window.requestAnimationFrame(frame);
    }
    function start() {
      if (rafId === null) rafId = window.requestAnimationFrame(frame);
    }
    function stop() {
      if (rafId !== null) { window.cancelAnimationFrame(rafId); rafId = null; }
    }

    build();
    if (stillMotion.matches) {
      render(0); // one static frame, no loop
    } else {
      start();
    }

    // Don't burn frames (or battery) animating a wallpaper nobody is
    // looking at.
    document.addEventListener('visibilitychange', () => {
      if (stillMotion.matches) return;
      if (document.visibilityState === 'hidden') stop();
      else start();
    });

    let resizeTimer = null;
    window.addEventListener('resize', () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        build();
        if (stillMotion.matches) render(0);
      }, 150);
    });
  })();

  /* ---------- 2. MENU BAR CLOCK ---------- */
  (function initClock() {
    const el = document.getElementById('menuClock');
    if (!el) return;

    function render() {
      const d = new Date();
      const date = d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
      const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
      el.textContent = `${date}  ${time}`;
    }

    function scheduleNextTick() {
      render();
      const now = new Date();
      const msToNextMinute = 60000 - (now.getSeconds() * 1000 + now.getMilliseconds());
      setTimeout(scheduleNextTick, Math.max(1000, msToNextMinute));
    }
    scheduleNextTick();

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') render();
    });
    window.addEventListener('focus', render);
  })();

  /* ---------- 3. DRAG HELPER ---------- */
  function getOffsetOrigin(el) {
    const parent = el.offsetParent;
    const parentRect = parent ? parent.getBoundingClientRect() : { left: 0, top: 0 };
    const rect = el.getBoundingClientRect();
    return { x: rect.left - parentRect.left, y: rect.top - parentRect.top };
  }

  function makeDraggable(el, handle, opts = {}) {
    handle = handle || el;
    let pointerId = null;
    let moved = false;
    let startPX = 0, startPY = 0;
    let baseX = 0, baseY = 0;

    handle.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.traffic')) return;
      if (e.button !== undefined && e.button !== 0) return;
      pointerId = e.pointerId;
      moved = false;
      startPX = e.clientX;
      startPY = e.clientY;
      handle.setPointerCapture(pointerId);
      if (opts.onStart) opts.onStart();
    });

    handle.addEventListener('pointermove', (e) => {
      if (pointerId === null || e.pointerId !== pointerId) return;
      if (opts.disabled && opts.disabled()) return;
      const dx = e.clientX - startPX;
      const dy = e.clientY - startPY;

      if (!moved) {
        if (Math.hypot(dx, dy) < 6) return;
        moved = true;
        const origin = getOffsetOrigin(el);
        baseX = origin.x;
        baseY = origin.y;
        if (opts.setPosition !== false) el.style.position = 'absolute';
        el.style.left = baseX + 'px';
        el.style.top = baseY + 'px';
        if (opts.onDragStart) opts.onDragStart();
      }

      el.style.left = (baseX + (e.clientX - startPX)) + 'px';
      el.style.top = (baseY + (e.clientY - startPY)) + 'px';
    });

    handle.addEventListener('pointerup', (e) => {
      if (pointerId === null || e.pointerId !== pointerId) return;
      try { handle.releasePointerCapture(pointerId); } catch (_) {}
      pointerId = null;
      if (opts.onEnd) opts.onEnd(moved);
    });
  }

  const isMobile = () => window.matchMedia('(max-width: 640px)').matches;

  /* ---------- 4. DESKTOP ICONS: messy layout, drag, select/open, tidy up ---------- */
  const desktop = document.getElementById('desktop');
  const iconEls = Array.from(document.querySelectorAll('.dt-icon'));
  let selectedIcon = null;

  function deselectAll() {
    document.querySelectorAll('.dt-icon.selected').forEach(i => i.classList.remove('selected'));
    selectedIcon = null;
  }

  function handleIconActivate(icon) {
    // On touch devices there's no hover state to preview a select-first
    // step, and no mouse muscle-memory for "click again to open" — one tap
    // just opens it directly, the way tapping an app icon does anywhere else.
    if (isMobile()) {
      deselectAll();
      icon.classList.add('selected');
      selectedIcon = icon;
      const win = document.getElementById(icon.dataset.window);
      if (win) openWindow(win);
      return;
    }
    // Desktop: Finder-style two-step. The first click just selects it (the
    // highlight). A second click on an already-selected icon opens it —
    // which also means two clicks close together (a real double-click)
    // open it in one motion, without needing a separate dblclick listener.
    if (icon.classList.contains('selected')) {
      const win = document.getElementById(icon.dataset.window);
      if (win) openWindow(win);
      return;
    }
    deselectAll();
    icon.classList.add('selected');
    selectedIcon = icon;
  }

  iconEls.forEach((icon, index) => {
    icon.dataset.idx = index;
    makeDraggable(icon, icon, {
      disabled: isMobile,
      onStart: () => icon.classList.add('dragging'),
      onDragStart: () => { icon.style.zIndex = 5; },
      onEnd: (moved) => {
        icon.classList.remove('dragging');
        if (moved) {
          icon.dataset.userMoved = 'true'; // hand-placed — leave it alone on resize
        } else {
          handleIconActivate(icon);
        }
      }
    });
    // Keyboard equivalent of a click/tap — without this, tabindex="0" lets
    // a keyboard user focus an icon but Enter/Space did nothing at all,
    // since everything else here is driven by pointer events only.
    icon.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault(); // stop Space from also scrolling the page
      handleIconActivate(icon);
    });
  });

  if (desktop) {
    desktop.addEventListener('pointerdown', (e) => {
      if (!e.target.closest('.dt-icon')) deselectAll();
    });
  }

  // The Deck Design icon's preview autoplays on loop like a silent GIF —
  // fine for most people, but a real problem for anyone who's told their
  // OS they don't want unrequested motion. Same prefers-reduced-motion
  // this site already honors for the wallpaper's current and its CSS
  // transitions, just extended to video, which CSS alone can't stop.
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.querySelectorAll('.dt-icon-thumb video').forEach(v => {
      v.pause();
      v.removeAttribute('autoplay');
    });
  }

  /* ---- Layout system: "messy" (uniform, scattered — the default) vs
     "tidy" (the 3 key projects an additional 15% bigger — compounding on
     top of the existing +15% — lined up left-aligned along the top; the
     rest lined up neatly in a grid underneath). Which mode is active is
     tracked so a window resize re-lays-out things the same way. ---- */
  const CELL_W = 96, CELL_H = 108, PAD_X = 28, PAD_Y = 24;
  const ICON_W = 88, ICON_H = 96, EDGE_MARGIN = 16, MIN_DIST = 100;
  const FEATURED_ROW_GAP = 46;
  // .dt-icon.big is two compounded +15% bumps on the base size — this
  // mirrors styles.css so the row math (width + gaps) matches what's
  // actually on screen.
  const FEATURED_W = 116, FEATURED_H = Math.round(96 * 1.15 * 1.15); // matches .dt-icon.big in styles.css
  // The 3 key projects need to visibly stand out in messy mode too, not
  // just tidy: bigger gaps between them so they don't crowd each other.
  const FEATURED_MIN_DIST = 170;

  let desktopMode = 'messy';
  const featuredIcons = () => iconEls.filter(el => el.classList.contains('featured'));
  const regularIcons = () => iconEls.filter(el => !el.classList.contains('featured'));

  // Small deterministic PRNG — each icon's spread is stable across resizes
  // (seeded by its own index) instead of reshuffling every time.
  function seededRandom(seed) {
    let s = seed % 2147483647;
    if (s <= 0) s += 2147483646;
    return () => (s = (s * 16807) % 2147483647) / 2147483647;
  }
  const seededRandForEl = (el) => seededRandom((Number(el.dataset.idx) || 0) * 92821 + 12345);

  // macOS-style column-major flow: fill a column top-to-bottom, then wrap
  // right. `topFloor` lets the grid start below the featured row.
  function computeGridPositions(els, topFloor) {
    if (!desktop) return [];
    const rect = desktop.getBoundingClientRect();
    const usableH = Math.max(rect.height - topFloor - PAD_Y, CELL_H);
    const rowsPerCol = Math.max(1, Math.floor(usableH / CELL_H));
    return els.map((el, index) => {
      const col = Math.floor(index / rowsPerCol);
      const row = index % rowsPerCol;
      return { el, x: PAD_X + col * CELL_W, y: topFloor + row * CELL_H };
    });
  }

  // Truly scattered across the whole desktop, not just jittered within a
  // tidy grid cell — with light rejection-sampling so icons land near
  // each other sometimes (real desktops do that) without stacking solid.
  // `randForEl` returns a fresh rand() generator per icon: seeded (stable,
  // for the initial load / resize reflow) or genuinely random (for the
  // "Mess Up Desktop" action, which should shuffle differently every time).
  // `yStart`/`yEnd` confine the scatter to a horizontal band — used to keep
  // the 3 featured icons in the top half, and the rest strictly below it.
  function scatterAcrossDesktop(els, randForEl, opts = {}) {
    const {
      animate = false,
      yStart = EDGE_MARGIN,
      yEnd = null,
      minDist = MIN_DIST,
      iconW = ICON_W,
      iconH = ICON_H,
    } = opts;
    if (!desktop) return [];
    const rect = desktop.getBoundingClientRect();
    const maxX = Math.max(EDGE_MARGIN, rect.width - iconW - EDGE_MARGIN);
    const bottom = yEnd != null ? yEnd - iconH : rect.height - iconH - EDGE_MARGIN;
    const maxY = Math.max(EDGE_MARGIN, bottom - yStart);
    const placed = [];
    els.forEach((el) => {
      const rand = randForEl(el);
      let x, y, tries = 0;
      do {
        x = EDGE_MARGIN + rand() * maxX;
        y = yStart + rand() * maxY;
        tries += 1;
      } while (tries < 14 && placed.some(p => Math.hypot(p.x - x, p.y - y) < minDist));
      placed.push({ x, y });
      if (animate) el.classList.add('tidying');
      el.style.left = x + 'px';
      el.style.top = y + 'px';
    });
    if (animate) {
      window.setTimeout(() => els.forEach(el => el.classList.remove('tidying')), 520);
    }
    return placed;
  }

  // Messy-mode layout for one set of icons: the 3 featured ones scatter
  // (bigger, with extra breathing room) through the top half only, so they
  // stand out at a glance; everything else scatters through the bottom
  // half only. The two bands never overlap, so a regular icon can never
  // land above (or even level with) the featured 3 — not just usually
  // clear of them, but structurally unable to.
  function layoutMessyScatter(els, randForEl, { animate = false } = {}) {
    if (!desktop) return;
    const featured = els.filter(el => el.classList.contains('featured'));
    const regular = els.filter(el => !el.classList.contains('featured'));
    featured.forEach(el => el.classList.add('big'));
    regular.forEach(el => el.classList.remove('big'));

    const rect = desktop.getBoundingClientRect();
    const topHalfEnd = Math.max(EDGE_MARGIN + FEATURED_H, rect.height / 2);
    scatterAcrossDesktop(featured, randForEl, {
      animate,
      yEnd: topHalfEnd,
      minDist: FEATURED_MIN_DIST,
      iconW: FEATURED_W,
      iconH: FEATURED_H,
    });
    scatterAcrossDesktop(regular, randForEl, {
      animate,
      yStart: topHalfEnd + FEATURED_ROW_GAP / 2,
    });
  }

  function featuredRowFloor() {
    return PAD_Y + FEATURED_H + FEATURED_ROW_GAP;
  }

  // Left-aligned row, starting at the same left margin as the tidy grid
  // underneath it.
  function layoutFeaturedRow(els) {
    const gapX = 28;
    els.forEach((el, i) => {
      el.style.left = (PAD_X + i * (FEATURED_W + gapX)) + 'px';
      el.style.top = PAD_Y + 'px';
    });
  }

  // "Tidy Up Desktop" (and "Work"): the 3 key projects get an extra 15%
  // bigger and line up, left-aligned, in their own row at the top; every
  // other icon lines up neatly in a grid underneath. The featured 3 never
  // fall back into the ordinary grid alongside the rest — they're always
  // pulled into their row.
  function tidyUp() {
    if (isMobile() || !desktop) return;
    desktopMode = 'tidy';
    const featured = featuredIcons();
    const regular = regularIcons();
    const all = featured.concat(regular);
    all.forEach(el => el.classList.add('tidying'));

    featured.forEach(el => el.classList.add('big'));
    layoutFeaturedRow(featured);
    computeGridPositions(regular, featuredRowFloor()).forEach(({ el, x, y }) => {
      el.style.left = x + 'px';
      el.style.top = y + 'px';
    });

    all.forEach(el => delete el.dataset.userMoved);
    window.setTimeout(() => all.forEach(el => el.classList.remove('tidying')), 520);
  }

  // "Mess Up Desktop": genuinely random every time it's invoked (unlike the
  // stable seeded scatter used on first load). The 3 "key" projects stay
  // bigger and confined to the top half here too — only their exact spot
  // reshuffles, not their prominence — while everything else scatters
  // freely, nothing pinned to a row.
  function messUpDesktop() {
    if (isMobile() || !desktop) return;
    desktopMode = 'messy';
    iconEls.forEach(el => delete el.dataset.userMoved);
    layoutMessyScatter(iconEls, () => Math.random, { animate: true });
  }

  function layoutDesktopIcons() {
    if (isMobile() || !desktop) return;
    desktopMode = 'messy';
    layoutMessyScatter(iconEls, seededRandForEl);
  }

  layoutDesktopIcons();

  window.addEventListener('resize', () => {
    if (isMobile() || !desktop) return;
    // Hand-placed icons stay put (just clamped back into view); everything
    // still "in formation" gets re-laid-out for the new bounds, in
    // whichever mode — messy or tidy — is currently active.
    const rect = desktop.getBoundingClientRect();
    iconEls.forEach(el => {
      if (!el.dataset.userMoved) return;
      const r = el.getBoundingClientRect();
      const x = Math.min(Math.max(r.left - rect.left, 4), rect.width - r.width - 4);
      const y = Math.min(Math.max(r.top - rect.top, 4), rect.height - r.height - 4);
      el.style.left = x + 'px';
      el.style.top = y + 'px';
    });

    const inFormation = iconEls.filter(el => !el.dataset.userMoved);
    if (desktopMode === 'tidy') {
      layoutFeaturedRow(inFormation.filter(el => el.classList.contains('featured')));
      computeGridPositions(
        inFormation.filter(el => !el.classList.contains('featured')),
        featuredRowFloor()
      ).forEach(({ el, x, y }) => {
        el.style.left = x + 'px';
        el.style.top = y + 'px';
      });
    } else {
      layoutMessyScatter(inFormation, seededRandForEl);
    }
  });

  /* ---- "Tidy Up Desktop": click empty desktop space to summon it ---- */
  const desktopMenu = document.getElementById('desktopMenu');

  function openDesktopMenu(x, y) {
    if (!desktopMenu) return;
    desktopMenu.classList.add('open');
    const rect = desktopMenu.getBoundingClientRect();
    const maxX = window.innerWidth - rect.width - 8;
    const maxY = window.innerHeight - rect.height - 8;
    desktopMenu.style.left = Math.min(x, maxX) + 'px';
    desktopMenu.style.top = Math.min(y, maxY) + 'px';
  }
  function closeDesktopMenu() {
    desktopMenu?.classList.remove('open');
  }

  // Listens on the whole page, not just `.desktop` — the dock sits in its
  // own reserved strip at the bottom that's wider than the dock pill
  // itself, and the same strip exists to either side of the menu bar's own
  // content. Those margins used to be genuinely dead: nothing there had a
  // click handler at all. Scoping by what the click *hit* (rather than
  // what element it's attached to) makes that whole background — desktop,
  // and the dead space flanking the dock/menu bar — click-away-able.
  document.body.addEventListener('click', (e) => {
    if (e.target.closest('.dt-icon, .os-window, .dock, .menubar, .desktop-menu')) return;
    // Any open window takes priority: a tap/click on empty background
    // dismisses all of them first, same as tapping away from a modal —
    // on mobile the open project window covers almost the whole screen,
    // so this is what makes "tap away to close" actually reachable there.
    if (windowsEls.some(w => w.classList.contains('open'))) {
      closeAllWindows();
      deselectAll();
      return;
    }
    // The Tidy/Mess context menu is a desktop-only, mouse-driven
    // convenience — skip summoning it on touch devices, and only summon it
    // for clicks actually within the icon field, not the dead-zone margins.
    if (isMobile() || !e.target.closest('.desktop')) return;
    openDesktopMenu(e.clientX, e.clientY);
  });
  document.addEventListener('pointerdown', (e) => {
    if (desktopMenu?.classList.contains('open') && !e.target.closest('.desktop-menu')) {
      closeDesktopMenu();
    }
  });
  desktopMenu?.querySelector('[data-action="tidy-confirm"]')?.addEventListener('click', () => {
    tidyUp();
    closeDesktopMenu();
  });
  desktopMenu?.querySelector('[data-action="mess-confirm"]')?.addEventListener('click', () => {
    messUpDesktop();
    closeDesktopMenu();
  });

  /* ---------- 5. WINDOWS ---------- */
  const windowsEls = Array.from(document.querySelectorAll('.os-window'));
  let zTop = 10;

  function bringToFront(win) {
    zTop += 1;
    win.style.zIndex = zTop;
  }

  // Positioning: the first window opened lands dead-center on screen.
  // Every window opened after that stacks off neatly to the right (and
  // slightly down) of whichever one opened just before it, so a run of
  // opens reads as a fanned stack rather than a random cascade. Tracked
  // in `openStack`, in the order windows were opened; closing one just
  // drops it out — the rest keep their positions.
  let openStack = [];
  const STACK_STEP_X = 44, STACK_STEP_Y = 28;
  const WIN_MENUBAR_H = 34, WIN_DOCK_H = 78, WIN_EDGE_MARGIN = 12;

  function centerWindow(win) {
    const rect = win.getBoundingClientRect();
    const availH = window.innerHeight - WIN_MENUBAR_H - WIN_DOCK_H;
    const left = Math.max(WIN_EDGE_MARGIN, (window.innerWidth - rect.width) / 2);
    const top = WIN_MENUBAR_H + Math.max(WIN_EDGE_MARGIN, (availH - rect.height) / 2);
    win.style.left = left + 'px';
    win.style.top = top + 'px';
  }

  function stackWindow(win) {
    if (!openStack.length) {
      centerWindow(win);
      return;
    }
    const prevRect = openStack[openStack.length - 1].getBoundingClientRect();
    const rect = win.getBoundingClientRect();
    const maxLeft = window.innerWidth - rect.width - WIN_EDGE_MARGIN;
    const maxTop = window.innerHeight - WIN_DOCK_H - rect.height - WIN_EDGE_MARGIN;
    const left = Math.min(maxLeft, prevRect.left + STACK_STEP_X);
    const top = Math.min(maxTop, Math.max(WIN_MENUBAR_H + WIN_EDGE_MARGIN, prevRect.top + STACK_STEP_Y));
    win.style.left = left + 'px';
    win.style.top = top + 'px';
  }

  function openWindow(win) {
    if (!win) return;
    if (!win.classList.contains('open')) {
      win.classList.add('open'); // laid out now, so getBoundingClientRect below is real
      stackWindow(win);
      openStack.push(win);
    }
    bringToFront(win);
    playVideoIn(win);
    win.querySelector('.os-titlebar')?.focus?.();
  }

  function closeWindow(win) {
    if (!win) return;
    win.classList.remove('open', 'maximized');
    pauseVideoIn(win);
    win.querySelectorAll('video').forEach(v => { v.pause(); v.currentTime = 0; });
    openStack = openStack.filter(w => w !== win);
  }

  function minimizeWindow(win) {
    if (!win) return;
    win.classList.remove('open');
  }

  function closeAllWindows() {
    windowsEls.forEach(closeWindow);
  }

  function topWindow() {
    const open = windowsEls.filter(w => w.classList.contains('open'));
    if (!open.length) return null;
    return open.reduce((a, b) => (parseInt(b.style.zIndex || 0) > parseInt(a.style.zIndex || 0) ? b : a));
  }

  // Resizable windows: all 4 edges plus all 4 corners, each dragged the
  // same way everything else here is — pointer events, no library.
  // Edges resize one axis; corners resize both together (a uniform
  // diagonal scale) with the opposite edge/corner staying anchored in
  // place, same as any real desktop window. Disabled while maximized or
  // on mobile (window already fills the screen in both cases).
  const WIN_MIN_W = 320, WIN_MIN_H = 220, TOP_FLOOR = 38;

  function makeResizable(win) {
    function addHandle(dir) {
      const handle = document.createElement('span');
      handle.className = 'os-resize-handle os-resize-' + dir;
      handle.setAttribute('aria-hidden', 'true');
      win.appendChild(handle);

      const hasE = dir.includes('e'), hasW = dir.includes('w');
      const hasS = dir.includes('s'), hasN = dir.includes('n');
      let pointerId = null;
      let startX = 0, startY = 0, startW = 0, startH = 0, startLeft = 0, startTop = 0;

      handle.addEventListener('pointerdown', (e) => {
        if (win.classList.contains('maximized') || isMobile()) return;
        pointerId = e.pointerId;
        startX = e.clientX;
        startY = e.clientY;
        const rect = win.getBoundingClientRect();
        startW = rect.width;
        startH = rect.height;
        startLeft = rect.left;
        startTop = rect.top;
        win.style.maxHeight = 'none'; // let an explicit height win over the default clamp
        handle.setPointerCapture(pointerId);
      });

      handle.addEventListener('pointermove', (e) => {
        if (pointerId === null || e.pointerId !== pointerId) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;

        if (hasE) {
          const maxW = window.innerWidth - startLeft - 12;
          win.style.width = Math.min(maxW, Math.max(WIN_MIN_W, startW + dx)) + 'px';
        } else if (hasW) {
          // Right edge stays put — left moves, width fills the gap.
          const rightEdge = startLeft + startW;
          const newLeft = Math.min(Math.max(startLeft + dx, 4), rightEdge - WIN_MIN_W);
          win.style.left = newLeft + 'px';
          win.style.width = (rightEdge - newLeft) + 'px';
        }

        if (hasS) {
          const maxH = window.innerHeight - startTop - 12;
          win.style.height = Math.min(maxH, Math.max(WIN_MIN_H, startH + dy)) + 'px';
        } else if (hasN) {
          // Bottom edge stays put — top moves, height fills the gap.
          const bottomEdge = startTop + startH;
          const newTop = Math.min(Math.max(startTop + dy, TOP_FLOOR), bottomEdge - WIN_MIN_H);
          win.style.top = newTop + 'px';
          win.style.height = (bottomEdge - newTop) + 'px';
        }
      });

      handle.addEventListener('pointerup', (e) => {
        if (pointerId === null || e.pointerId !== pointerId) return;
        try { handle.releasePointerCapture(pointerId); } catch (_) {}
        pointerId = null;
      });
    }

    ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].forEach(addHandle);
  }

  windowsEls.forEach(win => {
    const bar = win.querySelector('.os-titlebar');
    win.addEventListener('pointerdown', () => bringToFront(win), true);

    // With several windows able to be open at once, "Close"/"Minimize"/
    // "Maximize" alone would announce identically for every one of them to
    // a screen reader — there'd be no way to tell which window a given
    // button belongs to. Folding the window's own title into each label
    // fixes that without hand-editing every button in the markup.
    const winTitle = win.querySelector('.os-title')?.textContent.trim();
    if (winTitle) {
      bar.querySelectorAll('.traffic').forEach(btn => {
        btn.setAttribute('aria-label', `${btn.getAttribute('aria-label')} ${winTitle}`);
      });
    }

    bar.querySelector('[data-action="close"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      closeWindow(win);
    });
    bar.querySelector('[data-action="min"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      minimizeWindow(win);
    });
    bar.querySelector('[data-action="max"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      win.classList.toggle('maximized');
    });

    makeDraggable(win, bar, {
      setPosition: false,
      disabled: () => win.classList.contains('maximized') || isMobile()
    });

    makeResizable(win);
  });

  // Expose activation triggers for menu bar / dock links that open windows by id
  document.querySelectorAll('[data-open-window]').forEach(trigger => {
    trigger.addEventListener('click', (e) => {
      e.preventDefault();
      openWindow(document.getElementById(trigger.dataset.openWindow));
    });
  });

  document.querySelectorAll('[data-action="show-desktop"]').forEach(trigger => {
    trigger.addEventListener('click', (e) => {
      e.preventDefault();
      closeAllWindows();
      deselectAll();
      // "Work" toggles: tidy it up if it's currently messy, mess it back up
      // if it's already tidy — so hitting it again undoes the last tidy.
      if (desktopMode === 'tidy') messUpDesktop();
      else tidyUp();
    });
  });

  /* ---------- 6. VIMEO PLAYBACK CONTROL ---------- */
  const vimeoPlayers = new WeakMap();

  function getPlayer(iframe) {
    if (typeof Vimeo === 'undefined') return null;
    if (!vimeoPlayers.has(iframe)) vimeoPlayers.set(iframe, new Vimeo.Player(iframe));
    return vimeoPlayers.get(iframe);
  }

  function playVideoIn(win) {
    const iframe = win.querySelector('.vimeo-frame');
    if (!iframe) return;
    const player = getPlayer(iframe);
    player?.play().catch(() => {});
  }

  function pauseVideoIn(win) {
    const iframe = win.querySelector('.vimeo-frame');
    if (!iframe) return;
    const player = getPlayer(iframe);
    if (!player) return;
    player.pause().catch(() => {});
    player.setCurrentTime(0).catch(() => {});
  }

  /* ---------- 7. DOCK ---------- */
  const dock = document.getElementById('dock');
  const dockIcons = dock ? Array.from(dock.querySelectorAll('.dock-icon')) : [];

  if (dock) {
    dock.addEventListener('mousemove', (e) => {
      dockIcons.forEach(icon => {
        const rect = icon.getBoundingClientRect();
        const center = rect.left + rect.width / 2;
        const dist = Math.abs(e.clientX - center);
        const influence = 90;
        const maxScale = 1.5;
        const scale = Math.max(1, maxScale - (dist / influence) * (maxScale - 1));
        icon.style.transform = `translateY(${(scale - 1) * -16}px) scale(${scale})`;
      });
    });
    dock.addEventListener('mouseleave', () => {
      dockIcons.forEach(icon => { icon.style.transform = ''; });
    });
  }

  /* ---- Dock resize handle: drag the divider to grow/shrink the dock ---- */
  const dockResizeHandle = document.getElementById('dockResizeHandle');
  const DOCK_MIN = 34, DOCK_MAX = 74;

  if (dockResizeHandle && dock) {
    let pointerId = null, startY = 0, startSize = 48;

    const currentDockSize = () =>
      parseFloat(getComputedStyle(dock).getPropertyValue('--dock-icon-size')) || 48;

    dockResizeHandle.addEventListener('pointerdown', (e) => {
      pointerId = e.pointerId;
      startY = e.clientY;
      startSize = currentDockSize();
      dockResizeHandle.setPointerCapture(pointerId);
    });

    dockResizeHandle.addEventListener('pointermove', (e) => {
      if (pointerId === null || e.pointerId !== pointerId) return;
      const delta = startY - e.clientY; // drag up = bigger, down = smaller
      const next = Math.min(DOCK_MAX, Math.max(DOCK_MIN, startSize + delta));
      dock.style.setProperty('--dock-icon-size', next + 'px');
    });

    dockResizeHandle.addEventListener('pointerup', (e) => {
      if (pointerId === null || e.pointerId !== pointerId) return;
      try { dockResizeHandle.releasePointerCapture(pointerId); } catch (_) {}
      pointerId = null;
    });
  }

  /* ---------- 8. KEYBOARD SHORTCUTS ---------- */
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (desktopMenu?.classList.contains('open')) { closeDesktopMenu(); return; }
    const win = topWindow();
    if (win) closeWindow(win);
  });

});
