#!/usr/bin/env bash

set -uo pipefail

INPUT_DIRECTORY="./letiteach-physics"
OUTPUT_DIRECTORY="./letiteach-audio"
BITRATE="96k"

usage() {
    cat <<'EOF'
Convert downloaded LETIteach MP4 videos to compact MP3 audio files.

Usage:
  ./convert-to-mp3.sh [options]

Options:
  -i, --input DIR       Directory containing MP4 files
                        (default: ./letiteach-physics)
  -o, --output DIR      Directory for MP3 files
                        (default: ./letiteach-audio)
  -b, --bitrate VALUE   MP3 bitrate, for example 64k, 96k, or 128k
                        (default: 96k)
  -h, --help            Show this help
EOF
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        -i|--input)
            [[ $# -ge 2 ]] || { echo "Missing value for $1" >&2; exit 1; }
            INPUT_DIRECTORY="$2"
            shift 2
            ;;
        -o|--output)
            [[ $# -ge 2 ]] || { echo "Missing value for $1" >&2; exit 1; }
            OUTPUT_DIRECTORY="$2"
            shift 2
            ;;
        -b|--bitrate)
            [[ $# -ge 2 ]] || { echo "Missing value for $1" >&2; exit 1; }
            BITRATE="$2"
            shift 2
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            echo "Unknown argument: $1" >&2
            usage >&2
            exit 1
            ;;
    esac
done

if [[ ! "$BITRATE" =~ ^[0-9]+k$ ]]; then
    echo "Invalid bitrate: $BITRATE. Example: 96k" >&2
    exit 1
fi

command -v ffmpeg >/dev/null 2>&1 || {
    echo "ffmpeg is not installed. See README.md for installation commands." >&2
    exit 1
}

[[ -d "$INPUT_DIRECTORY" ]] || {
    echo "Input directory not found: $INPUT_DIRECTORY" >&2
    exit 1
}

mkdir -p "$OUTPUT_DIRECTORY"

FAILED=0
shopt -s nullglob nocaseglob
INPUT_FILES=("$INPUT_DIRECTORY"/*.mp4)

if [[ ${#INPUT_FILES[@]} -eq 0 ]]; then
    echo "No MP4 files found in: $INPUT_DIRECTORY" >&2
    exit 1
fi

for input_file in "${INPUT_FILES[@]}"; do
    filename="$(basename "$input_file")"
    output_file="$OUTPUT_DIRECTORY/${filename%.*}.mp3"

    if [[ -f "$output_file" ]]; then
        echo "Skipping existing file: $output_file"
        continue
    fi

    echo "Converting $input_file..."

    if ! ffmpeg \
        -hide_banner \
        -loglevel error \
        -i "$input_file" \
        -vn \
        -codec:a libmp3lame \
        -b:a "$BITRATE" \
        -ac 1 \
        -n \
        "$output_file"; then
        echo "Could not convert: $input_file" >&2
        FAILED=1
    fi
done

if [[ $FAILED -ne 0 ]]; then
    exit 2
fi

echo "Done. Audio files are in: $OUTPUT_DIRECTORY"
