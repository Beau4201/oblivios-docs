/* Review mode for a multi-page mockup. Toggle with the pill; flags are saved per page and readable with window.__allFlags(). */
(function () {
  if (location.search.indexOf('norv') >= 0) return;
  var KEY = 'rv:' + location.pathname, ON = 'rv-on';
  function load() { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; } }
  function save(a) { try { localStorage.setItem(KEY, JSON.stringify(a)); } catch (e) {} }
  function on() { try { return sessionStorage.getItem(ON) === '1'; } catch (e) { return false; } }
  function setOn(v) { try { sessionStorage.setItem(ON, v ? '1' : '0'); } catch (e) {} }

  function cssPath(el) {
    var parts = [];
    while (el && el.nodeType === 1 && el !== document.body) {
      var i = 1, s = el;
      while ((s = s.previousElementSibling)) if (s.tagName === el.tagName) i++;
      parts.unshift(el.tagName.toLowerCase() + ':nth-of-type(' + i + ')');
      el = el.parentElement;
    }
    return 'body > ' + parts.join(' > ');
  }
  function label(el) { return (el.innerText || el.getAttribute('aria-label') || el.alt || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 80); }

  window.__allFlags = function () {
    var out = [];
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k.indexOf('rv:') !== 0) continue;
      JSON.parse(localStorage.getItem(k)).forEach(function (f) { out.push(k.slice(3) + '  "' + f.t + '"' + (f.n ? ' => ' + f.n : '')); });
    }
    return out.join('\n') || '(no flags)';
  };

  var css = document.createElement('style');
  css.textContent =
    '.rv-flag{outline:3px solid #e0003c!important;outline-offset:3px}' +
    '.rv-badge{position:absolute;z-index:99998;background:#e0003c;color:#fff;font:700 13px/1 sans-serif;min-width:22px;height:22px;border-radius:11px;display:grid;place-items:center;pointer-events:none}' +
    '#rv-panel{position:fixed;right:14px;bottom:14px;z-index:99999;width:330px;max-height:60vh;overflow:auto;background:#fff;color:#111;border:2px solid #e0003c;border-radius:10px;font:14px/1.4 system-ui,sans-serif;box-shadow:0 10px 40px rgba(0,0,0,.3)}' +
    '#rv-panel .h{display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:#e0003c;color:#fff;font-weight:700}' +
    '#rv-panel button{border:0;border-radius:999px;padding:6px 12px;font:600 13px system-ui;cursor:pointer;background:#fff;color:#e0003c}' +
    '#rv-panel button.off{background:#111;color:#fff}' +
    '#rv-panel li{padding:8px 12px;border-top:1px solid #eee;list-style:none}#rv-panel li b{color:#e0003c}' +
    '#rv-panel input{width:100%;margin-top:4px;padding:5px 7px;border:1px solid #ccc;border-radius:4px;font:inherit}' +
    '#rv-panel p{margin:0;padding:10px 12px;color:#555}' +
    '#rv-mini{position:fixed;right:14px;bottom:14px;z-index:99999;border:0;border-radius:999px;padding:10px 16px;font:700 14px system-ui;background:#111;color:#fff;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.3)}';
  document.head.appendChild(css);

  var flags = load();
  var panel = document.createElement('div'); panel.id = 'rv-panel';
  var mini = document.createElement('button'); mini.id = 'rv-mini'; mini.textContent = 'Flag';
  document.body.appendChild(panel); document.body.appendChild(mini);

  function esc(t) { return t.replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
  function apply() {
    document.querySelectorAll('.rv-badge').forEach(function (b) { b.remove(); });
    document.querySelectorAll('.rv-flag').forEach(function (e) { e.classList.remove('rv-flag'); });
    flags.forEach(function (f, i) {
      var el; try { el = document.querySelector(f.p); } catch (e) {}
      if (!el) return;
      el.classList.add('rv-flag');
      var r = el.getBoundingClientRect(), b = document.createElement('div');
      b.className = 'rv-badge'; b.textContent = i + 1;
      b.style.left = (r.left + scrollX - 8) + 'px'; b.style.top = (r.top + scrollY - 8) + 'px';
      document.body.appendChild(b);
    });
  }
  function render() {
    var active = on();
    mini.style.display = active ? 'none' : 'block';
    panel.style.display = active ? 'block' : 'none';
    if (!active) { apply(); return; }
    panel.innerHTML = '<div class="h"><span>Flagged on this page (' + flags.length + ')</span><button class="off" id="rv-off">Off</button></div>' +
      (flags.length ? '<ul style="margin:0;padding:0"></ul>' : '<p>Click anything that is not acceptable. Links work again after you press Off.</p>');
    var ul = panel.querySelector('ul');
    flags.forEach(function (f, i) {
      var li = document.createElement('li');
      li.innerHTML = '<b>' + (i + 1) + '.</b> ' + esc(f.t.slice(0, 60));
      var inp = document.createElement('input'); inp.placeholder = 'why not? (optional)'; inp.value = f.n || '';
      inp.addEventListener('input', function () { f.n = inp.value; save(flags); });
      inp.addEventListener('click', function (e) { e.stopPropagation(); });
      li.appendChild(inp); ul.appendChild(li);
    });
    panel.querySelector('#rv-off').addEventListener('click', function (e) { e.stopPropagation(); setOn(false); render(); });
    apply();
  }
  mini.addEventListener('click', function () { setOn(true); render(); });

  document.addEventListener('click', function (e) {
    if (!on() || panel.contains(e.target) || e.target === mini) return;
    e.preventDefault(); e.stopPropagation();
    var el = e.target, p = cssPath(el);
    var at = flags.findIndex(function (f) { return f.p === p; });
    if (at >= 0) flags.splice(at, 1); else flags.push({ p: p, t: label(el), n: '' });
    save(flags); render();
  }, true);
  render();
})();
