import argparse
import json
import subprocess
from datetime import datetime
from pathlib import Path

from collector import append_jsonl, fingerprint, load_known_hashes


def utc_now() -> str:
    return datetime.utcnow().isoformat(timespec="seconds") + "Z"


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Valida una solucion y guarda en dataset solo si pasa")
    parser.add_argument("--prompt", required=True)
    parser.add_argument("--response-file", required=True)
    parser.add_argument("--validate-cmd", required=True)
    parser.add_argument("--dataset", default=".agent-learning/dataset.jsonl")
    parser.add_argument("--attempts", default=".agent-learning/logs/attempts.jsonl")
    parser.add_argument("--source", default="agent")
    parser.add_argument("--tag", default="general")
    args = parser.parse_args()

    response_file = Path(args.response_file)
    response = read_text(response_file)

    proc = subprocess.run(
        args.validate_cmd,
        shell=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )

    attempt = {
        "ts": utc_now(),
        "prompt": args.prompt,
        "response_file": str(response_file),
        "validate_cmd": args.validate_cmd,
        "return_code": proc.returncode,
        "stdout": proc.stdout[-4000:],
        "stderr": proc.stderr[-4000:],
        "tag": args.tag,
    }
    append_jsonl(Path(args.attempts), attempt)

    if proc.returncode != 0:
        print("VALIDATION_FAILED")
        return proc.returncode

    dataset_path = Path(args.dataset)
    item_hash = fingerprint(args.prompt, response)
    known = load_known_hashes(dataset_path)
    if item_hash in known:
        print("SUCCESS_DUPLICATE")
        return 0

    row = {
        "ts": utc_now(),
        "prompt": args.prompt,
        "response": response,
        "source": args.source,
        "tag": args.tag,
        "score": 1.0,
        "validator": args.validate_cmd,
        "hash": item_hash,
    }
    append_jsonl(dataset_path, row)
    print("SUCCESS_SAVED")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
