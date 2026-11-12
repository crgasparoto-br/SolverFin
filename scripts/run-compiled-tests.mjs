#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readdir } from "node:fs/promises";
import path from "node:path";

const args = process.argv.slice(2);

if (args.length === 0) {
  printUsage();
  process.exit(1);
}

const rootArg = args[0];
const options = parseOptions(args.slice(1));
const includeSuffixes = options.include.length > 0 ? options.include : [".test.js"];
const excludeSuffixes = options.exclude;
const root = path.resolve(process.cwd(), rootArg);
const testFiles = await discoverTests(root, includeSuffixes, excludeSuffixes);

if (testFiles.length === 0) {
  console.error(
    `No compiled test files found in ${rootArg} matching ${formatSuffixes(includeSuffixes)}.`,
  );
  if (excludeSuffixes.length > 0) {
    console.error(`Excluded suffixes: ${formatSuffixes(excludeSuffixes)}.`);
  }
  process.exit(1);
}

for (const testFile of testFiles) {
  const relativePath = toPosixPath(path.relative(root, testFile));
  console.log(`\n[test] ${relativePath}`);

  const result = spawnSync(process.execPath, [testFile], { stdio: "inherit" });

  if (result.error !== undefined) {
    console.error(`Failed to run ${relativePath}: ${result.error.message}`);
    process.exit(1);
  }

  if (result.signal !== null) {
    console.error(`${relativePath} terminated with signal ${result.signal}.`);
    process.exit(1);
  }

  if (result.status !== 0) {
    console.error(`${relativePath} failed with exit code ${result.status ?? 1}.`);
    process.exit(result.status ?? 1);
  }
}

console.log(`\n${testFiles.length} compiled test file(s) passed.`);

function parseOptions(rawArgs) {
  const options = { include: [], exclude: [] };

  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];

    if (arg.startsWith("--include=")) {
      options.include.push(readInlineOptionValue(arg, "--include"));
      continue;
    }

    if (arg === "--include") {
      index += 1;
      options.include.push(readNextOptionValue(rawArgs[index], "--include"));
      continue;
    }

    if (arg.startsWith("--exclude=")) {
      options.exclude.push(readInlineOptionValue(arg, "--exclude"));
      continue;
    }

    if (arg === "--exclude") {
      index += 1;
      options.exclude.push(readNextOptionValue(rawArgs[index], "--exclude"));
      continue;
    }

    console.error(`Unknown option: ${arg}`);
    printUsage();
    process.exit(1);
  }

  return options;
}

function readInlineOptionValue(arg, optionName) {
  const value = arg.slice(`${optionName}=`.length).trim();

  return readNextOptionValue(value, optionName);
}

function readNextOptionValue(value, optionName) {
  if (value === undefined || value.trim() === "") {
    console.error(`Missing value for ${optionName}.`);
    printUsage();
    process.exit(1);
  }

  return value.trim();
}

async function discoverTests(rootDir, includeSuffixes, excludeSuffixes) {
  const files = await collectFiles(rootDir);

  return files
    .filter((file) => matchesAnySuffix(file, includeSuffixes))
    .filter((file) => !matchesAnySuffix(file, excludeSuffixes))
    .sort((left, right) =>
      toPosixPath(path.relative(rootDir, left)).localeCompare(
        toPosixPath(path.relative(rootDir, right)),
      ),
    );
}

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectFiles(entryPath)));
      continue;
    }

    if (entry.isFile()) {
      files.push(entryPath);
    }
  }

  return files;
}

function matchesAnySuffix(filePath, suffixes) {
  const normalizedPath = toPosixPath(filePath);

  return suffixes.some((suffix) => normalizedPath.endsWith(suffix));
}

function toPosixPath(filePath) {
  return filePath.split(path.sep).join("/");
}

function formatSuffixes(suffixes) {
  return suffixes.map((suffix) => `\`${suffix}\``).join(", ");
}

function printUsage() {
  console.error(
    "Usage: node scripts/run-compiled-tests.mjs <compiled-root> [--include <suffix>] [--exclude <suffix>]",
  );
}
