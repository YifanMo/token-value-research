#!/usr/bin/env python3
"""Fetch public research sources, retain raw responses, and compile a local snapshot.

No exchange credentials. No trading. Missing observations are never zero-filled.
"""
import argparse
import concurrent.futures
import datetime as dt
from decimal import Decimal
from email.utils import parsedate_to_datetime
import hashlib
import json
import math
from pathlib import Path
import threading
import time
import urllib.error
import urllib.request
from urllib.parse import urlparse

try:
    from scripts.web_assets import generate_web_assets
    from scripts import bnb_data
except ModuleNotFoundError as error:
    if error.name != "scripts":
        raise
    # Direct execution (python scripts/refresh.py) starts with scripts/ on sys.path.
    from web_assets import generate_web_assets
    import bnb_data

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
UTC = dt.timezone.utc
BEIJING = dt.timezone(dt.timedelta(hours=8))
PROJECTS = {
    "HYPE": ("hyperliquid", "hyperliquid"),
    "PUMP": ("pump", "pump-fun"),
    "UNI": ("uniswap", "uniswap"),
    "JUP": ("jupiter", "jupiter-exchange-solana"),
    "RAY": ("raydium", "raydium"),
    "CAKE": ("pancakeswap", "pancakeswap-token"),
    "BNB": (None, "binancecoin"),
    "AAVE": ("aave", "aave"),
}
TYPES = {"fees": "dailyFees", "revenue": "dailyRevenue", "holders": "dailyHoldersRevenue"}
SUPPLEMENTAL_PRICE_KEY = "price-supplemental-llama"
SUPPLEMENTAL_PRICE_START = dt.date(2020, 1, 1)
SUPPLEMENTAL_PRICE_TOLERANCE_SECONDS = 3600
SUPPLEMENTAL_PRICE_CHUNK_DAYS = 70
SUPPLEMENTAL_PRICE_MAX_POINTS = 500
# Preserve the exact URLs of already archived historical requests when the
# project list grows. New coins use separate batches under the same point cap.
LEGACY_PRICE_COINS = ("hyperliquid", "pump-fun", "uniswap", "jupiter-exchange-solana", "raydium", "bitcoin", "solana")
PRICE_HISTORY_LIMIT_NOTE = "CoinGecko 免费历史接口限最近365天；更早日期仅使用已单独标明的 DeFiLlama 历史价格补充，缺日不插值。"


def completed_day_cutoff(as_of, now=None):
    """Use the last completed UTC day, capped by the Beijing research date.

    Before 08:00 Beijing time, yesterday's UTC day is still in progress.
    Historical --as-of dates retain their previous as_of - 1 convention.
    """
    now = now or dt.datetime.now(UTC)
    if now.tzinfo is None or now.utcoffset() is None:
        raise ValueError("刷新时间必须包含时区。")
    return min(as_of - dt.timedelta(days=1),
               now.astimezone(UTC).date() - dt.timedelta(days=1))


def load(path, default=None):
    return json.loads(path.read_text()) if path.exists() else default


