#!/usr/bin/env bash
# Uploads an iOS or Android build of Vera or Vera Dev with an install page to
# bunny.net (the `vera-evidence` zone, under an unlisted path) and prints
# the page's URL. scripts/phone.sh (dev clients) and `pnpm release build
# internal` use it instead of `eas upload`, because EAS's free plan caps
# uploads of local builds. iOS installs ad hoc builds from an HTTPS manifest
# (itms-services), on registered devices only.
#
# Each upload is one folder (`<path prefix>-<random>`). Before uploading,
# it deletes build folders older than 30 days under `dev-client/` and
# `internal/`, so builds don't pile up on the bill; PR evidence (`pr/`)
# stays. scripts/phone.sh re-uploads a cached dev client whose page was
# deleted.
#
#   scripts/install-page.sh <ipa|apk> <path prefix> "<description>" [production]
set -euo pipefail

artifact="${1:?ipa or apk}"
prefix="${2:?path prefix}-$(openssl rand -hex 6)"
description="${3:-}"
variant="${4:-development}"
app_name="Vera Dev"
artifact_name="vera-dev"
page_title="$app_name"
button_color="#ec8a1e"
replacement="Replaces whichever Vera Dev is installed. The TestFlight app stays."
if [ "$variant" = production ]; then
  app_name="Vera"
  artifact_name="vera"
  page_title="Vera preview"
  button_color="#248a3d"
elif [ "$variant" != development ]; then
  echo "variant must be development or production" >&2
  exit 2
fi
ZONE="vera-evidence"
CDN="https://vera-evidence.b-cdn.net"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

put() {
  local log
  log="$(bunny storage files upload "$1" --zone "$ZONE" --to "$prefix/$2" --content-type "$3" 2>&1)" || {
    echo "$log" >&2
    exit 1
  }
}

# Deletes upload folders older than 30 days in each build directory.
prune() {
  local root old
  for root in dev-client/ios dev-client/android internal/ios internal/android; do
    old="$(bunny storage files list "$root/" --zone "$ZONE" -o json 2>/dev/null |
      node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
        let list=[];try{list=JSON.parse(s)}catch{}
        const cutoff=Date.now()-30*24*3600*1000;
        for(const f of list) if(f.isDirectory&&Date.parse(f.dateCreated)<cutoff) console.log(f.objectName);
      })')"
    for name in $old; do
      bunny storage files remove "$root/$name/" --zone "$ZONE" --force >/dev/null 2>&1 &&
        echo "deleted $root/$name (over 30 days old)" >&2
    done
  done
}
prune

case "$artifact" in
  *.ipa)
    unzip -p "$artifact" 'Payload/*.app/Info.plist' >"$work/Info.plist"
    bundle_id="$(plutil -extract CFBundleIdentifier raw "$work/Info.plist")"
    version="$(plutil -extract CFBundleShortVersionString raw "$work/Info.plist")"
    build="iOS build $(plutil -extract CFBundleVersion raw "$work/Info.plist")"
    if [ "$variant" = production ]; then
      replacement="Replaces Vera on this iPhone. Install over it without deleting it to keep your sign-in and data. Return by reinstalling from TestFlight."
    fi
    put "$artifact" "$artifact_name.ipa" application/octet-stream
    cat >"$work/manifest.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>items</key>
  <array>
    <dict>
      <key>assets</key>
      <array>
        <dict>
          <key>kind</key><string>software-package</string>
          <key>url</key><string>$CDN/$prefix/$artifact_name.ipa</string>
        </dict>
      </array>
      <key>metadata</key>
      <dict>
        <key>bundle-identifier</key><string>$bundle_id</string>
        <key>bundle-version</key><string>$version</string>
        <key>kind</key><string>software</string>
        <key>title</key><string>$app_name</string>
      </dict>
    </dict>
  </array>
</dict>
</plist>
PLIST
    put "$work/manifest.plist" manifest.plist text/xml
    link="itms-services://?action=download-manifest&amp;url=$CDN/$prefix/manifest.plist"
    ;;
  *.apk)
    build="Android"
    if [ "$variant" = production ]; then
      replacement="Uninstall the Play copy of Vera before installing, then sign in again. Server messages remain; local drafts, unsent messages, and cached data are removed. To return, uninstall this build and reinstall Vera from Play."
    fi
    put "$artifact" "$artifact_name.apk" application/vnd.android.package-archive
    link="$CDN/$prefix/$artifact_name.apk"
    ;;
  *)
    echo "not an ipa or apk: $artifact" >&2
    exit 2
    ;;
esac

cat >"$work/index.html" <<HTML
<!doctype html>
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>$page_title</title>
<body style="font: 17px -apple-system, system-ui, sans-serif; margin: 3em 1.5em; text-align: center">
<h1>$page_title</h1>
<p>$description</p>
<p style="color: #888">$build</p>
<p><a href="$link" style="display: inline-block; padding: .8em 1.6em; border-radius: 12px; background: $button_color; color: white; text-decoration: none; font-weight: 600">Install</a></p>
<p style="color: #888">$replacement</p>
HTML
put "$work/index.html" index.html text/html
echo "$CDN/$prefix/index.html"
