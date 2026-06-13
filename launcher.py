import os
import socket
import subprocess
import sys
import time
import webbrowser
from pathlib import Path
from urllib.request import urlopen


BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
VENV_DIR = BASE_DIR / "venv"
VENV_PYTHON = VENV_DIR / "Scripts" / "python.exe"
REQUIREMENTS = BASE_DIR / "requirements.txt"
APP_PORT = 8080
APP_URL = f"http://127.0.0.1:{APP_PORT}"
HEALTH_URL = f"{APP_URL}/api/health"
APP_LOG = DATA_DIR / "start-app.log"
APP_ERR = DATA_DIR / "start-app.err.log"


def echo(step: str, message: str) -> None:
    print(f"[{step}] {message}")


def fail(message: str, code: int = 1) -> None:
    print(f"[ERROR] {message}")
    sys.exit(code)


def resolve_bootstrap_python() -> str:
    if VENV_PYTHON.exists():
        return str(VENV_PYTHON)
    embedded = Path(r"C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe")
    if embedded.exists():
        return str(embedded)
    return sys.executable


def run_checked(args, cwd=None):
    result = subprocess.run(args, cwd=cwd or BASE_DIR)
    if result.returncode != 0:
        fail(f"Command failed: {' '.join(map(str, args))}")


def port_in_use(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.5)
        return sock.connect_ex(("127.0.0.1", port)) == 0


def wait_for_health(timeout_seconds: int = 30) -> bool:
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        try:
            with urlopen(HEALTH_URL, timeout=2) as resp:
                if resp.status == 200:
                    return True
        except Exception:
            time.sleep(1)
    return False


def start_server() -> subprocess.Popen:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    APP_LOG.write_text("", encoding="utf-8")
    APP_ERR.write_text("", encoding="utf-8")
    out = APP_LOG.open("a", encoding="utf-8")
    err = APP_ERR.open("a", encoding="utf-8")
    creationflags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
    return subprocess.Popen(
        [str(VENV_PYTHON), "main.py"],
        cwd=str(BASE_DIR),
        stdout=out,
        stderr=err,
        creationflags=creationflags,
    )


def ensure_venv(bootstrap_python: str) -> None:
    if VENV_PYTHON.exists():
        return
    echo("2/6", "Creating virtual environment...")
    run_checked([bootstrap_python, "-m", "venv", "venv"])


def ensure_requirements() -> None:
    echo("3/6", "Installing and validating dependencies...")
    run_checked([str(VENV_PYTHON), "-m", "pip", "install", "--upgrade", "pip"])
    run_checked([str(VENV_PYTHON), "-m", "pip", "install", "-r", str(REQUIREMENTS)])
    run_checked([str(VENV_PYTHON), "-c", "import fastapi, uvicorn, openpyxl, openai"])


def main() -> None:
    print("=====================================")
    print("  Bookkeeping Dev Launcher")
    print("=====================================")
    print()

    echo("1/6", "Checking Python runtime...")
    bootstrap_python = resolve_bootstrap_python()
    if not bootstrap_python:
        fail("Python not found. Install Python 3.11 or 3.12.")

    ensure_venv(bootstrap_python)
    if not VENV_PYTHON.exists():
        fail("Virtual environment is missing python.exe.")

    ensure_requirements()

    echo("4/6", "Checking port availability...")
    if port_in_use(APP_PORT):
        fail(f"Port {APP_PORT} is already in use.")

    echo("5/6", "Starting service...")
    proc = start_server()

    echo("6/6", "Waiting for health check...")
    if not wait_for_health():
        proc.poll()
        fail(f"Service startup timed out. Check logs: {APP_LOG} / {APP_ERR}")

    print(f"[OK] Service is ready: {APP_URL}")
    try:
        if os.name == "nt":
            webbrowser.open(APP_URL)
    except Exception:
        pass


if __name__ == "__main__":
    main()
