import {createRangeProject, validateDateRange} from './periods.js';
import {createVerifiedReader, mapLimited} from './data-loader.js';

// Raw response parsing and normalization run in a Worker, away from rendering.
export function createRangeEngine(reader = createVerifiedReader()) {
  return async (projects, start, end) => {
    const range = validateDateRange(start, end);
    if (!range.valid) throw Error(range.error);
    const errors = [];
    const output = await mapLimited(projects, 2, async project => {
      const candidates = [...(project.data_sources || []).filter(source => ['fees', 'revenue', 'holders'].includes(source.kind)),
        ...(project.windows?.['30']?.flow_distributions?.sources || []).filter(source => ['supply', 'protocol'].includes(source.kind))];
      const byKind = new Map();
      for (const source of candidates) {
        const previous = byKind.get(source.kind);
        if (previous && (previous.response_path !== source.response_path || (previous.stored_sha256 || previous.sha256) !== (source.stored_sha256 || source.sha256))) {
          throw Error(`${project.ticker} ${source.kind} 存在冲突的数据来源`);
        }
        byKind.set(source.kind, source);
      }
      const sources = [...byKind.values()];
      const responses = {};
      await mapLimited(sources, 2, async source => {
        try {responses[source.kind] = await reader(source);}
        catch (error) {errors.push(`${project.ticker} ${source.kind}：${error.message}`);}
      });
      const result = createRangeProject(project, start, end, responses);
      return {ticker: project.ticker, window: result.windows[String(range.days)], custom_range: result.custom_range};
    });
    return {projects: output, errors};
  };
}
