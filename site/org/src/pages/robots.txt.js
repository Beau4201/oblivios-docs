import { siteUrl } from "../lib/site.mjs";
import { robotsTxt } from "@oblivios/site-shared/lib/agent-files.mjs";

// No Disallow and no noindex: a hidden public site protects nothing. AI agents are named and welcome (ADR-276).
export function GET() {
  return new Response(robotsTxt(siteUrl));
}
