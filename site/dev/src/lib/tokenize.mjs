// The tokenizer of the search. The build uses it to write the index and /browse.js carries a copy of it (the endpoint
// browse.js.js cuts the `export` words and joins this file to the script), so a word is cut the same way when it is
// indexed and when it is searched.
//
// A token is a run of letters and digits, folded to lower case without accents. A version such as 5.18.2 is also one
// token as a whole, and a word of a path or a package name (compartments-profiles, @fontsource-variable/noto-serif) is its
// parts. A letter or digit alone is dropped, except a digit, because ADR numbers and ports are short.

export function fold(s) {
  return String(s).normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function tokenize(s) {
  const out = [];
  for (const m of fold(s).matchAll(/[a-z0-9]+(?:\.[0-9]+)+|[a-z0-9]+/g)) {
    const t = m[0].slice(0, 64);
    if (t.length > 1 || /^[0-9]$/.test(t)) out.push(t);
    if (t.includes(".")) for (const part of t.split(".")) if (part.length > 1) out.push(part);
  }
  return out;
}
