// The topics of the decision log and its crucial set (ADR-290). Both are a grouping and a selection made for the pages of
// oblivios.dev, not a record: the decision log is the record, and nothing here changes a row of it. Every entry has exactly one
// topic. The nine parts of the system are topics, and the entries that belong to a part without being listed in `parts.mjs`
// (amendments, closures, plans of that part) are added here; an entry that is in several parts takes the first one of the list. The
// parts themselves stay as a second, many-to-many filter. A new entry that no list names falls under "Not yet sorted" and is
// still a page, a search hit and a filter result; it is placed here when the next session closes.
import { parts } from "@oblivios/site-shared/lib/parts.mjs";

const OF = "Parts of the system";
const MADE = "How it is made, run and published";
const part = (id, more = []) => {
  const p = parts.find((x) => x.id === id);
  if (!p) throw new Error(`topics.mjs: no part ${id} in parts.mjs`);
  return { id, group: OF, title: p.title, adrs: [...p.adrs, ...more] };
};

export const topics = [
  part("compartments", [37, 168, 177, 200, 201, 203, 205, 206, 214, 223, 235]),
  part("network-exit", [196, 199, 212]),
  part("live-data-map", [164]),
  part("duress-unlock", [40, 53, 58, 61, 62, 64, 68, 69, 71, 72, 74, 81, 82, 84, 89, 90, 91, 92, 94, 95, 147, 232, 274, 280]),
  part("passwords", [202, 237]),
  part("grab-detection", [236, 259]),
  part("app-drawer", [183]),
  part("keyboard"),
  part("airpods", [107, 109, 115, 117, 123, 126, 127, 128, 137, 277]),
  { id: "guardian", group: OF, title: "Guardian (removed)", adrs: [13, 15, 16, 32, 33, 34, 35, 36, 44, 51, 57, 70, 240] },
  { id: "hardening", group: MADE, title: "Privacy hardening and tuning", adrs: [150, 151, 153, 221, 278] },
  { id: "base", group: MADE, title: "Base and devices", adrs: [1, 3, 8, 9, 10, 20, 99, 104, 163, 166, 218] },
  { id: "build", group: MADE, title: "Build and reproducibility", adrs: [17, 18, 21, 22, 23, 24, 25, 29, 31, 112, 226] },
  { id: "signing", group: MADE, title: "Signing and updates", adrs: [26, 27, 28, 30, 41, 43, 45, 46, 47, 48, 49, 50, 52, 100, 101, 102, 103, 105, 110, 111, 113, 246] },
  { id: "release", group: MADE, title: "Release and publication", adrs: [4, 5, 6, 12, 171, 241, 243, 244, 245, 247, 248, 254, 264, 265, 266, 267] },
  {
    id: "sites",
    group: MADE,
    title: "Sites and documentation",
    adrs: [130, 250, 251, 252, 253, 255, 256, 257, 258, 260, 261, 262, 263, 268, 269, 270, 271, 272, 273, 275, 276, 279, 281, 282, 283, 284, 285, 286, 287, 288, 289, 290, 291, 292],
  },
  { id: "brand", group: MADE, title: "Project, name and brand", adrs: [2, 11, 14, 19, 93, 97, 152, 156, 170, 219, 224, 225, 227, 242, 249] },
  { id: "process", group: MADE, title: "Process and rules", adrs: [7, 54, 131, 216, 220] },
];
export const unsorted = "Not yet sorted";

const byNumber = new Map();
for (const t of topics) {
  for (const n of t.adrs) if (!byNumber.has(n)) byNumber.set(n, t.title);
}
export const topicOf = (n) => byNumber.get(n) ?? unsorted;

// The crucial set: decisions that still hold and that most of the others rest on, taken from the entries the log marks Accepted
// (an entry that is superseded or only proposed is not crucial). The one line of each is the reason it is here. The set is
// short on purpose; records.mjs stops the build when one of them is no longer an accepted decision, so that a replaced one is
// noticed and the set reviewed. The owner's decision of the size and of the rule is in ADR-290; the choice of these twelve is the
// agent's proposal, which the owner may overrule entry by entry.
export const crucial = [
  { n: 242, group: "What it is", why: "What ObliviOS is for: control over what the phone reveals." },
  { n: 240, group: "What it is", why: "Guardian is gone from the product; later entries read differently without this one." },
  { n: 1, group: "What it stands on", why: "The base: a pinned GrapheneOS stable release." },
  { n: 2, group: "What it stands on", why: "A distribution of its own, with its own branding, signing, updates and support." },
  { n: 7, group: "What it stands on", why: "What an AI may never be given on the phone." },
  { n: 39, group: "What it does", why: "How Duress Unlock hands over a decoy profile." },
  { n: 167, group: "What it does", why: "How the identity that apps can read from the phone is hardened." },
  { n: 157, group: "What it does", why: "The map that shows which app talks to which company." },
  { n: 185, group: "What it does", why: "The local password vault and the default autofill." },
  { n: 110, group: "How it ships", why: "Who may sign what: the Personal Stable trust tier." },
  { n: 6, group: "How it ships", why: "No public beta until the evidence-based gates are met." },
  { n: 171, group: "How it ships", why: "Source first: what is public now and what waits for the beta." },
];
