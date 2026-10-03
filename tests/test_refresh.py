import datetime as dt
import copy
import importlib.util
import io
import pathlib
import tempfile
from contextlib import redirect_stdout
from unittest.mock import patch
import unittest

spec=importlib.util.spec_from_file_location('refresh',pathlib.Path(__file__).parents[1]/'scripts/refresh.py')
refresh=importlib.util.module_from_spec(spec)
spec.loader.exec_module(refresh)

class RateLimitRetry(unittest.TestCase):
    def setUp(self):
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        self.raw = pathlib.Path(folder.name)
        context = patch.object(refresh, 'RAW', self.raw)
        context.start()
        self.addCleanup(context.stop)
        self.key = 'price-raydium'
        self.url = 'https://api.coingecko.com/api/v3/coins/raydium/market_chart?vs_currency=usd&days=365&interval=daily'

    def http_error(self, code, headers=None):
        return refresh.urllib.error.HTTPError(self.url, code, 'Upstream error', headers or {}, None)

    def test_429_then_success_waits_once_and_records_final_actual_time(self):
        real_datetime = dt.datetime
        clock = [real_datetime(2026, 10, 2, 20, tzinfo=refresh.UTC)]
        class FakeDatetime(real_datetime):
            @classmethod
            def now(cls, tz=None):
                return clock[0].astimezone(tz) if tz else clock[0].replace(tzinfo=None)
        def fake_sleep(seconds):
            clock[0] += dt.timedelta(seconds=seconds)
        body = b'{"prices": [[1, 2]]}'
        with patch.object(refresh.urllib.request, 'urlopen', side_effect=[self.http_error(429, {'Retry-After': '15'}), io.BytesIO(body)]) as fetch, \
             patch.object(refresh.time, 'sleep', side_effect=fake_sleep) as sleep, \
             patch.object(refresh.dt, 'datetime', FakeDatetime):
            key, meta = refresh.request((self.key, self.url))
        self.assertEqual(key, self.key)
        self.assertEqual(fetch.call_count, 2)
        sleep.assert_called_once_with(15.0)
        self.assertEqual(meta['status'], 'fresh')
        self.assertEqual(meta['retrieved_at'], '2026-10-02T20:00:15+00:00')
        self.assertEqual(meta['sha256'], refresh.hashlib.sha256(body).hexdigest())
        self.assertEqual((self.raw / (self.key + '.json')).read_bytes(), body)
        self.assertNotIn('refresh_error', meta)

    def test_repeated_429_stops_after_one_retry_and_keeps_cache_date(self):
        body = b'{"prices": [[1, 1]]}'
        path = self.raw / (self.key + '.json')
        path.write_bytes(body)
        previous = {'url': self.url, 'retrieved_at': '2026-10-01T12:00:00+00:00',
                    'sha256': refresh.hashlib.sha256(body).hexdigest(), 'status': 'fresh'}
        refresh.dump(self.raw / (self.key + '.meta.json'), previous)
        with patch.object(refresh.urllib.request, 'urlopen', side_effect=[self.http_error(429), self.http_error(429)]) as fetch, \
             patch.object(refresh.time, 'sleep') as sleep:
            _, meta = refresh.request((self.key, self.url))
        self.assertEqual(fetch.call_count, 2)
        sleep.assert_called_once_with(60.0)
        self.assertEqual(meta['status'], 'cached')
        self.assertEqual(meta['retrieved_at'], previous['retrieved_at'])
        self.assertEqual(meta['sha256'], previous['sha256'])
        self.assertIn('429', meta['refresh_error'])
        self.assertEqual(path.read_bytes(), body)

    def test_non_429_is_not_retried(self):
        with patch.object(refresh.urllib.request, 'urlopen', side_effect=self.http_error(500)) as fetch, \
             patch.object(refresh.time, 'sleep') as sleep:
            _, meta = refresh.request((self.key, self.url))
        self.assertEqual(fetch.call_count, 1)
        sleep.assert_not_called()
        self.assertEqual(meta['status'], 'missing')
        self.assertIn('500', meta['refresh_error'])

    def test_retry_after_http_date_and_wait_bounds(self):
        now = dt.datetime(2026, 10, 2, 20, tzinfo=refresh.UTC)
        self.assertEqual(refresh.retry_after_delay('Fri, 02 Oct 2026 20:00:45 GMT', now), 45)
        self.assertEqual(refresh.retry_after_delay('Fri, 02 Oct 2026 20:10:00 GMT', now), 120)
        self.assertEqual(refresh.retry_after_delay('Fri, 02 Oct 2026 19:59:00 GMT', now), 0)
        self.assertEqual(refresh.retry_after_delay('9999', now), 120)
        self.assertEqual(refresh.retry_after_delay('0', now), 0)
        for value in [None, 'invalid', 'nan', 'inf']:
            with self.subTest(value=value):
                self.assertEqual(refresh.retry_after_delay(value, now), 60)

