"""BNB native-coin burns, kept separate from income and cash repurchases.

The official burn announcements link the NodeReal-operated BNBBurn tracker.
That tracker discovers transactions; BSC JSON-RPC proves their success, amount
and UTC time. Tracker dates, token estimates and current prices are not proof.

Network and archive ownership stay with refresh.py. Fetch jobs(), then call
rpc_jobs(raw, cutoff, stage='transactions'), reload the cache, fetch stage='blocks',
reload again, and call compile_bnb(raw, cutoff, price, metadata). `raw` maps job
keys to decoded responses. Metadata may contain immutable response_path hashes.
"""

import datetime as dt
from decimal import Decimal, InvalidOperation
import math
import re
from urllib.parse import urlparse

UTC = dt.timezone.utc
TRACKER = "https://www.bnbburn.info"
RPC_URL = "https://bsc-dataseed.bnbchain.org"
DEAD_ADDRESS = "0x000000000000000000000000000000000000dead"
QUARTERS_KEY = "bnb-quarter-burns"
SUPPLY_KEY = "bnb-supply"
REALTIME_KEY = "bnb-realtime-burn-info"
BREAKDOWN_KEY = "bnb-burn-breakdown"
TRANSACTIONS_KEY = "rpc-bnb-burn-transactions"
BLOCKS_KEY = "rpc-bnb-burn-blocks"
HASH = re.compile(r"^0x[0-9a-fA-F]{64}$")
BSC_EXPLORERS = {"bscscan.com", "www.bscscan.com", "bsctrace.com", "www.bsctrace.com"}


def _date(value):
    return value if isinstance(value, dt.date) and not isinstance(value, dt.datetime) else dt.date.fromisoformat(value)


def _number(value):
    if isinstance(value, bool):
        return None
    try:
        number = Decimal(str(value))
        return number if number.is_finite() and number >= 0 else None
    except (InvalidOperation, TypeError, ValueError):
        return None


def _hex(value):
    if not isinstance(value, str) or not re.fullmatch(r"0x[0-9a-fA-F]+", value):
        raise ValueError("invalid_hex_quantity")
    return int(value, 16)


def _hash(value):
    return value.lower() if isinstance(value, str) and HASH.fullmatch(value) else None


def _transaction_hash(link):
    if not isinstance(link, str):
        return None
    parsed = urlparse(link)
    if parsed.scheme != "https" or parsed.hostname not in BSC_EXPLORERS:
        return None
    parts = parsed.path.strip("/").split("/")
    return _hash(parts[1]) if len(parts) == 2 and parts[0] == "tx" else None


def jobs():
    """Fixed public tracker endpoints; no embedded website API credentials."""
    return [
        (QUARTERS_KEY, TRACKER + "/api/getQuarterBurns"),
        (SUPPLY_KEY, TRACKER + "/api/getBnbSupply"),
        (REALTIME_KEY, TRACKER + "/api/getRealTimeBurnInfo"),
        (BREAKDOWN_KEY, TRACKER + "/api/getBurnBreakdown"),
    ]


def _quarters(raw):
    response = raw.get(QUARTERS_KEY)
    rows = response.get("quarters") if isinstance(response, dict) else None
    return rows if isinstance(rows, list) else []


def _batch_results(response):
    """Duplicate ids and JSON-RPC errors cannot silently become valid proof."""
    rows = response if isinstance(response, list) else [response] if isinstance(response, dict) else []
    result = {}
    duplicates = set()
    for row in rows:
        if not isinstance(row, dict) or not isinstance(row.get("id"), str):
            continue
        key = row["id"]
        if key in result:
            duplicates.add(key)
        result[key] = row.get("result") if not row.get("error") else None
    for key in duplicates:
        result[key] = None
    return result


