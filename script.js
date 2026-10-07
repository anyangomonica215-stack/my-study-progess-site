/* Standalone mode: stands in for the Claude page's saved data. Progress is kept in this browser (localStorage). */
(function () {
  var KEY = 'monica-portfolio-progress-v1';
  var SEED = {"about": "", "days": [], "due": {}, "focus": "", "g": {"cryptography": "l", "css": "l", "html": "l", "javascript": "l", "networking-and-protocols": "l", "python": "l"}, "log": [{"d": "2026-10-07", "t": "Built this portfolio and mapped everything I am learning"}], "plan": {"goal": 3, "mins": 25, "time": "18:00"}, "projects": [{"id": "p1", "name": "Personal portfolio site, deployed with my own domain", "status": "building", "url": ""}, {"id": "p2", "name": "To-do app with sign-up and login", "status": "idea", "url": ""}, {"id": "p3", "name": "Blog with a database and an admin page", "status": "idea", "url": ""}, {"id": "p4", "name": "Weather or news app using a public API", "status": "idea", "url": ""}, {"id": "p5", "name": "Home lab with Kali Linux and a vulnerable VM", "status": "idea", "url": ""}, {"id": "p6", "name": "Scan my own network with Nmap and write up the results", "status": "idea", "url": ""}, {"id": "p7", "name": "Finish 10 TryHackMe rooms and keep notes", "status": "idea", "url": ""}, {"id": "p8", "name": "Password strength checker in Python", "status": "idea", "url": ""}, {"id": "p9", "name": "Build a login system, then attack it, then fix it", "status": "idea", "url": ""}], "s": {"osi-and-tcp-ip-models": "l"}, "step": {}};
  var data = null;
  try { data = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
  if (!data) data = JSON.parse(JSON.stringify(SEED));
  function save() { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {} }
  function mergeInto(a, b) {
    Object.keys(b).forEach(function (k) {
      var v = b[k];
      if (v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object' && !Array.isArray(a[k])) mergeInto(a[k], v);
      else a[k] = v;
    });
  }
  var subs = [];
  function snap() { return { exists: true, data: function () { return JSON.parse(JSON.stringify(data)); }, metadata: {} }; }
  var ref = {
    onSnapshot: function (f) { subs.push(f); setTimeout(function () { f(snap()); }, 0); return function () {}; },
    update: function (p) { mergeInto(data, p); save(); return Promise.resolve(); },
    set: function (d) { data = JSON.parse(JSON.stringify(d)); save(); return Promise.resolve(); }
  };
  window.claude = {
    use: function (name) {
      if (name === 'user') return Promise.resolve({ canEdit: function () { return Promise.resolve(true); } });
      if (name === 'db') return Promise.resolve({ doc: function () { return ref; } });
      return Promise.resolve(null);
    }
  };
})();

(function () {
  'use strict';
  var NAME = 'Monica';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function h(tag, attrs, kids) {
    var e = document.createElement(tag);
    for (var k in (attrs || {})) {
      var v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'text') e.textContent = v;
      else if (k === 'class') e.className = v;
      else e.setAttribute(k, v === true ? '' : v);
    }
    (kids || []).forEach(function (c) { if (c != null) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function today() { return ymd(new Date()); }
  function parse(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function diffDays(a, b) { return Math.round((parse(b) - parse(a)) / 86400000); }
  function nice(s) { return parse(s).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }); }
  function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }

  /* ---------- state ---------- */
  function blank() {
    return { s: {}, g: {}, due: {}, step: {}, focus: '', log: [], days: [], plan: { time: '18:00', mins: 25, goal: 3 }, projects: [], about: '' };
  }
  function norm(d) {
    var b = blank();
    if (!d) return b;
    ['s', 'g', 'due', 'step'].forEach(function (k) { if (d[k] && typeof d[k] === 'object') b[k] = Object.assign({}, d[k]); });
    if (typeof d.focus === 'string') b.focus = d.focus;
    ['log', 'days', 'projects'].forEach(function (k) { if (Array.isArray(d[k])) b[k] = d[k].slice(); });
    if (d.plan && typeof d.plan === 'object') b.plan = Object.assign(b.plan, d.plan);
    if (typeof d.about === 'string') b.about = d.about;
    return b;
  }
  var S = blank();
  var canWrite = false, loaded = false, dbOff = false, doc = null, exists = false;

  /* ---------- groups from the page ---------- */
  var GROUPS = $$('.grp').map(function (el) {
    return {
      id: el.dataset.gid, name: el.dataset.name, track: el.dataset.track, el: el,
      topics: $$('.t', el).map(function (b) { return { id: b.dataset.id, name: b.textContent, el: b }; })
    };
  });
  var GBY = {}, TBY = {};
  GROUPS.forEach(function (g) { GBY[g.id] = g; g.topics.forEach(function (t) { TBY[t.id] = { t: t, g: g }; }); });

  function gCount(g) {
    var d = 0;
    g.topics.forEach(function (t) { if (S.s[t.id] === 'd') d++; });
    return { d: d, n: g.topics.length };
  }
  function listed() { return GROUPS.filter(function (g) { return S.g[g.id] === 'l'; }); }

  /* ---------- saving ---------- */
  var pending = null, flushing = false, timer = null, late = null;
  function merge(a, b) {
    var o = Object.assign({}, a);
    Object.keys(b).forEach(function (k) {
      var v = b[k];
      if (v && typeof v === 'object' && !Array.isArray(v) && o[k] && typeof o[k] === 'object' && !Array.isArray(o[k])) o[k] = merge(o[k], v);
      else o[k] = v;
    });
    return o;
  }
  function saveNote(t) { var e = $('#saveState'); if (e) e.textContent = t; }
  function queue(patch) {
    if (!doc) return;
    pending = merge(pending || {}, patch);
    saveNote('Saving');
    clearTimeout(timer);
    timer = setTimeout(flush, 350);
  }
  function flush() {
    timer = null;
    if (flushing || !pending || !doc) return;
    flushing = true;
    var p = pending; pending = null;
    var job = exists ? doc.update(p) : doc.set(JSON.parse(JSON.stringify(S)));
    job.then(function () { exists = true; saveNote('Saved'); }, function () {
      pending = merge(p, pending || {});
      saveNote('Could not save. Retrying.');
      clearTimeout(timer); timer = setTimeout(flush, 5000);
    }).then(function () {
      flushing = false;
      if (pending && !timer) timer = setTimeout(flush, 350);
    });
  }

  function isTyping() {
    var a = document.activeElement;
    return !!(a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.closest('#nowList,#projList,#aboutForm,#projAdd,#today'));
  }
  function onSnap(snap) {
    loaded = true;
    exists = snap.exists;
    if (pending || flushing || isTyping()) { late = snap; return; }
    S = snap.exists ? norm(snap.data()) : blank();
    render();
  }
  document.addEventListener('focusout', function () {
    setTimeout(function () {
      if (late && !pending && !flushing && !isTyping()) { var s = late; late = null; S = s.exists ? norm(s.data()) : blank(); render(); }
    }, 0);
  });

  /* ---------- small actions ---------- */
  var toastTimer = null;
  function toast(msg) {
    var t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('show'); }, 4500);
  }
  function addWin(text) { S.log = [{ d: today(), t: text }].concat(S.log).slice(0, 40); queue({ log: S.log }); }
  function markStudied() {
    var t = today();
    if (S.days.indexOf(t) < 0) { S.days = S.days.concat([t]).sort().slice(-120); queue({ days: S.days }); }
  }
  function setPlan(p) { Object.assign(S.plan, p); queue({ plan: p }); }
  function setTopic(id, v) {
    var o = TBY[id]; if (!o) return;
    S.s[id] = v;
    var patch = { s: {} }; patch.s[id] = v; queue(patch);
    if (v === 'd') {
      addWin('Finished ' + o.t.name);
      markStudied();
      var c = gCount(o.g);
      toast(c.d === c.n ? o.g.name + ' is complete. That is a real finish.' : o.t.name + ' done. ' + c.d + ' of ' + c.n + ' in ' + o.g.name + '.');
    }
    render();
  }
  function pickFocus() {
    var ls = listed();
    if (!ls.length) return null;
    if (S.focus && S.g[S.focus] === 'l') return GBY[S.focus];
    var withDue = ls.filter(function (g) { return S.due[g.id]; }).sort(function (a, b) { return S.due[a.id] < S.due[b.id] ? -1 : 1; });
    return withDue[0] || ls[0];
  }
  function dueInfo(s) {
    if (!s) return null;
    var d = diffDays(today(), s);
    if (d < 0) return { t: 'Overdue by ' + plural(-d, 'day') + '. Pick a new date, that is allowed.', late: true };
    if (d === 0) return { t: 'Due today', late: false };
    if (d === 1) return { t: 'Due tomorrow (' + nice(s) + ')', late: false };
    return { t: 'Due in ' + d + ' days (' + nice(s) + ')', late: false };
  }

  /* ---------- rendering ---------- */
  function renderTopics() {
    GROUPS.forEach(function (g) {
      var c = gCount(g);
      g.topics.forEach(function (t) {
        var v = S.s[t.id] || 'n';
        t.el.dataset.s = v;
        t.el.setAttribute('aria-label', t.name + ': ' + (v === 'd' ? 'done' : v === 'l' ? 'learning' : 'not started') + (canWrite ? '. Tap to change.' : ''));
      });
      $('.bar i', g.el).style.width = (c.n ? Math.round(100 * c.d / c.n) : 0) + '%';
      $('.gm', g.el).textContent = c.d + ' of ' + c.n;
      var on = S.g[g.id] === 'l';
      g.el.dataset.listed = on ? '1' : '0';
      var b = $('.learn', g.el);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.textContent = on ? 'On my list' : 'Add to my list';
    });
  }
  function applyFilter() {
    var q = $('#q').value.trim().toLowerCase();
    var f = $('.flt[aria-pressed="true"]').dataset.f;
    var any = false;
    GROUPS.forEach(function (g) {
      var vis = 0;
      g.topics.forEach(function (t) {
        var hit = (!q || t.name.toLowerCase().indexOf(q) !== -1 || g.name.toLowerCase().indexOf(q) !== -1) && (f !== 'done' || S.s[t.id] === 'd');
        t.el.parentNode.hidden = !hit;
        if (hit) vis++;
      });
      var show = vis > 0 && (f !== 'list' || S.g[g.id] === 'l');
      g.el.hidden = !show;
      if (show) any = true;
    });
    $('#none').hidden = any;
    $('#none').textContent = f === 'list' ? 'Nothing on your list matches.' : f === 'done' ? 'No finished topics match yet.' : 'No topic matches that search.';
  }
  function renderProgress() {
    ['sec', 'web'].forEach(function (tr) {
      var d = 0, n = 0;
      GROUPS.forEach(function (g) { if (g.track === tr) { var c = gCount(g); d += c.d; n += c.n; } });
      $('#ps-' + tr + '-fill').style.width = (n ? Math.round(100 * d / n) : 0) + '%';
      $('#ps-' + tr + '-text').textContent = d + ' of ' + n + ' topics done';
    });
    var note = $('#modeNote');
    if (dbOff) note.textContent = 'Progress could not be loaded here. The topic map is still complete.';
    else if (canWrite) note.textContent = 'Tap a topic to change it: not started, learning, done. Use Add to my list on an area to move it to the list at the top. Changes save by themselves.';
    else note.textContent = 'Viewing the topic map. Colours show Monica\'s progress: dot means learning, tick means done.';
  }
  function renderNow() {
    var box = $('#nowList'), ls = listed();
    box.textContent = '';
    var wip = $('#wip');
    wip.hidden = true;
    if (!loaded && !dbOff) { box.appendChild(h('p', { class: 'empty', text: 'Loading the list.' })); return; }
    if (!ls.length) {
      box.appendChild(h('p', { class: 'empty', text: canWrite ? 'Your list is empty. Find an area below and choose Add to my list. One or two is plenty.' : 'Nothing is on the list right now.' }));
      return;
    }
    ls.sort(function (a, b) {
      if (S.focus === a.id) return -1; if (S.focus === b.id) return 1;
      var da = S.due[a.id] || '9999', db2 = S.due[b.id] || '9999';
      return da < db2 ? -1 : da > db2 ? 1 : 0;
    });
    if (canWrite) {
      if (S.focus && S.g[S.focus] === 'l' && ls.length > 1) { wip.textContent = 'Finishing first: ' + GBY[S.focus].name + '. The others can wait until it is done.'; wip.hidden = false; }
      else if (ls.length > 3) { wip.textContent = ls.length + ' areas are on your list. People finish more when they pick one first. Choose Finish this first on the one you want done soonest.'; wip.hidden = false; }
    }
    ls.forEach(function (g) {
      var c = gCount(g), di = dueInfo(S.due[g.id]), isFirst = S.focus === g.id;
      var card = h('div', { class: 'card track-' + g.track }, [
        h('p', { class: 'tag' }, [h('span', { text: g.track === 'sec' ? 'Cybersecurity' : 'Web development' }), isFirst ? h('span', { text: 'Finishing first' }) : null]),
        h('h3', { text: g.name }),
        h('div', { class: 'prog' }, [h('div', { class: 'bar' }, [h('i', { style: 'width:' + (c.n ? Math.round(100 * c.d / c.n) : 0) + '%' })]), h('span', { text: c.d + ' of ' + c.n + ' topics done' })])
      ]);
      if (canWrite) {
        card.appendChild(h('div', {}, [h('label', { class: 'label', for: 'step-' + g.id, text: 'Next small step' }), h('input', { type: 'text', id: 'step-' + g.id, 'data-f': 'step', 'data-gid': g.id, maxlength: '160', placeholder: 'Build a form with three inputs', value: S.step[g.id] || '', autocomplete: 'off' })]));
        card.appendChild(h('div', {}, [h('label', { class: 'label', for: 'due-' + g.id, text: 'Finish by' }), h('input', { type: 'date', id: 'due-' + g.id, 'data-f': 'due', 'data-gid': g.id, value: S.due[g.id] || '' })]));
        if (di) card.appendChild(h('p', { class: 'dueline' + (di.late ? ' late' : ''), text: di.t }));
        card.appendChild(h('div', { class: 'acts' }, [
          h('button', { type: 'button', class: 'btn ghost' + (isFirst ? ' on' : ''), 'data-action': 'focus', 'data-gid': g.id, 'aria-pressed': isFirst ? 'true' : 'false', text: isFirst ? 'Finishing this first' : 'Finish this first' }),
          h('button', { type: 'button', class: 'btn ghost', 'data-action': 'list', 'data-gid': g.id, text: 'Take off my list' })
        ]));
      } else {
        if (S.step[g.id]) card.appendChild(h('p', { text: 'Next: ' + S.step[g.id] }));
        if (di) card.appendChild(h('p', { class: 'dueline' + (di.late ? ' late' : ''), text: di.t }));
      }
      box.appendChild(card);
    });
  }
  function renderWins() {
    var ul = $('#winList'); ul.textContent = '';
    S.log.slice(0, 6).forEach(function (w) {
      ul.appendChild(h('li', {}, [h('time', { datetime: w.d, text: nice(w.d) }), h('span', { text: w.t })]));
    });
    $('#winEmpty').hidden = S.log.length > 0;
    ul.hidden = S.log.length === 0;
  }
  var MSGS = [
    'Ten minutes counts. Start small and let the timer do the rest.',
    'Finish one topic before you open the next one.',
    'A finished small topic beats a half-read big one.',
    'You do not need motivation to start. Press the button and see how it feels after five minutes.',
    'Progress comes in lumps. A slow day still keeps the week alive.',
    'Write down the next tiny step before you stop, so tomorrow starts easy.',
    'Every tick on this page is something you can now do.',
    'Pick the smallest topic on your list and finish it today.',
    'Break the work down until the first step takes two minutes.',
    'Rest is part of the plan. Short sessions with breaks beat long ones you dread.',
    'Say it out loud: one session, one topic, done.',
    'Look at your recent wins. You have already been doing this.'
  ];
  function weekDates() {
    var d = new Date(), off = (d.getDay() + 6) % 7, out = [];
    for (var i = 0; i < 7; i++) out.push(ymd(new Date(d.getFullYear(), d.getMonth(), d.getDate() - off + i)));
    return out;
  }
  function slotText() {
    var el = $('#slotText'); if (!el) return;
    var m = /^(\d\d):(\d\d)$/.exec(S.plan.time || ''); if (!m) { el.textContent = ''; return; }
    var now = new Date(), at = new Date(now.getFullYear(), now.getMonth(), now.getDate(), +m[1], +m[2]);
    var studied = S.days.indexOf(today()) >= 0;
    if (studied) el.textContent = 'Done for today. Next study time is tomorrow at ' + S.plan.time + '.';
    else if (at > now) { var mins = Math.round((at - now) / 60000); el.textContent = 'Today at ' + S.plan.time + ', in ' + (mins >= 60 ? Math.floor(mins / 60) + 'h ' + (mins % 60) + 'm' : mins + ' minutes') + '.'; }
    else el.textContent = 'Your study time was ' + S.plan.time + '. Starting late still counts. Try just 10 minutes.';
  }
  function renderToday() {
    var hr = new Date().getHours();
    $('#greet').textContent = (hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening') + ', ' + NAME;
    var doy = Math.floor((new Date() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
    $('#msg').textContent = MSGS[doy % MSGS.length];
    var g = pickFocus(), di = g ? dueInfo(S.due[g.id]) : null;
    $('#oneName').textContent = g ? g.name : 'Nothing on your list yet';
    $('#oneStep').textContent = g ? (S.step[g.id] ? 'Next step: ' + S.step[g.id] : 'Next step: open ' + g.name + ' below and finish one topic.') : 'Add one or two areas from the topic map below.';
    var du = $('#oneDue'); du.textContent = di ? di.t : ''; du.className = 'due' + (di && di.late ? ' late' : '');
    var set = {}; S.days.forEach(function (d) { set[d] = 1; });
    var wd = weekDates(), t = today(), n = 0, dots = $('#dots'); dots.textContent = '';
    var L = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
    wd.forEach(function (d, i) {
      if (set[d]) n++;
      dots.appendChild(h('li', { class: 'dot' + (set[d] ? ' on' : '') + (d === t ? ' today' : ''), 'aria-label': nice(d) + (set[d] ? ': studied' : ''), text: L[i] }));
    });
    var goal = +S.plan.goal || 3;
    $('#weekText').textContent = n >= goal ? n + ' study days this week. Goal reached, anything more is a bonus.' : n + ' of ' + goal + ' study days this week. ' + (goal - n) + ' to go.';
    $('#studiedBtn').textContent = set[t] ? 'Studied today. Undo' : 'I studied today';
    if (document.activeElement !== $('#slotTime')) $('#slotTime').value = S.plan.time || '18:00';
    $('#goal').value = String(goal);
    slotText();
    renderTimer();
  }
  var T = { end: 0, total: 0, iv: null, ctx: null };
  function fmt(ms) { var s = Math.max(0, Math.ceil(ms / 1000)); return pad(Math.floor(s / 60)) + ':' + pad(s % 60); }
  function renderTimer() {
    var run = !!T.iv;
    $$('.segb').forEach(function (b) { b.setAttribute('aria-pressed', String(+b.dataset.m === +S.plan.mins)); b.disabled = run; });
    $('#timerBtn').textContent = run ? 'Stop' : 'Start session';
    if (!run) $('#time').textContent = fmt(S.plan.mins * 60000);
  }
  function beep() {
    try {
      var c = T.ctx; if (!c) return; if (c.resume) c.resume();
      [0, 0.35].forEach(function (dl) {
        var o = c.createOscillator(), gn = c.createGain();
        o.frequency.value = 880; o.connect(gn); gn.connect(c.destination);
        gn.gain.setValueAtTime(0.0001, c.currentTime + dl); gn.gain.exponentialRampToValueAtTime(0.25, c.currentTime + dl + 0.02); gn.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dl + 0.28);
        o.start(c.currentTime + dl); o.stop(c.currentTime + dl + 0.3);
      });
    } catch (e) {}
  }
  function startTimer() {
    try { T.ctx = T.ctx || new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
    T.total = S.plan.mins * 60000; T.end = Date.now() + T.total;
    T.iv = setInterval(function () { var left = T.end - Date.now(); if (left <= 0) stopTimer(true); else $('#time').textContent = fmt(left); }, 250);
    $('#time').textContent = fmt(T.total);
    renderTimer();
  }
  function stopTimer(done) {
    clearInterval(T.iv); T.iv = null;
    var el = Math.min(T.total, Date.now() - (T.end - T.total)), g = pickFocus(), on = g ? ' on ' + g.name : '';
    if (done) { beep(); markStudied(); addWin('Focused for ' + S.plan.mins + ' minutes' + on); toast('Session complete. Take a short break, you earned it.'); }
    else if (el >= 600000) { var m = Math.floor(el / 60000); markStudied(); addWin('Focused for ' + m + ' minutes' + on); toast(m + ' minutes counts. Well done.'); }
    else toast('Stopped. Come back when you are ready.');
    renderToday(); renderWins();
  }
  function renderProjects() {
    var box = $('#projList'); box.textContent = '';
    if (!loaded && !dbOff) { box.appendChild(h('p', { class: 'empty', text: 'Loading projects.' })); return; }
    if (!S.projects.length) { box.appendChild(h('p', { class: 'empty', text: canWrite ? 'No projects yet. Add your first one below, even if it is only an idea.' : 'No projects have been added yet.' })); return; }
    S.projects.forEach(function (p) {
      var url = /^https?:\/\//i.test(p.url || '') ? p.url : '';
      var row = h('div', { class: 'prow' });
      if (canWrite) {
        row.appendChild(h('input', { type: 'text', id: 'pn-' + p.id, 'data-pf': 'name', 'data-pid': p.id, value: p.name, maxlength: '90', 'aria-label': 'Project name' }));
        row.appendChild(h('input', { type: 'text', id: 'pl-' + p.id, 'data-pf': 'url', 'data-pid': p.id, value: p.url || '', maxlength: '300', placeholder: 'Link', 'aria-label': 'Project link' }));
        var sel = h('select', { id: 'ps-' + p.id, 'data-pf': 'status', 'data-pid': p.id, 'aria-label': 'Project status' }, [['idea', 'Idea'], ['building', 'Building'], ['done', 'Done']].map(function (o) { return h('option', { value: o[0], selected: p.status === o[0], text: o[1] }); }));
        row.appendChild(sel);
        row.appendChild(h('button', { type: 'button', class: 'btn ghost', 'data-action': 'rmproj', 'data-pid': p.id, text: 'Remove' }));
      } else {
        row.appendChild(h('span', { class: 'pn', text: p.name }));
        row.appendChild(url ? h('a', { class: 'pl', href: url, target: '_blank', rel: 'noopener noreferrer', text: url.replace(/^https?:\/\//i, '') }) : h('span', { class: 'pl' }));
        row.appendChild(h('span', { class: 'stat', 'data-s': p.status, text: p.status === 'done' ? 'Done' : p.status === 'building' ? 'Building' : 'Idea' }));
      }
      box.appendChild(row);
    });
  }
  var DEFAULT_ABOUT = $('#aboutText').innerHTML;
  function renderAbout() { if (S.about) $('#aboutText').textContent = S.about; else $('#aboutText').innerHTML = DEFAULT_ABOUT; }
  function render() {
    renderTopics(); applyFilter(); renderProgress(); renderNow(); renderWins(); renderProjects(); renderAbout();
    if (canWrite) renderToday();
  }

  /* ---------- events ---------- */
  document.addEventListener('click', function (e) {
    var chip = e.target.closest('.grp .t');
    if (chip) {
      if (!canWrite) return;
      var cur = S.s[chip.dataset.id] || 'n';
      setTopic(chip.dataset.id, cur === 'n' ? 'l' : cur === 'l' ? 'd' : 'n');
      return;
    }
    var f = e.target.closest('.flt');
    if (f) { $$('.flt').forEach(function (b) { b.setAttribute('aria-pressed', String(b === f)); }); applyFilter(); return; }
    var seg = e.target.closest('.segb');
    if (seg) { if (!T.iv) { setPlan({ mins: +seg.dataset.m }); renderTimer(); } return; }
    var a = e.target.closest('[data-action]');
    if (!a || !canWrite) return;
    var act = a.dataset.action, gid = a.dataset.gid;
    if (act === 'list') {
      var on = S.g[gid] === 'l'; S.g[gid] = on ? 'n' : 'l';
      var p = { g: {} }; p.g[gid] = S.g[gid];
      if (on && S.focus === gid) { S.focus = ''; p.focus = ''; }
      queue(p); render();
      if (!on) toast(GBY[gid].name + ' is on your list. Set a finish date and a first small step.');
    } else if (act === 'focus') {
      S.focus = S.focus === gid ? '' : gid; queue({ focus: S.focus }); render();
    } else if (act === 'rmproj') {
      if (a.dataset.sure) {
        S.projects = S.projects.filter(function (p) { return p.id !== a.dataset.pid; }); queue({ projects: S.projects }); renderProjects();
      } else {
        a.dataset.sure = '1'; a.textContent = 'Confirm remove';
        setTimeout(function () { if (a.isConnected) { delete a.dataset.sure; a.textContent = 'Remove'; } }, 3500);
      }
    }
  });
  document.addEventListener('change', function (e) {
    var el = e.target;
    if (!canWrite) return;
    if (el.dataset.f === 'step') { var v = el.value.trim().slice(0, 160); S.step[el.dataset.gid] = v; var p = { step: {} }; p.step[el.dataset.gid] = v; queue(p); renderToday(); }
    else if (el.dataset.f === 'due') { S.due[el.dataset.gid] = el.value; var q2 = { due: {} }; q2.due[el.dataset.gid] = el.value; queue(q2); render(); }
    else if (el.id === 'slotTime') { if (/^\d\d:\d\d$/.test(el.value)) { setPlan({ time: el.value }); slotText(); } }
    else if (el.id === 'goal') { setPlan({ goal: +el.value }); renderToday(); }
    else if (el.dataset.pf) {
      S.projects = S.projects.map(function (p) {
        if (p.id !== el.dataset.pid) return p;
        var c = Object.assign({}, p), val = el.value.trim();
        if (el.dataset.pf === 'name') { if (!val) { el.value = p.name; return p; } c.name = val.slice(0, 90); }
        else if (el.dataset.pf === 'url') c.url = val.slice(0, 300);
        else c.status = val;
        return c;
      });
      queue({ projects: S.projects });
    }
  });
  $('#q').addEventListener('input', applyFilter);
  $('#timerBtn').addEventListener('click', function () { if (T.iv) stopTimer(false); else startTimer(); });
  $('#studiedBtn').addEventListener('click', function () {
    var t = today(), i = S.days.indexOf(t);
    if (i < 0) { markStudied(); toast('Logged. Showing up is the hard part.'); }
    else { S.days = S.days.filter(function (d) { return d !== t; }); queue({ days: S.days }); }
    renderToday();
  });
  $('#projAdd').addEventListener('submit', function (e) {
    e.preventDefault();
    var n = $('#pn').value.trim(), u = $('#pl').value.trim();
    if (!n) { $('#pn').focus(); toast('Give the project a name first.'); return; }
    if (u && !/^https?:\/\//i.test(u)) u = 'https://' + u;
    if (S.projects.length >= 60) { toast('That is 60 projects, the most this page keeps.'); return; }
    S.projects = S.projects.concat([{ id: 'p' + Date.now().toString(36) + Math.floor(Math.random() * 1000).toString(36), name: n.slice(0, 90), url: u.slice(0, 300), status: 'idea' }]);
    queue({ projects: S.projects });
    $('#pn').value = ''; $('#pl').value = '';
    renderProjects();
    toast('Project added.');
  });
  $('#aboutBtn').addEventListener('click', function () { $('#aboutBox').value = S.about || $('#aboutText').textContent; $('#aboutForm').hidden = false; $('#aboutBtn').hidden = true; $('#aboutBox').focus(); });
  function closeAbout() { $('#aboutForm').hidden = true; $('#aboutBtn').hidden = false; }
  $('#aboutCancel').addEventListener('click', closeAbout);
  $('#aboutReset').addEventListener('click', function () { S.about = ''; queue({ about: '' }); renderAbout(); closeAbout(); });
  $('#aboutForm').addEventListener('submit', function (e) { e.preventDefault(); S.about = $('#aboutBox').value.trim().slice(0, 400); queue({ about: S.about }); renderAbout(); closeAbout(); toast('Intro saved.'); });
  window.addEventListener('beforeunload', function () { if (pending && doc) { try { flush(); } catch (e) {} } });
  setInterval(function () { if (canWrite) slotText(); }, 30000);

  /* ---------- start ---------- */
  render();
  (async function () {
    var api = window.claude;
    if (!api || !api.use) { loaded = true; dbOff = true; render(); return; }
    var user = null, db = null;
    try { user = await api.use('user'); } catch (e) {}
    try { canWrite = user ? !!(await user.canEdit()) : false; } catch (e) {}
    try { db = await api.use('db'); } catch (e) {}
    document.body.classList.toggle('edit', canWrite);
    if (!db) { loaded = true; dbOff = true; render(); return; }
    doc = db.doc('tracker/main');
    doc.onSnapshot(onSnap, function () { loaded = true; dbOff = true; render(); });
  })();
})();
