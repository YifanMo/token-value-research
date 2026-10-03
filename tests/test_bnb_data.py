import copy
import datetime as dt
import unittest

from scripts import bnb_data as bnb


TX = "0xa9c1d03773a2edd29d5fe24bef231fb404b0c193661941a41457f8317fc49fa7"
BLOCK = "0xdddbf6a0ab97a0131aeeae098e76896a8a7cf7e3b1afc88186e5d9e045d2accf"
UTC = dt.timezone.utc


def sample_raw():
    """Known 36th burn proof: tracker date differs from chain execution date."""
    transaction = {"hash": TX, "to": bnb.DEAD_ADDRESS, "chainId": "0x38",
                   "value": "0x1562a3345e1eee7db8000", "blockHash": BLOCK,
                   "blockNumber": "0x68ff089"}
    receipt = {"transactionHash": TX, "to": bnb.DEAD_ADDRESS, "status": "0x1",
               "blockHash": BLOCK, "blockNumber": "0x68ff089"}
    block = {"hash": BLOCK, "number": "0x68ff089", "timestamp": "0x6a573f82"}
    return {
        bnb.QUARTERS_KEY: {"quarters": [
            {"rank": 37, "name": "Q3 2026", "amount": "1646196.44", "burnDate": None, "txLink": ""},
            {"rank": 36, "name": "Q2 2026", "amount": "1615827.7950001028", "burnDate": "2026-07-16",
             "txLink": "https://bscscan.com/tx/" + TX, "pioneer": "100.0995"},
        ]},
        bnb.TRANSACTIONS_KEY: [
            {"jsonrpc": "2.0", "id": "tx-" + TX, "result": transaction},
            {"jsonrpc": "2.0", "id": "receipt-" + TX, "result": receipt},
        ],
        bnb.BLOCKS_KEY: [{"jsonrpc": "2.0", "id": "block-" + BLOCK, "result": block}],
        bnb.SUPPLY_KEY: {"bcSupply": 0, "bscSupply": 133159213.03},
        bnb.REALTIME_KEY: {"success": True, "last7DaysBurnt": 586.89, "totalBurnt": 297848.14,
                           "bnbPrice": "765", "recentBurnData": [{"timestamp": 1791014602}]},
    }


