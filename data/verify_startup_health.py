import json
import socket
import subprocess
import sys
import time
from pathlib import Path
from urllib.error import URLError
from urllib.request import urlopen


BASE_DIR = Path(__file__).resolve().parents[1]
VENV_PYTHON = BASE_DIR / "venv" / "Scripts" / "python.exe"
HOST = "127.0.0.1"
TIMEOUT_SECONDS = 20


def find_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind((HOST, 0))
        return sock.getsockname()[1]


def wait_for_health(url: str, timeout_seconds: int) -> tuple[bool, float]:
    start = time.time()
    deadline = start + timeout_seconds
    while time.time() < deadline:
        try:
            with urlopen(url, timeout=2) as resp:
                if resp.status == 200:
                    return True, time.time() - start
        except URLError:
            time.sleep(0.5)
        except Exception:
            time.sleep(0.5)
    return False, time.time() - start


def main():
    if not VENV_PYTHON.exists():
        raise SystemExit(f"missing python runtime: {VENV_PYTHON}")

    port = find_free_port()
    health_url = f"http://{HOST}:{port}/api/health"
    process = subprocess.Popen(
        [
            str(VENV_PYTHON),
            "-m",
            "uvicorn",
            "main:app",
            "--host",
            HOST,
            "--port",
            str(port),
        ],
        cwd=str(BASE_DIR),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    result = {
        "port": port,
        "health_url": health_url,
        "process_id": process.pid,
    }

    try:
        ok, elapsed = wait_for_health(health_url, TIMEOUT_SECONDS)
        result["startup_time_seconds"] = round(elapsed, 3)
        result["health_ok"] = ok
        result["process_returncode_during_check"] = process.poll()
        result["terminated_by_script"] = False
    finally:
        if process.poll() is None:
            result["terminated_by_script"] = True
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)
        result["final_returncode"] = process.returncode

    print(json.dumps(result, ensure_ascii=False, indent=2))
    if not result["health_ok"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
