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


ETH_TX = "0x5c2c458b4af0ed8d3ce822fbae71878de10b8a2405101344456c358e19045463"
ETH_SENDER = "0x" + "a" * 40
BEACON_TX = "0x" + "c" * 64


def ethereum_raw():
    units = 986000 * 10 ** 18
    abi = "0x" + format(units, "064x")
    tx = {"hash": ETH_TX, "to": bnb.ETH_BNB_CONTRACT, "from": ETH_SENDER,
          "chainId": "0x1", "input": bnb.ETH_BURN_SELECTOR + abi[2:], "value": "0x0",
          "blockHash": BLOCK, "blockNumber": "0x1234"}
    log = {"address": bnb.ETH_BNB_CONTRACT, "topics": [bnb.ETH_BURN_TOPIC, "0x" + "0" * 24 + ETH_SENDER[2:]],
           "data": abi, "transactionHash": ETH_TX, "blockHash": BLOCK, "blockNumber": "0x1234",
           "logIndex": "0x1", "removed": False}
    receipt = {"transactionHash": ETH_TX, "to": bnb.ETH_BNB_CONTRACT, "status": "0x1",
               "blockHash": BLOCK, "blockNumber": "0x1234", "logs": [log]}
    timestamp = int(dt.datetime(2017, 10, 18, 9, 0, tzinfo=UTC).timestamp())
    return {bnb.QUARTERS_KEY: {"quarters": [{"rank": 1, "name": "Q3 2017", "amount": "986000",
            "burnDate": "2017-10-18", "txLink": "https://etherscan.io/tx/" + ETH_TX}]},
            bnb.ETH_TRANSACTIONS_KEY: [{"id": "chain-id", "result": "0x1"},
                {"id": "tx-" + ETH_TX, "result": tx}, {"id": "receipt-" + ETH_TX, "result": receipt}],
            bnb.ETH_BLOCKS_KEY: [{"id": "chain-id", "result": "0x1"},
                {"id": "block-" + BLOCK, "result": {"hash": BLOCK, "number": "0x1234", "timestamp": hex(timestamp)}}]}


def beacon_raw():
    key = bnb.BEACON_TRANSACTION_PREFIX + BEACON_TX[2:]
    return {bnb.QUARTERS_KEY: {"quarters": [{"rank": 26, "name": "Q4 2023", "amount": "2141487",
            "burnDate": "2024-01-17", "pioneer": "1542.15",
            "txLink": "https://explorer.binance.org/tx/" + BEACON_TX[2:].upper()}]},
            key: {"txHash": BEACON_TX[2:].upper(), "blockHeight": 363201898,
                  "txType": "BURN_TOKEN", "timeStamp": 1705501419379, "value": 2139945.12,
                  "txAsset": "BNB", "hasChildren": 0, "code": 0}}


