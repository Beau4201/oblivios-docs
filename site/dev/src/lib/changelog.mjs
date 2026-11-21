// The changelog: one line for every publication of the snapshot, read from site/dev/src/data/changelog.json. The build reads
// no git (Vercel builds from a shallow clone of the snapshot, and the live check wants the same bytes everywhere): the file is
// written by tools/docs/sync-site.py at every publication. A line is the time of the run in UTC and what changed.
import path from "node:path";
import { ROOT, read, decisions } from "./records.mjs";
import { esc } from "./md.mjs";

const raw = JSON.parse(read(path.join(ROOT, "site/dev/src/data/changelog.json")));
const ISO = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/;

for (const [i, e] of raw.entries.entries()) {
  if (!ISO.test(e.t) || !e.text) throw new Error(`changelog.json, line ${i + 1}: needs a time like 2026-11-20T21:32:48Z and a text`);
  if (i && raw.entries[i - 1].t < e.t) throw new Error(`changelog.json, line ${i + 1}: lines must be newest first`);
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
// "20 November 2026, 21:32 UTC": written by hand, so the build does not depend on the locale data of the machine
export const stamp = (t) => `${+t.slice(8, 10)} ${MONTHS[+t.slice(5, 7) - 1]} ${t.slice(0, 4)}, ${t.slice(11, 16)} UTC`;

export const changelog = raw.entries.map((e) => ({ t: e.t, text: e.text, stamp: stamp(e.t), hm: e.t.slice(11, 16) + " UTC", id: "c" + e.t.replace(/[-:]/g, "") }));
export const changelogLatest = changelog[0].t;

// The changelog page shows the lines by day (UTC), newest day first, and a page holds at most DAYS_PER_PAGE days that
// have a line: a day without a publication takes no room, so a quiet week does not make an empty page.
export const DAYS_PER_PAGE = 7;
export const days = [];
for (const e of changelog) {
  const day = e.t.slice(0, 10);
  if (days.at(-1)?.day !== day) days.push({ day, label: `${+day.slice(8)} ${MONTHS[+day.slice(5, 7) - 1]} ${day.slice(0, 4)}`, entries: [] });
  days.at(-1).entries.push(e);
}

// A decision named in a line (ADR-290) links to its page, when the log has it.
const known = new Set(decisions.map((d) => d.n));
export const linked = (t) => esc(t).replace(/\bADR-(\d+)\b/g, (m, n) => (known.has(+n) ? `<a class="ulk" href="/adr/${n}">${m}</a>` : m));