def rpc_jobs(raw, cutoff, stage="transactions"):
    """Build dependent, read-only RPC batches. Fetch stages sequentially.

    Advertised dates are not used to exclude rows: the tracker has incorrect
    dates for known burns. Actual block time determines the cutoff at compile.
    Historical Ethereum/Beacon transactions require other adapters and stay
    unverified here. Projected rows without an execution date are never fetched.
    """
    _date(cutoff)
    if stage == "transactions":
        hashes = sorted({_transaction_hash(row.get("txLink")) for row in _quarters(raw)
                         if isinstance(row, dict) and row.get("burnDate")} - {None})
        payload = [
            {"jsonrpc": "2.0", "id": prefix + tx_hash, "method": method, "params": [tx_hash]}
            for tx_hash in hashes for prefix, method in [
                ("tx-", "eth_getTransactionByHash"), ("receipt-", "eth_getTransactionReceipt")]
        ]
        return [(TRANSACTIONS_KEY, RPC_URL, payload)] if payload else []
    if stage == "blocks":
        proofs = _batch_results(raw.get(TRANSACTIONS_KEY))
        hashes = sorted({_hash(value.get("blockHash")) for key, value in proofs.items()
                         if key.startswith("tx-") and isinstance(value, dict)} - {None})
        payload = [{"jsonrpc": "2.0", "id": "block-" + block_hash,
                    "method": "eth_getBlockByHash", "params": [block_hash, False]}
                   for block_hash in hashes]
        return [(BLOCKS_KEY, RPC_URL, payload)] if payload else []
    raise ValueError("BNB RPC stage must be transactions or blocks")


def _verified_transfer(tx_hash, proofs, blocks):
    tx, receipt = proofs.get("tx-" + tx_hash), proofs.get("receipt-" + tx_hash)
    if not isinstance(tx, dict) or not isinstance(receipt, dict):
        raise ValueError("transaction_or_receipt_missing")
    if _hash(tx.get("hash")) != tx_hash or _hash(receipt.get("transactionHash")) != tx_hash:
        raise ValueError("transaction_hash_mismatch")
    if _hex(receipt.get("status")) != 1:
        raise ValueError("transaction_not_successful")
    if not isinstance(tx.get("to"), str) or not isinstance(receipt.get("to"), str) or \
            tx["to"].lower() != DEAD_ADDRESS or receipt["to"].lower() != DEAD_ADDRESS:
        raise ValueError("recipient_not_burn_address")
    if _hex(tx.get("chainId")) != 56:
        raise ValueError("wrong_chain")
    block_hash = _hash(tx.get("blockHash"))
    if not block_hash or _hash(receipt.get("blockHash")) != block_hash:
        raise ValueError("receipt_block_mismatch")
    block = blocks.get("block-" + block_hash)
    if not isinstance(block, dict) or _hash(block.get("hash")) != block_hash:
        raise ValueError("block_missing_or_mismatched")
    number = _hex(tx.get("blockNumber"))
    if number != _hex(receipt.get("blockNumber")) or number != _hex(block.get("number")):
        raise ValueError("block_number_mismatch")
    wei = _hex(tx.get("value"))
    if wei <= 0:
        raise ValueError("no_native_coin_burned")
    timestamp = _hex(block.get("timestamp"))
    when = dt.datetime.fromtimestamp(timestamp, UTC)
    tokens = Decimal(wei) / Decimal(10) ** 18
    return {"transaction_hash": tx_hash, "transaction_url": "https://bscscan.com/tx/" + tx_hash,
            "block_hash": block_hash, "block_number": number, "timestamp": timestamp,
            "utc_time": when.isoformat(), "date": when.date().isoformat(),
            "recipient": DEAD_ADDRESS, "raw_wei": str(wei), "exact_tokens": str(tokens),
            "tokens": float(tokens), "evidence": "successful_native_transfer_to_burn_address"}


