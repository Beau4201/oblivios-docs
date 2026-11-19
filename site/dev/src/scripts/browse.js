/* The one script of oblivios.dev (ADR-268): search and filters. It is plain, readable source, served as it is written.
   It fetches /search-index.json when a search starts, from its own origin, and nothing else. It stores nothing: no
   cookie, no storage; the query lives in the address of the page. Every page works without it (the decision list is
   paged, the SBOM pages are complete); with it, the search fields and the filters work.

   How a search is ranked: each word of the query is matched exactly, as the start of a word while it is being typed, and
   with one or two letters wrong when it matches nothing; a document that has every word comes first; the score is BM25
   over the fields of the document with the weight of each field (name and title count most); an ADR number or an
   advisory ID that is typed whole puts its document at the top; a document with the words in its title, or the phrase
   in its text, is lifted; a library whose whole licence is the typed one is lifted, and an amendment comes after the
   decision it amends. */
/*TOKENIZER*/

(function () {
  "use strict";
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const rx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // ---- the index
  let idx = null;
  let loading = null;
  function load() {
    if (idx) return Promise.resolve(idx);
    if (!loading) {
      loading = fetch("/search-index.json")
        .then((r) => {
          if (!r.ok) throw new Error("status " + r.status);
          return r.json();
        })
        .then((j) => {
          j.df = j.post.map((p) => p.length / 2);
          idx = j;
          return j;
        });
      loading.catch(() => {
        loading = null;
      });
    }
    return loading;
  }

  // ---- finding words
  const bound = (arr, x) => {
    let lo = 0;
    let hi = arr.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (arr[mid] < x) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  const exact = (t) => {
    const i = bound(idx.terms, t);
    return idx.terms[i] === t ? i : -1;
  };
  function prefixed(p, limit) {
    const out = [];
    for (let i = bound(idx.terms, p); i < idx.terms.length && idx.terms[i].startsWith(p) && out.length < limit; i++) out.push(i);
    return out;
  }
  // the distance between two words counting a swap of neighbours as one step; stops as soon as it passes max
  function distance(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let prev2 = null;
    let prev = [];
    for (let j = 0; j <= b.length; j++) prev.push(j);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      let min = i;
      for (let j = 1; j <= b.length; j++) {
        let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
        cur.push(v);
        if (v < min) min = v;
      }
      if (min > max) return max + 1;
      prev2 = prev;
      prev = cur;
    }
    return prev[b.length];
  }
  function fuzzy(t, limit) {
    const max = t.length >= 8 ? 2 : 1;
    const found = [];
    for (let i = 0; i < idx.terms.length; i++) {
      const u = idx.terms[i];
      if (u[0] !== t[0] || Math.abs(u.length - t.length) > max) continue;
      const d = distance(t, u, max);
      if (d <= max) found.push([i, d]);
    }
    found.sort((a, b) => a[1] - b[1] || idx.df[b[0]] - idx.df[a[0]]);
    return found.slice(0, limit);
  }

  // ---- the search
  // a decision is what most searches are for; the directories and files that carry its name come after it
  const BOOST = { d: 1.4, a: 1.1, c: 1, s: 1, f: 0.6 };
  // a published document as a whole is what "threat model" asks for; its sections and cases support a record and do not outrank
  // the decision, the library or the advisory that carries the same name
  const docWeight = (doc) => (doc.t !== "x" ? 1 : doc.k === "doc" ? 1.2 : 0.7);
  function search(query, pass) {
    const t0 = performance.now();
    const raw = String(query || "").trim();
    const tokens = tokenize(raw);
    const typedPrefix = raw !== "" && !/\s$/.test(String(query)) && tokens.length > 0;
    const N = idx.n;
    const marks = new Set(tokens);
    if (!tokens.length) return { hits: [], tokens, marks: [], ms: 0, empty: true };

    const perToken = tokens.map((tok, qi) => {
      const last = qi === tokens.length - 1;
      let cands = [];
      const e = exact(tok);
      if (e >= 0) cands.push([e, 1]);
      if (!/^[0-9]+$/.test(tok) || tok.length > 3) {
        if (last && typedPrefix && (tok.length >= 4 || e < 0)) {
          // the word is still being typed: its continuations count, a little less than the word itself (a word of three
          // letters that exists is not stretched: "mit" is the licence, not mitigation)
          for (const i of prefixed(tok, 60)) if (i !== e) cands.push([i, 0.55]);
        } else if (e < 0 || tok.indexOf(".") > 0) {
          // a word that is not there yet, or a version such as 5.18, which is also the start of 5.18.2 even when some
          // document spells 5.18 alone
          for (const i of prefixed(tok, 30)) if (i !== e) cands.push([i, 0.5]);
        }
        if (!cands.length && tok.length >= 4) for (const [i, d] of fuzzy(tok, 10)) cands.push([i, 0.5 - 0.12 * d]);
      }
      const scores = new Map();
      for (const [ti, f] of cands) {
        const post = idx.post[ti];
        const idf = Math.log(1 + (N - idx.df[ti] + 0.5) / (idx.df[ti] + 0.5));
        if (f < 0.5) marks.add(idx.terms[ti]); // a word found with a letter wrong is marked as it stands in the text
        for (let k = 0; k < post.length; k += 2) {
          const di = post[k];
          const doc = idx.docs[di];
          if (pass && !pass(doc)) continue;
          const mask = post[k + 1] >> 8;
          const tf = (post[k + 1] & 255) / 2;
          const s = idf * ((tf * 2.4) / (tf + 1.4 * (0.5 + (0.5 * doc.w) / idx.avg))) * f;
          const cur = scores.get(di);
          if (!cur) scores.set(di, [s, mask]);
          else {
            if (s > cur[0]) cur[0] = s;
            cur[1] |= mask;
          }
        }
      }
      return scores;
    });

    // a document with every word; when there are few, also those that lack one
    const union = new Set();
    perToken.forEach((m) => m.forEach((_, di) => union.add(di)));
    const rows = [];
    for (const di of union) {
      let total = 0;
      let have = 0;
      let mask = 0;
      let inTitle = 0;
      for (const m of perToken) {
        const v = m.get(di);
        if (!v) continue;
        have++;
        total += v[0];
        mask |= v[1];
        if (v[1] & 1) inTitle++;
      }
      rows.push({ di, total, have, mask, inTitle });
    }
    // every word is needed; only when no document has them all, the documents that lack one word are shown, and the page says so
    const full = rows.filter((r) => r.have === tokens.length);
    const loose = !full.length && tokens.length > 1;
    const use = loose ? rows.filter((r) => r.have === tokens.length - 1).map((r) => ((r.total *= 0.5), r)) : full;

    const lower = raw.toLowerCase();
    const num = /^(?:adr[\s-]*)?(\d{1,3})$/i.exec(raw);
    const hits = use.map((r) => {
      const doc = idx.docs[r.di];
      let s = r.total * (BOOST[doc.t] || 1) * docWeight(doc) * (doc.k === "mod" ? 0.7 : 1);
      if (tokens.length > 1 && r.inTitle === tokens.length) s *= 1.35;
      const id = String(doc.i || "").toLowerCase();
      if (id && (id === lower || id === lower.replace(/\s+/, "-") || (num && doc.t === "d" && id === "adr-" + String(num[1]).padStart(3, "0")))) s += 60;
      const title = String(doc.n || "").toLowerCase();
      // the name of a component or a data set typed as it stands, alone or beside a version, is what was asked for
      if ((doc.t === "c" || doc.t === "s") && (title === lower || tokens.indexOf(title) >= 0)) s += title === lower ? 25 : 12;
      // a licence typed as it stands: the libraries that have only that licence come before those with a long expression
      if (doc.t === "c" && tokens.length === 1 && String(doc.l || "").toLowerCase() === lower) s += 5;
      // an amendment comes after the decision it amends when both match the words equally
      if (doc.t === "d" && title.indexOf("amend ") === 0) s *= 0.8;
      if (tokens.length > 1 && title.indexOf(lower) >= 0) s += 6;
      else if (tokens.length > 1 && String(doc.x || "").toLowerCase().indexOf(lower) >= 0) s += 2;
      if (doc.t === "d") s += Number(doc.i.slice(4)) / 4000;
      return { di: r.di, doc, score: s, mask: r.mask };
    });
    hits.sort((a, b) => b.score - a.score || a.di - b.di);
    return { hits, tokens, marks: Array.from(marks), loose, ms: performance.now() - t0 };
  }

  // the closest words, for "did you mean"
  function suggest(tokens) {
    const out = [];
    for (const tok of tokens) {
      if (exact(tok) >= 0 || tok.length < 4) continue;
      for (const [i] of fuzzy(tok, 3)) out.push(idx.terms[i]);
    }
    return Array.from(new Set(out)).slice(0, 4);
  }

  // ---- showing a hit
  function mark(text, words) {
    const ws = words.filter((w) => w.length > 1 || /\d/.test(w)).sort((a, b) => b.length - a.length);
    if (!ws.length) return esc(text);
    const re = new RegExp("(" + ws.map(rx).join("|") + ")", "gi");
    return text.split(re).map((p, i) => (i % 2 ? "<mark>" + esc(p) + "</mark>" : esc(p))).join("");
  }
  function window_(text, words, size) {
    const ws = words.filter((w) => w.length > 1).map((w) => w.toLowerCase());
    const low = text.toLowerCase();
    let first = -1;
    let count = 0;
    for (const w of ws) {
      let at = low.indexOf(w);
      while (at >= 0) {
        count++;
        if (first < 0 || at < first) first = at;
        at = low.indexOf(w, at + w.length);
      }
    }
    if (first < 0 || text.length <= size) return { text: text.length > size ? text.slice(0, size).replace(/\s+\S*$/, "") + "…" : text, count };
    let start = Math.max(0, first - 50);
    if (start > 0) start = text.indexOf(" ", start) + 1 || start;
    let end = Math.min(text.length, start + size);
    if (end < text.length) end = text.lastIndexOf(" ", end) > start ? text.lastIndexOf(" ", end) : end;
    return { text: (start > 0 ? "…" : "") + text.slice(start, end) + (end < text.length ? "…" : ""), count };
  }
  const FIELDS = [[1, "the name"], [2, "the decision"], [4, "the reasons"], [8, "the review"]];
  const found = (mask) => FIELDS.filter((f) => mask & f[0]).map((f) => f[1]).join(", ");

  const adrNumber = (doc) => Number(doc.i.slice(4));
  const gitHref = (doc) => {
    const parts = doc.n.split("/");
    const commit = idx.g[parts[0].replace("oblivios-", "")] || "main";
    return "https://github.com/Beau4201/" + parts[0] + "/blob/" + commit + "/" + parts.slice(1).join("/");
  };
  const href = (doc) =>
    doc.t === "d" ? "/adr/" + adrNumber(doc) : doc.t === "x" ? doc.h : doc.t === "a" ? "/advisories#" + doc.i : doc.t === "c" ? "/components?q=" + encodeURIComponent(doc.n) : doc.t === "s" ? "/data?q=" + encodeURIComponent(doc.n) : gitHref(doc);
  const stamp = (doc) => '<span class="sx ' + esc(doc.st) + '">' + esc(doc.sl) + "</span>";
  const TYPE = { d: "Decision", c: "Component", a: "Advisory", s: "Data", f: "File", x: "Document" };

  function decisionHtml(hit, words, showText) {
    const d = hit.doc;
    let p = "";
    if (showText) {
      const a = window_(d.x, words, 230);
      const b = window_(d.r, words, 200);
      p = b.count > a.count ? "<p><b>Review when:</b> " + mark(b.text, words) + "</p>" : "<p>" + mark(a.text, words) + "</p>";
    } else p = "<p><b>Review when:</b> " + esc(d.r.length > 240 ? d.r.slice(0, 237) + "…" : d.r) + "</p>";
    const meta = [d.pt.join(", "), hit.mask && showText ? "Found in " + found(hit.mask) : "", d.c ? "Shown as written: the entry does not have the usual seven columns" : ""].filter(Boolean).join(" · ");
    return (
      '<li class="en"><div class="id">' + esc(d.i) + "<small>" + esc(d.dt) + "</small>" + stamp(d) + '</div><div><h3><a data-hit href="' + href(d) + '">' + mark(d.n, words) + "</a></h3>" + p + (meta ? '<p class="meta">' + esc(meta) + "</p>" : "") + "</div></li>"
    );
  }
  function generalHtml(hit, words) {
    const d = hit.doc;
    let title = mark(d.n, words);
    let body = "";
    let label = TYPE[d.t];
    if (d.t === "c") {
      title = mark(d.n, words) + (d.v ? ' <span class="m v">' + mark(d.v, words) + "</span>" : "");
      body = '<p class="meta">' + [d.e, d.l, d.a ? d.a + " advisories" : "", d.x].filter(Boolean).map(esc).join(" · ") + "</p>";
      label = d.k === "tool" ? "Tool" : d.k === "mod" ? "Upstream project" : "Library";
    } else if (d.t === "a") {
      body = "<p>" + mark(window_(d.x, words, 260).text, words) + '</p><p class="meta">' + esc(d.c) + " · " + esc(d.e) + "</p>";
    } else if (d.t === "x") {
      body = "<p>" + mark(window_(d.x, words, 260).text, words) + '</p><p class="meta">' + esc(d.p) + "</p>";
    } else if (d.t === "s") {
      body = '<p class="meta">' + [d.l, d.m === "source" ? "A public source" : "In the repositories", d.np ? "Not in the repositories" : "", d.x].filter(Boolean).map(esc).join(" · ") + "</p>";
    } else {
      title = '<span class="m">' + mark(d.n, words) + "</span>";
      body = '<p class="meta"><span class="m">' + mark(d.h, words) + "</span>" + (d.b ? " · Prebuilt binary" : d.p ? " · Patch" : "") + "</p>";
    }
    const idc = d.t === "a" ? '<span class="m aid">' + mark(d.i, words) + "</span>" : esc(label);
    return '<li class="en gen"><div class="id t">' + idc + (d.t === "a" ? "<small>Advisory</small>" : "") + "</div><div><h3><a data-hit href=\"" + esc(href(d)) + '">' + title + "</a></h3>" + body + "</div></li>";
  }
  function rowHtml(hit, words) {
    const d = hit.doc;
    let name = mark(d.n, words);
    let kind;
    let ver;
    let lic = "";
    let adv = "";
    if (d.t === "c") {
      kind = d.k === "tool" ? "Tool" : d.k === "mod" ? "Upstream" : d.e;
      ver = d.v;
      lic = d.l || "not stated";
      adv = d.a ? "<b>" + d.a + "</b>" : "none";
    } else if (d.t === "s") {
      kind = "Data";
      ver = "";
      lic = d.l || "not stated";
      adv = d.np ? "not in the repositories" : "";
    } else {
      name = '<a data-hit href="' + esc(gitHref(d)) + '">' + mark(d.n, words) + "</a>";
      kind = d.b ? "Binary" : d.p ? "Patch" : "File";
      ver = d.h.slice(0, 12);
    }
    return '<li class="cmpl-r"><span class="n">' + name + '</span><span class="e">' + esc(kind) + '</span><span class="v">' + mark(ver, words) + '</span><span class="l">' + esc(lic) + '</span><span class="a">' + adv + "</span></li>";
  }
  function adviceHtml(hit, words) {
    const d = hit.doc;
    return '<li><a class="m aid" data-hit href="' + esc(d.u) + '">' + mark(d.i, words) + "</a><div><b>" + mark(d.n, words) + "</b><p>" + mark(window_(d.x, words, 300).text, words) + '</p><p class="meta">' + esc(d.c) + " · " + esc(d.e) + "</p></div></li>";
  }
  function dataHtml(hit, words) {
    const d = hit.doc;
    return "<li><b>" + mark(d.n, words) + '</b><span><span class="m">' + esc(d.l || "not stated") + "</span>" + (d.np ? ' · <em class="nt-flag">not in the repositories</em>' : "") + (d.m === "shipped" ? " · " + d.f + (d.f === 1 ? " file" : " files") : "") + "</span></li>";
  }

  // ---- what each place filters and how it shows a hit
  const checked = (form, group) => $$('input[data-filter="' + group + '"]:checked', form).map((i) => i.value);
  const SCOPES = {
    decisions: {
      list: "ol, ul",
      pass: (f) => (d) => d.t === "d" && (!f.st.length || f.st.indexOf(d.st) >= 0) && (!f.pt.length || d.pt.some((p) => f.pt.indexOf(p) >= 0)) && (!f.ev.length || d.ev.some((e) => f.ev.indexOf(e) >= 0)),
      groups: ["st", "pt", "ev"],
      html: (h, w, q) => decisionHtml(h, w, q),
    },
    components: {
      band: true,
      pass: (f) => (d) => {
        const type = f.type[0] || "all";
        if (d.t === "d" || d.t === "a" || d.t === "x") return false;
        if (type === "lib" && !(d.t === "c" && d.k !== "tool")) return false;
        if (type === "file" && d.t !== "f") return false;
        if (type === "data" && d.t !== "s") return false;
        if (type === "tool" && !(d.t === "c" && d.k === "tool")) return false;
        if (f.eco.length && !(d.t === "c" && f.eco.indexOf(d.e) >= 0)) return false;
        if (f.lic.length && f.lic.indexOf(d.l) < 0) return false;
        if (f.only.indexOf("adv") >= 0 && !(d.t === "c" && d.a > 0)) return false;
        if (f.only.indexOf("np") >= 0 && !(d.t === "s" && d.np)) return false;
        if (f.only.indexOf("pre") >= 0 && !(d.t === "f" && d.b)) return false;
        return true;
      },
      groups: ["type", "eco", "lic", "only"],
      neutral: { type: "all" },
      html: (h, w) => rowHtml(h, w),
      wrap: (items) => '<ul class="cmpl e5"><li class="cmpl-h"><span>Component</span><span>Kind</span><span>Version</span><span>Licence</span><span>Advisories</span></li>' + items + "</ul>",
    },
    advisories: {
      band: true,
      pass: (f) => (d) => d.t === "a" && (!f.eco.length || f.eco.indexOf(d.e) >= 0),
      groups: ["eco"],
      html: (h, w) => adviceHtml(h, w),
      wrap: (items) => '<ul class="advl flat">' + items + "</ul>",
    },
    data: {
      band: true,
      pass: () => (d) => d.t === "s",
      groups: [],
      html: (h, w) => dataHtml(h, w),
      wrap: (items) => '<ul class="dl2">' + items + "</ul>",
    },
    all: {
      pass: (f) => (d) => !f.kind.length || f.kind.indexOf(d.t) >= 0,
      groups: ["kind"],
      html: (h, w) => (h.doc.t === "d" ? decisionHtml(h, w, true) : generalHtml(h, w)),
    },
  };

  const STEP = 30;
  // a button that only works with the script is hidden in the page and shown here, again after the list is restored
  const reveal = () => $$("[data-showall]").forEach((b) => (b.hidden = false));
  function wire(form) {
    const scope = SCOPES[form.getAttribute("data-scope")];
    const input = $('input[type="search"]', form);
    const out = $("[data-results]");
    const status = $("[data-status]");
    const hideWhenActive = $$("[data-hide-when-active]");
    const saved = out ? out.innerHTML : "";
    let shown = STEP;
    let last = null;
    let seq = 0;

    const filters = () => {
      const f = {};
      scope.groups.forEach((g) => (f[g] = checked(form, g)));
      return f;
    };
    const neutral = (f) => scope.groups.every((g) => !f[g].length || (scope.neutral && scope.neutral[g] === f[g][0] && f[g].length === 1));
    const say = (t) => {
      if (status) status.textContent = t;
    };
    // on the pages of the bill of materials the results take the place of whole bands, so they sit in a band of their own
    const frame = (h) => (scope.band ? '<section class="band alt"><div class="c">' + h + "</div></section>" : h);

    function paint(res, q) {
      const words = res.marks.length ? res.marks : tokenize(q);
      const slice = res.hits.slice(0, shown);
      const items = slice.map((h) => scope.html(h, words, true)).join("");
      out.innerHTML = frame((scope.wrap ? scope.wrap(items) : '<ol class="entries">' + items + "</ol>") + (res.hits.length > shown ? '<div class="btns after"><button class="btn ghost" type="button" data-more>Show ' + Math.min(STEP, res.hits.length - shown) + " more</button></div>" : ""));
    }
    function paintAll(f, q) {
      // no words: the documents of this place in the order of the index, with the filters
      const pass = scope.pass(f);
      const hits = [];
      for (let i = 0; i < idx.docs.length && hits.length < shown + 1; i++) if (pass(idx.docs[i])) hits.push({ di: i, doc: idx.docs[i], score: 0, mask: 0 });
      let total = 0;
      for (let i = 0; i < idx.docs.length; i++) if (pass(idx.docs[i])) total++;
      const items = hits.slice(0, shown).map((h) => scope.html(h, [], false)).join("");
      out.innerHTML = frame((scope.wrap ? scope.wrap(items) : '<ol class="entries">' + items + "</ol>") + (total > shown ? '<div class="btns after"><button class="btn ghost" type="button" data-more>Show ' + Math.min(STEP, total - shown) + " more</button></div>" : ""));
      return total;
    }
    // with no words the chips show how many documents of each kind there are, the number the page was built with
    const totals = () =>
      $$("[data-count]", form).forEach((el) => {
        if (el.hasAttribute("data-total")) el.textContent = Number(el.getAttribute("data-total")).toLocaleString("en-US");
      });
    function run() {
      const q = input ? input.value : "";
      const f = filters();
      const active = q.trim() !== "" || !neutral(f);
      // the query lives in the address, so a search can be shared and the back button keeps it
      const u = new URL(location.href);
      if (q.trim()) u.searchParams.set("q", q.trim());
      else u.searchParams.delete("q");
      history.replaceState(null, "", u.pathname + u.search + u.hash);
      if (!active && out) {
        out.innerHTML = saved;
        totals();
        reveal();
        hideWhenActive.forEach((e) => (e.hidden = false));
        say("");
        return;
      }
      const mine = ++seq;
      say("Loading the index…");
      load().then(
        () => {
          if (mine !== seq) return;
          hideWhenActive.forEach((e) => (e.hidden = true));
          if (q.trim() === "") {
            totals();
            const total = paintAll(f, q);
            say(total + (total === 1 ? " entry" : " entries"));
            last = null;
            return;
          }
          const res = search(q, scope.pass(f));
          last = { res, q };
          if (form.getAttribute("data-scope") === "all") counts(q);
          if (!res.hits.length) {
            const s = suggest(res.tokens);
            out.innerHTML = frame('<p class="none">Nothing found for “' + esc(q.trim()) + "”." + (s.length ? " Did you mean " + s.map((w) => '<button class="u" type="button" data-try="' + esc(w) + '">' + esc(w) + "</button>").join(", ") + "?" : "") + "</p>");
            say("No results");
            return;
          }
          paint(res, q);
          say(
            res.loose
              ? "Nothing has every word of “" + q.trim() + "”. These " + res.hits.length + " lack one."
              : res.hits.length + (res.hits.length === 1 ? " result" : " results") + " for “" + q.trim() + "” in " + Math.max(1, Math.round(res.ms)) + " ms",
          );
        },
        () => {
          if (mine === seq) {
            say("");
            if (out) out.innerHTML = frame('<p class="none">The search index could not be loaded. Reload the page, or read the lists on the other pages.</p>');
          }
        },
      );
    }
    // the number of hits of each kind, for the chips of the search page (counted without the kind filter)
    function counts(q) {
      const all = search(q, null);
      const n = { d: 0, c: 0, a: 0, s: 0, f: 0, x: 0 };
      all.hits.forEach((h) => n[h.doc.t]++);
      Object.keys(n).forEach((k) => {
        const el = $('[data-count="' + k + '"]', form);
        if (el) el.textContent = n[k].toLocaleString("en-US");
      });
    }

    form.addEventListener("submit", (e) => e.preventDefault());
    form.addEventListener("input", () => {
      shown = STEP;
      run();
    });
    form.addEventListener("change", () => {
      shown = STEP;
      run();
    });
    form.addEventListener("reset", () => {
      setTimeout(() => {
        shown = STEP;
        run();
      }, 0);
    });
    if (input) {
      input.addEventListener("focus", () => {
        load();
      });
      input.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && input.value) {
          input.value = "";
          shown = STEP;
          run();
        } else if (e.key === "ArrowDown") {
          const a = $("[data-hit]");
          if (a) {
            e.preventDefault();
            a.focus();
          }
        }
      });
    }
    document.addEventListener("click", (e) => {
      const more = e.target.closest && e.target.closest("[data-more]");
      if (more && out && out.contains(more)) {
        shown += STEP;
        if (last) paint(last.res, last.q);
        else run();
        return;
      }
      const t = e.target.closest && e.target.closest("[data-try]");
      if (t && input) {
        input.value = t.getAttribute("data-try");
        input.focus();
        run();
      }
    });
    // arrow keys move through the hits
    document.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      const links = $$("[data-hit]");
      const at = links.indexOf(document.activeElement);
      if (at < 0) return;
      e.preventDefault();
      if (e.key === "ArrowDown") (links[at + 1] || links[at]).focus();
      else if (at === 0 && input) input.focus();
      else links[at - 1].focus();
    });

    const start = new URL(location.href).searchParams.get("q");
    if (start && input) input.value = start;
    if (start || !neutral(filters())) run();
    return input;
  }

  // ---- start, and the / key
  const forms = $$("form[data-scope]");
  const inputs = forms.map(wire);
  // "Browse all libraries": the list of the page is the first of many; with a script the rest is one click away
  reveal();
  document.addEventListener("click", (e) => {
    if (!(e.target.closest && e.target.closest("[data-showall]"))) return;
    const lib = $('input[data-filter="type"][value="lib"]');
    if (lib) {
      lib.checked = true;
      lib.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    e.preventDefault();
    if (inputs[0]) inputs[0].focus();
    else location.href = "/search";
  });

  // ---- the contents column: the section on screen is marked (aria-current, which gives it the blue edge), and a column that is
  // longer than the screen scrolls to keep it in view
  (function spy() {
    const toc = $(".toc");
    if (!toc) return;
    const items = $$("a[href^='#']", toc)
      .map((a) => [a, document.getElementById(decodeURIComponent(a.getAttribute("href").slice(1)))])
      .filter((x) => x[1]);
    if (!items.length) return;
    let cur = null;
    let queued = false;
    const update = () => {
      queued = false;
      // the last section whose top has passed the line under the header, or the first one before any has
      let pick = items[0];
      for (const it of items) {
        if (it[1].getBoundingClientRect().top <= 150) pick = it;
        else break;
      }
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) pick = items[items.length - 1];
      if (pick === cur) return;
      if (cur) cur[0].removeAttribute("aria-current");
      pick[0].setAttribute("aria-current", "true");
      cur = pick;
      if (toc.scrollHeight > toc.clientHeight) toc.scrollTop = pick[0].offsetTop - (toc.clientHeight - pick[0].offsetHeight) / 2;
    };
    const queue = () => {
      if (!queued) {
        queued = true;
        window.requestAnimationFrame(update);
      }
    };
    window.addEventListener("scroll", queue, { passive: true });
    window.addEventListener("resize", queue);
    update();
  })();

  // ---- the tabs under a page header: on a phone the row scrolls sideways, so the current tab is brought into view
  (function tabs() {
    const row = $(".subnav .c");
    const on = row && $("a[aria-current]", row);
    // only when the current tab would be cut off at the right edge: scroll just far enough to show it
    const need = on ? on.offsetLeft + on.offsetWidth + 24 - row.clientWidth : 0;
    if (need > 0) row.scrollLeft = need;
  })();
})();
