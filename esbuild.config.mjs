import esbuild from "esbuild";
import { rm } from "node:fs/promises";

const prod = process.argv.includes("production");
const outfile = "main.js";

await rm(outfile, { force: true });

await esbuild.build({
  banner: {
    js: "/* This file is generated from src/main.ts. */",
  },
  bundle: true,
  entryPoints: ["src/main.ts"],
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
  minify: prod,
  outfile,
  sourcemap: prod ? false : "inline",
  target: "es2018",
  treeShaking: true,
});