def quarterly_window(records, end, days, price):
    """Sum each verified execution once; this is NOT all BNB burn activity.

    Event-scope sums are usable for custom periods, but never establish missing
    BEP-95 activity as zero. A missing event price keeps the valued total unknown.
    No daily zero filling is performed, even on dates with no listed quarterly
    transaction. `complete` is therefore always false for total BNB destruction.
    """
    end = _date(end)
    if isinstance(days, bool) or not isinstance(days, int) or days <= 0:
        raise ValueError("days must be a positive integer")
    start = end - dt.timedelta(days=days - 1)
    selected, seen, unverified = [], set(), []
    for record in records:
        candidate_date = record.get("date") or record.get("reported_date")
        try:
            date = _date(candidate_date)
        except (ValueError, TypeError):
            continue
        if not start <= date <= end:
            continue
        tx_hash = record.get("transaction_hash")
        if record.get("status") != "verified":
            if record.get("status") != "projected":
                unverified.append(record)
            continue
        if not tx_hash or tx_hash in seen:
            continue
        seen.add(tx_hash)
        selected.append(record)
    token_total = sum((Decimal(record["exact_tokens"]) for record in selected), Decimal(0))
    valued, missing_price_dates = [], []
    for record in selected:
        event_price = _number(price.get(record["date"]))
        if event_price is None or event_price == 0:
            missing_price_dates.append(record["date"])
        else:
            valued.append(Decimal(record["exact_tokens"]) * event_price)
    # No events is an observed list total, not proof that all burning was zero.
    listed_valued = not missing_price_dates and not unverified
    value_total = float(sum(valued, Decimal(0))) if listed_valued and selected else None
    return {"start": start.isoformat(), "end": end.isoformat(), "days": days,
            "tokens": float(token_total) if selected and not unverified else None,
            "exact_tokens": str(token_total) if selected and not unverified else None,
            "observed_tokens": float(token_total), "usd": value_total,
            "observed_usd": float(sum(valued, Decimal(0))) if valued else None,
            "confirmed_events": len(selected), "unverified_events": len(unverified),
            "missing_price_dates": sorted(set(missing_price_dates)), "complete": False,
            "quarterly_records_complete": not unverified,
            "coverage_status": "verified_quarterly_subset",
            "gas_history_available": False, "cash_buyback_usd": None,
            "basis": "已核季度交易的实际BNB枚数；美元值按执行日价格估值，不是现金回购支出。",
            "note": "只含已成功核验的季度交易；Gas日销毁、Pioneer及其他销毁未完整覆盖，无事件日不补零。"}


def _source(key, url, kind, metadata):
    return {"source_key": key, "kind": kind, "url": url,
            **metadata.get(key, {}), "role": "rpc_proof" if key.startswith("rpc-") else "official_linked_indexer"}


