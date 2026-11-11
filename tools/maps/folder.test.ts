import { describe, expect, it } from 'vitest';
import { FIXTURE_LEGEND, FIXTURE_STAGE } from '@escape/world';
import { countBySeverity, lintSources, type SourceFile } from './folder';

const LEGEND_FILE = 'lowlands.legend.json';
const STAGE_FILE = 'fixture-1.json';

function sourceOf(name: string, value: unknown): SourceFile {
  return { name, text: JSON.stringify(value) };
}

function reportFor(reports: ReturnType<typeof lintSources>, file: string) {
  const report = reports.find((item) => item.file === file);
  if (report === undefined) {
    throw new Error(`no report for ${file}`);
  }
  return report;
}

describe('lintSources', () => {
  it('lints a stage against the legend file with the same id', () => {
    const reports = lintSources([sourceOf(LEGEND_FILE, FIXTURE_LEGEND), sourceOf(STAGE_FILE, FIXTURE_STAGE)]);
    const stage = reportFor(reports, STAGE_FILE);
    expect(stage.issues.map((issue) => issue.rule)).toEqual(['placeholder']);
    expect(countBySeverity(reports)).toEqual({ errors: 0, warnings: 1 });
  });

  it('does not lint a legend file as a stage', () => {
    const reports = lintSources([sourceOf(LEGEND_FILE, FIXTURE_LEGEND), sourceOf(STAGE_FILE, FIXTURE_STAGE)]);
    expect(reportFor(reports, LEGEND_FILE).issues).toEqual([]);
  });

  it('reports a stage whose legend is not in the folder', () => {
    const reports = lintSources([sourceOf(STAGE_FILE, FIXTURE_STAGE)]);
    expect(reportFor(reports, STAGE_FILE).issues.map((issue) => issue.rule)).toEqual(['legend-missing']);
    expect(countBySeverity(reports).errors).toBe(1);
  });

  it('reports a file that is not valid JSON, without throwing', () => {
    const reports = lintSources([sourceOf(LEGEND_FILE, FIXTURE_LEGEND), { name: STAGE_FILE, text: '{ "id": ' }]);
    expect(reportFor(reports, STAGE_FILE).issues.map((issue) => issue.rule)).toEqual(['parse']);
  });

  it('reports a schema failure with the path of the bad field', () => {
    const broken = { ...FIXTURE_STAGE, hearts: 'three' };
    const reports = lintSources([sourceOf(LEGEND_FILE, FIXTURE_LEGEND), sourceOf(STAGE_FILE, broken)]);
    const issues = reportFor(reports, STAGE_FILE).issues;
    expect(issues.map((issue) => issue.rule)).toEqual(['schema']);
    expect(issues[0]?.message).toMatch(/^hearts:/);
  });

  it('reports a legend that is not valid against the schema', () => {
    const reports = lintSources([sourceOf(LEGEND_FILE, { id: 'lowlands' })]);
    expect(reportFor(reports, LEGEND_FILE).issues[0]?.rule).toBe('schema');
  });

  it('reports two legend files with the same id and keeps the first', () => {
    const reports = lintSources([
      sourceOf('a.legend.json', FIXTURE_LEGEND),
      sourceOf('b.legend.json', FIXTURE_LEGEND),
      sourceOf(STAGE_FILE, FIXTURE_STAGE),
    ]);
    expect(reportFor(reports, 'b.legend.json').issues.map((issue) => issue.rule)).toEqual(['legend-duplicate-id']);
    expect(reportFor(reports, STAGE_FILE).issues.map((issue) => issue.rule)).toEqual(['placeholder']);
  });

  it('gives every file a report, even when it is clean', () => {
    const reports = lintSources([sourceOf(LEGEND_FILE, FIXTURE_LEGEND), sourceOf(STAGE_FILE, FIXTURE_STAGE)]);
    expect(reports.map((report) => report.file)).toEqual([LEGEND_FILE, STAGE_FILE]);
  });

  it('keeps a stage with an error failing the run even when other files pass', () => {
    const broken = { ...FIXTURE_STAGE, map: [] };
    const reports = lintSources([sourceOf(LEGEND_FILE, FIXTURE_LEGEND), sourceOf(STAGE_FILE, broken)]);
    expect(countBySeverity(reports).errors).toBeGreaterThan(0);
  });
});

describe('countBySeverity', () => {
  it('counts errors and warnings across all reports', () => {
    const counts = countBySeverity([
      { file: 'a', issues: [{ severity: 'error', rule: 'map-empty', message: 'x' }] },
      { file: 'b', issues: [{ severity: 'warning', rule: 'placeholder', message: 'y' }, { severity: 'warning', rule: 'placeholder', message: 'z' }] },
    ]);
    expect(counts).toEqual({ errors: 1, warnings: 2 });
  });
});
