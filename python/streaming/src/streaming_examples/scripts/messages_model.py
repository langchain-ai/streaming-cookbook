from __future__ import annotations

from streaming_examples.agents.shared import model


def main() -> None:
    # Model-level event streaming uses BaseChatModel.stream_v2().
    # Iterate `stream` itself for raw content-block events.
    stream = model.stream_v2(
        "Search the web for the current population of Tokyo, then calculate what 1% of that number is."
    )

    print("--- Streaming messages (model) ---\n")
    print('[Message #1 from "model"] ', end="")

    print("\n  reasoning: ", end="")
    for reasoning in stream.reasoning:
        print(reasoning, end="", flush=True)

    print("\n  text: ", end="")
    for token in stream.text:
        print(token, end="", flush=True)

    print("\n\n--- Retrieving output ---")
    output = stream.output
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


if __name__ == "__main__":
    main()
