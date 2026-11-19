import fs from "node:fs";
import path from "node:path";

// /browse.js is the readable source of src/scripts/browse.js with the tokenizer of the search joined to it (the build and
// the script cut words the same way). No minifier and no bundler: what a visitor reads is what runs.
export function GET() {
  const src = path.resolve(process.cwd(), "src");
  const tokenizer = fs.readFileSync(path.join(src, "lib/tokenize.mjs"), "utf8").replace(/^export /gm, "");
  const script = fs.readFileSync(path.join(src, "scripts/browse.js"), "utf8");
  if (!script.includes("/*TOKENIZER*/")) throw new Error("browse.js has no place for the tokenizer");
  return new Response(script.replace("/*TOKENIZER*/", tokenizer), { headers: { "Content-Type": "text/javascript; charset=utf-8" } });
}
