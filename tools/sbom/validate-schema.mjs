// SPDX-License-Identifier: Apache-2.0
// Validate a JSON document against a JSON schema with ajv 8 (draft 07), the way build-sbom.py --schemas does.
//   node validate-schema.mjs SCHEMA.json DOCUMENT.json SCHEMA_DIR
// SCHEMA_DIR holds the schemas that SCHEMA refers to (the CycloneDX bom schema names spdx.schema.json and
// jsf-0.82.schema.json). The ajv modules come from NODEJS_LIB (default /usr/share/nodejs, the Debian package).
import { createRequire } from "node:module";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const lib = process.env.NODEJS_LIB || "/usr/share/nodejs";
const require = createRequire(import.meta.url);
const addFormats = require(join(lib, "ajv-formats"));

const [schemaPath, docPath, dir] = process.argv.slice(2);
if (!schemaPath || !docPath || !dir) {
  console.error("usage: validate-schema.mjs SCHEMA DOCUMENT SCHEMA_DIR");
  process.exit(2);
}
const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
// the draft the schema declares decides the ajv class: draft 07 by default, 2019-09 or 2020-12 when named
const draft = String(schema.$schema || "");
const Ajv = draft.includes("2020-12") ? require(join(lib, "ajv/dist/2020")) : draft.includes("2019-09") ? require(join(lib, "ajv/dist/2019")) : require(join(lib, "ajv"));
const ajv = new (Ajv.default || Ajv)({ strict: false, allErrors: true });
addFormats(ajv);
// ajv-formats has no internationalised forms: the CycloneDX schema asks for them; the plain forms are the nearest check
ajv.addFormat("iri-reference", ajv.formats["uri-reference"]);
ajv.addFormat("iri", ajv.formats["uri"]);
ajv.addFormat("idn-email", ajv.formats["email"]);
for (const f of readdirSync(dir)) {
  if (!f.endsWith(".json") || join(dir, f) === schemaPath) continue;
  const s = JSON.parse(readFileSync(join(dir, f), "utf8"));
  if (s.$id && s.$schema === schema.$schema) ajv.addSchema(s);
}
const validate = ajv.compile(schema);
const ok = validate(JSON.parse(readFileSync(docPath, "utf8")));
if (!ok) {
  for (const e of validate.errors.slice(0, 15)) console.log(`${e.instancePath || "/"} ${e.message} ${JSON.stringify(e.params)}`);
  console.log(`${validate.errors.length} schema errors`);
  process.exit(1);
}
console.log(`valid against ${schemaPath.split("/").pop()}`);
