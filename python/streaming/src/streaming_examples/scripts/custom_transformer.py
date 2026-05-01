from __future__ import annotations

from streaming_examples.agents.simple_tool_graph import graph
from streaming_examples.shared.custom_transformers import (
    StatsTransformer,
    ToolActivityTransformer,
)

DIM = "\033[2m"
BOLD = "\033[1m"
RESET = "\033[0m"
CYAN = "\033[36m"
YELLOW = "\033[33m"
GREEN = "\033[32m"


def main() -> None:
    run = graph.stream_events(
        {
            "messages": [
                {
                    "role": "user",
                    "content": "What is the square root of 144? Then search for who discovered it.",
                }
            ]
        },
        version="v3",
        transformers=[StatsTransformer, ToolActivityTransformer],
    )

    print(f"{BOLD}--- Interleaved consumers ---{RESET}\n")

    msg_index = 0
    tool_call_count: int | None = None
    total_tokens: int | None = None

    for name, item in run.interleave(
        "messages",
        "toolActivity",
        "tool_call_count",
        "total_tokens",
    ):
        if name == "messages":
            msg_index += 1
            text = str(item.text)
            if text:
                print(f"{CYAN}[message #{msg_index}]{RESET} {text}")
            else:
                print(f"{CYAN}[message #{msg_index}]{RESET} {DIM}(tool call){RESET}")

            usage = getattr(item.output, "usage_metadata", None)
            if usage:
                print(
                    f"{DIM}  tokens: {usage.get('input_tokens', 0)} in, "
                    f"{usage.get('output_tokens', 0)} out{RESET}"
                )
        elif name == "toolActivity":
            color = YELLOW if item["status"] == "started" else GREEN
            print(
                f"{color}[tool]{RESET} {item['name']} "
                f"{DIM}-> {item['status']}{RESET}"
            )
        elif name == "tool_call_count":
            tool_call_count = item
        elif name == "total_tokens":
            total_tokens = item

    print(f"\n{BOLD}--- Final stats (from StatsTransformer) ---{RESET}")
    print(f"  Tool calls:   {tool_call_count}")
    print(f"  Total tokens: {total_tokens}")


if __name__ == "__main__":
    main()