def dump(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_text(json.dumps(data, ensure_ascii=False, indent=2, allow_nan=False) + "\n")
    temp.replace(path)


def retry_after_delay(value, now=None):
    """Bound a 429 Retry-After to 0..120 seconds; absent/invalid headers use 60."""
    delay = 60.0
    if value is not None:
        try:
            parsed = float(value)
            if math.isfinite(parsed):
                delay = parsed
        except (TypeError, ValueError):
            try:
                retry_at = parsedate_to_datetime(value)
                if retry_at.tzinfo is None:
                    retry_at = retry_at.replace(tzinfo=UTC)
                delay = (retry_at - (now or dt.datetime.now(UTC))).total_seconds()
            except (TypeError, ValueError, OverflowError):
                pass
    return max(0.0, min(120.0, delay))


class RequestGate:
    """One vendor queue shared by worker threads, including 429 cooldowns."""
    def __init__(self, gap=4.0):
        self.gap, self.next_allowed, self.lock = gap, 0.0, threading.Lock()

    def wait(self):
        with self.lock:
            delay = max(0.0, self.next_allowed - time.monotonic())
            if delay:
                time.sleep(delay)
            self.next_allowed = time.monotonic() + self.gap

    def defer(self, delay):
        with self.lock:
            self.next_allowed = max(self.next_allowed, time.monotonic() + delay)


COINGECKO_GATE = RequestGate()


def wait_for_vendor_slot(url):
    if urlparse(url).hostname == "api.coingecko.com":
        COINGECKO_GATE.wait()


def defer_vendor_requests(url, delay):
    if urlparse(url).hostname == "api.coingecko.com":
        COINGECKO_GATE.defer(delay)


def request(item):
    key, url, *post = item
    path = RAW / (key + ".json")
    payload = post[0] if post else None
    endpoints = list(dict.fromkeys([url, *bnb_data.rpc_endpoints(key)]))
    attempts = []
    try:
        body, used_url = None, None
        for candidate in endpoints:
            try:
                req = urllib.request.Request(candidate, data=json.dumps(payload).encode() if payload else None,
                                             headers={"User-Agent": "LocalTokenResearch/1.0", **({"Content-Type":"application/json"} if payload else {})})
                for attempt in range(2):
                    wait_for_vendor_slot(candidate)
                    try:
                        with urllib.request.urlopen(req, timeout=35) as response:
                            candidate_body = response.read()
                        break
                    except urllib.error.HTTPError as error:
                        if error.code != 429 or attempt == 1:
                            raise
                        delay = retry_after_delay(error.headers.get("Retry-After") if error.headers else None)
                        defer_vendor_requests(candidate, delay)
                        time.sleep(delay)
                data = json.loads(candidate_body)
                api_status = data.get("status") if isinstance(data, dict) else None
                if isinstance(data, dict) and (data.get("error") or isinstance(api_status, dict) and api_status.get("error_code")):
                    raise ValueError(str(data)[:200])
                if isinstance(data, list) and any(isinstance(row, dict) and row.get("error") for row in data):
                    raise ValueError("RPC batch contains failed results")
                if bnb_data.rpc_endpoints(key) and not bnb_data.valid_rpc_response(key, data, payload):
                    raise ValueError("RPC响应缺少完整结果或链标识不符")
                if not bnb_data.valid_history_response(key, data, load(path)):
                    raise ValueError("BNB历史响应不完整、交易尚未确认或缺少已有季度；保留上次成功记录")
                if key.startswith("llama-") and not isinstance(data.get("totalDataChart"), list):
                    raise ValueError("Missing totalDataChart; incompatible response")
                if key.startswith(SUPPLEMENTAL_PRICE_KEY) and not isinstance(data.get("coins"), dict):
                    raise ValueError("Missing coins; incompatible historical price response")
                body, used_url = candidate_body, candidate
                break
            except Exception as error:
                attempts.append({"url": candidate, "error": str(error), "attempted_at": dt.datetime.now(UTC).isoformat()})
        if body is None:
            raise ValueError(attempts[-1]["error"] if attempts else "未取得响应")
        temp = path.with_suffix(".json.tmp")
        temp.write_bytes(body)
        temp.replace(path)
        meta = {"url": used_url, "retrieved_at": dt.datetime.now(UTC).isoformat(),
                "sha256": hashlib.sha256(body).hexdigest(), "status": "fresh"}
        if used_url != url or attempts:
            meta.update(requested_url=url, fallback_used=used_url != url, request_attempts=attempts)
        if payload:
            meta["request"] = payload
        dump(RAW / (key + ".meta.json"), meta)
        return key, meta
    except Exception as error:
        previous = load(RAW / (key + ".meta.json"), {})
        return key, {**previous, "url": previous.get("url", url) if path.exists() else url,
                     "requested_url": url, "status": "cached" if path.exists() else "missing",
                     "refresh_error": str(error), "attempted_at": dt.datetime.now(UTC).isoformat(), "request_attempts": attempts}


def series(data, cutoff):
    result = {}
    for row in (data or {}).get("totalDataChart", []):
        if len(row) != 2 or not isinstance(row[1], (float, int)) or not math.isfinite(row[1]):
            continue
        date = dt.datetime.fromtimestamp(row[0], UTC).date()
        if date <= cutoff:
            # Daily timestamp; duplicates cannot silently double the same day.
            result[date.isoformat()] = float(row[1])
    return result


def normalize_fees(data, cutoff, rule):
    """Remove a documented duplicated child only when the parent reconciles.

    If the provider starts excluding the child itself, retain its parent total.
    An absent or incompatible breakdown makes that day's adjusted fee unknown.
    """
    raw = series(data, cutoff)
    expected_methods = rule.get("expected_fee_methodologies", {})
    actual_methods = {child.get("name"): (child.get("methodology") or {}).get("Fees") for child in (data or {}).get("childProtocols", [])}
    if any(actual_methods.get(name) != description for name, description in expected_methods.items()):
        return {}, {}, {}, {date: "methodology_changed" for date in raw}
    breakdown = {}
    for row in (data or {}).get("totalDataChartBreakdown", []):
        if not isinstance(row, list) or len(row) != 2 or not isinstance(row[0], (int, float)) or not math.isfinite(row[0]):
            continue
        date = dt.datetime.fromtimestamp(row[0], UTC).date()
        if date <= cutoff:
            breakdown[date.isoformat()] = row[1]
    adjusted, excluded, statuses, issues = {}, {}, {}, {}
    close = lambda a, b: abs(a - b) <= max(rule.get("tolerance_usd", 1e-6), abs(b) * 1e-10)
    for date, total in raw.items():
        if date < rule["valid_from"]:
            adjusted[date], excluded[date], statuses[date] = total, 0.0, "before_child_start"
            continue
        groups = breakdown.get(date)
        if not isinstance(groups, dict) or not groups:
            issues[date] = "missing_breakdown"
            continue
        amounts = [value for group in groups.values() if isinstance(group, dict) for value in group.values()]
        if any(not isinstance(group, dict) or not group for group in groups.values()) or any(
            isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or (value < 0 and not rule.get("allow_signed_components", False))
            for value in amounts
        ):
            issues[date] = "incompatible_breakdown"
            continue
        duplicate = groups.get(rule["chain"], {}).get(rule["child"])
        if duplicate is None:
            issues[date] = "missing_duplicate_child"
            continue
        if duplicate < 0:
            issues[date] = "negative_duplicate_child"
            continue
        if any(child not in groups[rule["chain"]] for child in rule.get("required_children", [])):
            issues[date] = "missing_required_child"
            continue
        child_total = sum(amounts)
        includes_child, excludes_child = close(total, child_total), close(total, child_total - duplicate)
        if duplicate > 0 and includes_child and excludes_child:
            issues[date] = "ambiguous_breakdown"
        elif includes_child and total >= duplicate:
            adjusted[date], excluded[date], statuses[date] = total - duplicate, duplicate, "removed_duplicate"
        elif excludes_child:
            adjusted[date], excluded[date], statuses[date] = total, 0.0, "provider_already_excluded"
        else:
            issues[date] = "parent_children_mismatch"
    return adjusted, excluded, statuses, issues


def composition(data, start, end, values, rule=None):
    """Describe source categories, not invented per-product cash distributions."""
    daily = {}
    for row in (data or {}).get("totalDataChartBreakdown", []):
        if not isinstance(row, list) or len(row) != 2 or not isinstance(row[0], (float, int)):
            continue
        date = dt.datetime.fromtimestamp(row[0], UTC).date().isoformat()
        if start <= date <= end:
            daily[date] = row[1]
    products, chains = {}, {}
    invalid, observed = [], 0
    for date, groups in sorted(daily.items()):
        if date not in values or not isinstance(groups, dict) or not groups:
            invalid.append(date)
            continue
        amounts = [(chain, product, value) for chain, group in groups.items() if isinstance(group, dict)
                   for product, value in group.items()]
        if any(not isinstance(group, dict) for group in groups.values()) or any(
            isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value)
            for _, _, value in amounts
        ):
            invalid.append(date)
            continue
        observed += 1
        for chain, product, value in amounts:
            if rule and chain == rule["chain"] and product == rule["child"]:
                continue
            products[product] = products.get(product, 0) + value
            chains[chain] = chains.get(chain, 0) + value
    required = (dt.date.fromisoformat(end) - dt.date.fromisoformat(start)).days + 1
    complete = observed == required
    total = sum(products.values()) if complete else None
    parent = sum(values[(dt.date.fromisoformat(start) + dt.timedelta(days=i)).isoformat()] for i in range(required)) if all(
        (dt.date.fromisoformat(start) + dt.timedelta(days=i)).isoformat() in values for i in range(required)
    ) else None
    return {"products": [{"label": name, "usd": value} for name, value in sorted(products.items(), key=lambda x: -x[1])],
            "chains": [{"label": name, "usd": value} for name, value in sorted(chains.items(), key=lambda x: -x[1])],
            "observed_days": observed, "days": required, "complete": complete,
            "sum_usd": total, "difference_from_total_usd": total - parent if total is not None and parent is not None else None,
            "invalid_dates": invalid, "note": "按API已列项目加总；未出现的类别不推定为现实中无收入，未单列的版本或来源不能硬拆。"}


