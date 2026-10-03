"""BNB chain fees and burns, kept separate from corporate income/repurchases.

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
RPC_URLS = (RPC_URL, "https://bsc-dataseed1.bnbchain.org", "https://bsc-dataseed2.bnbchain.org")
ETH_RPC_URL = "https://eth-mainnet.public.blastapi.io"
ETH_RPC_URLS = (ETH_RPC_URL, "https://eth.drpc.org", "https://cloudflare-eth.com")
ETH_BNB_CONTRACT = "0xb8c77482e45f1f44de1745f52c74426c631bdd52"
# keccak256("Burn(address,uint256)"); this ERC20 Burn reduces totalSupply.
ETH_BURN_TOPIC = "0xcc16f5dbb4873280815c1ee09dbd06736cffcc184412cf7a71a0fdb75d397ca5"
ETH_BURN_SELECTOR = "0x42966c68"
ETH_CONTRACT_SOURCE = "https://etherscan.io/address/" + ETH_BNB_CONTRACT + "#code"
BEACON_EXPLORER = "https://explorer.bnbchain.org"
BEACON_API = BEACON_EXPLORER + "/api/v1/tx?txHash="
DEAD_ADDRESS = "0x000000000000000000000000000000000000dead"
QUARTERS_KEY = "bnb-quarter-burns"
SUPPLY_KEY = "bnb-supply"
REALTIME_KEY = "bnb-realtime-burn-info"
BREAKDOWN_KEY = "bnb-burn-breakdown"
TRANSACTIONS_KEY = "rpc-bnb-burn-transactions"
BLOCKS_KEY = "rpc-bnb-burn-blocks"
ETH_TRANSACTIONS_KEY = "rpc-bnb-ethereum-transactions"
ETH_BLOCKS_KEY = "rpc-bnb-ethereum-blocks"
BEACON_TRANSACTION_PREFIX = "bnb-beacon-transaction-"
FEES_KEY = "bnb-bsc-fees"
GAS_ESTIMATE_KEY = "bnb-bsc-chain-revenue-estimate"
CURRENT_BLOCK_KEY = "bnb-current-block"
VALIDATOR_PARAMETERS_KEY = "bnb-validator-parameters"
LLAMA_FEES_URL = "https://api.llama.fi/summary/fees/bsc?dataType=dailyFees"
LLAMA_GAS_ESTIMATE_URL = "https://api.llama.fi/summary/fees/bsc?dataType=dailyRevenue"
LLAMA_ADAPTER_URL = "https://github.com/DefiLlama/dimension-adapters/blob/master/fees/bsc.ts"
VALIDATOR_SET = "0x0000000000000000000000000000000000001000"
VALIDATOR_SOURCE_URL = "https://github.com/bnb-chain/bsc-genesis-contract/blob/master/contracts/BSCValidatorSet.sol"
BEP95_START = dt.date(2021, 11, 30)
GAS_ESTIMATE_METHODOLOGY = "Amount of 10% BNB transaction fees that were burned"
# Ethereum Keccak-256 selectors of the public uint256 getters in BSCValidatorSet.
BURN_RATIO_SELECTOR = "0x5192c82c"
RATIO_SCALE_SELECTOR = "0x820dcaa8"
HASH = re.compile(r"^0x[0-9a-fA-F]{64}$")
BSC_EXPLORERS = {"bscscan.com", "www.bscscan.com", "bsctrace.com", "www.bsctrace.com"}
ETH_EXPLORERS = {"etherscan.io", "www.etherscan.io"}
BEACON_EXPLORERS = {"explorer.binance.org", "explorer.bnbchain.org"}


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


def _abi_uint(value):
    if not isinstance(value, str) or not re.fullmatch(r"0x[0-9a-fA-F]{64}", value):
        raise ValueError("invalid_abi_uint256")
    return int(value, 16)


def _hash(value):
    return value.lower() if isinstance(value, str) and HASH.fullmatch(value) else None


def _transaction_reference(link):
    if not isinstance(link, str):
        return None, None
    parsed = urlparse(link)
    if parsed.scheme != "https":
        return None, None
    parts = parsed.path.strip("/").split("/")
    if len(parts) != 2 or parts[0] != "tx":
        return None, None
    if parsed.hostname in BSC_EXPLORERS:
        return "bsc", _hash(parts[1])
    if parsed.hostname in ETH_EXPLORERS:
        return "ethereum", _hash(parts[1])
    if parsed.hostname in BEACON_EXPLORERS and re.fullmatch(r"[0-9a-fA-F]{64}", parts[1]):
        return "beacon", "0x" + parts[1].lower()
    return None, None


def _transaction_hash(link):
    # Existing BSC callers deliberately remain BSC-only.
    chain, tx_hash = _transaction_reference(link)
    return tx_hash if chain == "bsc" else None


def beacon_jobs(raw, cutoff=None):
    """Official explorer JSON, a chain index observation rather than raw RPC proof."""
    if cutoff is not None:
        _date(cutoff)
    hashes = sorted({tx_hash for row in _quarters(raw) if isinstance(row, dict) and row.get("burnDate")
                     for chain, tx_hash in [_transaction_reference(row.get("txLink"))]
                     if chain == "beacon" and tx_hash})
    return [(BEACON_TRANSACTION_PREFIX + value[2:], BEACON_API + value[2:].upper()) for value in hashes]


def proof_keys(raw=None):
    return [TRANSACTIONS_KEY, BLOCKS_KEY, ETH_TRANSACTIONS_KEY, ETH_BLOCKS_KEY,
            VALIDATOR_PARAMETERS_KEY] + [job[0] for job in beacon_jobs(raw or {})]


def rpc_endpoints(key):
    """Ordered public fallbacks; refresh owns requests, validation and archiving."""
    if key in [ETH_TRANSACTIONS_KEY, ETH_BLOCKS_KEY]:
        return list(ETH_RPC_URLS)
    if key in [TRANSACTIONS_KEY, BLOCKS_KEY, CURRENT_BLOCK_KEY, VALIDATOR_PARAMETERS_KEY]:
        return list(RPC_URLS)
    return []


def valid_rpc_response(key, response, payload):
    """An HTTP 200 with errors/null/missing/duplicate ids is not a healthy RPC."""
    results = _batch_results(response)
    if not isinstance(payload, list) or not payload:
        return False
    if any(results.get(request.get("id")) is None for request in payload):
        return False
    if key in [ETH_TRANSACTIONS_KEY, ETH_BLOCKS_KEY, CURRENT_BLOCK_KEY]:
        try:
            return _hex(results.get("chain-id")) == (1 if key.startswith("rpc-bnb-ethereum") else 56)
        except (ValueError, TypeError):
            return False
    return True


def valid_history_response(key, response, previous=None):
    """Only complete history/index proofs may replace or become final cache entries."""
    if key.startswith(BEACON_TRANSACTION_PREFIX):
        try:
            tx_hash = "0x" + key[len(BEACON_TRANSACTION_PREFIX):]
            if not _hash(tx_hash):
                return False
            _indexed_beacon_burn(tx_hash, {key: response})
            return True
        except (ValueError, TypeError, InvalidOperation, OverflowError, OSError):
            return False
    if key != QUARTERS_KEY:
        return True
    def executed_ranks(data):
        rows = _quarters({QUARTERS_KEY: data})
        if not rows:
            return None
        ranks, executed = set(), set()
        for row in rows:
            if not isinstance(row, dict):
                return None
            rank = row.get("rank")
            if isinstance(rank, bool) or not isinstance(rank, int) or rank <= 0 or rank in ranks:
                return None
            ranks.add(rank)
            if not row.get("burnDate"):
                continue
            try:
                _date(row["burnDate"])
            except (ValueError, TypeError):
                return None
            if not _transaction_reference(row.get("txLink"))[1] or _number(row.get("amount")) is None:
                return None
            executed.add(rank)
        return executed or None
    current, old = executed_ranks(response), executed_ranks(previous)
    return current is not None and (old is None or old.issubset(current))


def jobs():
    """Discovered/documented public sources; no embedded website credentials."""
    return [
        (QUARTERS_KEY, TRACKER + "/api/getQuarterBurns"),
        (SUPPLY_KEY, TRACKER + "/api/getBnbSupply"),
        (REALTIME_KEY, TRACKER + "/api/getRealTimeBurnInfo"),
        (BREAKDOWN_KEY, TRACKER + "/api/getBurnBreakdown"),
        (FEES_KEY, LLAMA_FEES_URL),
        (GAS_ESTIMATE_KEY, LLAMA_GAS_ESTIMATE_URL),
        (CURRENT_BLOCK_KEY, RPC_URL, [
            {"jsonrpc": "2.0", "id": "current-block", "method": "eth_getBlockByNumber", "params": ["latest", False]},
            {"jsonrpc": "2.0", "id": "chain-id", "method": "eth_chainId", "params": []},
        ]),
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
    Ethereum burns are proved from the original ERC20 Burn event. Beacon data
    uses a separate official explorer adapter. Projected rows are never fetched.
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
        ethereum_hashes = sorted({value for row in _quarters(raw) if isinstance(row, dict) and row.get("burnDate")
                                  for chain, value in [_transaction_reference(row.get("txLink"))]
                                  if chain == "ethereum" and value})
        ethereum_payload = [{"jsonrpc": "2.0", "id": "chain-id", "method": "eth_chainId", "params": []}] + [
            {"jsonrpc": "2.0", "id": prefix + tx_hash, "method": method, "params": [tx_hash]}
            for tx_hash in ethereum_hashes for prefix, method in [
                ("tx-", "eth_getTransactionByHash"), ("receipt-", "eth_getTransactionReceipt")]]
        return ([(TRANSACTIONS_KEY, RPC_URL, payload)] if payload else []) + \
            ([(ETH_TRANSACTIONS_KEY, ETH_RPC_URL, ethereum_payload)] if ethereum_hashes else []) + parameter_jobs(raw)
    if stage == "blocks":
        proofs = _batch_results(raw.get(TRANSACTIONS_KEY))
        hashes = sorted({_hash(value.get("blockHash")) for key, value in proofs.items()
                         if key.startswith("tx-") and isinstance(value, dict)} - {None})
        payload = [{"jsonrpc": "2.0", "id": "block-" + block_hash,
                    "method": "eth_getBlockByHash", "params": [block_hash, False]}
                   for block_hash in hashes]
        ethereum_proofs = _batch_results(raw.get(ETH_TRANSACTIONS_KEY))
        ethereum_hashes = sorted({_hash(value.get("blockHash")) for key, value in ethereum_proofs.items()
                                  if key.startswith("tx-") and isinstance(value, dict)} - {None})
        ethereum_payload = [{"jsonrpc": "2.0", "id": "chain-id", "method": "eth_chainId", "params": []}] + [
            {"jsonrpc": "2.0", "id": "block-" + block_hash, "method": "eth_getBlockByHash",
             "params": [block_hash, False]} for block_hash in ethereum_hashes]
        return ([(BLOCKS_KEY, RPC_URL, payload)] if payload else []) + \
            ([(ETH_BLOCKS_KEY, ETH_RPC_URL, ethereum_payload)] if ethereum_hashes else [])
    raise ValueError("BNB RPC stage must be transactions or blocks")


def _current_block(raw):
    observation = _batch_results(raw.get(CURRENT_BLOCK_KEY))
    block = observation.get("current-block")
    try:
        if _hex(observation.get("chain-id")) != 56 or not isinstance(block, dict):
            return None
        if not _hash(block.get("hash")):
            return None
        _hex(block.get("number"))
        _hex(block.get("timestamp"))
        return block
    except (ValueError, TypeError):
        return None


def parameter_jobs(raw):
    """Pin both getters to the observed BSC block, never mix latest states."""
    block = _current_block(raw)
    if not block:
        return []
    number = block["number"]
    payload = [{"jsonrpc": "2.0", "id": prefix + number, "method": "eth_call",
                "params": [{"to": VALIDATOR_SET, "data": selector}, number]}
               for prefix, selector in [("burn-ratio-", BURN_RATIO_SELECTOR), ("ratio-scale-", RATIO_SCALE_SELECTOR)]]
    return [(VALIDATOR_PARAMETERS_KEY, RPC_URL, payload)]


def _policy_observation(raw, metadata):
    result = {"ratio": None, "burn_ratio": None, "ratio_scale": None,
              "evidence": "unavailable", "snapshot_only": True,
              "source_key": VALIDATOR_PARAMETERS_KEY, "contract": VALIDATOR_SET,
              "contract_source_url": VALIDATOR_SOURCE_URL, **metadata.get(VALIDATOR_PARAMETERS_KEY, {}),
              "note": "只核本区块的治理参数，不能证明整个历史观察窗口比例一直相同。"}
    block = _current_block(raw)
    if not block:
        return result
    proof = _batch_results(raw.get(VALIDATOR_PARAMETERS_KEY))
    number = block["number"]
    try:
        ratio = _abi_uint(proof.get("burn-ratio-" + number))
        scale = _abi_uint(proof.get("ratio-scale-" + number))
        if scale <= 0 or ratio > scale:
            return result
        timestamp = _hex(block["timestamp"])
        result.update(ratio=ratio / scale, burn_ratio=ratio, ratio_scale=scale,
                      block_number=_hex(number), block_hash=block["hash"],
                      observed_at=dt.datetime.fromtimestamp(timestamp, UTC).isoformat(),
                      evidence="pinned_block_eth_call")
    except (ValueError, TypeError, OverflowError, OSError):
        pass
    return result


def _daily_series(response, cutoff):
    """Only valid USD UTC-day rows; conflicting duplicate days become missing."""
    if not isinstance(response, dict) or response.get("id") != "chain#bsc" or response.get("category") != "Chain":
        return {}, {"source": "unexpected_protocol_or_scope"}
    rows = response.get("totalDataChart")
    if not isinstance(rows, list):
        return {}, {"source": "missing_daily_chart"}
    values, issues = {}, {}
    for row in rows:
        if not isinstance(row, list) or len(row) != 2:
            continue
        timestamp, amount = row
        if isinstance(timestamp, bool) or not isinstance(timestamp, (int, float)) or not math.isfinite(timestamp):
            continue
        if int(timestamp) != timestamp or timestamp % 86400:
            continue
        if isinstance(amount, bool) or not isinstance(amount, (int, float)):
            continue
        numeric = _number(amount)
        if numeric is None:
            continue
        try:
            day = dt.datetime.fromtimestamp(timestamp, UTC).date()
        except (ValueError, OverflowError, OSError):
            continue
        if day > cutoff:
            continue
        date = day.isoformat()
        if date in issues:
            continue
        if date in values and values[date] != float(numeric):
            values.pop(date)
            issues[date] = "conflicting_duplicate_day"
        else:
            values[date] = float(numeric)
    return values, issues


def daily_window(history, end, days, *, evidence, label, source_key):
    """Observed daily USD values only; gaps never become zero or annualized."""
    end = _date(end)
    if isinstance(days, bool) or not isinstance(days, int) or days <= 0:
        raise ValueError("days must be a positive integer")
    start = end - dt.timedelta(days=days - 1)
    dates = [(start + dt.timedelta(days=offset)).isoformat() for offset in range(days)]
    present = {date: history[date] for date in dates if _number(history.get(date)) is not None}
    missing = [date for date in dates if date not in present]
    observed = float(sum((Decimal(str(value)) for value in present.values()), Decimal(0)))
    return {"start": start.isoformat(), "end": end.isoformat(), "days": days,
            "expected_days": days, "covered_days": len(present), "missing_dates": missing,
            "usd": observed if not missing else None, "observed_usd": observed if present else None,
            "complete": not missing, "tokens": None, "actual_burn_verified": False,
            "cash_buyback_usd": None, "evidence": evidence, "label": label, "source_key": source_key}


def _chain_histories(raw, cutoff):
    fee_response = raw.get(FEES_KEY)
    fees, fee_issues = _daily_series(fee_response, cutoff)
    fee_methods = fee_response.get("methodology") if isinstance(fee_response, dict) else None
    if not isinstance(fee_methods, dict) or fee_methods.get("Fees") != "Transaction fees paid by users":
        fees, fee_issues = {}, {"source": "fee_methodology_changed_or_missing"}
    gas_response = raw.get(GAS_ESTIMATE_KEY)
    estimate, gas_issues = _daily_series(gas_response, cutoff)
    gas_methods = gas_response.get("methodology") if isinstance(gas_response, dict) else None
    if not isinstance(gas_methods, dict) or gas_methods.get("Revenue") != GAS_ESTIMATE_METHODOLOGY:
        estimate, gas_issues = {}, {"source": "gas_model_methodology_changed_or_missing"}
    retained = {}
    for date, amount in estimate.items():
        # Provider has pre-BEP95 zeros. They are policy-model zeros, not burn events.
        if _date(date) < BEP95_START:
            continue
        if date not in fees:
            gas_issues[date] = "matching_fee_observation_missing"
            continue
        # API USD charts are rounded integers; allow their independent rounding.
        if abs(amount - fees[date] * 0.1) > 1.0:
            gas_issues[date] = "provider_ten_percent_model_does_not_reconcile"
            continue
        retained[date] = amount
    return fees, retained, {"fees": fee_issues, "gas_burn_estimate": gas_issues}


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


def _verified_erc20_burn(tx_hash, proofs, blocks):
    """Original Ethereum BNB burn(), never an ETH transfer or migration scan."""
    if _hex(proofs.get("chain-id")) != 1 or _hex(blocks.get("chain-id")) != 1:
        raise ValueError("wrong_ethereum_chain")
    tx, receipt = proofs.get("tx-" + tx_hash), proofs.get("receipt-" + tx_hash)
    if not isinstance(tx, dict) or not isinstance(receipt, dict):
        raise ValueError("transaction_or_receipt_missing")
    if _hash(tx.get("hash")) != tx_hash or _hash(receipt.get("transactionHash")) != tx_hash:
        raise ValueError("transaction_hash_mismatch")
    if _hex(receipt.get("status")) != 1:
        raise ValueError("transaction_not_successful")
    if tx.get("chainId") is not None and _hex(tx["chainId"]) != 1:
        raise ValueError("wrong_ethereum_chain")
    if not all(isinstance(item.get("to"), str) and item["to"].lower() == ETH_BNB_CONTRACT
               for item in [tx, receipt]):
        raise ValueError("wrong_bnb_erc20_contract")
    block_hash = _hash(tx.get("blockHash"))
    if not block_hash or _hash(receipt.get("blockHash")) != block_hash:
        raise ValueError("receipt_block_mismatch")
    block = blocks.get("block-" + block_hash)
    if not isinstance(block, dict) or _hash(block.get("hash")) != block_hash:
        raise ValueError("block_missing_or_mismatched")
    number = _hex(tx.get("blockNumber"))
    if number != _hex(receipt.get("blockNumber")) or number != _hex(block.get("number")):
        raise ValueError("block_number_mismatch")
    calldata = tx.get("input")
    if not isinstance(calldata, str) or not re.fullmatch(ETH_BURN_SELECTOR + r"[0-9a-fA-F]{64}", calldata):
        raise ValueError("transaction_not_bnb_burn_call")
    units = _abi_uint("0x" + calldata[10:])
    sender = tx.get("from")
    if not isinstance(sender, str) or not re.fullmatch(r"0x[0-9a-fA-F]{40}", sender):
        raise ValueError("burn_sender_missing")
    indexed_sender = "0x" + "0" * 24 + sender[2:].lower()
    logs = receipt.get("logs")
    if not isinstance(logs, list):
        raise ValueError("burn_log_missing")
    burns = [log for log in logs if isinstance(log, dict)
             and isinstance(log.get("address"), str) and log["address"].lower() == ETH_BNB_CONTRACT
             and isinstance(log.get("topics"), list) and log["topics"]
             and log["topics"][0] == ETH_BURN_TOPIC]
    if len(burns) != 1:
        raise ValueError("burn_log_missing_or_ambiguous")
    log = burns[0]
    if log.get("removed") is not False or log.get("topics") != [ETH_BURN_TOPIC, indexed_sender]:
        raise ValueError("burn_log_invalid_or_removed")
    if _hash(log.get("transactionHash")) != tx_hash or _hash(log.get("blockHash")) != block_hash \
            or _hex(log.get("blockNumber")) != number:
        raise ValueError("burn_log_block_or_transaction_mismatch")
    if units <= 0 or _abi_uint(log.get("data")) != units:
        raise ValueError("burn_amount_mismatch_or_zero")
    timestamp = _hex(block.get("timestamp"))
    when = dt.datetime.fromtimestamp(timestamp, UTC)
    # The quarterly ERC20 era ended before the April 2019 mainnet migration.
    # Burn events after this date can reduce ERC20 supply due to swaps and must
    # not be counted as additional economic quarterly destruction.
    if when.date() > dt.date(2019, 4, 18):
        raise ValueError("erc20_migration_or_post_quarterly_era")
    tokens = Decimal(units) / Decimal(10) ** 18
    return {"transaction_hash": tx_hash, "transaction_url": "https://etherscan.io/tx/" + tx_hash,
            "block_hash": block_hash, "block_number": number, "timestamp": timestamp,
            "utc_time": when.isoformat(), "date": when.date().isoformat(),
            "contract": ETH_BNB_CONTRACT, "sender": sender.lower(), "raw_token_units": str(units),
            "exact_tokens": str(tokens), "tokens": float(tokens),
            "evidence": "successful_original_bnb_erc20_burn_event", "chain": "ethereum",
            "contract_source_url": ETH_CONTRACT_SOURCE}


def _indexed_beacon_burn(tx_hash, raw):
    """Validate the official explorer's decoded record, without claiming RPC proof."""
    source_key = BEACON_TRANSACTION_PREFIX + tx_hash[2:]
    observation = raw.get(source_key)
    if not isinstance(observation, dict):
        raise ValueError("beacon_explorer_observation_missing")
    hash_value = observation.get("txHash")
    if not isinstance(hash_value, str) or "0x" + hash_value.lower() != tx_hash:
        raise ValueError("beacon_transaction_hash_mismatch")
    if isinstance(observation.get("code"), bool) or observation.get("code") != 0:
        raise ValueError("beacon_transaction_not_successful")
    if observation.get("txType") != "BURN_TOKEN" or observation.get("txAsset") != "BNB":
        raise ValueError("beacon_not_native_bnb_burn")
    if observation.get("hasChildren") not in [False, 0]:
        raise ValueError("beacon_aggregate_transaction_unsupported")
    amount = _number(observation.get("value"))
    height, millis = observation.get("blockHeight"), observation.get("timeStamp")
    if amount is None or amount <= 0 or amount > Decimal(200000000) or amount != amount.quantize(Decimal("0.00000001")):
        raise ValueError("beacon_burn_amount_invalid")
    if any(isinstance(value, bool) or not isinstance(value, int) or value <= 0 for value in [height, millis]):
        raise ValueError("beacon_block_or_time_missing")
    when = dt.datetime.fromtimestamp(millis / 1000, UTC)
    return {"indexed_tokens": float(amount), "indexed_exact_tokens": str(amount),
            "indexed_date": when.date().isoformat(), "indexed_utc_time": when.isoformat(),
            "indexed_block_number": height, "indexed_source_key": source_key,
            "indexed_transaction_url": BEACON_EXPLORER + "/tx/" + tx_hash[2:].upper(),
            "evidence": "indexed_beacon_burn_transaction", "chain": "beacon",
            "status": "indexed_verified",
            "note": "官方链浏览器确认成功的BNB Burn交易；未取得原始Beacon RPC证明，不计独立链核合计。"}


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
            **metadata.get(key, {}),
            "role": "rpc_proof" if key.startswith("rpc-") or key in [CURRENT_BLOCK_KEY, VALIDATOR_PARAMETERS_KEY]
            else "public_analytics_indexer" if key in [FEES_KEY, GAS_ESTIMATE_KEY] else "official_linked_indexer"}


