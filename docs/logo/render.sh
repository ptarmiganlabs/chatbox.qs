#!/usr/bin/env bash
#
# Renders every derived logo file from the SVG sources in this directory.
# Run it after editing any SVG; never hand-edit a PNG.
#
#   docs/logo/render.sh
#
# Needs rsvg-convert and ImageMagick. Both are outside npm on purpose: nothing
# here is needed to build, test or run the extension, and the dependency list
# is short deliberately.
#
#   macOS:    brew install librsvg imagemagick
#   Windows:  winget install ImageMagick.ImageMagick  (rsvg-convert ships with
#             the GTK runtime; magick alone can do everything below, less
#             faithfully on text)
set -euo pipefail

for cmd in rsvg-convert magick; do
  command -v "$cmd" >/dev/null || { echo "missing $cmd — see the comment at the top of this file" >&2; exit 1; }
done

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
cd "$HERE"

ASSETS="$ROOT/assets/logo"
DOCSITE="$ASSETS/docs-site"
mkdir -p "$ASSETS" "$DOCSITE"

# --- docs/logo: the light rasters, committed next to their sources ----------
for s in 128 256 512; do
  rsvg-convert -w $s -h $s chatbox-qs-logo.svg -o "chatbox-qs-logo-$s.png"
done
for s in 128 256; do
  rsvg-convert -w $s -h $s chatbox-qs-mark.svg -o "chatbox-qs-mark-$s.png"
done

# --- assets/logo: the heavy rasters, blog and social ------------------------
rsvg-convert -w 1200 -h 630  chatbox-qs-og.svg           -o "$ASSETS/chatbox-qs-og.png"
rsvg-convert -w 1280 -h 640  chatbox-qs-social.svg       -o "$ASSETS/chatbox-qs-social.png"
rsvg-convert -w 1200 -h 1200 chatbox-qs-square.svg       -o "$ASSETS/chatbox-qs-square.png"
rsvg-convert -w 1200 -h 600  chatbox-qs-hero.svg         -o "$ASSETS/chatbox-qs-hero.png"
rsvg-convert -w 800          chatbox-qs-lockup.svg       -o "$ASSETS/chatbox-qs-lockup-800.png"
rsvg-convert -w 1600         chatbox-qs-lockup.svg       -o "$ASSETS/chatbox-qs-lockup-1600.png"
rsvg-convert -w 1024 -h 1024 chatbox-qs-logo.svg         -o "$ASSETS/chatbox-qs-logo-1024.png"
rsvg-convert -w 512  -h 512  chatbox-qs-logo-on-dark.svg -o "$ASSETS/chatbox-qs-logo-on-dark-512.png"
rsvg-convert -w 1024 -h 1024 chatbox-qs-fullbleed.svg    -o "$ASSETS/chatbox-qs-fullbleed-1024.png"

# --- The extension's own preview -------------------------------------------
# src/meta.json names preview.png, and `nebula sense` copies it into the
# generated extension folder, so this is what the Sense asset panel shows.
# 280 x 280 matches audit.qs and QvsView.qs, the siblings that also keep an SVG
# source. The SVG sits beside it as the editable original — Sense never reads it.
cp chatbox-qs-logo.svg "$ROOT/preview.svg"
rsvg-convert -w 280 -h 280 chatbox-qs-logo.svg -o "$ROOT/preview.png"

# --- Documentation site -----------------------------------------------------
# The web favicon set. It lives under assets/ so the doc site can copy it; this
# stays the single place the mark is rendered from, so that repo holds no SVG
# sources of its own.
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
for s in 16 32 48 180 192 512; do
  rsvg-convert -w $s -h $s chatbox-qs-fullbleed.svg -o "$tmp/i-$s.png"
done
cp "$tmp/i-16.png"  "$DOCSITE/favicon-16x16.png"
cp "$tmp/i-32.png"  "$DOCSITE/favicon-32x32.png"
cp "$tmp/i-180.png" "$DOCSITE/apple-touch-icon.png"
cp "$tmp/i-192.png" "$DOCSITE/android-chrome-192x192.png"
cp "$tmp/i-512.png" "$DOCSITE/android-chrome-512x512.png"
cp chatbox-qs-fullbleed.svg "$DOCSITE/favicon.svg"
# Stopping at 48: ImageMagick writes ICO frames as uncompressed BMP, so a single
# 256 frame costs 262 KB — more than every other file here put together.
magick "$tmp/i-16.png" "$tmp/i-32.png" "$tmp/i-48.png" "$DOCSITE/favicon.ico"

echo "wrote:"
echo "  docs/logo/*.png              README, docs, slides"
echo "  assets/logo/*.png            social cards, blog hero, high-res"
echo "  assets/logo/docs-site/*      documentation site favicons"
echo "  preview.svg, preview.png     the extension's asset-panel preview"
