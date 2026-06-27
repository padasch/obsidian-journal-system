import { copyFile, mkdir, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import esbuild from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(root, "manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const mainJsPath = path.join(root, "main.js");

if (typeof manifest.id !== "string" || manifest.id.length === 0) {
  throw new Error("manifest.json must define a non-empty plugin id.");
}

await rm(mainJsPath, { force: true });

await esbuild.build({
  banner: {
    js: "/* This file is generated from src/main.ts. */",
  },
  bundle: true,
  entryPoints: [path.join(root, "src/main.ts")],
  external: [
    "obsidian",
    "electron",
    "@codemirror/autocomplete",
    "@codemirror/collab",
    "@codemirror/commands",
    "@codemirror/language",
    "@codemirror/lint",
    "@codemirror/search",
    "@codemirror/state",
    "@codemirror/view",
    "@lezer/common",
    "@lezer/highlight",
    "@lezer/lr"
  ],
  format: "cjs",
  logLevel: "info",
  minify: true,
  outfile: mainJsPath,
  sourcemap: false,
  target: "es2018",
  treeShaking: true,
});

const targetDir = path.join(root, "dist", manifest.id);
await rm(targetDir, { recursive: true, force: true });
await mkdir(targetDir, { recursive: true });

for (const file of ["manifest.json", "main.js", "styles.css"]) {
  const source = path.join(root, file);

  if (!existsSync(source)) {
    throw new Error(`Expected ${file} to exist before packaging.`);
  }

  await copyFile(source, path.join(targetDir, file));
}

console.log(`Created ${targetDir}`);
