import argparse
import hashlib
import json
from datetime import datetime
from pathlib import Path


def utc_now() -> str:
    return datetime.utcnow().isoformat(timespec="seconds") + "Z"


def read_jsonl(path: Path):
    if not path.exists():
        return []
    rows = []
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            rows.append(json.loads(line))
    return rows


def append_jsonl(path: Path, row: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(row, ensure_ascii=True) + "\n")


def fingerprint(prompt: str, response: str) -> str:
    payload = (prompt + "\n---\n" + response).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def load_known_hashes(dataset_path: Path) -> set:
    hashes = set()
    for row in read_jsonl(dataset_path):
        h = row.get("hash")
        if h:
            hashes.add(h)
    return hashes


def main() -> int:
    parser = argparse.ArgumentParser(description="Guarda solo ejemplos exitosos en dataset.jsonl")
    parser.add_argument("--dataset", default=".agent-learning/dataset.jsonl")
    parser.add_argument("--prompt", required=True)
    parser.add_argument("--response", required=True)
    parser.add_argument("--source", default="manual")
    parser.add_argument("--tag", default="general")
    parser.add_argument("--score", type=float, default=1.0)
    args = parser.parse_args()

    dataset_path = Path(args.dataset)
    example_hash = fingerprint(args.prompt, args.response)
    known_hashes = load_known_hashes(dataset_path)

    if example_hash in known_hashes:
        print("SKIP_DUPLICATE")
        return 0

    row = {
        "ts": utc_now(),
        "prompt": args.prompt,
        "response": args.response,
        "source": args.source,
        "tag": args.tag,
        "score": args.score,
        "hash": example_hash,
    }
    append_jsonl(dataset_path, row)
    print("APPENDED_SUCCESS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
