#!/usr/bin/env bash
# Uploads PR evidence (screenshots and simulator videos) to the bunny.net
# zone `vera-evidence` and prints Markdown to paste into the PR description.
# Evidence never goes in git.
#
#   scripts/evidence.sh .cache/evidence/before.png .cache/evidence/after.mp4
#
# Images embed directly. Videos are re-encoded to a small H.264 MP4 and get
# an animated GIF preview that links to it, because GitHub only plays
# videos uploaded through its own web editor.
set -euo pipefail

ZONE="vera-evidence"
CDN="https://vera-evidence.b-cdn.net"

if [ "$#" -eq 0 ]; then
  sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'
  exit 2
fi

ROOT="$(git rev-parse --show-toplevel)"
branch="$(git -C "$ROOT" branch --show-current | sed -E 's/[^A-Za-z0-9]+/-/g')"
# Unlisted: the repository is private, so paths are not guessable.
prefix="pr/$branch/$(date +%Y%m%d-%H%M%S)-$(openssl rand -hex 4)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

upload() {
  local log
  log="$(bunny storage files upload "$1" --zone "$ZONE" --to "$prefix/$2" \
    --content-type "$3" 2>&1)" || {
    echo "$log" >&2
    exit 1
  }
  echo "$CDN/$prefix/$2"
}

for file in "$@"; do
  name="$(basename "$file")"
  stem="${name%.*}"
  label="$(echo "$stem" | tr '_-' '  ')"
  case "${name##*.}" in
    png) echo "![$label]($(upload "$file" "$name" image/png))" ;;
    jpg | jpeg) echo "![$label]($(upload "$file" "$name" image/jpeg))" ;;
    gif) echo "![$label]($(upload "$file" "$name" image/gif))" ;;
    mp4 | mov)
      ffmpeg -loglevel error -y -i "$file" -vf "scale=590:-2" -c:v libx264 \
        -preset veryfast -crf 26 -pix_fmt yuv420p -movflags +faststart -an \
        "$work/$stem.mp4"
      ffmpeg -loglevel error -y -i "$file" -vf \
        "fps=15,scale=320:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4" \
        "$work/$stem.gif"
      video="$(upload "$work/$stem.mp4" "$stem.mp4" video/mp4)"
      preview="$(upload "$work/$stem.gif" "$stem.gif" image/gif)"
      echo "[![$label]($preview)]($video)"
      ;;
    *)
      echo "skipping $file: not an image or video" >&2
      ;;
  esac
done
