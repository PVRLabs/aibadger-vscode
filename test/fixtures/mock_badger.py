#!/usr/bin/env python3
"""
Minimal text-first mock AI Badger CLI.

Commands:
  mock_badger.py api topology
  mock_badger.py api prompt --focus design --input goal.txt
  mock_badger.py api extract --input selectors.txt --goal-file goal.txt

This mock does not scan repositories or read real source files.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path


MOCK_FILES = {
    "README.md",
    "go.mod",
    "cmd/demo/main.go",
    "internal/greeting/greeting.go",
    "internal/greeting/greeting_test.go",
    "docs/architecture.md",
}

TOPOLOGY = """[PROJECT TOPOLOGY]
Languages: Go
Stack: Go Modules
Structure: Single Module

[SOURCE TREE]
Pkg: . [2 files] -> Top: README.md, go.mod
Pkg: cmd/demo [1 files] -> Top: main.go
Pkg: internal/greeting [2 files] -> Top: greeting.go, greeting_test.go
Pkg: docs [1 files] -> Top: architecture.md
"""

FOCUS_CONSTRAINTS = {
    "code": (
        "Request only the smallest context set needed to complete the task. "
        "Reply using FILE:, PREFIX:, or NEAR: lines only."
    ),
    "design": (
        "Request only the files needed to understand the relevant contracts "
        "and architecture. Reply using FILE:, PREFIX:, or NEAR: lines only."
    ),
    "review": (
        "Request only the files needed to review the described change. "
        "Reply using FILE:, PREFIX:, or NEAR: lines only."
    ),
    "followup": (
        "Request only any additional files needed for this follow-up. "
        "Reply using FILE:, PREFIX:, or NEAR: lines only."
    ),
}

PROMPT_2_CONSTRAINT = (
    "Use the provided context to answer the task. "
    "Do not respond with FILE:, PREFIX:, or NEAR: selector lines."
)


class CliError(Exception):
    pass


def read_required_file(value: str, label: str) -> str:
    path = Path(value)
    try:
        content = path.read_text(encoding="utf-8").strip()
    except FileNotFoundError:
        raise CliError(f"{label} not found: {path}") from None
    except OSError as exc:
        raise CliError(f"failed to read {label.lower()} {path}: {exc}") from exc

    if not content:
        raise CliError(f"{label} is empty: {path}")
    return content


def handle_topology(_: argparse.Namespace) -> int:
    print(TOPOLOGY, end="")
    return 0


def handle_prompt(args: argparse.Namespace) -> int:
    goal = read_required_file(args.input, "Input file")

    print(TOPOLOGY)
    print("[TASK]")
    print(goal)
    print()
    print("[CONSTRAINT]")
    print(FOCUS_CONSTRAINTS[args.focus])
    return 0


def parse_selector(line: str) -> tuple[str, str, str]:
    raw = line.strip()
    if ":" not in raw:
        raise CliError(f"invalid selector: {raw}")

    selector_type, value = raw.split(":", 1)
    selector_type = selector_type.strip().upper()
    value = value.strip()

    if selector_type not in {"FILE", "PREFIX", "NEAR"}:
        raise CliError(f"unsupported selector type: {selector_type}")
    if not value:
        raise CliError(f"missing selector path: {raw}")

    if selector_type == "FILE":
        return selector_type, value, ""

    if "#" not in value:
        raise CliError(f"{selector_type} requires path#pattern: {raw}")

    path, pattern = (part.strip() for part in value.split("#", 1))
    if not path or not pattern:
        raise CliError(f"{selector_type} requires path#pattern: {raw}")

    return selector_type, path, pattern


def placeholder_content(selector_type: str, path: str, pattern: str) -> str:
    if selector_type == "FILE":
        return f"// Mock content for {path}"

    return (
        f"// Mock extracted span for {path}\n"
        f"// Selector: {selector_type}\n"
        f"// Pattern: {pattern}"
    )


def handle_extract(args: argparse.Namespace) -> int:
    selectors_text = read_required_file(args.input, "Input file")
    goal = read_required_file(args.goal_file, "Goal file")

    extracted: list[tuple[str, str, str]] = []
    failures: list[str] = []

    for line_number, line in enumerate(selectors_text.splitlines(), start=1):
        if not line.strip():
            continue

        try:
            selector_type, path, pattern = parse_selector(line)
        except CliError as exc:
            failures.append(f"line {line_number}: {exc}")
            continue

        if path not in MOCK_FILES:
            failures.append(f"{path}: file not found in mock topology")
            continue

        extracted.append(
            (
                path,
                "Full File" if selector_type == "FILE" else "Extracted Span",
                placeholder_content(selector_type, path, pattern),
            )
        )

    for failure in failures:
        print(f"Warning: {failure}", file=sys.stderr)

    if not extracted:
        raise CliError("no mock files were extracted")

    print(TOPOLOGY)
    print("[TASK]")
    print(goal)
    print()
    print("[OUTPUT CONSTRAINT]")
    print(PROMPT_2_CONSTRAINT)
    print()
    print("[CONTEXT]")

    for path, label, content in extracted:
        print(f"--- File: {path} ({label}) ---")
        print(content)
        print("--- End File ---")

    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="mock_badger.py",
        description="Minimal text-first mock of the AI Badger external-tool interface.",
        epilog=(
            "Examples:\n"
            "  mock_badger.py api topology\n"
            "  mock_badger.py api prompt --focus design --input goal.txt\n"
            "  mock_badger.py api extract --input selectors.txt --goal-file goal.txt\n"
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )

    commands = parser.add_subparsers(dest="command", required=True)

    api = commands.add_parser(
        "api",
        help="Use the mocked external-tool API.",
    )
    operations = api.add_subparsers(dest="operation", required=True)

    topology = operations.add_parser(
        "topology",
        help="Print the fixed mock topology.",
    )
    topology.set_defaults(handler=handle_topology)

    prompt = operations.add_parser(
        "prompt",
        help="Create mock Prompt 1 from a goal file.",
    )
    prompt.add_argument(
        "--focus",
        choices=("code", "design", "review", "followup"),
        default="code",
        help="Prompt focus. Default: code.",
    )
    prompt.add_argument(
        "--input",
        required=True,
        metavar="FILE",
        help="UTF-8 text file containing the user goal.",
    )
    prompt.set_defaults(handler=handle_prompt)

    extract = operations.add_parser(
        "extract",
        help="Create mock Prompt 2 from selector and goal files.",
    )
    extract.add_argument(
        "--input",
        required=True,
        metavar="FILE",
        help="UTF-8 file containing FILE/PREFIX/NEAR selectors.",
    )
    extract.add_argument(
        "--goal-file",
        required=True,
        metavar="FILE",
        help="UTF-8 file containing the original user goal.",
    )
    extract.set_defaults(handler=handle_extract)

    return parser


def main() -> int:
    args = build_parser().parse_args()
    try:
        return args.handler(args)
    except CliError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 2
    except BrokenPipeError:
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
