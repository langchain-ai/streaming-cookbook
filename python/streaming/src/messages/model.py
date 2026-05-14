"""Streaming messages directly from the chat model.

Mirrors `messages/in_process.py` but calls the model directly — no
graph. Streams reasoning and text chunks, then reads the finalized
`AIMessage` from the chained chunks.

Run:
    cd python/streaming
    uv run python -m messages.model
"""

from __future__ import annotations

import asyncio
import sys

from langchain_core.messages import AIMessageChunk

from agents.shared import model


async def main() -> None:
    prompt = (
        "Search the web for the current population of Tokyo, then calculate "
        "what 1% of that number is."
    )

    print("--- Streaming messages (model) ---\n")
    sys.stdout.write('[Message #1 from "model"]\n')

    final: AIMessageChunk | None = None
    reasoning_text = ""
    final_text = ""

    sys.stdout.write("  reasoning: ")
    async for chunk in model.astream(prompt):
        final = chunk if final is None else final + chunk  # type: ignore[operator]

        content = chunk.content
        if isinstance(content, list):
            for block in content:
                if not isinstance(block, dict):
                    continue
                btype = block.get("type")
                if btype in {"reasoning", "thinking"} and isinstance(
                    block.get("reasoning") or block.get("thinking"), str
                ):
                    delta = block.get("reasoning") or block.get("thinking") or ""
                    reasoning_text += delta
                    sys.stdout.write(delta)
                    sys.stdout.flush()
        elif isinstance(content, str) and content:
            final_text += content

    sys.stdout.write("\n  text: ")
    # If the content was a single string (no reasoning blocks), it was
    # accumulated into `final_text` above. Otherwise pull the text from
    # the chained AIMessageChunk.
    if final_text:
        sys.stdout.write(final_text)
    elif final is not None and isinstance(final.content, list):
        for block in final.content:
            if isinstance(block, dict) and block.get("type") == "text":
                sys.stdout.write(block.get("text") or "")

    print("\n\n--- Retrieving output ---")
    if final is not None:
        blocks = final.content if isinstance(final.content, list) else 1
        sys.stdout.write(
            f"\n  content blocks: {len(blocks) if isinstance(blocks, list) else blocks}"
        )
        usage = getattr(final, "usage_metadata", None) or {}
        if usage:
            sys.stdout.write(
                f"\n  tokens: {usage.get('input_tokens') or 0} in, "
                f"{usage.get('output_tokens') or 0} out"
            )
        sys.stdout.write("\n\n")


if __name__ == "__main__":
    asyncio.run(main())