def compile_bnb(raw, cutoff, price, metadata=None):
    """Pure compiler for archived tracker/RPC bytes and same-date USD prices."""
    cutoff = _date(cutoff)
    metadata = metadata or {}
    price = price or {}
    fees, gas_estimate, chain_issues = _chain_histories(raw, cutoff)
    gas_windows = {str(days): daily_window(gas_estimate, cutoff, days,
                  evidence="provider_policy_estimate", label="BSC Gas销毁估算（供应商按链手续费10%推算）",
                  source_key=GAS_ESTIMATE_KEY) for days in [7, 30, 90, 365]}
    fee_windows = {str(days): daily_window(fees, cutoff, days,
                  evidence="indexed_transaction_gas_fees", label="BSC链手续费（不含Binance企业收入）",
                  source_key=FEES_KEY) for days in [7, 30, 90, 365]}
    for gas_window in gas_windows.values():
        gas_window.update(assumed_ratio=0.1, fee_scope="BSC native transaction gas only",
                          usd_basis="provider_daily_usd_valuation_of_ten_percent_gas_fee_model",
                          note="按供应商固定10%模型估算，未逐笔核验feeBurned事件；不与季度销毁冒充完整实际合计。")
    policy = _policy_observation(raw, metadata)
    policy["matches_provider_assumption"] = policy["ratio"] == 0.1 if policy["ratio"] is not None else None
    proofs = _batch_results(raw.get(TRANSACTIONS_KEY))
    blocks = _batch_results(raw.get(BLOCKS_KEY))
    ethereum_proofs = _batch_results(raw.get(ETH_TRANSACTIONS_KEY))
    ethereum_blocks = _batch_results(raw.get(ETH_BLOCKS_KEY))
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
        chain, tx_hash = _transaction_reference(row["txLink"])
        record["chain"] = chain
        record["transaction_hash"] = tx_hash
        if not tx_hash:
            record.update(status="unverified_legacy", note="未识别支持的链浏览器交易链接；保留已公布数量。")
        elif tx_hash in seen:
            # One economic transfer stays one record regardless of duplicate ranks.
            continue
        else:
            seen.add(tx_hash)
            try:
                if chain == "beacon":
                    record.update(_indexed_beacon_burn(tx_hash, raw))
                    record["proof_source_keys"] = [record["indexed_source_key"]]
                    if _date(record["indexed_date"]) > cutoff:
                        record.update(status="after_cutoff", note="索引交易发生在完整UTC日截止之后，不计本次窗口。")
                    records.append(record)
                    continue
                if chain == "ethereum":
                    record.update(_verified_erc20_burn(tx_hash, ethereum_proofs, ethereum_blocks))
                    record["proof_source_keys"] = [ETH_TRANSACTIONS_KEY, ETH_BLOCKS_KEY]
                else:
                    record.update(_verified_transfer(tx_hash, proofs, blocks))
                    record["proof_source_keys"] = [TRANSACTIONS_KEY, BLOCKS_KEY]
                if _date(record["date"]) > cutoff:
                    record.update(status="after_cutoff", note="交易发生在完整UTC日截止之后，不计本次窗口。")
                else:
                    record["status"] = "verified"
                    record["reported_date_matches_chain"] = record["reported_date"] == record["date"]
                    event_price = _number(price.get(record["date"]))
                    record["price_usd"] = float(event_price) if event_price and event_price > 0 else None
                    record["usd"] = float(Decimal(record["exact_tokens"]) * event_price) if event_price and event_price > 0 else None
                    record["note"] = ("只计原BNB合约burn()成功事件；跨链迁移销毁不纳入季度记录。美元值不是购买成本。"
                                      if chain == "ethereum" else "只计本笔native transfer；Pioneer补偿统计不再次相加。美元值不是购买成本。")
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
        record["tx_url"] = record.get("transaction_url") or record.get("indexed_transaction_url") or record.get("reported_transaction_url")
        record["usd_basis"] = "executed_bnb_tokens_times_same_utc_date_price; not_cash_cost"
    kinds = {QUARTERS_KEY: "burns", BREAKDOWN_KEY: "burns", SUPPLY_KEY: "supply",
             REALTIME_KEY: "gas_burn_snapshot", FEES_KEY: "chain_fees",
             GAS_ESTIMATE_KEY: "gas_burn_policy_estimate", CURRENT_BLOCK_KEY: "policy_block"}
    sources = [_source(job[0], job[1], kinds[job[0]], metadata) for job in jobs()]
    for key in [TRANSACTIONS_KEY, BLOCKS_KEY, ETH_TRANSACTIONS_KEY, ETH_BLOCKS_KEY, VALIDATOR_PARAMETERS_KEY]:
        if key in raw or key in metadata:
            sources.append(_source(key, ETH_RPC_URL if key in [ETH_TRANSACTIONS_KEY, ETH_BLOCKS_KEY] else RPC_URL,
                                   "gas_burn_policy" if key == VALIDATOR_PARAMETERS_KEY else "burn_proof", metadata))
    for key, url in beacon_jobs(raw):
        if key in raw or key in metadata:
            sources.append({**_source(key, url, "burn_proof", metadata), "role": "official_explorer_indexer",
                            "evidence": "indexed_beacon_burn_transaction", "independent_rpc_verified": False})
    for source in sources:
        if source["source_key"] == FEES_KEY:
            source.update(methodology_url=LLAMA_ADAPTER_URL, evidence="indexed_transaction_gas_fees",
                          scope="BSC native transaction gas only")
        elif source["source_key"] == GAS_ESTIMATE_KEY:
            source.update(methodology_url=LLAMA_ADAPTER_URL, evidence="provider_policy_estimate", assumed_ratio=0.1)
    windows = {str(days): quarterly_window(records, cutoff, days, price) for days in [7, 30, 90, 365]}
    limitations = [
        "季度Auto-Burn独立于Binance CEX收入；无法由销毁估值反推交易所收入、利润或实际现金回购。",
        "BSC须successful receipt、dead地址、chainId和block一致；Ethereum须原BNB合约burn()及Burn事件、回执和区块一致。",
        "Beacon仅取得官方链浏览器交易索引；原始RPC证明未取得，不并入独立链核合计。预测行及Pioneer不得重复当已执行量。",
        "BSC链手续费来自交易Gas索引；只覆盖BSC，不含Binance企业收入、opBNB或Greenfield费用。",
        "Gas日销毁美元值为供应商按链手续费10%推算；本区块RPC参数观测不证明整个历史窗口都采用该比例。",
        "实际BEP-95只取得滚动7日及累计摘要，缺逐日feeBurned事件核验；季度与Gas模型不做完整实际合计。",
        "跟踪器不同摘要口径存在差异；供应与销毁拆分不自动对平初始2亿，需独立复核。",
        "历史价格缺失时不使用当前价格代替，净流通变化仍缺完整供应快照。",
    ]
    executed = [record for record in records if record.get("reported_date") and record.get("reported_transaction_url")]
    verified = [record for record in executed if record.get("verified")]
    indexed = [record for record in executed if record.get("status") == "indexed_verified"]
    ranks = sorted({record["rank"] for record in executed if isinstance(record.get("rank"), int) and not isinstance(record["rank"], bool)})
    coverage = {"indexed_executed_records": len(executed), "independent_rpc_verified_records": len(verified),
                "official_explorer_confirmed_records": len(indexed), "projected_records": len(records) - len(executed),
                "earliest_reported_date": min((record["reported_date"] for record in executed), default=None),
                "latest_reported_date": max((record["reported_date"] for record in executed), default=None),
                "reported_ranks": ranks, "missing_reported_ranks": [rank for rank in range(1, max(ranks, default=0) + 1) if rank not in ranks],
                "by_chain": {chain: {"records": sum(record.get("chain") == chain for record in executed),
                                     "rpc_verified": sum(record.get("chain") == chain for record in verified),
                                     "explorer_confirmed": sum(record.get("chain") == chain for record in indexed)}
                             for chain in ["ethereum", "beacon", "bsc"]},
                "index_source_key": QUARTERS_KEY, "amounts_not_combined_across_evidence_levels": True}
    return {"charts": {"fees": fees, "revenue": {}, "holders": {}},
            "burn_history": history, "burn_records": records, "quarterly_records": records,
            "burn_windows": windows, "quarterly_windows": windows,
            "supply_observation": supply_observation, "onchain_supply": None,
            "realtime_observation": realtime_observation, "data_sources": sources,
            "chain_fee_history": fees, "chain_fee_windows": fee_windows,
            "gas_burn_estimate_history": gas_estimate, "gas_burn_estimate_windows": gas_windows,
            "gas_burn_policy_observation": policy, "chain_data_issues": chain_issues,
            "chain_data_coverage": {"fees_first_date": min(fees) if fees else None,
                                    "fees_last_date": max(fees) if fees else None,
                                    "fee_days": len(fees), "gas_estimate_first_date": min(gas_estimate) if gas_estimate else None,
                                    "gas_estimate_last_date": max(gas_estimate) if gas_estimate else None,
                                    "gas_estimate_days": len(gas_estimate), "actual_daily_gas_burn_verified": False},
            "quarterly_history_coverage": coverage, "complete_total_burn_history": False, "cutoff_utc": cutoff.isoformat(),
            "income_linked": False, "mode": "reserve_and_gas_burn", "limitations": limitations}


# Explicit alias for callers using the longer research-oriented name.
compile_bnb_data = compile_bnb


def bnb_rpc_jobs(responses, cutoff=None):
    return rpc_jobs(responses, cutoff or dt.datetime.now(UTC).date(), stage="transactions")


def bnb_block_jobs(responses, cutoff=None):
    return rpc_jobs(responses, cutoff or dt.datetime.now(UTC).date(), stage="blocks")


bnb_jobs = jobs
bnb_beacon_jobs = beacon_jobs
