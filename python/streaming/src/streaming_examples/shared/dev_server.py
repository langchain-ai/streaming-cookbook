from __future__ import annotations

import subprocess
import sys
import time
from pathlib import Path
from typing import TextIO

READY_TEXT = "Server running at"
DEFAULT_PORT = 2024
STARTUP_TIMEOUT_SECONDS = 30


class DevServer:
    def __init__(self, proc: subprocess.Popen[str], url: str) -> None:
        self.proc = proc
        self.url = url

    def stop(self) -> None:
        if self.proc.poll() is None:
            self.proc.terminate()
            try:
                self.proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.proc.kill()


def _read_ready_line(stream: TextIO, silent: bool) -> bool:
    line = stream.readline()
    if not line:
        return False
    if not silent:
        sys.stderr.write(line)
    return READY_TEXT in line


def start_dev_server(port: int = DEFAULT_PORT, silent: bool = False) -> DevServer:
    cwd = Path(__file__).resolve().parents[3]
    proc = subprocess.Popen(
        ["langgraph", "dev", "--port", str(port), "--no-browser"],
        cwd=cwd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    assert proc.stdout is not None

    deadline = time.monotonic() + STARTUP_TIMEOUT_SECONDS
    while time.monotonic() < deadline:
        if proc.poll() is not None:
            raise RuntimeError(f"Dev server exited with code {proc.returncode}")
        if _read_ready_line(proc.stdout, silent):
            return DevServer(proc, f"http://localhost:{port}")

    proc.terminate()
    raise TimeoutError(f"Dev server did not start within {STARTUP_TIMEOUT_SECONDS}s")
