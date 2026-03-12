"""Scan copilot-agent/runs for successful executions and append examples to dataset.

Usage:
    python collect_from_runs.py [--runs-dir PATH] [--dataset PATH] [--state PATH]

The script keeps a state file recording which run_ids have been processed, so
it can be run repeatedly (e.g. from a scheduled task or as a post-run hook).
For each new run with status=succeeded and quality_gate.passed==true it
constructs a simple example: prompt=user_goal, response=summary
"""

import argparse
import json
from pathlib import Path


def load_json(path: Path):
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def append_jsonl(path: Path, row: dict):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(row, ensure_ascii=True) + "\n")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--runs-dir", default="copilot-agent/runs")
    parser.add_argument("--dataset", default=".agent-learning/dataset.jsonl")
    parser.add_argument("--state", default=".agent-learning/logs/processed_runs.json")
    args = parser.parse_args()

    runs_path = Path(args.runs_dir)
    state_path = Path(args.state)
    dataset_path = Path(args.dataset)

    processed = set(load_json(state_path).get("processed", []))

    hashes = set()
    if dataset_path.exists():
        for line in dataset_path.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            try:
                row = json.loads(line)
            except Exception:
                continue
            h = row.get("hash")
            if h:
                hashes.add(h)

    updated = False
    new_processed = []

    for runfile in runs_path.glob("*.json"):
        print(f"examining {runfile.name}")
        try:
            run = json.loads(runfile.read_text(encoding="utf-8"))
        except Exception as e:
            print(f"  skip invalid json: {e}")
            continue
        rid = run.get("run_id")
        if not rid:
            print("  no run_id, skip")
            continue
        if rid in processed:
            print("  already processed")
            continue
        # mark processed regardless of success so we don't re-read
        new_processed.append(rid)

        status = run.get("status")
        gate = run.get("quality_gate", {})
        print(f"  status={status} gate_passed={gate.get('passed')}")
        # always record a training example, success or failure
        prompt = run.get("user_goal", "")
        response = run.get("summary", "")
        score = 1.0 if status == "succeeded" and gate.get("passed") else 0.0
        payload = (prompt + "\n---\n" + response).encode("utf-8")
        import hashlib
        fhash = hashlib.sha256(payload).hexdigest()
        if fhash in hashes:
            continue
        hashes.add(fhash)
        row = {
            "ts": run.get("ended_at"),
            "prompt": prompt,
            "response": response,
            "source": "run-automation",
            "tag": "run",
            "score": score,
            "hash": fhash,
        }
        append_jsonl(dataset_path, row)
        updated = True
    if new_processed:
        processed.update(new_processed)
        state_path.parent.mkdir(parents=True, exist_ok=True)
        state_path.write_text(json.dumps({"processed": list(processed)}), encoding="utf-8")
    if updated:
        print("Appended examples from runs")
    else:
        print("No new valid runs found")


if __name__ == "__main__":
    main()
