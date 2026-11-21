// An Atom feed (RFC 4287) as a static file: the build writes it, nothing runs on a request. Every text is escaped here, and
// characters that XML does not allow are dropped.
import { siteUrl } from "./site.mjs";

const x = (s) =>
  String(s)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// entries: { id, title, updated (ISO, UTC), link, related?, summary }, newest first
export function atom({ path, title, subtitle, entries }) {
  const updated = entries.map((e) => e.updated).sort().at(-1);
  const body = entries
    .map(
      (e) => `  <entry>
    <id>${x(e.id)}</id>
    <title>${x(e.title)}</title>
    <updated>${e.updated}</updated>
    <link rel="alternate" type="text/html" href="${x(e.link)}"/>${e.related ? `\n    <link rel="related" href="${x(e.related)}"/>` : ""}
    <summary>${x(e.summary)}</summary>
  </entry>`,
    )
    .join("\n");
  return new Response(
    `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <id>${siteUrl}${path}</id>
  <title>${x(title)}</title>
  <subtitle>${x(subtitle)}</subtitle>
  <updated>${updated}</updated>
  <link rel="self" type="application/atom+xml" href="${siteUrl}${path}"/>
  <link rel="alternate" type="text/html" href="${siteUrl}/"/>
  <author><name>ObliviOS</name></author>
${body}
</feed>
`,
    { headers: { "Content-Type": "application/atom+xml; charset=utf-8" } },
  );
}
