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


def daily_response(rows, kind="fees"):
    return {"id": "chain#bsc", "category": "Chain", "methodology": {
        "Fees": "Transaction fees paid by users", "Revenue": bnb.GAS_ESTIMATE_METHODOLOGY},
        "totalDataChart": [[int(dt.datetime.combine(dt.date.fromisoformat(day), dt.time(), UTC).timestamp()), amount]
                           for day, amount in rows]}


def parameter_raw(number="0x10", ratio=1000, scale=10000):
    return {bnb.CURRENT_BLOCK_KEY: [
        {"id": "chain-id", "result": "0x38"},
        {"id": "current-block", "result": {"number": number, "hash": BLOCK,
         "timestamp": "0x6ac0d8d8"}}], bnb.VALIDATOR_PARAMETERS_KEY: [
        {"id": "burn-ratio-" + number, "result": "0x" + format(ratio, "064x")},
        {"id": "ratio-scale-" + number, "result": "0x" + format(scale, "064x")}]}


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


class ChainFeeAndGasModel(unittest.TestCase):
    def raw(self):
        return {bnb.FEES_KEY: daily_response([("2026-09-30", 500), ("2026-10-01", 1000), ("2026-10-02", 700)]),
                bnb.GAS_ESTIMATE_KEY: daily_response([("2026-09-30", 50), ("2026-10-01", 100), ("2026-10-02", 70)])}

    def compile(self, raw=None):
        return bnb.compile_bnb_data(raw or self.raw(), "2026-10-01", {})

    def test_real_chain_fees_and_provider_burn_model_stay_separate_from_income(self):
        result = self.compile()
        self.assertEqual(result["charts"]["fees"], {"2026-09-30": 500, "2026-10-01": 1000})
        self.assertEqual(result["charts"]["revenue"], {})
        self.assertEqual(result["charts"]["holders"], {})
        self.assertEqual(result["gas_burn_estimate_history"], {"2026-09-30": 50, "2026-10-01": 100})
        self.assertEqual(result["burn_history"], {})
        self.assertFalse(result["income_linked"])
        self.assertFalse(result["chain_data_coverage"]["actual_daily_gas_burn_verified"])

    def test_missing_day_keeps_window_unknown_and_never_fills_daily_zeros(self):
        result = self.compile()
        window = result["gas_burn_estimate_windows"]["7"]
        self.assertIsNone(window["usd"])
        self.assertEqual(window["observed_usd"], 150)
        self.assertEqual(window["covered_days"], 2)
        self.assertEqual(len(window["missing_dates"]), 5)
        complete = bnb.daily_window(result["gas_burn_estimate_history"], "2026-10-01", 2,
                                    evidence="provider_policy_estimate", label="model", source_key=bnb.GAS_ESTIMATE_KEY)
        self.assertEqual(complete["usd"], 150)
        self.assertTrue(complete["complete"])
        self.assertFalse(complete["actual_burn_verified"])
        self.assertIsNone(complete["tokens"])
        self.assertIsNone(complete["cash_buyback_usd"])

    def test_methodology_changes_or_wrong_protocol_do_not_keep_previously_valid_values(self):
        for key, field, value in [(bnb.FEES_KEY, "id", "chain#ethereum"),
                                  (bnb.GAS_ESTIMATE_KEY, "category", "CEX")]:
            raw = self.raw()
            raw[key][field] = value
            result = self.compile(raw)
            self.assertEqual(result["gas_burn_estimate_history"], {})
        raw = self.raw()
        raw[bnb.GAS_ESTIMATE_KEY]["methodology"]["Revenue"] = "Changed burn policy"
        self.assertEqual(self.compile(raw)["gas_burn_estimate_history"], {})

    def test_estimate_needs_same_day_fee_and_must_reconcile_with_model(self):
        raw = self.raw()
        raw[bnb.GAS_ESTIMATE_KEY]["totalDataChart"][0][1] = 80
        raw[bnb.GAS_ESTIMATE_KEY]["totalDataChart"][1][1] = 100.5
        result = self.compile(raw)
        self.assertNotIn("2026-09-30", result["gas_burn_estimate_history"])
        self.assertEqual(result["gas_burn_estimate_history"]["2026-10-01"], 100.5)
        self.assertEqual(result["chain_data_issues"]["gas_burn_estimate"]["2026-09-30"],
                         "provider_ten_percent_model_does_not_reconcile")

    def test_pre_bep95_zeros_are_excluded_and_conflicting_duplicates_are_missing(self):
        raw = {bnb.FEES_KEY: daily_response([("2021-11-29", 100), ("2021-11-30", 200)]),
               bnb.GAS_ESTIMATE_KEY: daily_response([("2021-11-29", 0), ("2021-11-30", 20)])}
        result = self.compile(raw)
        self.assertEqual(result["gas_burn_estimate_history"], {"2021-11-30": 20})
        raw = self.raw()
        duplicate = copy.deepcopy(raw[bnb.FEES_KEY]["totalDataChart"][1])
        duplicate[1] += 50
        raw[bnb.FEES_KEY]["totalDataChart"].append(duplicate)
        result = self.compile(raw)
        self.assertNotIn("2026-10-01", result["charts"]["fees"])
        self.assertNotIn("2026-10-01", result["gas_burn_estimate_history"])

    def test_bad_numbers_or_non_utc_day_rows_are_not_observations(self):
        raw = self.raw()
        raw[bnb.FEES_KEY]["totalDataChart"] += [[True, 5], [1790812800, True], [1790812801, 600],
                                                 [1790812800, float("nan")], [1790812800, -1]]
        result = self.compile(raw)
        self.assertEqual(result["charts"]["fees"], {"2026-09-30": 500, "2026-10-01": 1000})

    def test_public_jobs_and_pinned_parameter_getters_use_known_source_selectors(self):
        jobs = {job[0]: job for job in bnb.bnb_jobs()}
        self.assertEqual(jobs[bnb.FEES_KEY][1], bnb.LLAMA_FEES_URL)
        job = bnb.parameter_jobs(parameter_raw())[0]
        self.assertEqual(job[0], bnb.VALIDATOR_PARAMETERS_KEY)
        self.assertEqual([row["params"][1] for row in job[2]], ["0x10", "0x10"])
        self.assertEqual([row["params"][0]["data"] for row in job[2]], ["0x5192c82c", "0x820dcaa8"])

    def test_current_ratio_is_block_snapshot_and_does_not_change_historical_supplier_model(self):
        raw = {**self.raw(), **parameter_raw(ratio=2000)}
        result = self.compile(raw)
        policy = result["gas_burn_policy_observation"]
        self.assertEqual(policy["ratio"], 0.2)
        self.assertFalse(policy["matches_provider_assumption"])
        self.assertTrue(policy["snapshot_only"])
        self.assertEqual(result["gas_burn_estimate_history"]["2026-10-01"], 100)
        self.assertEqual(result["gas_burn_estimate_windows"]["7"]["assumed_ratio"], 0.1)

    def test_parameter_wrong_chain_or_mixed_block_context_keeps_ratio_unknown(self):
        raw = parameter_raw()
        raw[bnb.CURRENT_BLOCK_KEY][0]["result"] = "0x1"
        self.assertIsNone(self.compile(raw)["gas_burn_policy_observation"]["ratio"])
        raw = parameter_raw()
        raw[bnb.CURRENT_BLOCK_KEY][1]["result"]["number"] = "0x11"
        self.assertIsNone(self.compile(raw)["gas_burn_policy_observation"]["ratio"])
        raw = parameter_raw()
        raw[bnb.VALIDATOR_PARAMETERS_KEY][0]["result"] = "0x03e8"
        self.assertIsNone(self.compile(raw)["gas_burn_policy_observation"]["ratio"])


if __name__ == "__main__":
    unittest.main()
