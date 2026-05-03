from __future__ import annotations

import json

from streaming_examples.agents.research_pipeline import graph


def main() -> None:
    run = graph.stream_events(
        {
            "messages": [
                {
                    "role": "user",
                    "content": "Research TypeScript 5.8 features and identify risks.",
                }
            ]
        },
        version="v3",
    )

    for subgraph in run.subgraphs:
        path = "/".join(subgraph.path)
        label = subgraph.graph_name or path or "subgraph"
        print(f"\n--- Subgraph: {label} [{path}] ---")

        for message in subgraph.messages:
            node_label = message.node if message.node else label
            prefix = f"{label}/{node_label}" if message.node else label
            print(f"\n  [{prefix}] ", end="")
            for delta in message.text:
                print(delta, end="", flush=True)

            usage = getattr(message.output, "usage_metadata", None)
            if usage:
                print(
                    f"\n  (tokens: {usage.get('input_tokens')} in / "
                    f"{usage.get('output_tokens')} out)",
                    end="",
                )
            print()

        output = subgraph.output
        summary = json.dumps(output, default=str)[:120]
        print(f"\n--- Subgraph {label} completed: {summary} ---")

    print("\nDone.")


if __name__ == "__main__":
    main()
