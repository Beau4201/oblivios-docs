import fs from "node:fs";
import { security } from "../lib/records.mjs";

// the public key of the security contact, copied from the repository at build time
export function GET() {
  return new Response(fs.readFileSync(security.keyFile));
}
