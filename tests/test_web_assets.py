import copy
import datetime as dt
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
from unittest.mock import patch
import unittest

spec = importlib.util.spec_from_file_location('web_assets', Path(__file__).parents[1] / 'scripts' / 'web_assets.py')
web_assets = importlib.util.module_from_spec(spec)
spec.loader.exec_module(web_assets)


class WebAssetDelivery(unittest.TestCase):
    def setUp(self):
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        self.root = Path(folder.name)
        self.snapshot = {
            'schema_version': 2, 'as_of': '2026-10-03', 'completed_day_cutoff_utc': '2026-10-01',
            'compiled_at': '2026-10-02T22:20:00+00:00', 'currency': 'USD',
            'history_earliest': '2019-12-31', 'source_status': {'price': {'sha256': 'evidence', 'status': 'cached'}},
            'projects': [{
                'ticker': 'UNI', 'market': {'market_cap': 123456, 'circulating_supply': 1000},
                'windows': {'30': {'fees': {'usd': 123.5, 'complete': True},
                                   'holders': {'usd': 30, 'recurring_usd': None, 'oneoff_dates': ['2026-09-01']}}},
                'event_studies': [{'date': '2025-12-28', 'studies': [{'days': 30, 'token_return': .5}]}],
                'history_coverage': {'fees': {'normalized': {'first': '2019-12-31', 'last': '2026-10-02', 'missing_days': 5}}},
                'price_source': {'supplemental': {'sources': [{'response_path': '../data/responses/evidence.json'}]}},
                'history': [self.row(date, index) for index, date in enumerate([
                    '2019-12-31', '2020-01-01', '2026-03-01', '2026-07-03', '2026-07-04',
                    '2026-08-01', '2026-10-01', '2026-10-02'])],
            }],
        }
        self.full_path = self.root / 'data' / 'dashboard.json'
        self.full_path.parent.mkdir(parents=True)
        self.full_path.write_text(json.dumps(self.snapshot, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        self.full_bytes = self.full_path.read_bytes()

    @staticmethod
    def row(date, index):
        return {'date': date, 'fees': index - .35, 'revenue': index * 10,
                'holders': None if index == 5 else index, 'price': None if index == 5 else index + 1,
                'btc': index + 100, 'sol': index + 10, 'gas_burn_estimate_usd': None,
                'price_observation': {'timestamp': index, 'provider': 'DeFiLlama coins API', 'source_key': 'immutable-source'},
                'extra_provenance': {'null_is_unknown': True}}

    def local_path(self, path):
        # Manifest links are relative to /web/, exactly as the browser resolves them.
        return (self.root / 'web' / path).resolve()

    def lite(self):
        return json.loads((self.root / 'data' / 'dashboard-lite.json').read_text(encoding='utf-8'))

    def test_split_and_recombine_equals_full_history_including_provenance(self):
        before = copy.deepcopy(self.snapshot)
        result = web_assets.generate_web_assets(self.snapshot, self.root)
        lite = self.lite()
        records = lite['delivery']['history']['UNI']
        self.assertEqual([item['year'] for item in records], [2019, 2020, 2026])
        combined = []
        for item in records:
            path = self.local_path(item['path'])
            body = path.read_bytes()
            self.assertEqual(len(body), item['bytes'])
            self.assertEqual(hashlib.sha256(body).hexdigest(), item['sha256'])
            self.assertIn(item['sha256'], path.name)
            payload = json.loads(body)
            self.assertEqual(payload['ticker'], 'UNI')
            self.assertEqual(payload['year'], item['year'])
            self.assertEqual(item['start'], payload['history'][0]['date'])
            self.assertEqual(item['end'], payload['history'][-1]['date'])
            combined.extend(payload['history'])
        self.assertEqual(combined, self.snapshot['projects'][0]['history'])
        self.assertEqual(self.snapshot, before)
        self.assertEqual(self.full_path.read_bytes(), self.full_bytes)
        self.assertEqual(result['history_files'], 3)
        self.assertEqual(result['lite_bytes'], (self.root / 'data' / 'dashboard-lite.json').stat().st_size)

    def test_lite_keeps_all_metadata_and_financial_aggregates_and_only_recent_chart_fields(self):
        web_assets.generate_web_assets(self.snapshot, self.root)
        lite = self.lite()
        self.assertEqual(lite['delivery']['version'], 1)
        self.assertEqual(lite['delivery']['recent_days'], 90)
        self.assertEqual(lite['delivery']['recent_start'], '2026-07-04')
        for key in self.snapshot:
            if key != 'projects':
                self.assertEqual(lite[key], self.snapshot[key])
        original_project = self.snapshot['projects'][0]
        light_project = lite['projects'][0]
        for key in original_project:
            if key != 'history':
                self.assertEqual(light_project[key], original_project[key])
        self.assertEqual([row['date'] for row in light_project['history']], ['2026-07-04', '2026-08-01', '2026-10-01'])
        for row in light_project['history']:
            self.assertEqual(set(row), set(web_assets.CHART_FIELDS))
        self.assertIsNone(light_project['history'][1]['holders'])
        self.assertIsNone(light_project['history'][1]['price'])
        self.assertEqual(light_project['windows']['30']['holders']['recurring_usd'], None)

    def test_manifest_is_written_after_every_referenced_hashed_file(self):
        writes = []
        actual_write = web_assets.write_atomic
        def observe(path, body):
            writes.append(path.name)
            if path.name == 'dashboard-lite.json':
                value = json.loads(body)
                for records in value['delivery']['history'].values():
                    for record in records:
                        existing = self.local_path(record['path']).read_bytes()
                        self.assertEqual(hashlib.sha256(existing).hexdigest(), record['sha256'])
            actual_write(path, body)
        with patch.object(web_assets, 'write_atomic', side_effect=observe):
            web_assets.generate_web_assets(self.snapshot, self.root)
        self.assertEqual(writes[-1], 'dashboard-lite.json')

    def test_bnb_duplicate_daily_maps_are_lazy_but_window_evidence_stays(self):
        bnb = copy.deepcopy(self.snapshot['projects'][0])
        bnb['ticker'] = 'BNB'
        bnb['burns'] = {
            'chain_fee_history': {'2020-01-01': 123, '2026-10-01': 999},
            'gas_burn_estimate_history': {'2020-01-01': None, '2026-10-01': 99.9},
            'gas_burn_estimate_windows': {'30': {'usd': 99.9, 'actual_burn_verified': False}},
            'data_sources': [{'response_path': '../data/responses/pinned.json'}],
        }
        bnb['history'][-2]['gas_burn_estimate_usd'] = 99.9
        self.snapshot['projects'].append(bnb)
        before = copy.deepcopy(self.snapshot)
        web_assets.generate_web_assets(self.snapshot, self.root)
        lite = self.lite()['projects'][1]
        self.assertNotIn('chain_fee_history', lite['burns'])
        self.assertNotIn('gas_burn_estimate_history', lite['burns'])
        self.assertEqual(lite['burns']['gas_burn_estimate_windows'], bnb['burns']['gas_burn_estimate_windows'])
        self.assertEqual(lite['history'][-1]['gas_burn_estimate_usd'], 99.9)
        self.assertEqual(self.snapshot, before)
        years = self.lite()['delivery']['history']['BNB']
        full_rows = [row for item in years for row in json.loads(self.local_path(item['path']).read_text())['history']]
        self.assertEqual(full_rows, bnb['history'])

    def test_stable_history_urls_and_changed_year_gets_new_url_without_overwriting_old(self):
        web_assets.generate_web_assets(self.snapshot, self.root)
        original = self.lite()['delivery']['history']['UNI']
        original_bytes = {record['path']: self.local_path(record['path']).read_bytes() for record in original}
        web_assets.generate_web_assets(copy.deepcopy(self.snapshot), self.root)
        self.assertEqual(self.lite()['delivery']['history']['UNI'], original)
        changed = copy.deepcopy(self.snapshot)
        changed['projects'][0]['history'][-1]['price'] = 999
        web_assets.generate_web_assets(changed, self.root)
        current = self.lite()['delivery']['history']['UNI']
        self.assertEqual(current[:2], original[:2])
        self.assertNotEqual(current[-1]['path'], original[-1]['path'])
        for path, body in original_bytes.items():
            self.assertEqual(self.local_path(path).read_bytes(), body)

    def test_corrupt_existing_asset_is_rejected_without_replacing_manifest(self):
        web_assets.generate_web_assets(self.snapshot, self.root)
        path = self.root / 'data' / 'dashboard-lite.json'
        manifest = path.read_bytes()
        record = self.lite()['delivery']['history']['UNI'][0]
        self.local_path(record['path']).write_bytes(b'corrupted bytes')
        with self.assertRaisesRegex(ValueError, '哈希文件内容不匹配'):
            web_assets.generate_web_assets(self.snapshot, self.root)
        self.assertEqual(path.read_bytes(), manifest)

    def test_empty_history_has_empty_manifest_and_recent_array(self):
        self.snapshot['projects'][0]['history'] = []
        web_assets.generate_web_assets(self.snapshot, self.root)
        self.assertEqual(self.lite()['projects'][0]['history'], [])
        self.assertEqual(self.lite()['delivery']['history']['UNI'], [])

    def test_duplicate_dates_or_unsafe_ticker_cannot_replace_manifest(self):
        for ticker, history in [('unsafe/UNI', self.snapshot['projects'][0]['history']),
                                ('UNI', [self.row('2026-01-01', 1), self.row('2026-01-01', 2)])]:
            changed = copy.deepcopy(self.snapshot)
            changed['projects'][0].update(ticker=ticker, history=history)
            with self.subTest(ticker=ticker):
                with self.assertRaises(ValueError):
                    web_assets.generate_web_assets(changed, self.root)
                self.assertFalse((self.root / 'data' / 'dashboard-lite.json').exists())

    def test_refresh_compilation_generates_assets_without_adding_delivery_to_research_snapshot(self):
        from scripts import refresh
        now = dt.datetime(2026, 10, 3, 4, tzinfo=refresh.BEIJING)
        with patch.object(refresh, 'ROOT', self.root), patch.object(refresh, 'RAW', self.root / 'data' / 'raw'):
            snapshot = refresh.compile_snapshot(now.date(), {}, now=now)
        full = json.loads(self.full_path.read_text(encoding='utf-8'))
        lite = self.lite()
        self.assertEqual(snapshot, full)
        self.assertNotIn('delivery', full)
        self.assertEqual(lite['completed_day_cutoff_utc'], '2026-10-01')
        self.assertEqual(lite['delivery']['recent_start'], '2026-07-04')


if __name__ == '__main__':
    unittest.main()
