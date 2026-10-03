"""Reproduce Crypto3D table metrics from archived source, without network access."""
from pathlib import Path
import json

HERE = Path(__file__).resolve().parent
base = json.loads((HERE / 'all-protocols.json').read_bytes())['protocols']
out = {}
for key in ('aave', 'bnb'):
    config = base[key]
    daily = json.loads((HERE / f'daily-{key}-latest.json').read_bytes())
    # equity.html loadProtocolData: null daily values do not overwrite summary.
    merged = {
        **config,
        **{k: v for k, v in daily.items() if v is not None},
        'metrics': {
            **config['metrics'],
            **{k: v for k, v in daily.get('metrics', {}).items() if v is not None},
        },
        'payout_ratio': config.get('payout_ratio'),
    }
    metrics = merged['metrics']
    rows = []
    for days in (7, 30, 90, 365):
        shareholder = (merged['shareholder_yield_percent'] if days == 365
                       else metrics.get(f'shareholder_yield_{days}d_ann', merged['shareholder_yield_percent']))
        earnings = (merged['total_yield_percent'] if days == 365
                    else metrics.get(f'total_yield_{days}d_ann', merged['total_yield_percent']))
        pe = 100 / shareholder if shareholder > 0 else None
        ps = 100 / earnings if earnings > 0 else None
        def display(value):
            if value is None:
                return '—'
            # All observed values < 100; formatting matches the live script.
            return str(round(value)) + 'x' if value >= 100 else f'{value:.1f}x'
        rows.append({'period_days': days, 'shareholder_yield_percent': shareholder,
                     'earnings_yield_percent': earnings, 'pe': pe, 'ps': ps,
                     'pe_display': display(pe), 'ps_display': display(ps)})
    out[key] = {
        'market_cap_usd_displayed': merged['market_cap_usd'],
        'metrics_current_market_cap_usd': metrics['current_market_cap_usd'],
        'revenue_usd_365d_column': merged['revenue_usd_365d'],
        'net_income_usd_365d_column': merged['net_income_usd_365d'],
        'daily_updated_at': daily['updated_at'],
        'periods': rows,
    }
(HERE / 'reproduced-displayed-metrics.json').write_text(json.dumps(out, indent=2) + '\n')
print(json.dumps(out, indent=2))