class QuarterlyBurnProof(unittest.TestCase):
    def compile(self, raw=None, cutoff="2026-10-01", prices=None):
        return bnb.compile_bnb_data(raw or sample_raw(), cutoff,
                                    prices if prices is not None else {"2026-07-15": 600})

    def test_execution_time_and_value_override_bad_tracker_date_and_estimate(self):
        result = self.compile()
        verified = [record for record in result["quarterly_records"] if record["verified"]]
        self.assertEqual(len(verified), 1)
        self.assertEqual(verified[0]["date"], "2026-07-15")
        self.assertEqual(verified[0]["utc_time"], "2026-07-15T08:06:26+00:00")
        self.assertEqual(verified[0]["exact_tokens"], "1615827.795")
        self.assertFalse(verified[0]["reported_date_matches_chain"])
        self.assertAlmostEqual(result["quarterly_windows"]["365"]["tokens"], 1615827.795)
        self.assertAlmostEqual(result["quarterly_windows"]["365"]["usd"], 969496677.0)
        # Pioneer and rounded tracker quantity are not added to the transfer.
        self.assertNotIn("2026-07-16", result["burn_history"])

    def test_projected_and_duplicate_transactions_are_not_counted(self):
        raw = sample_raw()
        raw[bnb.QUARTERS_KEY]["quarters"].append(copy.deepcopy(raw[bnb.QUARTERS_KEY]["quarters"][1]))
        result = self.compile(raw)
        self.assertEqual(len([record for record in result["quarterly_records"] if record["verified"]]), 1)
        self.assertEqual(result["quarterly_windows"]["365"]["confirmed_events"], 1)
        requests = bnb.bnb_rpc_jobs(raw)[0][2]
        self.assertEqual(len(requests), 2)
        self.assertTrue(all(item["params"] == [TX] for item in requests))

    def test_utc_cutoff_uses_proven_date_not_later_tracker_date(self):
        self.assertEqual(self.compile(cutoff="2026-07-15")["quarterly_windows"]["7"]["confirmed_events"], 1)
        before = self.compile(cutoff="2026-07-14")
        self.assertEqual(before["quarterly_windows"]["7"]["confirmed_events"], 0)
        self.assertEqual(before["burn_history"], {})
        self.assertEqual([record for record in before["quarterly_records"] if record.get("transaction_hash") == TX][0]["status"], "after_cutoff")

    def test_missing_price_never_uses_current_provider_price(self):
        result = self.compile(prices={})
        window = result["quarterly_windows"]["365"]
        self.assertEqual(window["tokens"], 1615827.795)
        self.assertIsNone(window["usd"])
        self.assertEqual(window["missing_price_dates"], ["2026-07-15"])
        self.assertEqual(result["burn_history"], {})

    def test_failed_receipt_wrong_recipient_chain_or_mismatched_block_are_rejected(self):
        cases = [
            (bnb.TRANSACTIONS_KEY, 1, "status", "0x0"),
            (bnb.TRANSACTIONS_KEY, 0, "to", "0x" + "1" * 40),
            (bnb.TRANSACTIONS_KEY, 1, "to", None),
            (bnb.TRANSACTIONS_KEY, 0, "chainId", "0x1"),
            (bnb.TRANSACTIONS_KEY, 1, "transactionHash", "0x" + "2" * 64),
            (bnb.BLOCKS_KEY, 0, "number", "0x1"),
        ]
        for key, index, field, value in cases:
            with self.subTest(field=field, value=value):
                raw = sample_raw()
                raw[key][index]["result"][field] = value
                result = self.compile(raw)
                self.assertFalse(any(record["verified"] for record in result["quarterly_records"]))
                self.assertEqual(result["burn_history"], {})

    def test_rpc_error_duplicate_id_and_missing_blocks_are_not_proof(self):
        for mode in ["rpc_error", "duplicate_id", "no_block"]:
            with self.subTest(mode=mode):
                raw = sample_raw()
                if mode == "rpc_error":
                    raw[bnb.TRANSACTIONS_KEY][1] = {"id": "receipt-" + TX, "error": {"code": -32000}}
                elif mode == "duplicate_id":
                    raw[bnb.TRANSACTIONS_KEY].append(copy.deepcopy(raw[bnb.TRANSACTIONS_KEY][1]))
                else:
                    raw.pop(bnb.BLOCKS_KEY)
                self.assertFalse(any(record["verified"] for record in self.compile(raw)["quarterly_records"]))

    def test_unverified_legacy_event_in_window_keeps_quarterly_total_unknown(self):
        raw = sample_raw()
        raw[bnb.QUARTERS_KEY]["quarters"].append({
            "rank": 1, "name": "legacy", "burnDate": "2026-07-10", "amount": "10",
            "txLink": "https://explorer.bnbchain.org/tx/" + "1" * 64})
        window = self.compile(raw)["quarterly_windows"]["365"]
        self.assertIsNone(window["tokens"])
        self.assertIsNone(window["usd"])
        self.assertEqual(window["unverified_events"], 1)
        self.assertEqual(window["observed_tokens"], 1615827.795)

    def test_current_gas_snapshot_is_not_daily_history_or_protocol_income(self):
        result = self.compile()
        self.assertEqual(result["charts"], {"fees": {}, "revenue": {}, "holders": {}})
        self.assertEqual(result["realtime_observation"]["last7_days_tokens"], 586.89)
        self.assertFalse(result["realtime_observation"]["historical_daily_available"])
        self.assertFalse(result["realtime_observation"]["included_in_quarterly_windows"])
        self.assertFalse(result["complete_total_burn_history"])
        self.assertFalse(result["quarterly_windows"]["365"]["complete"])
        self.assertIsNone(result["quarterly_windows"]["365"]["cash_buyback_usd"])
        # A zero quarterly-event observation does not establish zero gas burns.
        self.assertIsNone(result["quarterly_windows"]["7"]["usd"])
        self.assertIsNone(result["quarterly_windows"]["7"]["tokens"])

    def test_custom_window_inclusive_dates_and_no_daily_zero_filling(self):
        records = self.compile()["quarterly_records"]
        included = bnb.quarterly_window(records, "2026-07-15", 1, {"2026-07-15": 600})
        excluded = bnb.quarterly_window(records, "2026-07-16", 1, {"2026-07-15": 600})
        self.assertEqual(included["confirmed_events"], 1)
        self.assertEqual(excluded["confirmed_events"], 0)
        self.assertEqual(list(self.compile()["burn_history"]), ["2026-07-15"])
        for days in [0, -1, True, 1.5]:
            with self.assertRaises(ValueError):
                bnb.quarterly_window(records, "2026-07-15", days, {})

    def test_staged_jobs_request_transaction_then_exact_block_and_keep_sources(self):
        raw = sample_raw()
        tx_job = bnb.bnb_rpc_jobs(raw)[0]
        block_job = bnb.bnb_block_jobs(raw)[0]
        self.assertEqual(tx_job[0], bnb.TRANSACTIONS_KEY)
        self.assertEqual(block_job[2][0]["params"], [BLOCK, False])
        metadata = {bnb.QUARTERS_KEY: {"response_path": "../data/responses/abc.json", "sha256": "abc"}}
        result = bnb.compile_bnb(raw, "2026-10-01", {}, metadata)
        quarter_source = next(source for source in result["data_sources"] if source["source_key"] == bnb.QUARTERS_KEY)
        self.assertEqual(quarter_source["response_path"], "../data/responses/abc.json")
        self.assertEqual(quarter_source["role"], "official_linked_indexer")

    def test_malformed_tracker_payload_does_not_create_observations(self):
        result = bnb.compile_bnb({bnb.QUARTERS_KEY: [], bnb.SUPPLY_KEY: [], bnb.REALTIME_KEY: []}, "2026-10-01", {})
        self.assertEqual(result["quarterly_records"], [])
        self.assertIsNone(result["supply_observation"]["tokens"])
        self.assertIsNone(result["realtime_observation"]["last7_days_tokens"])


if __name__ == "__main__":
    unittest.main()
