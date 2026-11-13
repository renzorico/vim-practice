/**
 * Lints a folder of stage and legend JSON.
 *   npx tsx tools/maps/cli.ts <dir>
 * Legend files are `*.legend.json`; every other `*.json` is a stage matched to its legend by id.
 * Exits 1 on any error. Warnings are printed and do not fail the run.
 */
import { contentSchema, type StoryContent } from '@escape/story';
import type { EntitySpawn } from '@escape/world';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { countBySeverity, lintSources, type FileReport, type SourceFile } from './folder';

const JSON_SUFFIX = '.json';
const USAGE = 'usage: npx tsx tools/maps/cli.ts <dir> [stage-story.json]';

function assertStory(value: unknown): asserts value is StoryContent {
  contentSchema.parse(value);
}

/** A stage-local story fragment supplies actors absent from the starting map. */
async function readStorySpawns(path: string | undefined): Promise<Readonly<Record<string, readonly EntitySpawn[]>>> {
  if (path === undefined) return {};
  const story: unknown = JSON.parse(await readFile(path, 'utf8'));
  assertStory(story);
  const effects = [
    ...story.dialogues.flatMap(item => item.then),
    ...story.reactions.flatMap(item => item.then),
    ...story.cutscenes.flatMap(item => item.then),
    ...story.quests.flatMap(item => item.steps.flatMap(step => step.then)),
  ];
  const entities = effects.flatMap(effect => effect.type === 'world'
    ? effect.effects.flatMap(inner => inner.type === 'spawn' ? [inner.entity] : []) : []);
  return { [story.openingStage]: entities };
}

async function readFolder(dir: string): Promise<SourceFile[]> {
  const names = (await readdir(dir)).filter((name) => name.endsWith(JSON_SUFFIX)).sort();
  return Promise.all(
    names.map(async (name) => ({ name, text: await readFile(join(dir, name), 'utf8') })),
  );
}

function formatReport(report: FileReport): string[] {
  const lines = report.issues.map((issue) => `  ${issue.severity} [${issue.rule}] ${issue.message}`);
  return [report.file, ...lines];
}

function printSummary(reports: readonly FileReport[]): void {
  const { errors, warnings } = countBySeverity(reports);
  const checked = reports.length;
  console.log(`${checked} file(s) checked: ${errors} error(s), ${warnings} warning(s).`);
}

async function main(): Promise<number> {
  const dir = process.argv[2];
  if (dir === undefined) {
    console.error(USAGE);
    return 2;
  }
  const reports = lintSources(await readFolder(dir), await readStorySpawns(process.argv[3]));
  for (const report of reports.filter((item) => item.issues.length > 0)) {
    console.log(formatReport(report).join('\n'));
  }
  printSummary(reports);
  return countBySeverity(reports).errors > 0 ? 1 : 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
  });
