"""Dev server lifecycle helper — spawns `langgraph dev` and waits for readiness.

Usage::

    from shared.dev_server import start_dev_server

    url, stop = start_dev_server()
    try:
        ...  # SDK client against ``url``
    finally:
        stop()

Mirrors ``typescript/streaming/src/shared/dev-server.ts``.
"""

from __future__ import annotations

import contextlib
import os
import signal
import subprocess
import sys
import time
from collections.abc import Callable
from pathlib import Path
from typing import TypedDict

import httpx

DEFAULT_PORT = 2024
STARTUP_TIMEOUT_S = 60.0
# ``src/shared/dev_server.py`` → package root ``python/streaming``.
PACKAGE_ROOT = Path(__file__).resolve().parents[2]


def _langgraph_cli_path() -> str:
    """Return the ``langgraph`` executable from the active virtualenv.

    ``Path(sys.executable).resolve()`` follows uv's interpreter symlink into
    the managed Python install, which does not ship the CLI — use the venv
    ``bin/`` directory instead (``VIRTUAL_ENV`` or the symlink's parent).
    """
    if venv := os.environ.get("VIRTUAL_ENV"):
        candidate = Path(venv) / "bin" / "langgraph"
        if candidate.is_file():
            return str(candidate)
    candidate = Path(sys.executable).parent / "langgraph"
    if candidate.is_file():
        return str(candidate)
    raise FileNotFoundError(
        "langgraph CLI not found in the active environment. "
        "Install with: uv sync (requires langgraph-cli in pyproject.toml)."
    )


class DevServerHandle(TypedDict):
    url: str
    stop: Callable[[], None]


def start_dev_server(
    *,
    port: int = DEFAULT_PORT,
    silent: bool = False,
    timeout_s: float = STARTUP_TIMEOUT_S,
) -> DevServerHandle:
    """Start a LangGraph dev server rooted at this package's ``langgraph.json``.

    Args:
        port: Port for ``langgraph dev`` (default 2024).
        silent: When True, do not echo child stdout/stderr to this process.
        timeout_s: Seconds to wait for ``GET /ok`` before raising.

    Returns:
        ``url`` for SDK clients and a ``stop()`` callback that terminates the child.
    """
    url = f"http://127.0.0.1:{port}"
    health = f"{url}/ok"

    cli = _langgraph_cli_path()
    cmd = [cli, "dev", "--port", str(port), "--no-browser"]
    env = os.environ.copy()
    proc = subprocess.Popen(
        cmd,
        cwd=PACKAGE_ROOT,
        env=env,
        stdout=subprocess.DEVNULL if silent else None,
        stderr=subprocess.DEVNULL if silent else None,
        start_new_session=True,
    )

    def stop() -> None:
        if proc.poll() is not None:
            return
        with contextlib.suppress(ProcessLookupError):
            os.killpg(proc.pid, signal.SIGTERM)
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            with contextlib.suppress(ProcessLookupError):
                os.killpg(proc.pid, signal.SIGKILL)
            proc.wait()

    deadline = time.monotonic() + timeout_s
    last_err: Exception | None = None
    while time.monotonic() < deadline:
        if proc.poll() is not None:
            raise RuntimeError(
                f"langgraph dev exited with code {proc.returncode} before becoming ready"
            )
        try:
            resp = httpx.get(health, timeout=2.0)
            if resp.status_code == 200:
                return DevServerHandle(url=url, stop=stop)
        except Exception as err:  # noqa: BLE001 — poll until ready or timeout
            last_err = err
        time.sleep(0.25)

    stop()
    detail = f" ({last_err})" if last_err else ""
    raise TimeoutError(
        f"Dev server did not respond on {health} within {timeout_s}s{detail}"
    )
