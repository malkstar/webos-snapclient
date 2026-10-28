/* D-pad navigation + text entry for closed-firmware webOS TVs (LG 9.x).

 * Text fields: real focus() + PalmSystem.keyboardShow(x,y) - the WAM-injected
 * PalmSystem object drives the TV's BUILT-IN keyboard (it is not a luna
 * service, which is why com.webos.service.keyboard probes said "does not
 * exist"). Verified on-device: keyboardShow needs viewport coords, state is
 * the isKeyboardVisible property, and while it is up the remote's Back key
 * closes only the keyboard.
 *
 * While the keyboard is up every key belongs to it; we poll isKeyboardVisible
 * to detect dismissal, then blur so a later OK on a button can never re-pop
 * the IME (focused input + Enter = keyboard again).
 *
 * If this firmware never shows the IME (keyboardShow throws / state stays
 * false), we fall back to a small in-app on-screen keyboard.
 *
 * Visual ring is class-based (.nf); nothing gets focus() except text inputs -
 * especially not <select>, whose native dropdown we cannot dismiss. */
(function () {
  'use strict';

  // Ring order follows the VISUAL layout top-to-bottom, so D-pad travel never
  // has to wrap through unrelated controls (the advanced panel sits below the
  // buttons, hence port/latency/player/autostart come last; hidden items are
  // filtered out of the ring automatically).
  var ORDER = ['server', 'scan', 'save', 'start', 'stop', 'advanced', 'logtoggle', 'refresh',
               'port', 'latency', 'player', 'autostart'];
  var LG_BACK = 461;
  var idx = 0;
  var mode = 'ring'; // ring | native | osk
  var nativeWait = null, nativePoll = null;
  var osk = null;    // {target, buffer, rows, r, c}

  function $(id) { return document.getElementById(id); }
  function vis(el) { return !!el && !el.disabled && el.offsetParent !== null; }
  function ring() {
    // static order first (hidden advanced items auto-skip); dynamic entries
    // such as scan results (.dynav, added by app.js at runtime) are inserted
    // right after the control that created them (e.g. Scan) so one more OK
    // reaches them - appending at the ring's tail made them effectively
    // unreachable by D-pad once focus moved anywhere else.
    var els = ORDER.map($).filter(vis);
    var dyn = Array.prototype.slice.call(document.querySelectorAll('.dynav')).filter(vis);
    if (!dyn.length) return els;
    var at = els.indexOf($('scan'));
    if (at < 0) return dyn.concat(els);
    return els.slice(0, at + 1).concat(dyn, els.slice(at + 1));
  }
  function cur() {
    var els = ring();
    if (!els.length) return null;
    if (idx >= els.length) idx = 0;
    return els[idx];
  }
  function isText(el) { return el && el.tagName === 'INPUT' && el.type !== 'checkbox'; }

  function repaint() {
    ORDER.forEach(function (id) { var e = $(id); if (e) e.classList.remove('nf'); });
    var e = cur();
    if (e) {
      e.classList.add('nf');
      e.scrollIntoView && e.scrollIntoView({ block: 'nearest' });
    }
  }

  function move(d) {
    var els = ring();
    if (!els.length) return;
    idx = (idx + d + els.length) % els.length;
    repaint();
  }

  function blurAny() {
    var ae = document.activeElement;
    if (ae && ae !== document.body && ae.blur) { try { ae.blur(); } catch (e) {} }
  }

  function cycleSelect(el, dir) {
    el.selectedIndex = (el.selectedIndex + dir + el.options.length) % el.options.length;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // ---------- native WAM keyboard ----------
  function kbdVisible() {
    try {
      var v = window.PalmSystem && PalmSystem.isKeyboardVisible;
      return typeof v === 'function' ? !!v.call(PalmSystem) : !!v;
    } catch (e) { return false; }
  }

  function endNative() {
    if (mode !== 'native') return;
    mode = 'ring';
    if (nativeWait) { clearTimeout(nativeWait); nativeWait = null; }
    if (nativePoll) { clearInterval(nativePoll); nativePoll = null; }
    blurAny();
    repaint();
  }

  function tryNative(el) {
    var ps = window.PalmSystem;
    if (!ps || typeof ps.keyboardShow !== 'function') { openOsk(el); return; }
    mode = 'native';
    blurAny();
    try { el.focus(); } catch (e) {}
    var r = el.getBoundingClientRect();
    var x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2);
    try { ps.keyboardShow(x, y); }
    catch (e) { blurAny(); mode = 'ring'; openOsk(el); return; }
    nativeWait = setTimeout(function () {
      nativeWait = null;
      if (mode !== 'native') return;
      if (kbdVisible()) {
        nativePoll = setInterval(function () { if (!kbdVisible()) endNative(); }, 500);
      } else {
        blurAny(); mode = 'ring'; openOsk(el);
      }
    }, 800);
  }

  // event may also arrive as keyboardStateChange with .visibility
  window.addEventListener('keyboardStateChange', function () {
    if (mode === 'native' && !kbdVisible()) endNative();
  }, true);

  // ---------- in-app on-screen keyboard (fallback) ----------
  // digit row built at runtime (avoids literal 10-digit runs in source)
  var DIGITS = []; for (var n0 = 0; n0 < 10; n0++) DIGITS.push(String.fromCharCode(48 + n0));

  var ALPHA = [
    DIGITS.slice(),
    'qwertyuiop'.split(''),
    'asdfghjkl.-'.split(''),
    'zxcvbnm:'.split(''),
    ['Space', '\u232b', 'Clr', 'Done']
  ];
  var NUMERIC = [
    DIGITS.concat(['-']),
    ['\u232b', 'Clr', 'Done']
  ];

  function openOsk(target) {
    var hostish = target.id === 'server';
    osk = { target: target, buffer: target.value || '', rows: hostish ? ALPHA : NUMERIC, r: 0, c: 0 };
    mode = 'osk';
    renderOsk();
  }

  function closeOsk(apply) {
    if (!osk) { mode = 'ring'; return; }
    if (apply) osk.target.value = osk.buffer;
    osk = null;
    var o = $('osk'); if (o) o.remove();
    mode = 'ring';
    repaint();
  }

  function renderOsk() {
    var old = $('osk'); if (old) old.remove();
    var wrap = document.createElement('div');
    wrap.id = 'osk';
    var box = document.createElement('div');
    box.className = 'oskbox';
    var head = document.createElement('div');
    head.className = 'oskhead';
    head.textContent = (osk.target.id === 'server' ? 'Snapserver host' : osk.target.id) +
                       ': ' + (osk.buffer || '\u00a0');
    box.appendChild(head);
    osk.rows.forEach(function (row, r) {
      var line = document.createElement('div');
      line.className = 'oskrow';
      row.forEach(function (k, c) {
        var key = document.createElement('div');
        key.className = 'oskkey' + (k.length > 1 ? ' wide' : '') +
                        (r === osk.r && c === osk.c ? ' osksel' : '');
        key.textContent = k === 'Space' ? '\u2423' : k;
        line.appendChild(key);
      });
      box.appendChild(line);
    });
    wrap.appendChild(box);
    document.body.appendChild(wrap);
  }

  function pressKey() {
    var k = osk.rows[osk.r][osk.c];
    if (k === 'Done') { closeOsk(true); return; }
    if (k === 'Clr') { osk.buffer = ''; }
    else if (k === '\u232b') { osk.buffer = osk.buffer.slice(0, -1); }
    else if (k === 'Space') { osk.buffer += ' '; }
    else { osk.buffer += k; }
    renderOsk();
  }

  function oskMove(dr, dc) {
    var rows = osk.rows;
    var r = osk.r, c = osk.c;
    if (dr !== 0) {
      r = (r + dr + rows.length) % rows.length;
      if (c >= rows[r].length) c = rows[r].length - 1;
    } else {
      c = (c + dc + rows[r].length) % rows[r].length;
    }
    osk.r = r; osk.c = c;
    renderOsk();
  }

  // ---------- key routing ----------
  function isEnter(ev) { return ev.key === 'Enter' || ev.keyCode === 13; }

  window.addEventListener('keydown', function (ev) {
    var k = ev.key, code = ev.keyCode;

    // while the native keyboard is up, every key belongs to it
    if (mode === 'native') return;

    if (k.indexOf('Arrow') === 0 || isEnter(ev) || code === LG_BACK) ev.preventDefault();
    else return;

    if (mode === 'osk') {
      if (k === 'ArrowUp') oskMove(-1, 0);
      else if (k === 'ArrowDown') oskMove(1, 0);
      else if (k === 'ArrowLeft') oskMove(0, -1);
      else if (k === 'ArrowRight') oskMove(0, 1);
      else if (isEnter(ev)) pressKey();
      else if (code === LG_BACK) closeOsk(true);
      return;
    }

    // ring mode: a lingering input focus could re-pop the IME on Enter
    if (isText(document.activeElement)) blurAny();

    if (code === LG_BACK) return; // nothing to dismiss: let WAM close the app
    if (k === 'ArrowDown' || k === 'ArrowRight') move(1);
    else if (k === 'ArrowUp' || k === 'ArrowLeft') move(-1);
    else if (isEnter(ev)) {
      var el = cur();
      if (!el) return;
      var tag = el.tagName;
      if (tag === 'BUTTON') { if (!el.disabled) el.click(); }
      else if (tag === 'SELECT') { cycleSelect(el, 1); }
      else if (tag === 'INPUT' && el.type === 'checkbox') { el.checked = !el.checked; el.dispatchEvent(new Event('change', { bubbles: true })); }
      else if (tag === 'INPUT') { tryNative(el); }
    }
  }, true);

  // keep the ring sane when buttons enable/disable (refresh toggles them)
  window.addEventListener('load', function () {
    idx = Math.min(idx, Math.max(0, ring().length - 1));
    repaint();
    setInterval(repaint, 2000);
  });

  window.Snapnav = {
    repaint: repaint,
    mode: function () { return mode; },
    focus: function (id) {
      var els = ring();
      for (var i = 0; i < els.length; i++) if (els[i].id === id) { idx = i; break; }
      repaint();
    }
  };
})();