class CompletedUTCDay(unittest.TestCase):
    def test_beijing_0400_excludes_still_running_utc_day(self):
        now = dt.datetime(2026, 10, 3, 4, tzinfo=refresh.BEIJING)
        cutoff = refresh.completed_day_cutoff(now.date(), now)
        self.assertEqual(cutoff, dt.date(2026, 10, 1))
        timestamp = lambda day: int(dt.datetime(2026, 10, day, tzinfo=refresh.UTC).timestamp())
        values = refresh.series({'totalDataChart': [[timestamp(1), 5], [timestamp(2), 999]]}, cutoff)
        self.assertEqual(values, {'2026-10-01': 5.0})

    def test_beijing_0800_and_later_include_just_completed_utc_day(self):
        for hour, minute in [(8, 0), (10, 30)]:
            with self.subTest(hour=hour, minute=minute):
                now = dt.datetime(2026, 10, 3, hour, minute, tzinfo=refresh.BEIJING)
                self.assertEqual(refresh.completed_day_cutoff(now.date(), now), dt.date(2026, 10, 2))

    def test_explicit_historical_as_of_preserves_prior_cutoff(self):
        now = dt.datetime(2026, 10, 3, 4, tzinfo=refresh.BEIJING)
        self.assertEqual(refresh.completed_day_cutoff(dt.date(2026, 9, 30), now), dt.date(2026, 9, 29))

    def test_snapshot_uses_completed_utc_cutoff(self):
        with tempfile.TemporaryDirectory() as folder:
            root = pathlib.Path(folder)
            now = dt.datetime(2026, 10, 3, 4, tzinfo=refresh.BEIJING)
            with patch.object(refresh, 'ROOT', root), patch.object(refresh, 'RAW', root / 'data' / 'raw'):
                snapshot = refresh.compile_snapshot(now.date(), {}, now=now)
            self.assertEqual(snapshot['as_of'], '2026-10-03')
            self.assertEqual(snapshot['completed_day_cutoff_utc'], '2026-10-01')
            saved = refresh.load(root / 'data' / 'dashboard.json')
            self.assertEqual(saved['completed_day_cutoff_utc'], '2026-10-01')

