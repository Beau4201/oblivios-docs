import { buildSearchIndex } from "../lib/search-index.mjs";

// The inverted index over the decisions and the bill of materials, written at build time and fetched by /browse.js.
export function GET() {
  return new Response(JSON.stringify(buildSearchIndex()), { headers: { "Content-Type": "application/json" } });
}
