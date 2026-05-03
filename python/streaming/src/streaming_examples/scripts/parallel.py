from __future__ import annotations

from streaming_examples.agents.simple_tool_graph import graph


def main() -> None:
    run = graph.stream_events(
        {
            "messages": [
                {
                    "role": "user",
                    "content": (
                        "Search the web for the population of Paris, "
                        "then calculate 5% of that number."
                    ),
                }
            ]
        },
        version="v3",
    )

    print("--- Parallel consumption ---\n")

    message_count = 0
    values_count = 0
    for name, item in run.interleave("messages", "values"):
        if name == "messages":
            message_count += 1
            text = str(item.text)
            if text:
                preview = f"{text[:57]}..." if len(text) > 60 else text
                print(f"  [msg #{message_count}] {preview}")
            else:
                print(f"  [msg #{message_count}] (tool call)")
        elif name == "values":
            values_count += 1

    final_state = run.output

    print("\n--- Summary ---")
    print(f"Messages streamed: {message_count}")
    print(f"State snapshots: {values_count}")
    print(f"Final state messages: {len(final_state.get('messages') or [])}")


if __name__ == "__main__":
    main()
