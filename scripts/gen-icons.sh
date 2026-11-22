#!/usr/bin/env bash
# One-off: rasterise the app icons from the SVG sources (PNGs are committed). Needs rsvg-convert.
set -euo pipefail
cd "$(dirname "$0")/../public"
r() { rsvg-convert -w "$2" -h "$2" "$1" -o "$3"; }
r favicon.svg 192 icons/icon-192.png
r favicon.svg 512 icons/icon-512.png
# Safe-zone version: glyph at 70% on a full-bleed square, survives circular masks.
r icons/maskable.svg 512 icons/icon-maskable-512.png
# iOS applies its own rounding: opaque, full-bleed.
r icons/full-bleed.svg 180 apple-touch-icon.png
