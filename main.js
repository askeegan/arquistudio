(function () {
  'use strict';

  // ---- Config -------------------------------------------------------------
  // Set ENDPOINT when the email service is chosen (Mailchimp, Klaviyo, Netlify
  // Forms, Formspree, a Google Sheets script...). It receives a JSON POST:
  // { email: "...", source: "meantime" }. While empty, the form only
  // simulates success and does NOT store the address anywhere.
  var CONFIG = {
    ENDPOINT: ''
  };

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  document.getElementById('year').textContent = new Date().getFullYear();

  // ---- Background film: keep it muted and looping; hold still for reduced motion ----
  var film = document.querySelector('.bg-video');
  if (film) {
    film.muted = true;
    if (reduce) { film.pause(); film.currentTime = 0; }
    else { var p = film.play(); if (p && p.catch) p.catch(function () {}); }
  }

  // ---- Bali clock ---------------------------------------------------------
  var clockEl = document.getElementById('clock');
  if (clockEl) {
    var fmt = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Makassar', hour: '2-digit', minute: '2-digit', hour12: false
    });
    var tickClock = function () { clockEl.textContent = fmt.format(new Date()); };
    tickClock();
    setInterval(tickClock, 15000);
  }

  // ---- Headline: split words into characters for the staggered reveal -----
  var idx = 0;
  document.querySelectorAll('.headline .word').forEach(function (word) {
    var text = word.textContent;
    word.textContent = '';
    Array.from(text).forEach(function (ch) {
      var s = document.createElement('span');
      s.className = 'c';
      s.setAttribute('aria-hidden', 'true');
      s.style.setProperty('--i', idx++);
      s.textContent = ch;
      word.appendChild(s);
    });
  });

  // ---- Marquee: pause when off screen / tab hidden ------------------------
  var marquee = document.querySelector('.marquee');
  if (marquee && 'IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      marquee.classList.toggle('paused', !entries[0].isIntersecting);
    }).observe(marquee);
  }
  document.addEventListener('visibilitychange', function () {
    if (marquee) marquee.classList.toggle('paused', document.hidden);
  });

  // ---- Logo mark: soft pointer parallax, eased in a single rAF loop -------
  var mark = document.querySelector('.mark');
  var fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (mark && fine && !reduce) {
    var tx = 0, ty = 0, cx = 0, cy = 0, raf = 0;
    window.addEventListener('pointermove', function (e) {
      tx = (e.clientX / window.innerWidth - 0.5) * 2;
      ty = (e.clientY / window.innerHeight - 0.5) * 2;
      if (!raf) raf = requestAnimationFrame(tick);
    }, { passive: true });
    var tick = function () {
      cx += (tx - cx) * 0.06;
      cy += (ty - cy) * 0.06;
      mark.style.setProperty('--px', (cx * -22).toFixed(2) + 'px');
      mark.style.setProperty('--py', (cy * -16).toFixed(2) + 'px');
      mark.style.setProperty('--rot', (cx * 2.5).toFixed(2) + 'deg');
      raf = (Math.abs(tx - cx) > 0.001 || Math.abs(ty - cy) > 0.001)
        ? requestAnimationFrame(tick) : 0;
    };
  }

  // ---- Cursor: precise dot + trailing ring that changes shape by context --
  var cursor = document.querySelector('.cursor');
  if (cursor && fine && !reduce) {
    var dot = cursor.querySelector('.cursor-dot');
    var ring = cursor.querySelector('.cursor-ring');
    var label = cursor.querySelector('.cursor-label');
    var mx = -100, my = -100, rx = -100, ry = -100, vx = 0, vy = 0, frame = 0, seen = false;
    var anchor = null;   // info panel: { x, cx, y } of the hovered row; null in every other state
    var curRow = null, panelH = 140;
    var rows = Array.prototype.slice.call(document.querySelectorAll('[data-info]'));
    var STATES = ['action', 'text', 'info'];
    var info = cursor.querySelector('.cursor-info');
    var ciKicker = info.querySelector('.ci-kicker');
    var ciTitle = info.querySelector('.ci-title');
    var ciText = info.querySelector('.ci-text');
    document.documentElement.classList.add('has-cursor');

    // ---- Glass lens: bend map + edge lighting generated from the panel's rounded shape ----
    var lensCache = '';
    var buildLens = function () {
      var measuredW = info.getBoundingClientRect().width;   // = 300 * --u, resolved by the browser
      var s = measuredW / 300 || 1;
      // one fixed panel size: the tallest of the four descriptions
      var saved = [ciKicker.textContent, ciTitle.textContent, ciText.textContent];
      var tallest = 0;
      rows.forEach(function (r) {
        ciKicker.textContent = r.querySelector('span').textContent;
        ciTitle.textContent = r.querySelector('em').textContent;
        ciText.textContent = r.getAttribute('data-info');
        tallest = Math.max(tallest, info.getBoundingClientRect().height);
      });
      ciKicker.textContent = saved[0]; ciTitle.textContent = saved[1]; ciText.textContent = saved[2];
      var W = Math.round(measuredW), H = Math.ceil(tallest);
      var key = W + 'x' + H;
      if (!W || !H || key === lensCache) return;
      lensCache = key;
      panelH = H;
      cursor.style.setProperty('--h', H + 'px');

      var R = 30 * s, B = 24 * s, MAX = 48 * s, BEND = 30 * s, ZOOM = 0.10;
      var hx = W / 2, hy = H / 2;
      // signed distance to the rounded rectangle (negative inside) and its outward normal
      var shape = function (px, py) {
        var qx = Math.abs(px - hx) - (hx - R), qy = Math.abs(py - hy) - (hy - R);
        var ox = Math.max(qx, 0), oy = Math.max(qy, 0), len = Math.sqrt(ox * ox + oy * oy);
        var dist = len + Math.min(Math.max(qx, qy), 0) - R;
        var nx, ny, sx = px < hx ? -1 : 1, sy = py < hy ? -1 : 1;
        if (len > 0) { nx = ox / len * sx; ny = oy / len * sy; }
        else if (qx > qy) { nx = sx; ny = 0; } else { nx = 0; ny = sy; }
        return [dist, nx, ny];
      };

      // 1) displacement map (1x): inward pull across a crisp curved bevel + gentle magnification
      var mw = Math.ceil(W), mh = Math.ceil(H);
      var mc = document.createElement('canvas'); mc.width = mw; mc.height = mh;
      var mctx = mc.getContext('2d'), mimg = mctx.createImageData(mw, mh), md = mimg.data;
      for (var y = 0; y < mh; y++) {
        for (var x = 0; x < mw; x++) {
          var px = x + 0.5, py = y + 0.5, sh = shape(px, py), d = -sh[0];
          var offx = 0, offy = 0;
          if (d > 0) {
            var t = d / B, f = t < 1 ? Math.pow(1 - t, 2.2) : 0;
            offx = -sh[1] * f * BEND - (px - hx) * ZOOM;
            offy = -sh[2] * f * BEND - (py - hy) * ZOOM;
          }
          var i = (y * mw + x) * 4;
          md[i] = 127.5 + 127.5 * Math.max(-1, Math.min(1, offx / MAX));
          md[i + 1] = 127.5 + 127.5 * Math.max(-1, Math.min(1, offy / MAX));
          md[i + 2] = 128; md[i + 3] = 255;
        }
      }
      mctx.putImageData(mimg, 0, 0);

      // 2) edge lighting (2x): white specular on the lit side, blue-green bounce on the far side
      var cs = 2, lw = Math.ceil(W * cs), lh = Math.ceil(H * cs);
      var lc = document.createElement('canvas'); lc.width = lw; lc.height = lh;
      var lctx = lc.getContext('2d'), limg = lctx.createImageData(lw, lh), ld = limg.data;
      var Lx = -0.62, Ly = -0.78, AQ = [150, 224, 214];
      for (var Y = 0; Y < lh; Y++) {
        for (var X = 0; X < lw; X++) {
          var qx2 = (X + 0.5) / cs, qy2 = (Y + 0.5) / cs, sh2 = shape(qx2, qy2), d2 = -sh2[0];
          var k = (Y * lw + X) * 4;
          if (d2 < -0.5) continue;
          var cover = Math.max(0, Math.min(1, d2 * cs + 0.5));
          var t2 = d2 / B, inBevel = t2 < 1, cosL = sh2[1] * Lx + sh2[2] * Ly;
          var spec = inBevel ? Math.pow(Math.max(0, cosL), 1.3) * Math.pow(1 - t2, 3) * 0.85 : 0;
          var bounce = inBevel ? Math.pow(Math.max(0, -cosL), 1.3) * Math.pow(1 - t2, 2.2) * 0.30 : 0;
          var body = inBevel ? 0.035 * Math.pow(1 - t2, 2.2) : 0;
          var hair = Math.max(0, 1 - d2 / (1.4 * s)) * 0.42;
          var aw = Math.min(1, spec + hair), aa = Math.min(1, bounce + body);
          var at = 1 - (1 - aw) * (1 - aa);
          if (at <= 0) continue;
          var wmix = aw / (aw + aa * (1 - aw) || 1);
          ld[k] = 255 * wmix + AQ[0] * (1 - wmix);
          ld[k + 1] = 255 * wmix + AQ[1] * (1 - wmix);
          ld[k + 2] = 255 * wmix + AQ[2] * (1 - wmix);
          ld[k + 3] = 255 * at * cover;
        }
      }
      lctx.putImageData(limg, 0, 0);

      // 3) hand both to the page
      var filt = document.getElementById('lg'), fimg = document.getElementById('lg-map');
      filt.setAttribute('width', mw); filt.setAttribute('height', mh);
      fimg.setAttribute('width', mw); fimg.setAttribute('height', mh);
      fimg.setAttribute('href', mc.toDataURL('image/png'));
      document.getElementById('lg-dr').setAttribute('scale', (2 * MAX * 0.92).toFixed(1));
      document.getElementById('lg-dg').setAttribute('scale', (2 * MAX).toFixed(1));
      document.getElementById('lg-db').setAttribute('scale', (2 * MAX * 1.08).toFixed(1));
      cursor.style.setProperty('--shade', 'url(' + lc.toDataURL('image/png') + ')');
      cursor.classList.add('lens-ready');
    };
    var lensTimer = 0;
    var scheduleLens = function () { clearTimeout(lensTimer); lensTimer = setTimeout(buildLens, 150); };
    window.addEventListener('resize', scheduleLens);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(buildLens); else scheduleLens();

    var loop = function () {
      var settled;
      if (anchor) {
        // spring toward a point left of the list: follows the pointer's height,
        // leans a little with its horizontal position, overshoots then settles
        var lo = panelH / 2 + 16, hi = window.innerHeight - panelH / 2 - 56;
        var ty = Math.max(lo, Math.min(hi, anchor.y * 0.3 + my * 0.7));
        var tx = anchor.x + (mx - anchor.cx) * 0.4;
        vx = (vx + (tx - rx) * 0.07) * 0.72;
        vy = (vy + (ty - ry) * 0.07) * 0.72;
        rx += vx; ry += vy;
        var sy = 1 + Math.min(Math.abs(vy) * 0.007, 0.14);
        var sx = 1 - (sy - 1) * 0.5;
        ring.style.transform = 'translate3d(' + rx.toFixed(1) + 'px,' + ry.toFixed(1) + 'px,0) rotate(' +
          (vy * 0.06).toFixed(2) + 'deg) scale(' + sx.toFixed(3) + ',' + sy.toFixed(3) + ')';
        settled = Math.abs(tx - rx) < 0.1 && Math.abs(ty - ry) < 0.1 && Math.abs(vx) < 0.05 && Math.abs(vy) < 0.05;
      } else {
        vx = vy = 0;
        rx += (mx - rx) * 0.16;
        ry += (my - ry) * 0.16;
        ring.style.transform = 'translate3d(' + rx.toFixed(1) + 'px,' + ry.toFixed(1) + 'px,0)';
        settled = Math.abs(mx - rx) < 0.1 && Math.abs(my - ry) < 0.1;
      }
      frame = settled ? 0 : requestAnimationFrame(loop);
    };
    var wake = function () { if (!frame) frame = requestAnimationFrame(loop); };
    var setState = function (name) {
      STATES.forEach(function (s) { cursor.classList.toggle(s, s === name); });
      if (name !== 'info') { anchor = null; curRow = null; wake(); }
    };
    var reset = function () { setState(null); cursor.classList.remove('dark'); };

    window.addEventListener('pointermove', function (e) {
      mx = e.clientX; my = e.clientY;
      dot.style.transform = 'translate3d(' + mx + 'px,' + my + 'px,0)';
      if (!seen) { seen = true; rx = mx; ry = my; cursor.classList.add('on'); }
      wake();
    }, { passive: true });

    document.addEventListener('pointerover', function (e) {
      var el = e.target.closest ? e.target : e.target.parentElement;
      if (!el) return;
      var row = el.closest('[data-info]');
      var action = el.closest('[data-cursor]');
      cursor.classList.toggle('dark', !!el.closest('[data-cursor-scheme="dark"]'));
      if (row) {
        var rr = row.getBoundingClientRect();
        var list = row.parentElement.getBoundingClientRect();
        anchor = { x: list.left - 22, cx: list.left + list.width / 2, y: rr.top + rr.height / 2 };
        if (row !== curRow) {
          var dir = curRow ? (rows.indexOf(row) > rows.indexOf(curRow) ? 1 : -1) : 1;
          ciKicker.textContent = row.querySelector('span').textContent;
          ciTitle.textContent = row.querySelector('em').textContent;
          ciText.textContent = row.getAttribute('data-info');
          info.style.setProperty('--dir', dir);
          info.classList.remove('swap'); void info.offsetWidth; info.classList.add('swap');
          curRow = row;
        }
        setState('info');
        wake();
      }
      else if (action) { label.textContent = action.getAttribute('data-cursor'); setState('action'); }
      else if (el.closest('[data-cursor-text]')) setState('text');
      else setState(null);
    });

    document.addEventListener('pointerdown', function () { cursor.classList.add('down'); });
    document.addEventListener('pointerup', function () { cursor.classList.remove('down'); });
    document.documentElement.addEventListener('mouseleave', function () {
      cursor.classList.remove('on'); reset(); seen = false;
    });
  }

  // ---- Signup form --------------------------------------------------------
  var form = document.getElementById('signup');
  var note = document.getElementById('note');
  var email = document.getElementById('email');
  var btn = form.querySelector('button');
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  function setNote(msg, isError) {
    note.textContent = msg;
    note.classList.toggle('error', !!isError);
  }

  function succeed() {
    form.classList.add('done');
    setNote("You're on the list. Something new is on its way.");
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var value = email.value.trim();

    if (form.elements.company.value) return succeed(); // honeypot: bots get a fake success
    if (!EMAIL_RE.test(value)) {
      setNote('Please enter a valid email address.', true);
      email.focus();
      return;
    }

    btn.disabled = true;
    setNote('One moment…');

    if (!CONFIG.ENDPOINT) {
      setTimeout(succeed, 500); // placeholder until the endpoint is wired
      return;
    }

    fetch(CONFIG.ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ email: value, source: 'meantime' })
    }).then(function (r) {
      if (!r.ok) throw new Error('bad status ' + r.status);
      succeed();
    }).catch(function () {
      btn.disabled = false;
      setNote('Something went wrong. Please try again in a moment.', true);
    });
  });
})();
