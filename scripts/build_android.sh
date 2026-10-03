#!/usr/bin/env bash
set -euo pipefail
project_root="$(cd "$(dirname "$0")/.." && pwd)"
build_root="${SHESHIELD_BUILD_ROOT:-$project_root/.tools/android/build}"
: "${SHESHIELD_SDK:=${ANDROID_HOME:-$project_root/.tools/android/sdk}}"
export JAVA_HOME="${JAVA_HOME:-$project_root/.tools/android/jdk}"
export GRADLE_USER_HOME="${GRADLE_USER_HOME:-$project_root/.tools/android/gradle}"
python3 - "$project_root" "$build_root" "$SHESHIELD_SDK" <<'PY'
import shutil,sys
from pathlib import Path
root,dest,sdk=map(Path,sys.argv[1:])
shutil.copytree(root/'android',dest,dirs_exist_ok=True,ignore=shutil.ignore_patterns('build','.gradle','.idea','local.properties','.kotlin'))
api_url=next((line.split('=',1)[1].strip() for line in reversed((root/'api/.env').read_text().splitlines()) if line.startswith('PUBLIC_BASE_URL=')),None)
if not api_url or not api_url.startswith('https://'):
    raise SystemExit('Set PUBLIC_BASE_URL to the running public API before building the phone app.')
(dest/'local.properties').write_text('sdk.dir='+str(sdk)+'\nBACKEND_BASE_URL='+api_url+'\n')
PY
cd "$build_root"
./gradlew "${@:-:app:assembleDebug}" --console=plain
if [ -f app/build/outputs/apk/debug/app-debug.apk ]; then
    mkdir -p "$project_root/artifacts"
    cp app/build/outputs/apk/debug/app-debug.apk "$project_root/artifacts/Waymate-debug.apk"
fi
if [ -d app/schemas ]; then cp -r app/schemas "$project_root/android/app/"; fi

if [ -f app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk ]; then cp app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk "$project_root/artifacts/Waymate-test.apk"; fi