class HistoricalChainProofs(unittest.TestCase):
    def test_history_refresh_rejects_empty_or_truncated_indexes_but_accepts_new_quarters(self):
        old = sample_raw()[bnb.QUARTERS_KEY]
        self.assertTrue(bnb.valid_history_response(bnb.QUARTERS_KEY, old))
        for invalid in [{}, {"quarters": []}, {"quarters": [old["quarters"][0]]}]:
            self.assertFalse(bnb.valid_history_response(bnb.QUARTERS_KEY, invalid, old))
        larger = copy.deepcopy(old)
        larger["quarters"].append({"rank":35,"burnDate":"2026-04-15","amount":"10","txLink":"https://bscscan.com/tx/"+TX})
        self.assertTrue(bnb.valid_history_response(bnb.QUARTERS_KEY, larger, old))
        shortened = copy.deepcopy(larger)
        shortened["quarters"] = old["quarters"]
        self.assertFalse(bnb.valid_history_response(bnb.QUARTERS_KEY, shortened, larger))

    def test_only_confirmed_matching_beacon_burns_are_final_cache_entries(self):
        raw = beacon_raw()
        key = bnb.BEACON_TRANSACTION_PREFIX + BEACON_TX[2:]
        self.assertTrue(bnb.valid_history_response(key, raw[key]))
        for invalid in [{}, {**raw[key],"code":1}, {**raw[key],"txType":"TRANSFER"}, {**raw[key],"txHash":TX[2:]}]:
            self.assertFalse(bnb.valid_history_response(key, invalid))

    def compile(self, raw):
        return bnb.compile_bnb(raw, "2026-10-02", {"2017-10-18": 1})

    def test_ethereum_original_burn_event_not_eth_value_is_proved(self):
        raw = ethereum_raw()
        record = self.compile(raw)["quarterly_records"][0]
        self.assertTrue(record["verified"])
        self.assertEqual(record["chain"], "ethereum")
        self.assertEqual(record["exact_tokens"], "986000")
        self.assertEqual(record["date"], "2017-10-18")
        self.assertEqual(record["usd"], 986000)
        self.assertEqual(record["proof_source_keys"], [bnb.ETH_TRANSACTIONS_KEY, bnb.ETH_BLOCKS_KEY])
        self.assertEqual(record["evidence"], "successful_original_bnb_erc20_burn_event")
        # Old pre-EIP-155 transaction RPC can omit its own chainId; both RPC
        # stages have an explicit Ethereum chain-id observation.
        raw[bnb.ETH_TRANSACTIONS_KEY][1]["result"].pop("chainId")
        self.assertTrue(self.compile(raw)["quarterly_records"][0]["verified"])

    def test_ethereum_wrong_contract_chain_log_amount_and_sender_are_rejected(self):
        cases = [
            ("tx", "to", bnb.DEAD_ADDRESS), ("tx", "chainId", "0x38"),
            ("tx", "input", "0xa9059cbb" + "0" * 64),
            ("receipt", "status", "0x0"),
            ("log", "address", bnb.DEAD_ADDRESS), ("log", "data", "0x" + "0" * 64),
            ("log", "topics", [bnb.ETH_BURN_TOPIC, "0x" + "0" * 64]),
            ("log", "removed", True), ("log", "transactionHash", TX),
            ("log", "blockHash", TX), ("log", "blockNumber", "0x1"),
        ]
        for target, field, value in cases:
            with self.subTest(target=target, field=field):
                raw = ethereum_raw()
                tx = raw[bnb.ETH_TRANSACTIONS_KEY][1]["result"]
                receipt = raw[bnb.ETH_TRANSACTIONS_KEY][2]["result"]
                {"tx": tx, "receipt": receipt, "log": receipt["logs"][0]}[target][field] = value
                self.assertFalse(self.compile(raw)["quarterly_records"][0]["verified"])
        for source in [bnb.ETH_TRANSACTIONS_KEY, bnb.ETH_BLOCKS_KEY]:
            raw = ethereum_raw()
            raw[source][0]["result"] = "0x38"
            self.assertFalse(self.compile(raw)["quarterly_records"][0]["verified"])

    def test_duplicate_burn_logs_and_post_migration_burns_are_rejected(self):
        raw = ethereum_raw()
        raw[bnb.ETH_TRANSACTIONS_KEY][2]["result"]["logs"] *= 2
        self.assertFalse(self.compile(raw)["quarterly_records"][0]["verified"])
        raw = ethereum_raw()
        raw[bnb.ETH_BLOCKS_KEY][1]["result"]["timestamp"] = hex(int(dt.datetime(2019, 4, 23, tzinfo=UTC).timestamp()))
        record = self.compile(raw)["quarterly_records"][0]
        self.assertEqual(record["verification_error"], "erc20_migration_or_post_quarterly_era")
        # Unlisted migration transactions are not discovered from ERC20 logs.
        raw[bnb.QUARTERS_KEY]["quarters"] = []
        self.assertEqual(self.compile(raw)["quarterly_records"], [])

    def test_beacon_indexed_actual_is_separate_from_tracker_total_and_rpc_total(self):
        raw = beacon_raw()
        compiled = self.compile(raw)
        record = compiled["quarterly_records"][0]
        self.assertEqual(record["status"], "indexed_verified")
        self.assertFalse(record["verified"])
        self.assertEqual(record["reported_amount"], "2141487")
        self.assertEqual(record["reported_pioneer"], "1542.15")
        self.assertEqual(record["indexed_tokens"], 2139945.12)
        self.assertNotIn("tokens", record)
        self.assertNotIn("date", record)
        self.assertEqual(compiled["burn_history"], {})
        window = bnb.quarterly_window(compiled["quarterly_records"], "2024-01-17", 1, {})
        self.assertIsNone(window["tokens"])
        self.assertEqual(window["unverified_events"], 1)
        source = next(s for s in compiled["data_sources"] if s["source_key"] == record["indexed_source_key"])
        self.assertEqual(source["role"], "official_explorer_indexer")
        self.assertFalse(source["independent_rpc_verified"])
        self.assertEqual(compiled["quarterly_history_coverage"]["official_explorer_confirmed_records"], 1)

    def test_beacon_failed_wrong_asset_transfer_hash_or_invalid_amount_is_rejected(self):
        for field, value in [("txHash", "f" * 64), ("code", 1), ("code", False),
                             ("txType", "TRANSFER"), ("txAsset", "BNB-123"), ("value", -1),
                             ("value", 1.123456789), ("timeStamp", True), ("hasChildren", 1)]:
            with self.subTest(field=field):
                raw = beacon_raw()
                raw[bnb.BEACON_TRANSACTION_PREFIX + BEACON_TX[2:]][field] = value
                record = self.compile(raw)["quarterly_records"][0]
                self.assertEqual(record["status"], "unverified")
                self.assertNotIn("indexed_tokens", record)

    def test_new_jobs_sources_and_rpc_health_validation(self):
        raw = ethereum_raw()
        tx_jobs = bnb.bnb_rpc_jobs(raw)
        self.assertEqual(tx_jobs[0][0], bnb.ETH_TRANSACTIONS_KEY)
        self.assertTrue(bnb.valid_rpc_response(tx_jobs[0][0], raw[bnb.ETH_TRANSACTIONS_KEY], tx_jobs[0][2]))
        duplicate = raw[bnb.ETH_TRANSACTIONS_KEY] + [copy.deepcopy(raw[bnb.ETH_TRANSACTIONS_KEY][1])]
        self.assertFalse(bnb.valid_rpc_response(tx_jobs[0][0], duplicate, tx_jobs[0][2]))
        null = copy.deepcopy(raw[bnb.ETH_TRANSACTIONS_KEY])
        null[2]["result"] = None
        self.assertFalse(bnb.valid_rpc_response(tx_jobs[0][0], null, tx_jobs[0][2]))
        self.assertIn(bnb.ETH_BLOCKS_KEY, bnb.proof_keys(raw))
        self.assertGreaterEqual(len(bnb.rpc_endpoints(bnb.ETH_TRANSACTIONS_KEY)), 2)
        self.assertGreaterEqual(len(bnb.rpc_endpoints(bnb.TRANSACTIONS_KEY)), 2)
        beacon = beacon_raw()
        job = bnb.bnb_beacon_jobs(beacon)[0]
        self.assertEqual(len(job), 2)
        self.assertEqual(job[0], bnb.BEACON_TRANSACTION_PREFIX + BEACON_TX[2:])
        self.assertEqual(job[1], bnb.BEACON_API + BEACON_TX[2:].upper())
        self.assertIn(job[0], bnb.proof_keys(beacon))


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
