/* =========================================================
   Niall Rooney — "Desktop" Portfolio
   scripts.js
   ---------------------------------------------------------
   Sections:
   1. Wallpaper (static illustration, drift handled in CSS)
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
     Niall's own illustration is a static <img> (see index.html) with a
     slow CSS-driven Ken Burns drift (see styles.css .wallpaper-img) —
     no JS needed here; prefers-reduced-motion is handled in CSS. */

  /* ---------- 2. MENU BAR CLOCK ----------
     Always shows the real current date/time: ticks aligned to the start
     of each real minute (not a fixed interval, which can drift), and
     force-refreshes the instant the tab regains focus/visibility —
     background tabs get their timers throttled or paused by the browser,
     so without this the clock could sit stale after being backgrounded,
     the laptop sleeping, or a timezone change mid-trip. */
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
      if (opts.disabled && opts.disabled()) return; // movement ignored -> stays a tap
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
    // A single click selects (the highlight) and opens the window in the
    // same motion — no more click-to-select-then-click-again-to-open.
    deselectAll();
    icon.classList.add('selected');
    selectedIcon = icon;
    const win = document.getElementById(icon.dataset.window);
    if (win) openWindow(win);
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
  });

  if (desktop) {
    desktop.addEventListener('pointerdown', (e) => {
      if (!e.target.closest('.dt-icon')) deselectAll();
    });
  }

  /* ---- Layout system: "messy" (uniform, scattered — the default) vs
     "tidy" (the 3 key projects ~15% bigger in their own row up top, the
     rest in a grid underneath). Which mode is active is tracked so a
     window resize re-lays-out things the same way. ---- */
  const CELL_W = 96, CELL_H = 108, PAD_X = 28, PAD_Y = 24;
  const ICON_W = 88, ICON_H = 96, EDGE_MARGIN = 16, MIN_DIST = 100;
  const FEATURED_ROW_GAP = 46;
  const FEATURED_W = 101, FEATURED_H = Math.round(96 * 1.15); // matches .dt-icon.big in styles.css

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
  function scatterAcrossDesktop(els, randForEl, { animate = false } = {}) {
    if (!desktop) return;
    const rect = desktop.getBoundingClientRect();
    const maxX = Math.max(EDGE_MARGIN, rect.width - ICON_W - EDGE_MARGIN);
    const maxY = Math.max(EDGE_MARGIN, rect.height - ICON_H - EDGE_MARGIN);
    const placed = [];
    els.forEach((el) => {
      const rand = randForEl(el);
      let x, y, tries = 0;
      do {
        x = EDGE_MARGIN + rand() * maxX;
        y = EDGE_MARGIN + rand() * maxY;
        tries += 1;
      } while (tries < 14 && placed.some(p => Math.hypot(p.x - x, p.y - y) < MIN_DIST));
      placed.push({ x, y });
      if (animate) el.classList.add('tidying');
      el.style.left = x + 'px';
      el.style.top = y + 'px';
    });
    if (animate) {
      window.setTimeout(() => els.forEach(el => el.classList.remove('tidying')), 520);
    }
  }

  function featuredRowFloor() {
    return PAD_Y + FEATURED_H + FEATURED_ROW_GAP;
  }

  function layoutFeaturedRow(els) {
    const gapX = 28;
    els.forEach((el, i) => {
      el.style.left = (PAD_X + i * (FEATURED_W + gapX)) + 'px';
      el.style.top = PAD_Y + 'px';
    });
  }

  // "Tidy Up Desktop" (and "Work"): the 3 key projects get ~15% bigger and
  // line up in their own row at the top; everything else lines up in a
  // grid underneath. The featured 3 never fall back into the ordinary
  // grid alongside the rest — they're always pulled into their row.
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
  // stable seeded scatter used on first load). Every icon — including the
  // 3 "key" ones — is the same size here and scattered like all the rest;
  // nothing is pinned to a row.
  function messUpDesktop() {
    if (isMobile() || !desktop) return;
    desktopMode = 'messy';
    iconEls.forEach(el => { delete el.dataset.userMoved; el.classList.remove('big'); });
    scatterAcrossDesktop(iconEls, () => Math.random, { animate: true });
  }

  function layoutDesktopIcons() {
    if (isMobile() || !desktop) return;
    desktopMode = 'messy';
    iconEls.forEach(el => el.classList.remove('big'));
    scatterAcrossDesktop(iconEls, seededRandForEl);
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
      scatterAcrossDesktop(inFormation, seededRandForEl);
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

  if (desktop) {
    desktop.addEventListener('click', (e) => {
      if (isMobile() || e.target.closest('.dt-icon')) return;
      openDesktopMenu(e.clientX, e.clientY);
    });
  }
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
  let cascadeCount = 0;

  function bringToFront(win) {
    zTop += 1;
    win.style.zIndex = zTop;
  }

  function cascadePosition(win) {
    cascadeCount += 1;
    const offset = (cascadeCount % 6) * 26;
    win.style.top = (64 + offset) + 'px';
    win.style.left = (56 + offset) + 'px';
  }

  function openWindow(win) {
    if (!win) return;
    if (!win.dataset.positioned) {
      cascadePosition(win);
      win.dataset.positioned = 'true';
    }
    win.classList.add('open');
    bringToFront(win);
    playVideoIn(win);
    win.querySelector('.os-titlebar')?.focus?.();
  }

  function closeWindow(win) {
    if (!win) return;
    win.classList.remove('open', 'maximized');
    pauseVideoIn(win);
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
      tidyUp(); // "Work" organizes the same way Tidy Up does — key projects up top
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
