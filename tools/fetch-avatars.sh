#!/bin/sh
# Vendor the About page's team avatars into assets/img/team/<handle>.webp (160px).
# The page used to hot-link github.com/<handle>.png: one redirect plus a
# third-party fetch per member, which is slow (or blocked) on some networks.
# Rerun after editing assets/data/contributors.js. Needs curl + ImageMagick.
set -e
cd "$(dirname "$0")/.."
mkdir -p assets/img/team
for u in $(grep -o "gh: *'[^']*'" assets/data/contributors.js | cut -d"'" -f2); do
  if curl -fsSL "https://avatars.githubusercontent.com/$u?s=160" \
     | magick - -resize 160x160^ -gravity center -extent 160x160 -quality 82 "assets/img/team/$u.webp"
  then echo "ok   $u"
  else echo "FAIL $u (the page falls back to GitHub for it)"
  fi
done
