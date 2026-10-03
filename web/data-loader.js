// Content-addressed files can be cached across visits; verify bytes before use.
export function createVerifiedReader(fetcher = (...args) => fetch(...args), digest = async bytes => {
  if (!globalThis.crypto?.subtle) throw Error('数据核验需要 HTTPS 或本地服务，请通过安全地址打开');
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}) {
  const cache = new Map();
  return source => {
    const path = source.path || source.response_path;
    const expected = source.stored_sha256 || source.sha256;
    if (!path || !/^[a-f0-9]{64}$/.test(expected || '')) return Promise.reject(Error('数据文件缺少可核验的来源'));
    const key = `${path}:${expected}`;
    if (!cache.has(key)) {
      const request = (async () => {
        const response = await fetcher(path, {cache: 'force-cache'});
        if (!response.ok) throw Error(`数据文件读取失败 (${response.status})`);
        const bytes = await response.arrayBuffer();
        if (await digest(bytes) !== expected) throw Error('数据文件与本次快照不一致，请刷新后重试');
        return JSON.parse(new TextDecoder().decode(bytes));
      })();
      cache.set(key, request);
      request.catch(() => {if (cache.get(key) === request) cache.delete(key);});
    }
    return cache.get(key);
  };
}

export async function mapLimited(items, limit, callback) {
  const output = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({length: Math.min(limit, items.length)}, async () => {
    while (next < items.length) {
      const index = next++;
      output[index] = await callback(items[index], index);
    }
  }));
  return output;
}

export class HistoryLoader {
  constructor(snapshot, reader = createVerifiedReader()) {
    this.snapshot = snapshot;
    this.read = reader;
    this.loaded = new Set();
    this.chunks = new Map();
  }

  required(ticker, start, end) {
    if (start >= this.snapshot.delivery.recent_start) return [];
    return (this.snapshot.delivery.history[ticker] || []).filter(chunk => chunk.start <= end && chunk.end >= start);
  }

  ready(ticker, start, end) {
    return this.required(ticker, start, end).every(chunk => this.loaded.has(chunk.path));
  }

  rows(ticker) {
    const daily = new Map();
    // Manifest order makes merge deterministic, independent of network order.
    for (const chunk of this.snapshot.delivery.history[ticker] || []) {
      for (const row of this.chunks.get(chunk.path) || []) daily.set(row.date, row);
    }
    for (const row of this.snapshot.projects.find(project => project.ticker === ticker)?.history || []) {
      if (!daily.has(row.date)) daily.set(row.date, row);
    }
    return [...daily.values()].sort((a, b) => a.date.localeCompare(b.date));
  }

  async load(ticker, start, end) {
    await mapLimited(this.required(ticker, start, end).filter(chunk => !this.loaded.has(chunk.path)), 3, async chunk => {
      const payload = await this.read(chunk);
      if (payload.ticker !== ticker || payload.year !== chunk.year || !Array.isArray(payload.history) ||
          payload.history.some(row => typeof row.date !== 'string' || row.date < chunk.start || row.date > chunk.end)) {
        throw Error('历史文件的代币或日期与快照不一致');
      }
      this.chunks.set(chunk.path, payload.history);
      this.loaded.add(chunk.path);
    });
    return this.rows(ticker);
  }
}
