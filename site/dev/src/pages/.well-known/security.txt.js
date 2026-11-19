import { securityTxt } from "../../lib/securitytxt.mjs";

export function GET() {
  return new Response(securityTxt());
}
