#!/bin/zsh
# Runs the message list's native tests on the Mac (Mac Catalyst: UIKit
# without a simulator). From anywhere: modules/message-list/ios/Tests/run.sh
set -e
here=${0:A:h}
src=$here/..
sdk=$(xcrun --sdk macosx --show-sdk-path)
out=$(mktemp -d)/message-list-tests
xcrun swiftc -O -target "$(uname -m)-apple-ios17.0-macabi" -sdk "$sdk" \
  -Fsystem "$sdk/System/iOSSupport/System/Library/Frameworks" \
  -I "$sdk/System/iOSSupport/usr/include" -L "$sdk/System/iOSSupport/usr/lib" \
  "$src/Models.swift" "$src/Theme.swift" "$src/Measure.swift" "$src/ListLayout.swift" "$src/ListDiff.swift" "$src/Insets.swift" "$src/TapRoute.swift" "$src/ApplyCoordination.swift" "$src/ComposerLayout.swift" \
  "$here/main.swift" -o "$out"
"$out"
