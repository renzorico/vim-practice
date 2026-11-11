import { ZodError } from 'zod';
import type { Legend, Stage } from '@escape/world';
import { parseLegend, parseStage } from '../../packages/world/src/schema.js';
import { errorIssue, type LintIssue } from './issue';
import { lintLegend, lintStageAgainst } from './lint';

/** Legend files end with this suffix; every other `.json` file in the folder is a stage. */
export const LEGEND_SUFFIX = '.legend.json';
const JSON_SUFFIX = '.json';

/** A file already read from disk: its name and raw text. Keeps the folder pass free of I/O. */
export interface SourceFile {
  readonly name: string;
  readonly text: string;
}

export interface FileReport {
  readonly file: string;
  readonly issues: readonly LintIssue[];
}

type ParseResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly issues: readonly LintIssue[] };

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function zodIssues(error: ZodError): LintIssue[] {
  return error.issues.map((issue) =>
    errorIssue('schema', `${issue.path.map(String).join('.') || '(root)'}: ${issue.message}`),
  );
}

/** Reads JSON text and parses it. Syntax and schema failures become issues; other errors are rethrown. */
function parseSource<T>(text: string, parse: (json: unknown) => T): ParseResult<T> {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error: unknown) {
    return { ok: false, issues: [errorIssue('parse', `Not valid JSON: ${describeError(error)}`)] };
  }
  try {
    return { ok: true, value: parse(json) };
  } catch (error: unknown) {
    if (error instanceof ZodError) {
      return { ok: false, issues: zodIssues(error) };
    }
    throw error;
  }
}

function isLegendFile(name: string): boolean {
  return name.endsWith(LEGEND_SUFFIX);
}

function isStageFile(name: string): boolean {
  return name.endsWith(JSON_SUFFIX) && !isLegendFile(name);
}

interface LegendEntry {
  readonly file: string;
  readonly issues: readonly LintIssue[];
}

/**
 * Parses and checks every legend file, each on its own, whether or not a stage uses it. The first
 * legend with an id wins; a later one with the same id is an error.
 */
function parseLegends(files: readonly SourceFile[]): { entries: LegendEntry[]; byId: Map<string, Legend> } {
  const byId = new Map<string, Legend>();
  const entries = files.filter((file) => isLegendFile(file.name)).map((file): LegendEntry => {
    const result = parseSource(file.text, parseLegend);
    if (!result.ok) {
      return { file: file.name, issues: result.issues };
    }
    if (byId.has(result.value.id)) {
      const issue = errorIssue('legend-duplicate-id', `Another legend file already defines legend "${result.value.id}".`);
      return { file: file.name, issues: [issue] };
    }
    byId.set(result.value.id, result.value);
    return { file: file.name, issues: lintLegend(result.value) };
  });
  return { entries, byId };
}

function lintStageFile(file: SourceFile, legends: ReadonlyMap<string, Legend>): LintIssue[] {
  const result = parseSource(file.text, parseStage);
  if (!result.ok) {
    return [...result.issues];
  }
  const stage: Stage = result.value;
  const legend = legends.get(stage.legend);
  if (legend === undefined) {
    return [errorIssue('legend-missing', `No legend file defines legend "${stage.legend}" for stage "${stage.id}".`)];
  }
  return lintStageAgainst(stage, legend);
}

/**
 * Lints a folder's worth of files. Legend files (`*.legend.json`) are matched to stages by id.
 * Every file gets a report, even when it has no issues.
 */
export function lintSources(files: readonly SourceFile[]): FileReport[] {
  const { entries, byId } = parseLegends(files);
  const legendReports = entries.map((entry) => ({ file: entry.file, issues: entry.issues }));
  const stageReports = files
    .filter((file) => isStageFile(file.name))
    .map((file) => ({ file: file.name, issues: lintStageFile(file, byId) }));
  return [...legendReports, ...stageReports];
}

export function countBySeverity(reports: readonly FileReport[]): { errors: number; warnings: number } {
  const issues = reports.flatMap((report) => report.issues);
  return {
    errors: issues.filter((issue) => issue.severity === 'error').length,
    warnings: issues.filter((issue) => issue.severity === 'warning').length,
  };
}
