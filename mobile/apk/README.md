# Built APKs

Put release APKs here. Nothing in this folder is gitignored, so the APK
is committed with the repo.

## Build it

### Option A — cloud (no Android toolchain needed, needs a free Expo account)

    cd mobile
    npm install
    eas login
    npm run build:apk

When it finishes, eas-cli prints an artifact URL. Download it into this folder:

    curl -L -o apk/biteat.apk "<artifact-url-from-eas>"

or grab it later with:  eas build:list   /   eas build:view

### Option B — fully local (needs Android SDK + JDK 17; macOS/Linux only for --local)

    cd mobile
    npm install
    npm run build:apk:local

Output: mobile/apk/biteat.apk
