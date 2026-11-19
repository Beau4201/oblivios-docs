// The served file of /.well-known/security.txt (RFC 9116, D-4). One place for the expiry: the build fails when fewer than
// 60 days remain (the reminder) or when the date is more than a year ahead (the RFC's limit). The contact, the key and the
// policy are those of oblivios.org: the security policy has one home.
import { security } from "./records.mjs";
import { siteUrl, orgUrl } from "./site.mjs";

export const expires = "2027-11-16T12:00:00Z";

export function securityTxt(now = Date.now()) {
  const days = (Date.parse(expires) - now) / 864e5;
  if (days < 60) throw new Error(`security.txt expires in ${Math.floor(days)} days: set a new date in site/dev/src/lib/securitytxt.mjs`);
  if (days > 366) throw new Error("security.txt Expires is more than one year ahead (RFC 9116)");
  return [
    `Contact: mailto:${security.email}`,
    `Expires: ${expires}`,
    `Encryption: ${siteUrl}/security-contact.asc`,
    "Preferred-Languages: en",
    `Canonical: ${siteUrl}/.well-known/security.txt`,
    `Policy: ${orgUrl}/security`,
  ].join("\n") + "\n";
}
