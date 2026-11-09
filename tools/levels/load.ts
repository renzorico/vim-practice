import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ZodError } from 'zod';
import { parseLevel } from '../../packages/curriculum/src/schema.js';
import type { Level } from '../../packages/curriculum/src/types.js';

const DEFAULT_ROOT = 'packages/curriculum/levels';
const DRAFTS_FOLDER = 'drafts';
const JSON_EXTENSION = '.json';

/** Lists every level JSON file under `folder`, recursively, skipping any `drafts` folder. */
async function collectLevelFiles(folder: string): Promise<string[]> {
  const entries = await readdir(folder, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(folder, entry.name);
    if (entry.isDirectory() && entry.name !== DRAFTS_FOLDER) {
      files.push(...(await collectLevelFiles(path)));
    } else if (entry.isFile() && entry.name.endsWith(JSON_EXTENSION)) {
      files.push(path);
    }
  }
  return files.sort();
}

function describeZodError(error: ZodError): string {
  return error.issues
    .map((issue) => `  - ${issue.path.map(String).join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
}

function describeFileError(error: unknown): string {
  if (error instanceof ZodError) return describeZodError(error);
  return `  - ${error instanceof Error ? error.message : String(error)}`;
}

/**
 * Loads and validates every level file. Throws one error listing every bad file with its problems,
 * so a single run reports all broken levels at once.
 */
export async function loadLevels(root: string = DEFAULT_ROOT): Promise<Level[]> {
  const levels: Level[] = [];
  const failures: string[] = [];
  for (const path of await collectLevelFiles(root)) {
    try {
      levels.push(parseLevel(JSON.parse(await readFile(path, 'utf8'))));
    } catch (error: unknown) {
      failures.push(`${path}\n${describeFileError(error)}`);
    }
  }
  if (failures.length > 0) {
    throw new Error(`${failures.length} level file(s) failed to load:\n${failures.join('\n')}`);
  }
  return levels;
}
