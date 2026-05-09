from __future__ import annotations

from streaming_examples.agents.simple_tool_graph import graph
from streaming_examples.scripts._utils import last_message_content, print_event


def main() -> None:
    run = graph.stream_events(
        {"messages": [{"role": "user", "content": "What is 42 * 17?"}]},
        version="v3",
    )

    print("--- Streaming All protocol events (in-process) ---\n")

    for event in run:
        print_event(event)

    final_state = run.output
    print("\n--- Final answer ---")
    print(last_message_content(final_state))


if __name__ == "__main__":
    main()
