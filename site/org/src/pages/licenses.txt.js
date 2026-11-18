import fs from "node:fs";
import path from "node:path";

// The licence texts of the two font families the site serves (SIL OFL 1.1), from the installed packages.
const fonts = ["roboto-flex", "noto-serif"];

export function GET() {
  const body = fonts
    .map((f) => {
      const dir = path.resolve(process.cwd(), "../node_modules/@fontsource-variable", f);
      const pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
      return `${f} (${pkg.name} ${pkg.version}, ${pkg.license})\n\n${fs.readFileSync(path.join(dir, "LICENSE"), "utf8")}`;
    })
    .join("\n\n----------------------------------------\n\n");
  return new Response(body);
}