class SupplementalRefresh(unittest.TestCase):
    def setUp(self):
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        self.root = pathlib.Path(folder.name)
        self.raw = self.root / 'data' / 'raw'
        self.raw.mkdir(parents=True)
        (self.root / 'web').mkdir()
        for name, value in [('ROOT', self.root), ('RAW', self.raw)]:
            context = patch.object(refresh, name, value)
            context.start()
            self.addCleanup(context.stop)
        self.old_body = self.daily_body(dt.date(2026, 9, 30))
        digest = refresh.hashlib.sha256(self.old_body).hexdigest()
        archive = self.root / 'data' / 'responses' / (digest + '.json')
        archive.parent.mkdir(parents=True)
        archive.write_bytes(self.old_body)
        self.manifest = {'verified_on': '2026-09-30', 'note': 'Reviewed policy evidence', 'records': []}
        for ticker, slug in [('JUP', 'jupiter'), ('RAY', 'raydium')]:
            for kind, dtype in [('protocol', 'dailyProtocolRevenue'), ('supply', 'dailySupplySideRevenue')]:
                self.manifest['records'].append({
                    'ticker': ticker, 'kind': kind,
                    'url': f'https://api.llama.fi/summary/fees/{slug}?dataType={dtype}',
                    'retrieved_at': '2026-10-01T15:00:00+00:00', 'sha256': digest,
                    'response_path': '../data/responses/' + digest + '.json'})
        refresh.dump(self.root / 'data' / 'flow-distributions.json', self.manifest)

    @staticmethod
    def daily_body(end):
        dates = [end - dt.timedelta(days=i) for i in reversed(range(7))]
        rows = [[int(dt.datetime.combine(date, dt.time(), refresh.UTC).timestamp()), 10] for date in dates]
        return refresh.json.dumps({'totalDataChart': rows}).encode()

    def successful_refresh(self):
        body = self.daily_body(dt.date(2026, 10, 1))
        with patch.object(refresh.urllib.request, 'urlopen', side_effect=lambda *_args, **_kwargs: io.BytesIO(body)):
            status = dict(refresh.request(job) for job in refresh.supplemental_jobs(self.manifest))
        refresh.update_supplemental_sources(self.manifest, status)
        return body, status

    def test_success_archives_exact_responses_and_keeps_policy_review_date(self):
        # A successful retry must also remove the old failure marker.
        self.manifest['records'][0]['refresh_error'] = 'Previous failure'
        body, status = self.successful_refresh()
        saved = refresh.load(self.root / 'data' / 'flow-distributions.json')
        self.assertEqual(saved['verified_on'], self.manifest['verified_on'])
        self.assertEqual(saved['note'], self.manifest['note'])
        self.assertEqual(len(saved['records']), 4)
        for source in saved['records']:
            self.assertEqual(source['status'], 'fresh')
            self.assertNotIn('refresh_error', source)
            self.assertEqual(source['fetched_at'], source['retrieved_at'])
            self.assertNotEqual(source['retrieved_at'], '2026-10-01T15:00:00+00:00')
            self.assertEqual(source['sha256'], refresh.hashlib.sha256(body).hexdigest())
            self.assertEqual((self.root / 'web' / source['response_path']).read_bytes(), body)
            self.assertEqual(status[refresh.supplemental_key(source)]['response_path'], source['response_path'])
        old_path = self.root / 'web' / self.manifest['records'][0]['response_path']
        self.assertEqual(old_path.read_bytes(), self.old_body)

    def test_failed_request_keeps_registered_response_and_actual_retrieval_time(self):
        with patch.object(refresh.urllib.request, 'urlopen', side_effect=OSError('rate limited')):
            status = dict(refresh.request(job) for job in refresh.supplemental_jobs(self.manifest))
        refresh.update_supplemental_sources(self.manifest, status)
        saved = refresh.load(self.root / 'data' / 'flow-distributions.json')
        self.assertEqual(saved['verified_on'], self.manifest['verified_on'])
        for original, source in zip(self.manifest['records'], saved['records']):
            self.assertEqual(source['retrieved_at'], original['retrieved_at'])
            self.assertEqual(source['sha256'], original['sha256'])
            self.assertEqual(source['response_path'], original['response_path'])
            self.assertEqual(source['status'], 'cached')
            self.assertEqual(source['refresh_error'], 'rate limited')
            self.assertEqual(status[refresh.supplemental_key(source)], source)

    def test_main_online_fetches_all_four_registered_urls(self):
        calls = []
        original_request = refresh.request
        body = self.daily_body(dt.date(2026, 10, 1))
        def fake_request(job):
            calls.append(job)
            if job[0].startswith('llama-supplemental-'):
                return original_request(job)
            return job[0], {'url': job[1], 'status': 'missing'}
        snapshot = {'projects': [], 'completed_day_cutoff_utc': '2026-10-01'}
        with patch.object(refresh, 'request', side_effect=fake_request), \
             patch.object(refresh, 'compile_snapshot', return_value=snapshot), \
             patch.object(refresh.urllib.request, 'urlopen', side_effect=lambda *_args, **_kwargs: io.BytesIO(body)), \
             patch('sys.argv', ['refresh.py', '--as-of', '2026-10-02']), redirect_stdout(io.StringIO()):
            refresh.main()
        fetched = [(key, url) for key, url, *_ in calls if key.startswith('llama-supplemental-')]
        self.assertCountEqual(fetched, refresh.supplemental_jobs(self.manifest))
        saved_status = refresh.load(self.root / 'data' / 'fetch-status.json')
        for key, _ in fetched:
            self.assertEqual(saved_status[key]['status'], 'fresh')

    def test_offline_never_fetches_or_changes_source_registry(self):
        path = self.root / 'data' / 'flow-distributions.json'
        before = path.read_bytes()
        with patch.object(refresh, 'request', side_effect=AssertionError('Offline fetch forbidden')), \
             patch.object(refresh.urllib.request, 'urlopen', side_effect=AssertionError('Offline network forbidden')), \
             patch('sys.argv', ['refresh.py', '--offline', '--as-of', '2026-10-02']), redirect_stdout(io.StringIO()):
            refresh.main()
        self.assertEqual(path.read_bytes(), before)
        snapshot = refresh.load(self.root / 'data' / 'dashboard.json')
        for source in self.manifest['records']:
            status = snapshot['source_status'][refresh.supplemental_key(source)]
            self.assertEqual(status['status'], 'offline-cache')
            self.assertEqual(status['retrieved_at'], source['retrieved_at'])

    def test_supplemental_and_main_windows_share_cutoff_and_missing_day_stays_unknown(self):
        _, status = self.successful_refresh()
        profiles = [{'ticker': ticker} for ticker in ['JUP', 'RAY']]
        refresh.dump(self.root / 'data' / 'profiles.json', profiles)
        for ticker in ['JUP', 'RAY']:
            slug, _ = refresh.PROJECTS[ticker]
            for kind in refresh.TYPES:
                (self.raw / f'llama-{slug}-{kind}.json').write_bytes(self.daily_body(dt.date(2026, 10, 1)))
        now = dt.datetime(2026, 10, 2, 9, tzinfo=refresh.BEIJING)
        snapshot = refresh.compile_snapshot(now.date(), status, now=now)
        for project in snapshot['projects']:
            week = project['windows']['7']
            extra = week['flow_distributions']
            self.assertTrue(extra['complete'])
            for kind in ['protocol', 'supply']:
                self.assertEqual(extra[kind]['start'], week['fees']['start'])
                self.assertEqual(extra[kind]['end'], week['fees']['end'])
                self.assertEqual(extra[kind]['end'], snapshot['completed_day_cutoff_utc'])
                self.assertEqual(extra[kind]['usd'], 70)
        # One failed endpoint with an older archive cannot masquerade as a complete window.
        current = refresh.load(self.root / 'data' / 'flow-distributions.json')
        old_source = {**self.manifest['records'][0], 'status': 'cached', 'refresh_error': 'rate limited'}
        current['records'][0] = old_source
        status[refresh.supplemental_key(old_source)] = old_source
        refresh.dump(self.root / 'data' / 'flow-distributions.json', current)
        snapshot = refresh.compile_snapshot(now.date(), status, now=now)
        extra = snapshot['projects'][0]['windows']['7']['flow_distributions']
        self.assertFalse(extra['complete'])
        self.assertIsNone(extra['protocol']['usd'])
        self.assertEqual(extra['protocol']['coverage_days'], 6)
        self.assertEqual(extra['sources'][0]['observation_lag_days'], 1)
        self.assertEqual(extra['sources'][0]['refresh_error'], 'rate limited')

