import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {HistoryLoader, createVerifiedReader} from '../web/data-loader.js';
import {createRangeEngine} from '../web/range-engine.js';
import {selectedChartData} from '../web/charts.js';
import {createRangeProject} from '../web/periods.js';

const webRoot = new URL('../web/', import.meta.url);
const full = JSON.parse(fs.readFileSync(new URL('../data/dashboard.json', import.meta.url)));
const lite = JSON.parse(fs.readFileSync(new URL('../data/dashboard-lite.json', import.meta.url)));
const readerFixture = () => {
  const reads = [];
  const reader = createVerifiedReader(async path => {
    reads.push(path);
    return new Response(fs.readFileSync(new URL(path, webRoot)));
  });
  return {reads, reader};
};

test('initial ninety days need no history downloads and preserve chart values for every token', () => {
  const {reads, reader} = readerFixture();
  const loader = new HistoryLoader(lite, reader);
  const liteSize=fs.statSync(new URL('../data/dashboard-lite.json', import.meta.url)).size;
  const fullSize=fs.statSync(new URL('../data/dashboard.json', import.meta.url)).size;
  assert.ok(liteSize < fullSize * .15, 'initial delivery must exclude bulk history');
  assert.ok(liteSize < 150000 * full.projects.length, 'initial metadata and 90-day history stay bounded per token');
  for (const original of full.projects) {
    const project = lite.projects.find(p => p.ticker === original.ticker);
    for (const days of [7, 30, 90]) {
      const {start, end} = original.windows[String(days)].fees;
      assert.equal(loader.ready(original.ticker, start, end), true);
      for (const mode of ['price', 'revenue']) {
        assert.deepEqual(selectedChartData({...project, history: loader.rows(project.ticker)}, start, end, mode),
          selectedChartData(original, start, end, mode));
      }
    }
  }
  assert.deepEqual(reads, []);
});

test('one-year selection downloads only selected-token intersecting years and reuses verified chunks', async () => {
  const {reads, reader} = readerFixture();
  const loader = new HistoryLoader(lite, reader);
  const original = full.projects.find(p => p.ticker === 'UNI');
  const {start, end} = original.windows['365'].fees;
  assert.equal(loader.ready('UNI', start, end), false);
  const rows = await loader.load('UNI', start, end);
  assert.equal(loader.ready('UNI', start, end), true);
  assert.equal(reads.length, 2);
  assert.ok(reads.every(path => /history-UNI-(2025|2026)-/.test(path)));
  assert.equal(new Set(rows.map(row => row.date)).size, rows.length);
  for (const mode of ['price', 'revenue']) {
    assert.deepEqual(selectedChartData({...original, history: rows}, start, end, mode), selectedChartData(original, start, end, mode));
  }
  await loader.load('UNI', start, end);
  assert.equal(reads.length, 2);
  assert.equal(loader.ready('RAY', start, end), false);
});

test('cross-year custom range loads two chunks, preserving dates and full provenance', async () => {
  const {reads, reader} = readerFixture();
  const loader = new HistoryLoader(lite, reader);
  const [a, b] = await Promise.all([loader.load('UNI', '2024-12-30', '2025-01-02'), loader.load('UNI', '2024-12-30', '2025-01-02')]);
  assert.equal(reads.length, 2, 'concurrent requests share verified fetches');
  const rows = a.filter(row => row.date >= '2024-12-30' && row.date <= '2025-01-02');
  assert.equal(rows.length, 4);
  assert.deepEqual(a, b);
  assert.deepEqual(rows, full.projects.find(p => p.ticker === 'UNI').history.filter(row => row.date >= '2024-12-30' && row.date <= '2025-01-02'));
});

test('corrupt or failed files are not treated as missing days and remain retryable', async () => {
  let corrupt = true, reads = 0;
  const reader = createVerifiedReader(async path => {
    reads++;
    return new Response(corrupt ? '{}' : fs.readFileSync(new URL(path, webRoot)));
  });
  const loader = new HistoryLoader(lite, reader);
  await assert.rejects(loader.load('HYPE', '2024-12-01', '2024-12-31'), /不一致/);
  assert.equal(loader.ready('HYPE', '2024-12-01', '2024-12-31'), false);
  corrupt = false;
  await loader.load('HYPE', '2024-12-01', '2024-12-31');
  assert.equal(loader.ready('HYPE', '2024-12-01', '2024-12-31'), true);
  assert.equal(reads, 2);
});

test('worker range results match full archived aggregation for every registered project without returning history', async () => {
  const {reader} = readerFixture();
  const engine = createRangeEngine(reader);
  const metadata = lite.projects.map(({history, ...project}) => project);
  const start = '2025-12-30', end = '2026-01-02';
  const result = await engine(metadata, start, end);
  assert.equal(result.projects.length, full.projects.length);
  assert.deepEqual(result.errors, []);
  for (const original of full.projects) {
    const sources = [...original.data_sources.filter(source=>['fees','revenue','holders'].includes(source.kind)), ...(original.windows['30'].flow_distributions?.sources || [])];
    const responses = Object.fromEntries(sources.map(source => [source.kind, JSON.parse(fs.readFileSync(new URL(source.response_path, webRoot)))]));
    const expected = createRangeProject(original, start, end, responses);
    const actual = result.projects.find(p => p.ticker === original.ticker);
    assert.deepEqual(actual.window, expected.windows['4']);
    assert.deepEqual(actual.custom_range, expected.custom_range);
    assert.equal(Object.hasOwn(actual, 'history'), false);
  }
});

test('one failed source preserves every project and marks only affected flow unknown; a retry restores it', async () => {
  const {reader} = readerFixture();
  const target = lite.projects.find(p => p.ticker === 'HYPE').data_sources.find(source => source.kind === 'holders').response_path;
  let fail = true;
  const engine = createRangeEngine(async source => {
    if (fail && source.kind === 'holders' && source.response_path === target) throw Error('fixture failure');
    return reader(source);
  });
  const metadata = lite.projects.map(({history, ...project}) => project);
  const result = await engine(metadata, '2026-09-30', '2026-10-01');
  assert.equal(result.projects.length, full.projects.length);
  assert.equal(result.errors.length, 1);
  const hype = result.projects.find(p => p.ticker === 'HYPE');
  assert.equal(hype.window.holders.usd, null);
  assert.equal(hype.window.holders.source_available, false);
  assert.ok(hype.window.fees.usd > 0);
  fail = false;
  const retried = await engine(metadata, '2026-09-30', '2026-10-01');
  assert.deepEqual(retried.errors, []);
  assert.ok(retried.projects.find(p => p.ticker === 'HYPE').window.holders.usd > 0);
});
