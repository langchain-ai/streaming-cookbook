from __future__ import annotations

import json

from streaming_examples.agents.a2a_research import graph


def main() -> None:
    run = graph.stream_events(
        {
            "messages": [
                {
                    "role": "user",
                    "content": "Research WebAssembly adoption and identify key risks.",
                }
            ]
        },
        version="v3",
    )

    print("--- Streaming A2A events (in-process) ---\n")

    for event in run.extensions["a2a"]:
        print(json.dumps(event))

    _ = run.output
    print("\n--- Done ---")


if __name__ == "__main__":
    main()