class Windows(unittest.TestCase):
    def test_missing_day_is_not_zero_filled(self):
        w=refresh.window({'2026-10-01':10},dt.date(2026,10,1),2)
        self.assertIsNone(w['usd'])
        self.assertEqual(w['coverage_days'],1)

    def test_only_documented_pre_activation_days_can_be_zero(self):
        w=refresh.window({'2026-10-01':10},dt.date(2026,10,1),2,zero_before='2026-10-01')
        self.assertEqual(w['usd'],10)
        self.assertTrue(w['complete'])

    def test_future_and_partial_day_are_cut_off(self):
        ts=lambda d:int(dt.datetime(2026,10,d,tzinfo=dt.timezone.utc).timestamp())
        values=refresh.series({'totalDataChart':[[ts(1),5],[ts(2),999]]},dt.date(2026,10,1))
        self.assertEqual(values,{'2026-10-01':5.0})

    def test_price_missing_exact_event_date_stays_unknown(self):
        self.assertIsNone(refresh.observed_return({'2026-09-30':2,'2026-10-02':4},dt.date(2026,10,1),2))

    def test_saved_response_stays_available_after_raw_file_changes(self):
        with tempfile.TemporaryDirectory() as folder:
            root=pathlib.Path(folder)
            raw=root/'data'/'raw'
            raw.mkdir(parents=True)
            path=raw/'test.json'
            body=b'{"totalDataChart": [[1, 2]]}'
            path.write_bytes(body)
            with patch.object(refresh,'ROOT',root), patch.object(refresh,'RAW',raw):
                digest=refresh.hashlib.sha256(body).hexdigest()
                meta=refresh.archive_response('test',{'sha256':digest})
                archive=root/'data'/'responses'/(digest+'.json')
                self.assertEqual(archive.read_bytes(),body)
                path.write_bytes(b'{"totalDataChart": [[1, 3]]}')
                self.assertEqual(archive.read_bytes(),body)
                self.assertEqual(meta['stored_sha256'],digest)
                with self.assertRaises(ValueError):
                    refresh.archive_response('test',{'sha256':digest})

    def test_reviewed_source_pins_exact_text_bytes_and_keeps_extension(self):
        with tempfile.TemporaryDirectory() as folder:
            root=pathlib.Path(folder)
            source=root/'official-source.txt'
            body='有日期的政策说明\n'.encode('utf-8')
            source.write_bytes(body)
            digest=refresh.hashlib.sha256(body).hexdigest()
            with patch.object(refresh,'ROOT',root):
                evidence=refresh.archive_file(source,{'sha256':digest},'政策证据')
                archive=root/'data'/'responses'/(digest+'.txt')
                self.assertEqual(archive.read_bytes(),body)
                self.assertEqual(evidence['response_path'],'../data/responses/'+digest+'.txt')
                source.write_bytes(b'new policy')
                self.assertEqual(archive.read_bytes(),body)
                with self.assertRaises(ValueError):
                    refresh.archive_file(source,{'sha256':digest},'政策证据')


