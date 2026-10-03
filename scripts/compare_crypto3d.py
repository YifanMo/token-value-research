"""Reproduce the reference site's displayed multiples from saved public fields.

This does not import its Net Income into our independent profit model. Run after
archiving a new equity.html/all-protocols.json response with its SHA metadata.
"""
import datetime as dt
import hashlib
import json
import math
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / 'research/evidence/crypto3d'


def checked_file(path, meta):
    body = path.read_bytes()
    if hashlib.sha256(body).hexdigest() != meta['sha256']:
        raise ValueError(f'{path.name} 与保存哈希不一致')
    return body, meta


def checked(name):
    path = EVIDENCE / name
    return checked_file(path, json.loads(path.with_suffix('.meta.json').read_text()))


def checked_daily(ticker):
    if ticker == 'HYPE':
        return checked('hype-daily.json')
    path = ROOT / 'research/evidence/crypto3d-uni/daily-uniswap-latest.json'
    manifest = json.loads((path.parent / 'manifest.json').read_text())
    meta = next(entry for entry in manifest if entry.get('name') == path.name and 'sha256' in entry)
    return checked_file(path, meta)


def inverse_percent(value):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value <= 0:
        return None
    result = 100 / value
    return result if math.isfinite(result) else None


def reference_windows(protocol):
    """Match equity.html's period-specific percentages and explicit fallback."""
    metrics = protocol.get('metrics', {})
    result = {}
    for days in [7, 30, 90, 365]:
        holder = protocol.get('shareholder_yield_percent')
        revenue = protocol.get('total_yield_percent')
        if days != 365:
            holder = metrics.get(f'shareholder_yield_{days}d_ann', holder)
            revenue = metrics.get(f'total_yield_{days}d_ann', revenue)
            if holder is None:
                holder = protocol.get('shareholder_yield_percent')
            if revenue is None:
                revenue = protocol.get('total_yield_percent')
        result[str(days)] = {'pe': inverse_percent(holder), 'ps': inverse_percent(revenue),
                            'shareholder_yield_percent': holder, 'total_yield_percent': revenue}
    return result


def main():
    html, html_meta = checked('equity.html')
    body, data_meta = checked('all-protocols.json')
    source = html.decode('utf-8')
    for expected in ['const pe = tevYield > 0 ? (100 / tevYield) : null;',
                     'const ps = earningYield > 0 ? (100 / earningYield) : null;']:
        if expected not in source:
            raise ValueError('参考网站公式已变，先重新核对，停止自动沿用旧算法')
    data = json.loads(body)
    projects = []
    for ticker in ['HYPE', 'PUMP', 'UNI', 'JUP', 'RAY']:
        item = next(((key, p) for key, p in data['protocols'].items() if p.get('ticker') == ticker), None)
        if item is None:
            projects.append({'ticker': ticker, 'available': False, 'note': '本次参考站主表未收录，不推定为零。'})
            continue
        key, p = item
        daily_body, daily_meta = checked_daily(ticker)
        daily = json.loads(daily_body)
        # Match loadProtocolData(): non-null top-level and metrics override base;
        # nested latest_record is not promoted to top-level market_cap_usd.
        merged = {**p, **{k: v for k, v in daily.items() if v is not None}}
        merged['metrics'] = {**p.get('metrics', {}),
                             **{k: v for k, v in daily.get('metrics', {}).items() if v is not None}}
        note = ('短窗收益率字段与当前市值、同期金额并非同次复算；AF统计范围与本地金额不同。'
                if ticker == 'HYPE' else
                '参考站采用主网dead转账、旧价烧币估值；本地采用多链兑换记录估值，覆盖范围和计价不同。')
        projects.append({'ticker': ticker, 'available': True, 'key': key, 'windows': reference_windows(merged),
                         'market_cap_usd': merged.get('market_cap_usd'), 'last_updated': merged.get('last_updated'),
                         'revenue_usd_365d': merged.get('revenue_usd_365d'),
                         'net_income_usd_365d': merged.get('net_income_usd_365d'),
                         'daily_source_url': daily_meta['url'],
                         'daily_retrieved_at': daily_meta['retrieved_at'],
                         'daily_sha256': daily_meta['sha256'],
                         'source_url': f'https://crypto3d.pro/equity/protocol?id={key}', 'note': note})
    output = {'compiled_at': dt.datetime.now(dt.timezone.utc).isoformat(),
              'generated_at': data.get('generated_at'), 'retrieved_at': data_meta['retrieved_at'],
              'reference_url': html_meta['url'], 'reference_data_url': data_meta['url'],
              'reference_html_path': '../research/evidence/crypto3d/equity.html',
              'reference_data_path': '../research/evidence/crypto3d/all-protocols.json',
              'reference_html_sha256': html_meta['sha256'], 'reference_data_sha256': data_meta['sha256'],
              'projects': projects,
              'note': '按本次保存源码与字段复算参考站算法；不是跨时点实时价格比较。短窗百分比可能回退365天；Rev/NetInc列始终365天。'}
    (ROOT / 'data/crypto3d-comparison.json').write_text(json.dumps(output, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'covered': [p['ticker'] for p in projects if p['available']], 'output': 'data/crypto3d-comparison.json'}, ensure_ascii=False))


if __name__ == '__main__':
    main()
