"""Same shape as `simple_tool_graph` but with module-level stream
transformers (stats + tool activity) so the projections are available
both in-process (via `astream_events(transformers=...)`) and remotely
(picked up by langgraph-api's auto-registration of
`stream_transformers()` factories).
"""

from __future__ import annotations

from shared.custom_transformers import (
    stats_transformer,
    tool_activity_transformer,
)

# Re-export the simple-tool-graph definition.
from agents.simple_tool_graph import graph as graph


def stream_transformers() -> list:
    """Auto-registered by `langgraph-api` when this module is loaded
    as a `langgraph.json` graph entry. Returns fresh transformer
    instances per run so per-run state doesn't leak.
    """
    return [stats_transformer(), tool_activity_transformer()]
