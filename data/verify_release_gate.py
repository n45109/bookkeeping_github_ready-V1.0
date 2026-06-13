import json
import os
import subprocess
import sys
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parents[1]
PYTHON = BASE_DIR / "venv" / "Scripts" / "python.exe"

CHECKS = [
    ("startup_health", BASE_DIR / "data" / "verify_startup_health.py"),
    ("org_isolation", BASE_DIR / "data" / "verify_org_isolation.py"),
    ("post_upgrade", BASE_DIR / "data" / "verify_post_upgrade_checks.py"),
]


def run_check(name: str, script: Path) -> dict:
    env = dict(**os.environ)
    env["PYTHONIOENCODING"] = "utf-8"
    result = subprocess.run(
        [str(PYTHON), str(script)],
        cwd=str(BASE_DIR),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        env=env,
    )
    payload = {
        "name": name,
        "script": str(script),
        "returncode": result.returncode,
        "stdout": result.stdout.strip(),
        "stderr": result.stderr.strip(),
    }
    try:
        payload["parsed"] = json.loads(result.stdout) if result.stdout.strip() else None
    except json.JSONDecodeError:
        payload["parsed"] = None
    return payload


def main():
    if not PYTHON.exists():
        raise SystemExit(f"missing python runtime: {PYTHON}")

    results = [run_check(name, script) for name, script in CHECKS]
    summary = {
        "python": str(PYTHON),
        "checks": results,
        "all_passed": all(item["returncode"] == 0 for item in results),
    }
    output = json.dumps(summary, ensure_ascii=False, indent=2)
    sys.stdout.buffer.write(output.encode("utf-8", errors="replace"))
    sys.stdout.buffer.write(b"\n")
    if not summary["all_passed"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