def compile_bnb(raw, cutoff, price, metadata=None):
    """Pure compiler for archived tracker/RPC bytes and same-date USD prices."""
    cutoff = _date(cutoff)
    metadata = metadata or {}
    price = price or {}
    proofs = _batch_results(raw.get(TRANSACTIONS_KEY))
    blocks = _batch_results(raw.get(BLOCKS_KEY))
    records, seen = [], set()
    for row in _quarters(raw):
        if not isinstance(row, dict):
            continue
        record = {"rank": row.get("rank"), "quarter": row.get("name"),
                  "reported_date": row.get("burnDate"), "reported_amount": row.get("amount"),
                  "reported_pioneer": row.get("pioneer"), "reported_transaction_url": row.get("txLink"),
                  "source_key": QUARTERS_KEY, "status": "projected"}
        if not row.get("burnDate") or not row.get("txLink"):
            record["note"] = "无已执行记录；预测数量不计入销毁。"
            records.append(record)
            continue
        tx_hash = _transaction_hash(row["txLink"])
        record["transaction_hash"] = tx_hash
        if not tx_hash:
            record.update(status="unverified_legacy", note="旧Ethereum或Beacon记录尚未用对应链核验。")
        elif tx_hash in seen:
            # One economic transfer stays one record regardless of duplicate ranks.
            continue
        else:
            seen.add(tx_hash)
            try:
                record.update(_verified_transfer(tx_hash, proofs, blocks))
                if _date(record["date"]) > cutoff:
                    record.update(status="after_cutoff", note="交易发生在完整UTC日截止之后，不计本次窗口。")
                else:
                    record["status"] = "verified"
                    record["reported_date_matches_chain"] = record["reported_date"] == record["date"]
                    event_price = _number(price.get(record["date"]))
                    record["price_usd"] = float(event_price) if event_price and event_price > 0 else None
                    record["usd"] = float(Decimal(record["exact_tokens"]) * event_price) if event_price and event_price > 0 else None
                    record["note"] = "只计本笔native transfer；Pioneer补偿统计不再次相加。美元值不是购买成本。"
            except (ValueError, TypeError, OverflowError, OSError) as error:
                record.update(status="unverified", verification_error=str(error))
        records.append(record)
    records.sort(key=lambda record: (record.get("date") or record.get("reported_date") or "9999", str(record.get("rank"))))
    history = {}
    for record in records:
        if record["status"] == "verified" and record.get("usd") is not None:
            history[record["date"]] = history.get(record["date"], 0.0) + record["usd"]
    supply = raw.get(SUPPLY_KEY) if isinstance(raw.get(SUPPLY_KEY), dict) else {}
    bc, bsc = _number(supply.get("bcSupply")), _number(supply.get("bscSupply"))
    supply_observation = {"tokens": float(bc + bsc) if bc is not None and bsc is not None else None,
                          "beacon_tokens": float(bc) if bc is not None else None,
                          "bsc_tokens": float(bsc) if bsc is not None else None,
                          "evidence": "indexed_native_supply_snapshot", "snapshot_only": True,
                          "source_key": SUPPLY_KEY, **metadata.get(SUPPLY_KEY, {}),
                          "note": "官方链接的跟踪器供应快照，不是独立全链审计；不替换行情估值分母或推算历史供应。"}
    realtime = raw.get(REALTIME_KEY) if isinstance(raw.get(REALTIME_KEY), dict) else {}
    valid_realtime = realtime.get("success") is True
    latest = []
    for row in realtime.get("recentBurnData", []) if isinstance(realtime.get("recentBurnData"), list) else []:
        timestamp = row.get("timestamp") if isinstance(row, dict) else None
        if isinstance(timestamp, (int, float)) and not isinstance(timestamp, bool) and math.isfinite(timestamp):
            try:
                latest.append(dt.datetime.fromtimestamp(timestamp, UTC).isoformat())
            except (ValueError, OverflowError, OSError):
                pass
    total = _number(realtime.get("totalBurnt")) if valid_realtime else None
    last7 = _number(realtime.get("last7DaysBurnt")) if valid_realtime else None
    realtime_observation = {"last7_days_tokens": float(last7) if last7 is not None else None,
                            "cumulative_tokens": float(total) if total is not None else None,
                            "latest_block_at": max(latest) if latest else None,
                            "source_key": REALTIME_KEY, **metadata.get(REALTIME_KEY, {}),
                            "period": "provider_rolling_7_days", "historical_daily_available": False,
                            "included_in_quarterly_windows": False,
                            "note": "抓取时点的滚动7日及累计摘要；不是固定UTC日序列，不能摊成每日或与季度统计直接混加。"}
    for record in records:
        record["verified"] = record["status"] == "verified"
        record["source_url"] = TRACKER + "/api/getQuarterBurns"
        record["tx_url"] = record.get("transaction_url") or record.get("reported_transaction_url")
        record["usd_basis"] = "executed_native_tokens_times_same_utc_date_price; not_cash_cost"
    sources = [_source(key, url, "burns" if key in [QUARTERS_KEY, BREAKDOWN_KEY] else "supply" if key == SUPPLY_KEY else "gas_burn", metadata)
               for key, url in jobs()]
    for key in [TRANSACTIONS_KEY, BLOCKS_KEY]:
        if key in raw or key in metadata:
            sources.append(_source(key, RPC_URL, "burn_proof", metadata))
    windows = {str(days): quarterly_window(records, cutoff, days, price) for days in [7, 30, 90, 365]}
    limitations = [
        "季度Auto-Burn独立于Binance CEX收入；无法由销毁估值反推交易所收入、利润或实际现金回购。",
        "只有successful receipt、dead地址、chainId和block一致的BSC native转账进入已核季度统计。",
        "旧Ethereum/Beacon季度记录未核；当前BNBBurn预测行、错误日期和Pioneer统计不得重复当已执行量。",
        "BEP-95只取得当前滚动7日及累计摘要，完整历史日序列缺失；季度和Gas两项不做完整合计。",
        "跟踪器不同摘要口径存在差异；供应与销毁拆分不自动对平初始2亿，需独立复核。",
        "历史价格缺失时不使用当前价格代替，净流通变化仍缺完整供应快照。",
    ]
    return {"charts": {"fees": {}, "revenue": {}, "holders": {}},
            "burn_history": history, "burn_records": records, "quarterly_records": records,
            "burn_windows": windows, "quarterly_windows": windows,
            "supply_observation": supply_observation, "onchain_supply": None,
            "realtime_observation": realtime_observation, "data_sources": sources,
            "complete_total_burn_history": False, "cutoff_utc": cutoff.isoformat(),
            "income_linked": False, "mode": "reserve_and_gas_burn", "limitations": limitations}


# Explicit alias for callers using the longer research-oriented name.
compile_bnb_data = compile_bnb


def bnb_rpc_jobs(responses, cutoff=None):
    return rpc_jobs(responses, cutoff or dt.datetime.now(UTC).date(), stage="transactions")


def bnb_block_jobs(responses, cutoff=None):
    return rpc_jobs(responses, cutoff or dt.datetime.now(UTC).date(), stage="blocks")


bnb_jobs = jobs
