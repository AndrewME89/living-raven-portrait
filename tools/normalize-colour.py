#!/usr/bin/env python3
"""Create colour-corrected copies of the portrait's source videos."""

from __future__ import annotations

import argparse
from pathlib import Path
import shutil
import subprocess
import sys


REPOSITORY_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_INPUT_DIRECTORY = REPOSITORY_ROOT / "assets" / "video"
DEFAULT_OUTPUT_DIRECTORY = REPOSITORY_ROOT / "assets" / "video-corrected"

# Keep this explicit: the table is also the manifest of inputs that must be present.
GAINS = {
    "Adjust.mp4": (1.0020, 1.0060, 1.0183),
    "Away.mp4": (1.0205, 1.0267, 1.0060),
    "Blink.mp4": (0.9651, 0.9671, 0.9882),
    "Dance.mp4": (0.9577, 0.9579, 0.9654),
    "Dance2_Hardstylez.mp4": (1.0081, 1.0101, 1.0121),
    "DoubleBlink.mp4": (1.0226, 1.0081, 1.0000),
    "Lightning.mp4": (0.9746, 0.9823, 0.9805),
    "LookLeft.mp4": (0.9842, 0.9843, 1.0020),
    "LookViewer.mp4": (0.9920, 0.9823, 0.9862),
    "Mausoleum.mp4": (1.0353, 1.0183, 1.0000),
    "Preen.mp4": (1.0000, 1.0000, 1.0080),
    "Return.mp4": (1.1581, 1.1547, 1.1306),
    "Ruffle.mp4": (1.0311, 1.0246, 1.0203),
    "Settle.mp4": (0.9361, 0.9434, 0.9490),
    "Stretch.mp4": (0.9540, 0.9506, 0.9454),
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Write colour-corrected copies of all portrait videos."
    )
    parser.add_argument(
        "input_directory",
        nargs="?",
        type=Path,
        default=DEFAULT_INPUT_DIRECTORY,
        help="source directory (default: assets/video relative to the repository root)",
    )
    parser.add_argument(
        "output_directory",
        nargs="?",
        type=Path,
        default=DEFAULT_OUTPUT_DIRECTORY,
        help=(
            "destination directory "
            "(default: assets/video-corrected relative to the repository root)"
        ),
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="replace corrected outputs that already exist",
    )
    return parser.parse_args()


def fail(message: str) -> int:
    print(f"error: {message}", file=sys.stderr)
    return 1


def main() -> int:
    args = parse_args()
    ffmpeg = shutil.which("ffmpeg")
    if ffmpeg is None:
        return fail("ffmpeg was not found on PATH")

    input_directory = args.input_directory.resolve()
    output_directory = args.output_directory.resolve()
    protected_source_directory = DEFAULT_INPUT_DIRECTORY.resolve()
    if output_directory == input_directory or output_directory.is_relative_to(
        protected_source_directory
    ):
        return fail("the output directory must not overwrite the source videos")

    missing = [name for name in GAINS if not (input_directory / name).is_file()]
    if missing:
        print("error: expected input files are missing:", file=sys.stderr)
        for name in missing:
            print(f"  {input_directory / name}", file=sys.stderr)
        return 1

    existing = [name for name in GAINS if (output_directory / name).exists()]
    if existing and not args.overwrite:
        print(
            "error: corrected outputs already exist (use --overwrite to replace them):",
            file=sys.stderr,
        )
        for name in existing:
            print(f"  {output_directory / name}", file=sys.stderr)
        return 1

    output_directory.mkdir(parents=True, exist_ok=True)

    for filename, (red, green, blue) in GAINS.items():
        source = input_directory / filename
        destination = output_directory / filename
        temporary = output_directory / f".{filename}.partial.mp4"
        temporary.unlink(missing_ok=True)
        print(f"{filename}: red={red:.4f} green={green:.4f} blue={blue:.4f}")

        command = [
            ffmpeg,
            "-hide_banner",
            "-nostdin",
            "-y",
            "-i",
            str(source),
            "-map",
            "0:v:0",
            "-map",
            "0:a:0?",
            "-map_metadata",
            "0",
            "-vf",
            f"colorchannelmixer=rr={red:.4f}:gg={green:.4f}:bb={blue:.4f}",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "copy",
            "-movflags",
            "+faststart",
            str(temporary),
        ]
        try:
            subprocess.run(command, check=True)
            temporary.replace(destination)
        except (subprocess.CalledProcessError, OSError) as error:
            temporary.unlink(missing_ok=True)
            return fail(f"could not encode {filename}: {error}")

    print(f"Corrected videos written to: {output_directory}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
