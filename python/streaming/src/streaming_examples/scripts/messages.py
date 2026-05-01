from __future__ import annotations

from streaming_examples.agents.simple_tool_graph import graph


def main() -> None:
    run = graph.stream_events(
        {
            "messages": [
                {
                    "role": "user",
                    "content": (
                        "Search the web for the current population of Tokyo, "
                        "then calculate what 1% of that number is."
                    ),
                }
            ]
        },
        version="v3",
    )

    print("--- Streaming messages (in-process) ---")
    for message in run.messages:
        print("\n  reasoning: ", end="")
        for reasoning in message.reasoning:
            print(reasoning, end="", flush=True)

        print("\n  text: ", end="")
        for token in message.text:
            print(token, end="", flush=True)

        output = message.output
        content = getattr(output, "content", [])
        print(f"\n  content blocks: {len(content)}", end="")

        usage = getattr(output, "usage_metadata", None)
        if usage:
            print(
                f"\n  tokens: {usage.get('input_tokens', 0)} in, "
                f"{usage.get('output_tokens', 0)} out",
                end="",
            )

        print("\n")

    print("--- Final output ---")
    state = run.output
    print((state.get("messages") or [])[-1])


if __name__ == "__main__":
    main()
