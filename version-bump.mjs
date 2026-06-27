import { readFile, writeFile } from "node:fs/promises";

const version = process.env.npm_package_version;

if (!version) {
  throw new Error("npm_package_version is required. Run this through npm scripts after updating package.json.");
}

const manifestPath = "manifest.json";
const versionsPath = "versions.json";
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const versions = JSON.parse(await readFile(versionsPath, "utf8"));

manifest.version = version;
versions[version] = manifest.minAppVersion;

await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
await writeFile(versionsPath, `${JSON.stringify(versions, null, 2)}\n`);
