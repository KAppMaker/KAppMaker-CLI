#!/usr/bin/env node
// Fake `asc` binary for tests. Rules come from $FAKE_ASC_RULES (a JSON file):
// [{ "match": "<regex on the joined argv>", "exit": 0, "stdout": "...", "stderr": "..." }].
// First match wins; no match = exit 0 with "{}". Every call is appended to
// $FAKE_ASC_LOG as one JSON line (the argv array).
import fs from 'node:fs';
const args = process.argv.slice(2);
if (process.env.FAKE_ASC_LOG) fs.appendFileSync(process.env.FAKE_ASC_LOG, JSON.stringify(args) + '\n');
const rules = process.env.FAKE_ASC_RULES ? JSON.parse(fs.readFileSync(process.env.FAKE_ASC_RULES, 'utf8')) : [];
const joined = args.join(' ');
const rule = rules.find((r) => new RegExp(r.match).test(joined));
if (!rule) { process.stdout.write('{}'); process.exit(0); }
if (rule.stdout) process.stdout.write(typeof rule.stdout === 'string' ? rule.stdout : JSON.stringify(rule.stdout));
if (rule.stderr) process.stderr.write(rule.stderr);
process.exit(rule.exit ?? 0);
