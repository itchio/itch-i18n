// validates every locale file against the rules the itch app relies on
// errors fail the run, warnings are printed but don't
//
// the app parses strings with two parsers: intl-messageformat (old parser,
// used for plain string contexts) and react-intl (newer @formatjs parser),
// so a string has to parse with both

import fs from "node:fs";
import path from "node:path";
import { parse as parseNew, TYPE } from "@formatjs/icu-messageformat-parser";
import { parse as parseOld } from "intl-messageformat-parser";

const LOCALES_DIR = path.join(path.dirname(new URL(import.meta.url).pathname), "locales");

// the only rich text tags the app has handlers for, anything else throws
const ALLOWED_TAGS = new Set(["strong", "em", "code"]);

const ARGUMENT_TYPES = new Set([
  TYPE.argument,
  TYPE.number,
  TYPE.date,
  TYPE.time,
  TYPE.select,
  TYPE.plural,
]);

const inCI = !!process.env.GITHUB_ACTIONS;
let errorCount = 0;
let warningCount = 0;

function report(level, file, line, message) {
  const rel = path.join("locales", file);
  if (level === "error") errorCount++;
  else warningCount++;

  if (inCI) {
    console.log(`::${level} file=${rel},line=${line}::${message}`);
  } else {
    console.log(`${level.toUpperCase()} ${rel}:${line} ${message}`);
  }
}

function lineOf(text, key) {
  const idx = text.indexOf(JSON.stringify(key) + ":");
  if (idx === -1) return 1;
  return text.slice(0, idx).split("\n").length;
}

// collects argument names and tag names from a parsed message
function collect(ast, out = { args: new Set(), tags: new Set() }) {
  for (const el of ast) {
    if (ARGUMENT_TYPES.has(el.type)) {
      out.args.add(el.value);
    }
    if (el.type === TYPE.tag) {
      out.tags.add(el.value);
      collect(el.children, out);
    }
    if (el.type === TYPE.select || el.type === TYPE.plural) {
      for (const opt of Object.values(el.options)) {
        collect(opt.value, out);
      }
    }
  }
  return out;
}

// returns the parsed ast, or throws with the first parser's error message
function parseBoth(message) {
  let ast;
  try {
    ast = parseNew(message);
  } catch (e) {
    throw new Error(`@formatjs parser: ${e.message}`);
  }
  try {
    parseOld(message);
  } catch (e) {
    throw new Error(`intl-messageformat-parser: ${e.message}`);
  }
  return ast;
}

function loadLocale(file) {
  const text = fs.readFileSync(path.join(LOCALES_DIR, file), "utf8");
  try {
    return { text, strings: JSON.parse(text) };
  } catch (e) {
    report("error", file, 1, `invalid JSON: ${e.message}`);
    return null;
  }
}

const files = fs.readdirSync(LOCALES_DIR).filter((f) => f.endsWith(".json")).sort();

const en = loadLocale("en.json");
if (!en) process.exit(1);

// parse the source strings first, translations are compared against these
const enInfo = {};
for (const [key, value] of Object.entries(en.strings)) {
  try {
    enInfo[key] = collect(parseBoth(value));
  } catch (e) {
    report("error", "en.json", lineOf(en.text, key), `${key}: ${e.message}`);
  }
}

for (const file of files) {
  if (file === "en.json") continue;
  const locale = loadLocale(file);
  if (!locale) continue;

  for (const [key, value] of Object.entries(locale.strings)) {
    const line = lineOf(locale.text, key);

    if (typeof value !== "string") {
      report("error", file, line, `${key}: value must be a string`);
      continue;
    }

    let info;
    try {
      info = collect(parseBoth(value));
    } catch (e) {
      report("error", file, line, `${key}: ${e.message}`);
      continue;
    }

    for (const tag of info.tags) {
      if (!ALLOWED_TAGS.has(tag)) {
        report("error", file, line, `${key}: unsupported tag <${tag}>`);
      }
    }

    const source = enInfo[key];
    if (!source) {
      if (!(key in en.strings)) {
        report("warning", file, line, `${key}: key is not in en.json`);
      }
      continue;
    }

    // a placeholder the app never passes makes the format call throw
    for (const arg of info.args) {
      if (!source.args.has(arg)) {
        report("error", file, line, `${key}: unknown placeholder {${arg}}, en.json has: ${[...source.args].map((a) => `{${a}}`).join(" ") || "none"}`);
      }
    }

    for (const arg of source.args) {
      if (!info.args.has(arg)) {
        report("warning", file, line, `${key}: missing placeholder {${arg}}`);
      }
    }
  }
}

console.log(`\n${files.length} locale files checked: ${errorCount} errors, ${warningCount} warnings`);
process.exit(errorCount > 0 ? 1 : 0);
