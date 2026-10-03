#!/usr/bin/env python3
"""Build a small initial dashboard and immutable annual history files, offline.

The research snapshot and its evidence are never rewritten by this script.
"""
import argparse
import datetime as dt
import hashlib
import json
from pathlib import Path
import re
import tempfile

ROOT = Path(__file__).resolve().parents[1]
CHART_FIELDS = ("date", "fees", "revenue", "holders", "price", "btc", "sol", "gas_burn_estimate_usd")
RECENT_DAYS = 90


def compact_bytes(value):
    """Hash the exact UTF-8 bytes that the browser will receive."""
    return (json.dumps(value, ensure_ascii=False, separators=(",", ":"),
                       sort_keys=True, allow_nan=False) + "\n").encode("utf-8")


def write_atomic(path, body):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(dir=path.parent, prefix=path.name + ".",
                                         suffix=".tmp", delete=False) as output:
            temporary = Path(output.name)
            output.write(body)
        temporary.replace(path)
    finally:
        if temporary and temporary.exists():
            temporary.unlink()


def generate_web_assets(snapshot, root=ROOT):
    """Keep all metadata/aggregates; move full history into per-year assets.

    Annual URLs are content-addressed and never overwritten with different
    bytes. Write the dashboard manifest only after every referenced asset exists.
    Input project order and history row order are preserved.
    """
    root = Path(root)
    cutoff = dt.date.fromisoformat(snapshot["completed_day_cutoff_utc"])
    recent_start = (cutoff - dt.timedelta(days=RECENT_DAYS - 1)).isoformat()
    cutoff_string = cutoff.isoformat()
    delivery = {"version": 1, "recent_days": RECENT_DAYS, "recent_start": recent_start,
                "history": {}}
    lite = {**snapshot, "projects": [], "delivery": delivery}
    chunk_count, chunk_bytes, recent_rows = 0, 0, 0
    for project in snapshot.get("projects", []):
        ticker = project["ticker"]
        if not isinstance(ticker, str) or not re.fullmatch(r"[A-Za-z0-9_-]+", ticker):
            raise ValueError("代币标识不能安全用于历史文件名。")
        if ticker in delivery["history"]:
            raise ValueError("存在重复代币标识，无法生成唯一历史清单。")
        yearly, previous = {}, None
        history = project.get("history", [])
        for row in history:
            date = dt.date.fromisoformat(row["date"])
            if previous is not None and date <= previous:
                raise ValueError(f"{ticker} 历史日期必须递增且不能重复。")
            previous = date
            yearly.setdefault(date.year, []).append(row)
        metadata = []
        for year, rows in sorted(yearly.items()):
            body = compact_bytes({"ticker": ticker, "year": year, "history": rows})
            digest = hashlib.sha256(body).hexdigest()
            filename = f"history-{ticker}-{year}-{digest}.json"
            path = root / "data" / "web" / filename
            if path.exists():
                if path.read_bytes() != body:
                    raise ValueError(f"已存在的历史哈希文件内容不匹配：{filename}")
            else:
                write_atomic(path, body)
            metadata.append({"year": year, "start": rows[0]["date"], "end": rows[-1]["date"],
                             "path": "../data/web/" + filename, "sha256": digest, "bytes": len(body)})
            chunk_count += 1
            chunk_bytes += len(body)
        delivery["history"][ticker] = metadata
        # Missing observations stay null. Do not create extra daily rows.
        recent = [{field: row[field] for field in CHART_FIELDS if field in row}
                  for row in history if recent_start <= row["date"] <= cutoff_string]
        recent_rows += len(recent)
        light_project = {**project, "history": recent}
        # BNB's full daily fee/model maps duplicate the lazy history. Keep
        # aggregate windows and provenance, loading old observations on demand.
        if isinstance(project.get("burns"), dict):
            light_project["burns"] = {key: value for key, value in project["burns"].items()
                                      if key not in ("chain_fee_history", "gas_burn_estimate_history")}
            # The collector retains its original burn_records field for
            # research exports. The UI reads quarterly_records; serializing
            # an identical legacy copy adds no observations or provenance.
            # Preserve the legacy field if it contains any distinct records.
            quarterly = light_project["burns"].get("quarterly_records")
            if isinstance(quarterly, list) and light_project["burns"].get("burn_records") == quarterly:
                light_project["burns"].pop("burn_records", None)
        lite["projects"].append(light_project)
    body = compact_bytes(lite)
    path = root / "data" / "dashboard-lite.json"
    write_atomic(path, body)
    return {"lite_path": str(path), "lite_bytes": len(body), "history_files": chunk_count,
            "history_bytes": chunk_bytes, "recent_rows": recent_rows,
            "completed_day_cutoff_utc": cutoff_string, "recent_start": recent_start}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT, help="项目根目录；不进行网络抓取")
    args = parser.parse_args()
    path = args.root / "data" / "dashboard.json"
    snapshot = json.loads(path.read_text(encoding="utf-8"))
    result = generate_web_assets(snapshot, args.root)
    result["full_snapshot_bytes"] = path.stat().st_size
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