class MultiYearHistory(unittest.TestCase):
    cutoff = dt.date(2026, 10, 1)

    @staticmethod
    def timestamp(date):
        return int(dt.datetime.combine(dt.date.fromisoformat(date), dt.time(), refresh.UTC).timestamp())

    def test_price_supplement_pairs_utc_target_and_preserves_real_timestamp(self):
        target = self.timestamp('2020-01-02')
        data = {'coins': {'coingecko:uniswap': {'prices': [
            {'timestamp': target - 3, 'price': 2},
            {'timestamp': self.timestamp('2020-01-03') + 3601, 'price': 999},
            {'timestamp': self.timestamp('2026-10-02'), 'price': 999},
            {'timestamp': self.timestamp('2019-12-31'), 'price': 999},
        ]}}}
        actual = refresh.supplemental_price_series(data, 'uniswap', self.cutoff)
        self.assertEqual(list(actual), ['2020-01-02'])
        self.assertEqual(actual['2020-01-02']['timestamp'], target - 3)
        self.assertEqual(actual['2020-01-02']['target_timestamp'], target)
        self.assertEqual(actual['2020-01-02']['offset_seconds'], -3)
        self.assertEqual(actual['2020-01-02']['provider'], 'DeFiLlama coins API')

    def test_supplement_does_not_replace_primary_or_zero_fill_missing_prices(self):
        target = self.timestamp('2020-01-02')
        primary = {'prices': [[target * 1000, 7]]}
        supplement = {'coins': {'coingecko:uniswap': {'prices': [
            {'timestamp': target, 'price': 2},
            {'timestamp': target + 86400, 'price': 3},
            {'timestamp': target + 2 * 86400, 'price': 0},
        ]}}}
        values, observations, cg, extra = refresh.merged_price_series(primary, supplement, 'uniswap', self.cutoff)
        self.assertEqual(values, {'2020-01-02': 7, '2020-01-03': 3})
        self.assertEqual(observations['2020-01-02']['provider'], 'CoinGecko')
        self.assertEqual(observations['2020-01-03']['provider'], 'DeFiLlama coins API')
        self.assertEqual(cg, {'2020-01-02': 7})
        self.assertNotIn('2020-01-04', extra)

    def test_equal_distance_conflicting_price_observations_stay_unknown(self):
        target = self.timestamp('2020-01-02')
        supplement = {'coins': {'coingecko:uniswap': {'prices': [
            {'timestamp': target - 10, 'price': 2},
            {'timestamp': target + 10, 'price': 3},
        ]}}}
        self.assertEqual(refresh.supplemental_price_series(supplement, 'uniswap', self.cutoff), {})

    def test_chunk_urls_cover_requested_period_within_live_total_point_limit(self):
        jobs = refresh.supplemental_price_jobs(self.cutoff)
        from urllib.parse import urlparse, parse_qs
        groups = {}
        for key, url in jobs:
            parsed = urlparse(url)
            query = parse_qs(parsed.query)
            start, span = int(query['start'][0]), int(query['span'][0])
            coins = parsed.path.removeprefix('/chart/').split(',')
            groups.setdefault(tuple(coins), []).append((start, span))
            self.assertLessEqual(span * len(coins), 500)
            self.assertTrue(key.startswith(refresh.SUPPLEMENTAL_PRICE_KEY + '-'))
        expected = {'coingecko:' + coin for _, coin in refresh.PROJECTS.values()} | {'coingecko:bitcoin', 'coingecko:solana'}
        self.assertEqual({coin for coins in groups for coin in coins}, expected)
        self.assertEqual(sum(len(coins) for coins in groups), len(expected))
        for ranges in groups.values():
            self.assertEqual(len(ranges), 36)
            self.assertEqual(ranges[0][0], self.timestamp('2020-01-01'))
            self.assertEqual(sum(span for _, span in ranges), 2466)
            for index in range(1, len(ranges)):
                self.assertEqual(ranges[index][0], ranges[index - 1][0] + ranges[index - 1][1] * 86400)
            self.assertEqual(ranges[-1][0] + (ranges[-1][1] - 1) * 86400, self.timestamp('2026-10-01'))

    def test_new_coins_preserve_existing_seven_coin_cache_urls(self):
        jobs = refresh.supplemental_price_jobs(self.cutoff)
        key, url = jobs[0]
        self.assertEqual(key, 'price-supplemental-llama-20200101')
        legacy = ','.join('coingecko:' + coin for coin in refresh.LEGACY_PRICE_COINS)
        self.assertTrue(url.startswith('https://coins.llama.fi/chart/' + legacy + '?'))
        self.assertNotIn('coingecko:binancecoin', url)

    def test_completed_chunk_cache_preserves_original_retrieval_date(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(refresh, 'RAW', pathlib.Path(folder)):
            key, url = refresh.supplemental_price_jobs(self.cutoff)[0]
            body = b'{"coins": {}}'
            (refresh.RAW / (key + '.json')).write_bytes(body)
            meta = {'url': url, 'retrieved_at': '2026-10-01T10:00:00+00:00',
                    'sha256': refresh.hashlib.sha256(body).hexdigest(), 'status': 'fresh'}
            refresh.dump(refresh.RAW / (key + '.meta.json'), meta)
            with patch.object(refresh, 'request', side_effect=AssertionError('Unnecessary historical request')):
                _, result = refresh.request_supplemental_price_chunk((key, url))
            self.assertEqual(result['status'], 'cached')
            self.assertEqual(result['retrieved_at'], meta['retrieved_at'])
            with patch.object(refresh, 'request', return_value=(key, {'status': 'fresh'})) as fetch:
                refresh.request_supplemental_price_chunk((key, url + '&changed=1'))
            fetch.assert_called_once_with((key, url + '&changed=1'))
            attempted_url = url + '&changed=1'
            with patch.object(refresh, 'request', return_value=(key, {**meta, 'url': attempted_url, 'status': 'cached', 'refresh_error': 'timeout'})):
                _, result = refresh.request_supplemental_price_chunk((key, attempted_url))
            self.assertEqual(result['response_url'], url)
            self.assertEqual(result['requested_url'], attempted_url)
            self.assertEqual(result['retrieved_at'], meta['retrieved_at'])

    def test_snapshot_exports_full_history_and_independent_raw_normalized_coverage(self):
        with tempfile.TemporaryDirectory() as folder:
            root = pathlib.Path(folder)
            raw = root / 'data' / 'raw'
            raw.mkdir(parents=True)
            ts = self.timestamp
            rule = {'id': 'deduplicate-reviewed-child', 'valid_from': '2019-01-01',
                    'chain': 'Chain', 'child': 'Duplicate'}
            refresh.dump(root / 'data' / 'profiles.json', [{'ticker': 'HYPE', 'initial_supply': 100,
                                                         'fee_normalization': rule}])
            fees = {'totalDataChart': [[ts('2019-01-01'), 5], [ts('2019-01-03'), 11], [ts('2026-10-01'), 11]],
                    'totalDataChartBreakdown': [[ts(date), {'Chain': {'Main': 10, 'Duplicate': 1}}]
                                               for date in ['2019-01-03', '2026-10-01']]}
            refresh.dump(raw / 'llama-hyperliquid-fees.json', fees)
            for kind in ['revenue', 'holders']:
                refresh.dump(raw / f'llama-hyperliquid-{kind}.json', {'totalDataChart': [[ts('2019-01-01'), 2], [ts('2026-10-01'), 3]]})
            refresh.dump(raw / 'price-hyperliquid.json', {'prices': [[ts('2021-01-01') * 1000, 7], [ts('2026-10-01') * 1000, 9]]})
            refresh.dump(raw / 'price-bitcoin.json', {'prices': [[ts('2013-01-01') * 1000, 1]]})
            now = dt.datetime(2026, 10, 3, 4, tzinfo=refresh.BEIJING)
            with patch.object(refresh, 'ROOT', root), patch.object(refresh, 'RAW', raw):
                snapshot = refresh.compile_snapshot(now.date(), {}, now=now)
            project = snapshot['projects'][0]
            dates = [row['date'] for row in project['history']]
            self.assertIn('2019-01-01', dates)
            self.assertIn('2021-01-01', dates)
            self.assertNotIn('2013-01-01', dates)
            self.assertEqual(snapshot['history_earliest'], '2019-01-01')
            historic = next(row for row in project['history'] if row['date'] == '2019-01-01')
            self.assertIsNone(historic['fees'])
            coverage = project['history_coverage']['fees']
            self.assertEqual(coverage['raw']['first'], '2019-01-01')
            self.assertEqual(coverage['raw']['observations'], 3)
            self.assertEqual(coverage['normalized']['first'], '2019-01-03')
            self.assertEqual(coverage['normalized']['observations'], 2)
            self.assertEqual(project['history_coverage']['price']['primary']['request_days'], 365)
            self.assertIn('365', project['price_source']['limitation'])
            self.assertEqual(project['price_source']['supplemental']['tolerance_seconds'], 3600)

    def test_empty_coverage_is_unknown_bounds_with_no_observations(self):
        self.assertEqual(refresh.series_coverage({}), {'first': None, 'last': None,
                         'observations': 0, 'calendar_days': 0, 'missing_days': 0})

class FeeNormalization(unittest.TestCase):
    rule={'id':'exclude-hlp-duplicate-v1','valid_from':'2024-12-23','chain':'Hyperliquid L1',
          'child':'Hyperliquid HLP','required_children':['Hyperliquid HLP','Hyperliquid Perps','Hyperliquid Spot Orderbook']}
    cutoff=dt.date(2026,10,1)
    timestamp=int(dt.datetime(2026,10,1,tzinfo=dt.timezone.utc).timestamp())

    def response(self, total=110):
        return {'totalDataChart':[[self.timestamp,total]], 'totalDataChartBreakdown':[[self.timestamp,{
            'Hyperliquid L1':{'Hyperliquid HLP':1,'Hyperliquid Perps':99,'Hyperliquid Spot Orderbook':10}}]]}

    def test_deduplicate_without_changing_raw_and_without_double_removal(self):
        raw=self.response()
        before=copy.deepcopy(raw)
        values,excluded,statuses,issues=refresh.normalize_fees(raw,self.cutoff,self.rule)
        self.assertEqual(values,{'2026-10-01':109})
        self.assertEqual(excluded,{'2026-10-01':1})
        self.assertEqual(issues,{})
        self.assertEqual(raw,before)
        values,excluded,statuses,issues=refresh.normalize_fees(self.response(109),self.cutoff,self.rule)
        self.assertEqual(values['2026-10-01'],109)
        self.assertEqual(excluded['2026-10-01'],0)
        self.assertEqual(statuses['2026-10-01'],'provider_already_excluded')

    def test_missing_incompatible_and_mismatching_parts_stay_unknown(self):
        for scenario in ['missing_breakdown','missing_child','only_hlp','invalid_child','mismatch','methodology_changed','ambiguous']:
            raw=self.response()
            rule=copy.deepcopy(self.rule)
            children=raw['totalDataChartBreakdown'][0][1]['Hyperliquid L1']
            if scenario=='missing_breakdown':raw.pop('totalDataChartBreakdown')
            if scenario=='missing_child':children.pop('Hyperliquid HLP')
            if scenario=='only_hlp':
                children.clear()
                children['Hyperliquid HLP']=110
            if scenario=='invalid_child':children['Hyperliquid HLP']=True
            if scenario=='mismatch':raw['totalDataChart'][0][1]=111
            if scenario=='methodology_changed':rule['expected_fee_methodologies']={'Hyperliquid Perps':'Previously verified gross fees'}
            if scenario=='ambiguous':
                children['Hyperliquid HLP']=1e-8
                raw['totalDataChart'][0][1]=109+1e-8
            with self.subTest(scenario=scenario):
                values,excluded,statuses,issues=refresh.normalize_fees(raw,self.cutoff,rule)
                self.assertNotIn('2026-10-01',values)
                self.assertIn('2026-10-01',issues)
                self.assertIsNone(refresh.window(values,self.cutoff,1)['usd'])

    def test_saved_window_fee_duplicate_is_reconstructed_from_children(self):
        root=pathlib.Path(__file__).parents[1]
        raw=refresh.load(root/'data/raw/llama-hyperliquid-fees.json')
        profile=next(p for p in refresh.load(root/'data/profiles.json') if p['ticker']=='HYPE')
        values,excluded,statuses,issues=refresh.normalize_fees(raw,self.cutoff,profile['fee_normalization'])
        for days,total,duplicate in [(7,13738019,106486),(30,70889789,556924),(90,187730934,1429830),(365,900083023,6909876)]:
            self.assertEqual(refresh.window(values,self.cutoff,days)['usd'],total)
            self.assertEqual(refresh.window(excluded,self.cutoff,days)['usd'],duplicate)
        # Historic missing child days remain unknown; do not silently assume HLP=0.
        self.assertNotIn('2025-02-13',values)
        self.assertEqual(issues['2025-02-13'],'missing_duplicate_child')

class FlowComposition(unittest.TestCase):
    cutoff=dt.date(2026,10,1)

    def test_composition_removes_duplicate_and_preserves_rounding_difference(self):
        timestamp=int(dt.datetime(2026,10,1,tzinfo=dt.timezone.utc).timestamp())
        raw={'totalDataChart':[[timestamp,120]],'totalDataChartBreakdown':[[timestamp,{
            'Solana':{'pump.fun':80,'PumpSwap':30,'Mobile':10,'Terminal':-.35}}]]}
        rule={'valid_from':'2026-05-21','chain':'Solana','child':'Mobile','tolerance_usd':1,
              'required_children':['pump.fun','PumpSwap','Mobile'],'allow_signed_components':True}
        values,excluded,_,issues=refresh.normalize_fees(raw,self.cutoff,rule)
        self.assertEqual(issues,{})
        self.assertEqual(values['2026-10-01'],110)
        self.assertEqual(excluded['2026-10-01'],10)
        c=refresh.composition(raw,'2026-10-01','2026-10-01',values,rule)
        self.assertTrue(c['complete'])
        self.assertAlmostEqual(c['sum_usd'],109.65)
        self.assertAlmostEqual(c['difference_from_total_usd'],-.35)
        self.assertNotIn('Mobile',[row['label'] for row in c['products']])
        self.assertEqual(next(row['usd'] for row in c['products'] if row['label']=='Terminal'),-.35)
        strict_rule={**rule,'allow_signed_components':False}
        self.assertEqual(refresh.normalize_fees(raw,self.cutoff,strict_rule)[0],{})

    def test_missing_composition_day_is_not_a_zero_category(self):
        timestamp=int(dt.datetime(2026,10,1,tzinfo=dt.timezone.utc).timestamp())
        raw={'totalDataChartBreakdown':[[timestamp,{'Solana':{'A':10}}]]}
        c=refresh.composition(raw,'2026-09-30','2026-10-01',{'2026-09-30':20,'2026-10-01':10})
        self.assertFalse(c['complete'])
        self.assertEqual(c['observed_days'],1)
        self.assertIsNone(c['sum_usd'])
        self.assertIsNone(c['difference_from_total_usd'])
        self.assertEqual(c['products'],[{'label':'A','usd':10}])

    def test_saved_pump_signed_net_income_and_first_mobile_day_gap(self):
        root=pathlib.Path(__file__).parents[1]
        profile=next(p for p in refresh.load(root/'data/profiles.json') if p['ticker']=='PUMP')
        expected={'fees':[(7,48884681),(30,159514205),(90,380312174)],
                  'revenue':[(7,16180854),(30,49859813),(90,136556805)]}
        for kind,windows in expected.items():
            raw=refresh.load(root/f'data/raw/llama-pump-{kind}.json')
            rule=profile['flow_normalizations'][kind]
            values,_,_,issues=refresh.normalize_fees(raw,self.cutoff,rule)
            for days,total in windows:
                self.assertEqual(refresh.window(values,self.cutoff,days)['usd'],total)
            self.assertEqual(issues['2026-05-21'],'missing_duplicate_child')
            annual=refresh.window(values,self.cutoff,365)
            self.assertFalse(annual['complete'])
            self.assertEqual(annual['coverage_days'],364)
            self.assertIsNone(annual['usd'])
            if kind=='revenue':
                self.assertEqual(values['2026-09-03'],1403282)

if __name__=='__main__':unittest.main()
