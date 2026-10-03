"""Protect window selection and saved reference evidence against silent mixing."""
import importlib.util
import json
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('compare_crypto3d', ROOT / 'scripts/compare_crypto3d.py')
compare = importlib.util.module_from_spec(spec)
spec.loader.exec_module(compare)


class ReferenceEvidenceTests(unittest.TestCase):
    def test_missing_short_period_falls_back_to_annual_but_nonpositive_does_not(self):
        p = {'shareholder_yield_percent': 4, 'total_yield_percent': 5,
             'metrics': {'shareholder_yield_7d_ann': None, 'total_yield_7d_ann': 0,
                         'shareholder_yield_30d_ann': -1, 'total_yield_30d_ann': 10}}
        windows = compare.reference_windows(p)
        self.assertEqual(windows['7']['pe'], 25)
        self.assertIsNone(windows['7']['ps'])
        self.assertIsNone(windows['30']['pe'])
        self.assertEqual(windows['30']['ps'], 10)
        self.assertEqual(windows['90']['pe'], 25)
        self.assertEqual(windows['365']['ps'], 20)

    def test_saved_sources_match_hashes_and_pe_is_not_net_income_multiple(self):
        _, html_meta = compare.checked('equity.html')
        body, data_meta = compare.checked('all-protocols.json')
        data = json.loads(body)
        compiled = json.loads((ROOT / 'data/crypto3d-comparison.json').read_text())
        self.assertEqual(compiled['reference_html_sha256'], html_meta['sha256'])
        self.assertEqual(compiled['reference_data_sha256'], data_meta['sha256'])
        self.assertEqual([p['ticker'] for p in compiled['projects'] if p['available']], ['HYPE', 'UNI'])
        for ticker in ['HYPE', 'UNI']:
            _, daily_meta = compare.checked_daily(ticker)
            record = next(p for p in compiled['projects'] if p['ticker'] == ticker)
            self.assertEqual(record['daily_sha256'], daily_meta['sha256'])
        hype = data['protocols']['hype']
        calculated = compare.reference_windows(hype)['365']['pe']
        self.assertAlmostEqual(calculated, 100 / hype['shareholder_yield_percent'])
        profit_multiple = hype['market_cap_usd'] / hype['net_income_usd_365d']
        self.assertNotAlmostEqual(calculated, profit_multiple, places=2)


if __name__ == '__main__':
    unittest.main()
