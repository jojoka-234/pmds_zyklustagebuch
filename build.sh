#!/usr/bin/env bash
# Builds the APK without Gradle/Android SDK, using Debian's aapt2, dx, zipalign and apksigner.
set -euo pipefail
cd "$(dirname "$0")"
VERSION_CODE=${VERSION_CODE:-3}
VERSION_NAME=${VERSION_NAME:-1.2}
JAR=tools/android.jar
# Signing key (not in git). Override with KEYSTORE / KS_PASS; a new key is generated if missing.
KEYSTORE=${KEYSTORE:-tools/release.jks}
KS_PASS=${KS_PASS:-zyklus123}
OUT=build
if [ ! -f "$JAR" ]; then
  echo "Downloading android.jar (API 34)..."
  curl -fsSL -o "$JAR" https://raw.githubusercontent.com/Sable/android-platforms/master/android-34/android.jar
fi
rm -rf "$OUT" && mkdir -p "$OUT"/{gen,classes}

aapt2 compile --dir app/res -o "$OUT/res.zip"
aapt2 link -o "$OUT/base.apk" -I "$JAR" --manifest app/AndroidManifest.xml -A app/assets \
  --java "$OUT/gen" --min-sdk-version 26 --target-sdk-version 34 \
  --version-code "$VERSION_CODE" --version-name "$VERSION_NAME" "$OUT/res.zip"

javac -nowarn -Xlint:-options --release 8 -encoding UTF-8 -cp "$JAR" -d "$OUT/classes" \
  $(find app/src "$OUT/gen" -name '*.java')
dalvik-exchange --dex --min-sdk-version=26 --output="$OUT/classes.dex" "$OUT/classes"
(cd "$OUT" && zip -q base.apk classes.dex)

zipalign -f -p 4 "$OUT/base.apk" "$OUT/aligned.apk"
if [ ! -f "$KEYSTORE" ]; then
  keytool -genkeypair -keystore "$KEYSTORE" -storepass "$KS_PASS" -keypass "$KS_PASS" -alias zyklus \
    -keyalg RSA -keysize 2048 -validity 20000 -dname "CN=Zyklustagebuch" >/dev/null 2>&1
fi
apksigner sign --ks "$KEYSTORE" --ks-pass "pass:$KS_PASS" --ks-key-alias zyklus \
  --out "$OUT/Zyklustagebuch.apk" "$OUT/aligned.apk"
apksigner verify "$OUT/Zyklustagebuch.apk"
echo "Built $OUT/Zyklustagebuch.apk"