def price_series(data, cutoff):
    result = {}
    for timestamp, value in (data or {}).get("prices", []):
        date = dt.datetime.fromtimestamp(timestamp / 1000, UTC).date()
        if date <= cutoff and value > 0:
            result[date.isoformat()] = value
    return result


def series_coverage(values):
    """Coverage describes actual observations, not implied zeros before activation."""
    dates = sorted(values)
    first, last = (dates[0], dates[-1]) if dates else (None, None)
    calendar_days = (dt.date.fromisoformat(last) - dt.date.fromisoformat(first)).days + 1 if dates else 0
    return {"first": first, "last": last, "observations": len(dates),
            "calendar_days": calendar_days, "missing_days": calendar_days - len(dates)}


def supplemental_price_jobs(cutoff):
    """Request at most 490 total points per call, on a daily UTC grid.

    The official chart docs do not publish a span maximum. A live error response
    states a maximum of 500 total points, across all requested coins. Completed
    chunks have fixed URLs and can be reused; only a changed tail needs fetching.
    """
    coins = list(dict.fromkeys([coin for _, coin in PROJECTS.values()] + ["bitcoin", "solana"]))
    legacy = [coin for coin in LEGACY_PRICE_COINS if coin in coins]
    extra = [coin for coin in coins if coin not in legacy]
    size = SUPPLEMENTAL_PRICE_MAX_POINTS // SUPPLEMENTAL_PRICE_CHUNK_DAYS
    groups = ([legacy] if legacy else []) + [extra[i:i + size] for i in range(0, len(extra), size)]
    jobs = []
    for group in groups:
        suffix = "" if group == list(LEGACY_PRICE_COINS) else "-" + hashlib.sha256(",".join(group).encode()).hexdigest()[:12]
        first = SUPPLEMENTAL_PRICE_START
        while first <= cutoff:
            span = min(SUPPLEMENTAL_PRICE_CHUNK_DAYS, SUPPLEMENTAL_PRICE_MAX_POINTS // len(group), (cutoff - first).days + 1)
            start = int(dt.datetime.combine(first, dt.time(), UTC).timestamp())
            url = ("https://coins.llama.fi/chart/" + ",".join("coingecko:" + coin for coin in group)
                   + f"?start={start}&span={span}&period=1d&searchWidth=1h")
            jobs.append((SUPPLEMENTAL_PRICE_KEY + suffix + "-" + first.strftime("%Y%m%d"), url))
            first += dt.timedelta(days=span)
    return jobs


def request_supplemental_price_chunk(job):
    """Reuse exact historical chunks; changed ranges and failed blocks retry."""
    key, url = job
    path = RAW / (key + ".json")
    meta = load(RAW / (key + ".meta.json"), {})
    if path.exists() and meta.get("url") == url and meta.get("sha256") == hashlib.sha256(path.read_bytes()).hexdigest():
        return key, {**meta, "status": "cached", "cache_note": "已完成历史分块复用原始响应；未更新原始抓取时间。"}
    key, result = request(job)
    if result.get("status") == "cached" and meta.get("url"):
        # A growing tail can fail and retain yesterday's shorter response.
        # Keep that response's real URL distinct from the attempted new range.
        result["response_url"] = meta["url"]
        result["requested_url"] = url
    return key, result


def supplemental_price_series(data, coin, cutoff, source_key=SUPPLEMENTAL_PRICE_KEY):
    """Pair returned timestamps with the requested UTC grid within ±1 hour.

    A sample at 23:59:57 belongs to the following requested 00:00 grid point.
    Keep its real timestamp, so the sampled spot price is not called a close.
    Ambiguous equal-distance observations remain unknown.
    """
    result, ambiguous = {}, set()
    prices = (data or {}).get("coins", {}).get("coingecko:" + coin, {}).get("prices", [])
    for observation in prices:
        if not isinstance(observation, dict):
            continue
        timestamp, value = observation.get("timestamp"), observation.get("price")
        if (isinstance(timestamp, bool) or not isinstance(timestamp, (float, int)) or not math.isfinite(timestamp)
            or isinstance(value, bool) or not isinstance(value, (float, int)) or not math.isfinite(value) or value <= 0):
            continue
        target = math.floor((timestamp + 43200) / 86400) * 86400
        offset = timestamp - target
        if abs(offset) > SUPPLEMENTAL_PRICE_TOLERANCE_SECONDS:
            continue
        date = dt.datetime.fromtimestamp(target, UTC).date()
        if not SUPPLEMENTAL_PRICE_START <= date <= cutoff or date.isoformat() in ambiguous:
            continue
        key = date.isoformat()
        previous = result.get(key)
        if previous and abs(previous["offset_seconds"]) == abs(offset) and previous["price"] != value:
            result.pop(key)
            ambiguous.add(key)
            continue
        if previous and abs(previous["offset_seconds"]) <= abs(offset):
            continue
        result[key] = {"price": float(value), "timestamp": timestamp,
                       "target_timestamp": target, "offset_seconds": offset,
                       "provider": "DeFiLlama coins API", "source_key": source_key}
    return result


def merged_price_series(data, supplemental_data, coin, cutoff):
    """Retain every existing CoinGecko date; supplement only missing dates."""
    primary = price_series(data, cutoff)
    supplementary = {}
    responses = supplemental_data if isinstance(supplemental_data, list) else [(SUPPLEMENTAL_PRICE_KEY, supplemental_data)]
    for key, response in responses:
        supplementary.update(supplemental_price_series(response, coin, cutoff, key))
    values = {date: observation["price"] for date, observation in supplementary.items()}
    values.update(primary)
    observations = dict(supplementary)
    for timestamp, value in (data or {}).get("prices", []):
        date = dt.datetime.fromtimestamp(timestamp / 1000, UTC).date().isoformat()
        if date in primary and primary[date] == value:
            observations[date] = {"price": value, "timestamp": timestamp / 1000,
                                  "target_timestamp": int(dt.datetime.combine(dt.date.fromisoformat(date), dt.time(), UTC).timestamp()),
                                  "provider": "CoinGecko", "source_key": "price-" + coin}
    return values, observations, primary, supplementary


def window(values, end, days, zero_before=None):
    """Only documented pre-activation zeros may complete an otherwise absent series."""
    start = end - dt.timedelta(days=days - 1)
    observations = []
    for index in range(days):
        date = (start + dt.timedelta(days=index)).isoformat()
        if date in values:
            observations.append(values[date])
        elif zero_before and date < zero_before:
            observations.append(0.0)
    complete = len(observations) == days
    return {"usd": sum(observations) if complete else None,
            "observed_usd": sum(observations) if observations else None,
            "coverage_days": len(observations), "days": days,
            "start": start.isoformat(), "end": end.isoformat(), "complete": complete}


def observed_return(values, event, offset):
    # No nearest-date substitution; absent observations remain absent.
    origin = values.get((event - dt.timedelta(days=1)).isoformat())
    end = values.get((event + dt.timedelta(days=offset)).isoformat())
    return end / origin - 1 if origin and end else None


def archive_response(key, meta):
    """Pin this snapshot's response bytes so future refreshes cannot replace its evidence."""
    return archive_file(RAW / (key + ".json"), meta, key)


def archive_file(path, meta, label):
    """Archive a reviewed schedule or public response without changing its bytes."""
    if not path.exists():
        return {}
    body = path.read_bytes()
    digest = hashlib.sha256(body).hexdigest()
    if meta.get("sha256") and meta["sha256"] != digest:
        raise ValueError(f"{label} 的保存文件与抓取哈希不一致，先核实原始数据。")
    filename = digest + path.suffix
    archive = ROOT / "data" / "responses" / filename
    archive.parent.mkdir(parents=True, exist_ok=True)
    if archive.exists():
        if archive.read_bytes() != body:
            raise ValueError(f"{label} 的归档响应文件已改变。")
    else:
        archive.write_bytes(body)
    return {"response_path": "../data/responses/" + filename, "stored_sha256": digest}


def supplemental_key(source):
    return f"llama-supplemental-{source['ticker'].lower()}-{source['kind']}"


def supplemental_jobs(manifest):
    """Refresh only the supplemental endpoints already registered as evidence."""
    jobs = [(supplemental_key(source), source["url"]) for source in manifest.get("records", [])]
    if len({key for key, _ in jobs}) != len(jobs):
        raise ValueError("补充分配来源存在重复币种／类型，先复核来源登记。")
    return jobs


def update_supplemental_sources(manifest, status, offline=False):
    """Pin successful responses; failed requests retain their previous evidence date."""
    records = []
    for previous in manifest.get("records", []):
        key = supplemental_key(previous)
        meta = status.get(key, {})
        source = dict(previous)
        if not offline and meta.get("status") == "fresh":
            source.pop("refresh_error", None)
            source.update(meta)
            source.update(archive_response(key, meta))
            source["fetched_at"] = meta["retrieved_at"]
        else:
            path = ROOT / "web" / previous["response_path"]
            source["status"] = ("offline-cache" if offline else "cached") if path.exists() else "missing"
            if not offline and meta.get("refresh_error"):
                source["refresh_error"] = meta["refresh_error"]
        # The registered archive, not a possibly newer raw cache, is this snapshot's evidence.
        status[key] = dict(source)
        records.append(source)
    if records and not offline:
        dump(ROOT / "data" / "flow-distributions.json", {**manifest, "records": records})


def bnb_responses():
    index = {bnb_data.QUARTERS_KEY: load(RAW / (bnb_data.QUARTERS_KEY + ".json"), {})}
    keys = [job[0] for job in bnb_data.bnb_jobs()] + bnb_data.proof_keys(index)
    return {key: load(RAW / (key + ".json"), {}) for key in keys}


def update_bnb_proofs(status, cutoff, offline=False):
    """Transaction/receipt discovery precedes block proofs; never parallelize stages."""
    for builder in [bnb_data.bnb_rpc_jobs, bnb_data.bnb_block_jobs, bnb_data.bnb_beacon_jobs]:
        jobs = builder(bnb_responses(), cutoff)
        if offline:
            for key, url, *post in jobs:
                meta = load(RAW / (key + ".meta.json"), {})
                status[key] = {**meta, "url": url, "status": "offline-cache" if (RAW / (key + ".json")).exists() else "missing"}
        else:
            for job in jobs:
                key, url, *post = job
                payload = post[0] if post else None
                path = RAW / (key + ".json")
                meta = load(RAW / (key + ".meta.json"), {})
                approved_urls = [url, *bnb_data.rpc_endpoints(key)]
                valid_cached_rpc = not bnb_data.rpc_endpoints(key) or bnb_data.valid_rpc_response(key, load(path), payload)
                valid_cached_history = bnb_data.valid_history_response(key, load(path))
                if path.exists() and meta.get("url") in approved_urls and meta.get("request") == payload and meta.get("sha256") == hashlib.sha256(path.read_bytes()).hexdigest() and valid_cached_rpc and valid_cached_history:
                    status[key] = {**meta, "status": "cached", "cache_note": "已完成季度交易的链上证明复用；保留原核验时间。"}
                else:
                    _, status[key] = request(job)


def compile_bnb_sources(cutoff, prices, fetch_meta):
    raw = bnb_responses()
    metadata = {}
    for key in raw:
        meta = {**load(RAW / (key + ".meta.json"), {}), **fetch_meta.get(key, {})}
        metadata[key] = {**meta, **archive_response(key, meta)}
    compiled = bnb_data.compile_bnb_data(raw, cutoff, prices, metadata)
    official_path = ROOT / "data" / "bnb-quarterly-history.json"
    if official_path.exists():
        registry = load(official_path)
        review_date = registry.get("reviewed_at_utc", "")[:10]
        if review_date and review_date > (cutoff + dt.timedelta(days=1)).isoformat():
            raise ValueError("季度公告清单复核日晚于研究快照，不用于历史回测。")
        compiled["official_history"] = {**registry, **archive_file(official_path, {}, "BNB季度公告历史")}
    return compiled


def compile_snapshot(as_of, fetch_meta, now=None):
    cutoff = completed_day_cutoff(as_of, now)
    profiles = load(ROOT / "data" / "profiles.json", [])
    flow_distribution_sources = load(ROOT / "data" / "flow-distributions.json", {}).get("records", [])
    supply_forecasts = load(ROOT / "data" / "supply-forecasts.json", {})
    if supply_forecasts.get("verified_on", "") > as_of.isoformat():
        raise ValueError("供应排期复核日晚于 --as-of，不用于历史回测。")
    forecast_by_ticker = {x["ticker"]: x for x in supply_forecasts.get("projects", [])}
    forecast_evidence = archive_file(ROOT / "data" / "supply-forecasts.json", {}, "供应排期")
    market = {x["id"]: x for x in load(RAW / "coingecko-markets.json", [])}
    for token in market.values():
        updated = token.get("last_updated")
        if updated and dt.datetime.fromisoformat(updated.replace("Z", "+00:00")).astimezone(BEIJING).date() > as_of:
            raise ValueError("行情快照晚于 --as-of，拒绝以未来估值回测。请选择当日归档快照；此采集器只编译当前估值。")
    supplemental_price_data, supplemental_price_sources = [], []
    for key, url in supplemental_price_jobs(cutoff):
        response = load(RAW / (key + ".json"), {})
        supplemental_price_data.append((key, response))
        raw_meta = load(RAW / (key + ".meta.json"), {})
        meta = {**raw_meta, **fetch_meta.get(key, {})}
        supplemental_price_sources.append({"source_key": key, **meta,
                                           "url": raw_meta.get("url", url), "requested_url": url,
                                           **archive_response(key, meta)})
    price_cache = {}
    for coin in [coin for _, coin in PROJECTS.values()] + ["bitcoin", "solana"]:
        price_cache[coin] = merged_price_series(load(RAW / f"price-{coin}.json", {}),
                                               supplemental_price_data, coin, cutoff)
    btc, btc_observations, btc_primary, btc_supplementary = price_cache["bitcoin"]
    sol, sol_observations, sol_primary, sol_supplementary = price_cache["solana"]
    output = []
    for profile in profiles:
        ticker = profile["ticker"]
        slug, coin = PROJECTS[ticker]
        project = dict(profile)
        forecast = forecast_by_ticker.get(ticker)
        project["supply_forecast"] = ({**forecast, **forecast_evidence,
                                      "verified_on": forecast.get("verified_on") or supply_forecasts.get("verified_on")}
                                     if forecast else None)
        m = market.get(coin, {})
        project["market"] = {key: m.get(key) for key in [
            "current_price", "market_cap", "fully_diluted_valuation", "circulating_supply",
            "total_supply", "max_supply", "last_updated"]}
        project["market"]["source"] = f"https://www.coingecko.com/en/coins/{coin}"
        project["market_lag_days"] = ((as_of - dt.datetime.fromisoformat(m["last_updated"].replace("Z", "+00:00")).astimezone(BEIJING).date()).days if m.get("last_updated") else None)
        project["market"]["remaining_supply_fdv"] = (
            m["current_price"] * m["total_supply"] if m.get("current_price") and m.get("total_supply") else None)
        project["market"]["original_cap_fdv"] = (
            m["current_price"] * profile["initial_supply"] if m.get("current_price") and profile.get("initial_supply") else None)
        mint_key = {"PUMP":"rpc-pump-mint", "RAY":"rpc-ray-mint"}.get(ticker)
        mint = load(RAW / f"{mint_key}.json", {}) if mint_key else {}
        if mint.get("result", {}).get("value"):
            info = mint["result"]["value"]["data"]["parsed"]["info"]
            exact = str(Decimal(info["supply"]) / Decimal(10) ** info["decimals"])
            project["onchain_supply"] = {
                "raw_amount": info["supply"], "exact_tokens": exact,
                "tokens": float(exact), "decimals": info["decimals"],
                "mint_authority": info.get("mintAuthority"), "freeze_authority": info.get("freezeAuthority"),
                "slot": mint["result"]["context"]["slot"], "source":"https://api.mainnet-beta.solana.com",
                **fetch_meta.get(mint_key, {}),
                "note":"RPC mint供应；时点独立于行情，不替换估值分母。只核mint/freeze权限，未归因每次burn。"}
        flow_responses = {kind: load(RAW / f"llama-{slug}-{kind}.json", {}) for kind in TYPES}
        raw_charts = {kind: series(raw, cutoff) for kind, raw in flow_responses.items()}
        charts = {kind: dict(values) for kind, values in raw_charts.items()}
        flow_rules = {**({"fees": profile["fee_normalization"]} if profile.get("fee_normalization") else {}),
                      **profile.get("flow_normalizations", {})}
        normalization = {}
        for kind, rule in flow_rules.items():
            raw_values = charts[kind]
            charts[kind], excluded, statuses, issues = normalize_fees(flow_responses[kind], cutoff, rule)
            normalization[kind] = (raw_values, excluded, statuses, issues)
        price, price_observations, price_primary, price_supplementary = price_cache[coin]
        if ticker == "BNB":
            bnb = compile_bnb_sources(cutoff, price, fetch_meta)
            charts = bnb["charts"]
            raw_charts = {kind: dict(values) for kind, values in charts.items()}
            project["burns"] = {key: value for key, value in bnb.items() if key not in ["charts", "data_sources"]}
        # All projects use the SAME completed UTC day. Late sources make a window unknown,
        # rather than moving only that project backward and comparing different periods.
        common = set.intersection(*(set(x) for x in charts.values()))
        latest = dt.date.fromisoformat(max(common)) if common else None
        end = cutoff
        project["flow_end"] = end.isoformat()
        project["latest_common_flow_observation"] = latest.isoformat() if latest else None
        project["flow_lag_days"] = (cutoff - latest).days if latest else 999
        project["windows"] = {}
        for days in [7, 30, 90, 365]:
            project["windows"][str(days)] = {
                kind: window(values, end, days, profile.get("zero_before", {}).get(kind))
                for kind, values in charts.items()}
            if ticker == "BNB":
                project["windows"][str(days)]["burns"] = bnb["quarterly_windows"][str(days)]
                project["windows"][str(days)]["gas_burn_estimate"] = bnb["gas_burn_estimate_windows"][str(days)]
            for kind, rule in flow_rules.items():
                raw_values, excluded, statuses, issues = normalization[kind]
                flow_window = project["windows"][str(days)][kind]
                flow_window["raw_usd"] = window(raw_values, end, days)["usd"]
                flow_window["excluded_usd"] = window(excluded, end, days)["usd"]
                flow_window["normalization_rule"] = rule["id"]
                flow_window["already_excluded_days"] = sum(status == "provider_already_excluded" for date, status in statuses.items()
                                                            if flow_window["start"] <= date <= flow_window["end"])
                flow_window["normalization_issues"] = [{"date": date, "reason": reason} for date, reason in sorted(issues.items())
                                                       if flow_window["start"] <= date <= flow_window["end"]]
            for kind in TYPES:
                flow_window = project["windows"][str(days)][kind]
                flow_window["composition"] = composition(flow_responses[kind], flow_window["start"], flow_window["end"], charts[kind], flow_rules.get(kind))
            supplemental = [{**source, **fetch_meta.get(supplemental_key(source), {})}
                            for source in flow_distribution_sources if source["ticker"] == ticker]
            if supplemental:
                extra = {"sources": supplemental}
                for source in supplemental:
                    path = ROOT / "web" / source["response_path"]
                    if not path.exists() or hashlib.sha256(path.read_bytes()).hexdigest() != source["sha256"]:
                        raise ValueError(f"{ticker} 额外分配响应哈希不匹配。")
                    values = series(load(path), cutoff)
                    source["latest_observation"] = max(values) if values else None
                    source["observation_lag_days"] = (cutoff - dt.date.fromisoformat(max(values))).days if values else None
                    extra[source["kind"]] = window(values, end, days)
                extra["complete"] = all(extra[source["kind"]]["complete"] for source in supplemental)
                project["windows"][str(days)]["flow_distributions"] = extra
            holder_window = project["windows"][str(days)]["holders"]
            oneoffs = [event for event in profile.get("holder_oneoff_dates", [])
                       if holder_window["start"] <= event <= holder_window["end"]]
            holder_window["oneoff_dates"] = oneoffs
            holder_window["recurring_usd"] = None if oneoffs else holder_window["usd"]
            holder_window["recurring_note"] = ("窗口跨存量销毁事件，API是否纳入及经常性部分尚未对账，不年化" if oneoffs else "无已识别存量一次性项目")
        # Export all available years. A benchmark's earlier launch does not
        # extend a protocol's history to dates with neither flow nor token price.
        dates = sorted(set(price).union(*[set(x) for x in charts.values()]))
        project["history"] = [{"date": date, **{kind: values.get(date) for kind, values in charts.items()},
                               "price": price.get(date), "btc": btc.get(date), "sol": sol.get(date),
                               "price_observation": price_observations.get(date),
                               "btc_observation": btc_observations.get(date),
                               "sol_observation": sol_observations.get(date)} for date in dates]
        if ticker == "BNB":
            for row in project["history"]:
                row["gas_burn_estimate_usd"] = bnb["gas_burn_estimate_history"].get(row["date"])
        project["history_coverage"] = {
            kind: {"raw": series_coverage(raw_charts[kind]), "normalized": series_coverage(charts[kind]),
                   "normalization_rule": flow_rules.get(kind, {}).get("id"),
                   "documented_zero_before": profile.get("zero_before", {}).get(kind)} for kind in TYPES}
        if ticker == "BNB":
            project["history_coverage"]["gas_burn_estimate_usd"] = {
                **series_coverage(bnb["gas_burn_estimate_history"]),
                "evidence": "provider_policy_estimate", "actual_burn_verified": False}
        for name, values, primary, supplementary in [
            ("price", price, price_primary, price_supplementary),
            ("btc", btc, btc_primary, btc_supplementary),
            ("sol", sol, sol_primary, sol_supplementary)]:
            project["history_coverage"][name] = {
                **series_coverage(values), "primary": {**series_coverage(primary), "provider": "CoinGecko", "request_days": 365},
                "supplemental": {**series_coverage(supplementary), "provider": "DeFiLlama coins API",
                                 "used_observations": len(set(supplementary) - set(primary))},
                "limitation": PRICE_HISTORY_LIMIT_NOTE}
        project["event_studies"] = []
        for event in profile.get("events", []):
            date = dt.date.fromisoformat(event["date"])
            studies = []
            for days in [30, 90]:
                if date + dt.timedelta(days=days) > cutoff:
                    studies.append({"days": days, "status": "尚未观察完整后窗口"})
                    continue
                pre = window(charts["revenue"], date - dt.timedelta(days=1), days,
                             profile.get("zero_before", {}).get("revenue"))
                post = window(charts["revenue"], date + dt.timedelta(days=days), days,
                              profile.get("zero_before", {}).get("revenue"))
                # Post window is day+1..day+N; exclude implementation day.
                pre_holder = window(charts["holders"], date - dt.timedelta(days=1), days,
                                    profile.get("zero_before", {}).get("holders"))
                post_holder = window(charts["holders"], date + dt.timedelta(days=days), days,
                                     profile.get("zero_before", {}).get("holders"))
                token_r = observed_return(price, date, days)
                btc_r = observed_return(btc, date, days)
                sol_r = observed_return(sol, date, days)
                studies.append({"days": days, "status": "收入窗口完整" if pre["complete"] and post["complete"] else "收入缺失",
                                "pre": pre, "post": post, "pre_holder": pre_holder, "post_holder": post_holder,
                                "revenue_change": post["usd"] / pre["usd"] - 1 if pre["usd"] and post["usd"] is not None else None,
                                "token_return": token_r, "btc_return": btc_r, "sol_return": sol_r,
                                "relative_btc": (1 + token_r) / (1 + btc_r) - 1 if token_r is not None and btc_r is not None else None,
                                "relative_sol": (1 + token_r) / (1 + sol_r) - 1 if token_r is not None and sol_r is not None else None,
                                "historical_supply_change": None,
                                "supply_note": "缺历史 totalSupply / circulating 快照，不能用价格或市值变化冒充供应变化。"})
            project["event_studies"].append({**event, "studies": studies})
        project["data_sources"] = [{"kind": kind, "url": f"https://api.llama.fi/summary/fees/{slug}?dataType={dtype}",
                                    **fetch_meta.get(f"llama-{slug}-{kind}", {}),
                                    **archive_response(f"llama-{slug}-{kind}", fetch_meta.get(f"llama-{slug}-{kind}", {})),
                                    "latest_observation": max(charts[kind]) if charts[kind] else None}
                                   for kind, dtype in TYPES.items()] if slug else []
        if ticker == "BNB":
            project["data_sources"] = bnb["data_sources"]
            for source in project["data_sources"]:
                if source["kind"] == "gas_burn_policy_estimate":
                    source["effective_from"] = bnb_data.BEP95_START.isoformat()
        project["price_source"] = {"url": f"https://api.coingecko.com/api/v3/coins/{coin}/market_chart?vs_currency=usd&days=365&interval=daily",
                                   **fetch_meta.get(f"price-{coin}", {}),
                                   "provider": "CoinGecko", "first": min(price) if price else None,
                                   "last": max(price) if price else None, "primary": series_coverage(price_primary),
                                   "limitation": PRICE_HISTORY_LIMIT_NOTE,
                                   "supplemental": {"sources": supplemental_price_sources, **series_coverage(price_supplementary),
                                                    "provider": "DeFiLlama coins API", "coin": "coingecko:" + coin,
                                                    "requested_start": SUPPLEMENTAL_PRICE_START.isoformat(),
                                                    "requested_end": cutoff.isoformat(),
                                                    "target_time": "00:00 UTC", "tolerance_seconds": SUPPLEMENTAL_PRICE_TOLERANCE_SECONDS,
                                                    "priority": "CoinGecko 已有日期优先；补充源只填缺日。",
                                                    "note": "UTC日界附近的采样现价，非交易所收盘价；保留原始timestamp，超出±1小时或没有观察仍未知。",
                                                    "documentation": "https://github.com/DefiLlama/api-sdk#prices"}}
        output.append(project)
    flow_first_dates = [coverage["normalized"]["first"] for project in output
                        for kind, coverage in project["history_coverage"].items()
                        if kind in TYPES and coverage["normalized"]["first"]]
    snapshot = {"schema_version": 2, "as_of": as_of.isoformat(), "completed_day_cutoff_utc": cutoff.isoformat(),
                "history_earliest": min(flow_first_dates) if flow_first_dates else None,
                "compiled_at": dt.datetime.now(UTC).isoformat(), "currency": "USD", "projects": output,
                "source_status": fetch_meta,
                "methodology": "../research/framework.md", "report": "../research/report.md",
                "reference": "https://crypto3d.pro/equity/"}
    dump(ROOT / "data" / "dashboard.json", snapshot)
    # Archive each run; immutable filenames keep before/after supply snapshots for future studies.
    timestamp = dt.datetime.now(UTC).strftime("%Y%m%dT%H%M%S%fZ")
    dump(ROOT / "data" / "snapshots" / f"{timestamp}.json", snapshot)
    generate_web_assets(snapshot, ROOT)
    return snapshot


def main():
    run_started_at = dt.datetime.now(UTC)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--as-of", default=run_started_at.astimezone(BEIJING).date().isoformat(),
                        help="研究日期（北京时间）；流量仅包含刷新时已经结束的完整 UTC 日")
    parser.add_argument("--offline", action="store_true", help="recompute from existing raw sources, no network")
    args = parser.parse_args()
    as_of = dt.date.fromisoformat(args.as_of)
    jobs = []
    ids = ",".join(coin for _, coin in PROJECTS.values())
    jobs.append(("coingecko-markets", f"https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids={ids}"))
    for slug, coin in PROJECTS.values():
        if slug:
            jobs.extend((f"llama-{slug}-{kind}", f"https://api.llama.fi/summary/fees/{slug}?dataType={dtype}")
                        for kind, dtype in TYPES.items())
        jobs.append((f"price-{coin}", f"https://api.coingecko.com/api/v3/coins/{coin}/market_chart?vs_currency=usd&days=365&interval=daily"))
    for coin in ["bitcoin", "solana"]:
        jobs.append((f"price-{coin}", f"https://api.coingecko.com/api/v3/coins/{coin}/market_chart?vs_currency=usd&days=365&interval=daily"))
    jobs.extend(supplemental_price_jobs(completed_day_cutoff(as_of, now=run_started_at)))
    for key, mint in [("pump","pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn"),
                      ("ray","4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R")]:
        jobs.append((f"rpc-{key}-mint", "https://api.mainnet-beta.solana.com",
                     {"jsonrpc":"2.0","id":1,"method":"getAccountInfo","params":[mint,{"encoding":"jsonParsed","commitment":"finalized"}]}))
    distribution_manifest = load(ROOT / "data" / "flow-distributions.json", {})
    jobs.extend(supplemental_jobs(distribution_manifest))
    jobs.extend(bnb_data.bnb_jobs())
    previous = load(ROOT / "data" / "fetch-status.json", {})
    if args.offline:
        status = {job[0]: {**previous.get(job[0], {}), **load(RAW / f"{job[0]}.meta.json", {}), "status": "offline-cache" if (RAW / f"{job[0]}.json").exists() else "missing"} for job in jobs}
    else:
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
            status = dict(pool.map(lambda job: request_supplemental_price_chunk(job)
                                   if job[0].startswith(SUPPLEMENTAL_PRICE_KEY) else request(job), jobs))
    try:
        update_bnb_proofs(status, completed_day_cutoff(as_of, now=run_started_at), offline=args.offline)
        update_supplemental_sources(distribution_manifest, status, offline=args.offline)
        if not args.offline:
            dump(ROOT / "data" / "fetch-status.json", status)
        snapshot = compile_snapshot(as_of, status, now=run_started_at)
    except ValueError as error:
        parser.exit(2, f"未覆盖当前快照：{error}\n")
    print(json.dumps({"projects": len(snapshot["projects"]), "as_of": args.as_of,
                      "completed_day_cutoff_utc": snapshot["completed_day_cutoff_utc"],
                      "sources": {key: value["status"] for key, value in status.items()},
                      "errors": {key: value["refresh_error"] for key, value in status.items() if "refresh_error" in value}}, ensure_ascii=False))


if __name__ == "__main__":
    main()
