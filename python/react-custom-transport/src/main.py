"""Start the local Agent Streaming Protocol server on port 9123."""

from __future__ import annotations

import asyncio
import os
from pathlib import Path

from dotenv import load_dotenv

from agent import graph
from app.server import CustomServer

_REPO_ROOT = Path(__file__).resolve().parents[3]
load_dotenv(_REPO_ROOT / ".env")

PORT = int(os.environ.get("PORT", "9123"))


async def main() -> None:
    server = CustomServer(graph)
    print(f"Agent Streaming Protocol server listening on http://localhost:{PORT}")
    await server.start(PORT)


if __name__ == "__main__":
    asyncio.run(main())
