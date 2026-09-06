#!/usr/bin/env bash

set -uo pipefail

BASE_URL="https://s3stor.etu.ru:8080/letiteach/PHYSICS_LECTURES_HLS"
QUALITY="720p"
OUTPUT_DIRECTORY="./letiteach-physics"
LIST_FILE=""
LECTURE_IDS=()

usage() {
    cat <<'EOF'
Download LETIteach physics video blocks from their HLS playlists.

Usage:
  ./download-letiteach.sh --ids 1_1,1_2,1_3 [options]
  ./download-letiteach.sh --list-file lectures.txt [options]

Options:
  -i, --ids IDS          Comma-separated video block IDs
  -f, --list-file FILE   Text file with one video block ID per line
  -q, --quality VALUE    best, 1080p, 720p, or 540p (default: 720p)
  -o, --output DIR       Output directory (default: ./letiteach-physics)
  -h, --help             Show this help
EOF
}

add_unique_id() {
    local candidate="$1"
    local existing

    for existing in "${LECTURE_IDS[@]:-}"; do
        if [[ "$existing" == "$candidate" ]]; then
            return
        fi
    done

    LECTURE_IDS+=("$candidate")
}

add_comma_separated_ids() {
    local raw_ids="$1"
    local parsed_ids=()
    local lecture_id

    IFS=',' read -r -a parsed_ids <<< "$raw_ids"
    for lecture_id in "${parsed_ids[@]}"; do
        lecture_id="${lecture_id#"${lecture_id%%[![:space:]]*}"}"
        lecture_id="${lecture_id%"${lecture_id##*[![:space:]]}"}"
        [[ -n "$lecture_id" ]] && add_unique_id "$lecture_id"
    done
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        -i|--ids)
            [[ $# -ge 2 ]] || { echo "Missing value for $1" >&2; exit 1; }
            add_comma_separated_ids "$2"
            shift 2
            ;;
        -f|--list-file)
            [[ $# -ge 2 ]] || { echo "Missing value for $1" >&2; exit 1; }
            LIST_FILE="$2"
            shift 2
            ;;
        -q|--quality)
            [[ $# -ge 2 ]] || { echo "Missing value for $1" >&2; exit 1; }
            QUALITY="$2"
            shift 2
            ;;
        -o|--output)
            [[ $# -ge 2 ]] || { echo "Missing value for $1" >&2; exit 1; }
            OUTPUT_DIRECTORY="$2"
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

case "$QUALITY" in
    best|1080p|720p|540p) ;;
    *)
        echo "Invalid quality: $QUALITY" >&2
        echo "Allowed values: best, 1080p, 720p, 540p" >&2
        exit 1
        ;;
esac

if [[ -n "$LIST_FILE" ]]; then
    [[ -f "$LIST_FILE" ]] || { echo "List file not found: $LIST_FILE" >&2; exit 1; }

    while IFS= read -r line || [[ -n "$line" ]]; do
        line="${line#"${line%%[![:space:]]*}"}"
        line="${line%"${line##*[![:space:]]}"}"
        [[ -z "$line" || "$line" == \#* ]] && continue
        add_unique_id "$line"
    done < "$LIST_FILE"
fi

if [[ ${#LECTURE_IDS[@]} -eq 0 ]]; then
    echo "No video block IDs specified." >&2
    usage >&2
    exit 1
fi

command -v yt-dlp >/dev/null 2>&1 || {
    echo "yt-dlp is not installed. See README.md for installation commands." >&2
    exit 1
}

command -v ffmpeg >/dev/null 2>&1 || {
    echo "ffmpeg is not installed. See README.md for installation commands." >&2
    exit 1
}

mkdir -p "$OUTPUT_DIRECTORY"

FAILED_IDS=()

for lecture_id in "${LECTURE_IDS[@]}"; do
    if [[ ! "$lecture_id" =~ ^[0-9]+_[0-9]+$ ]]; then
        echo "Skipping invalid video block ID: $lecture_id" >&2
        FAILED_IDS+=("$lecture_id")
        continue
    fi

    case "$QUALITY" in
        best)
            playlist_url="$BASE_URL/$lecture_id/master.m3u8"
            ;;
        1080p)
            playlist_url="$BASE_URL/$lecture_id/${lecture_id}_orig.m3u8"
            ;;
        720p|540p)
            playlist_url="$BASE_URL/$lecture_id/${lecture_id}_${QUALITY}.m3u8"
            ;;
    esac

    output_template="$OUTPUT_DIRECTORY/$lecture_id.%(ext)s"
    echo "Downloading $lecture_id in $QUALITY..."

    if ! yt-dlp \
        --continue \
        --no-overwrites \
        --merge-output-format mp4 \
        --output "$output_template" \
        "$playlist_url"; then
        echo "Could not download $lecture_id. Check its ID and available quality." >&2
        FAILED_IDS+=("$lecture_id")
    fi
done

if [[ ${#FAILED_IDS[@]} -gt 0 ]]; then
    echo "Failed or skipped IDs: ${FAILED_IDS[*]}" >&2
    exit 2
fi

echo "Done. Videos are in: $OUTPUT_DIRECTORY"
