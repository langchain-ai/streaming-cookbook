"""Minimal HTTP server for the Agent Streaming Protocol.

One ``LocalThreadSession`` per thread id (SSE replay + active runs) backed
by a shared compiled graph with an ``InMemorySaver`` checkpointer. Thread
state is exposed through the LangGraph SDK ``/threads/:id/state`` routes
recommended by the Agent Protocol.
"""

from __future__ import annotations

from typing import Any

import uvicorn
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import JSONResponse, Response, StreamingResponse
from starlette.routing import Route

from app.session import LocalProtocolGraph, LocalThreadSession
from app.threads import get_thread_history, get_thread_state, update_thread_state


class CustomServer:
    """Expose an in-process LangGraph through Agent Protocol HTTP endpoints."""

    def __init__(self, graph: LocalProtocolGraph) -> None:
        self._graph = graph
        self._sessions: dict[str, LocalThreadSession] = {}

    def _session(self, thread_id: str) -> LocalThreadSession:
        session = self._sessions.get(thread_id)
        if session is None:
            session = LocalThreadSession(self._graph, thread_id)
            self._sessions[thread_id] = session
        return session

    async def _get_state(self, request: Request) -> Response:
        thread_id = request.path_params["thread_id"]
        try:
            state = await get_thread_state(self._graph, thread_id)
        except KeyError:
            return JSONResponse(
                {
                    "error": "not_found",
                    "message": f"Thread {thread_id} not found",
                },
                status_code=404,
            )
        return JSONResponse(state)

    async def _post_state(self, request: Request) -> Response:
        thread_id = request.path_params["thread_id"]
        body = await request.json()
        values = body.get("values") if isinstance(body, dict) else None
        checkpoint = body.get("checkpoint") if isinstance(body, dict) else None
        as_node = body.get("as_node") if isinstance(body, dict) else None
        try:
            state = await update_thread_state(
                self._graph,
                thread_id,
                values=values if isinstance(values, dict) else None,
                checkpoint=checkpoint if isinstance(checkpoint, dict) else None,
                as_node=as_node if isinstance(as_node, str) else None,
            )
        except Exception as exc:  # noqa: BLE001
            return JSONResponse(
                {
                    "error": "invalid_state_update",
                    "message": str(exc),
                },
                status_code=422,
            )
        return JSONResponse(state)

    async def _post_history(self, request: Request) -> Response:
        thread_id = request.path_params["thread_id"]
        body = await request.json()
        parsed = body if isinstance(body, dict) else {}
        limit_raw = parsed.get("limit", 10)
        limit = int(limit_raw) if isinstance(limit_raw, int) else 10
        before = parsed.get("before")

        try:
            history = await get_thread_history(
                self._graph,
                thread_id,
                limit=limit,
                before=before,
            )
        except KeyError:
            return JSONResponse(
                {
                    "error": "not_found",
                    "message": f"Thread {thread_id} not found",
                },
                status_code=404,
            )
        return JSONResponse(history)

    async def _commands(self, request: Request) -> JSONResponse:
        thread_id = request.path_params["thread_id"]
        command = await request.json()
        result = await self._session(thread_id).handle_command(command)
        return JSONResponse(result)

    async def _stream(self, request: Request) -> StreamingResponse:
        thread_id = request.path_params["thread_id"]
        params: dict[str, Any] = await request.json()
        return StreamingResponse(
            self._session(thread_id).stream(params),
            media_type="text/event-stream",
            headers={"cache-control": "no-cache"},
        )

    def _build_app(self) -> Starlette:
        return Starlette(
            routes=[
                Route(
                    "/threads/{thread_id}/state",
                    self._get_state,
                    methods=["GET"],
                ),
                Route(
                    "/threads/{thread_id}/state",
                    self._post_state,
                    methods=["POST"],
                ),
                Route(
                    "/threads/{thread_id}/history",
                    self._post_history,
                    methods=["POST"],
                ),
                Route(
                    "/threads/{thread_id}/commands",
                    self._commands,
                    methods=["POST"],
                ),
                Route(
                    "/threads/{thread_id}/stream",
                    self._stream,
                    methods=["POST"],
                ),
            ]
        )

    async def start(self, port: int) -> None:
        config = uvicorn.Config(
            self._build_app(),
            host="0.0.0.0",
            port=port,
            log_level="info",
        )
        server = uvicorn.Server(config)
        await server.serve()
