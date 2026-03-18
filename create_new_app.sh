#!/bin/bash
# Usage: ./create_new_app.sh AppName
# Example: ./create_new_app.sh Remimi

set -e

APP_NAME="$1"
if [ -z "$APP_NAME" ]; then
  echo "Usage: $0 AppName"
  exit 1
fi

APP_ID_LOWER=$(echo "$APP_NAME" | tr '[:upper:]' '[:lower:]')
PACKAGE_NAME="com.measify.$APP_ID_LOWER"
FIREBASE_PROJECT="${APP_ID_LOWER}-app"

echo "App Name: $APP_NAME"
echo "Package/Bundle ID: $PACKAGE_NAME"

# --- 1️⃣ Clone repo ---
REPO="git@github.com-personal:KAppMaker/KAppMaker-MobileAppAndWeb.git"
TARGET_DIR="${APP_NAME}-All"

echo "Cloning repo into $TARGET_DIR..."
git clone "$REPO" "$TARGET_DIR"
cd "$TARGET_DIR/Web"

# --- 2️⃣ Firebase login ---
echo "Logging in to Firebase..."
firebase login

# --- 3️⃣ Create Firebase project ---
echo "Creating Firebase project: $FIREBASE_PROJECT..."
firebase projects:create "$FIREBASE_PROJECT" --display-name "$APP_NAME" || echo "Project may already exist, skipping."

# --- 4️⃣ Create Android app ---
echo "Creating Android app in Firebase..."
ANDROID_OUTPUT=$(firebase apps:create android "$APP_NAME (Android App)" --project "$FIREBASE_PROJECT" --package-name "$PACKAGE_NAME")
echo "$ANDROID_OUTPUT"

ANDROID_APP_ID=$(echo "$ANDROID_OUTPUT" | grep -oP '(?<=App ID: )[^ ]+')

# --- 5️⃣ Fetch and override google-services.json ---
ANDROID_JSON_PATH="../MobileApp/composeApp/google-services.json"
echo "Fetching Firebase SDK config for Android and overriding $ANDROID_JSON_PATH..."
firebase apps:sdkconfig ANDROID "$ANDROID_APP_ID" > "$ANDROID_JSON_PATH"
echo "✅ Android google-services.json replaced."

# --- 6️⃣ Create iOS app ---
echo "Creating iOS app in Firebase..."
IOS_OUTPUT=$(firebase apps:create ios "$APP_NAME (iOS App)" --project "$FIREBASE_PROJECT" --bundle-id "$PACKAGE_NAME")
echo "$IOS_OUTPUT"

IOS_APP_ID=$(echo "$IOS_OUTPUT" | grep -oP '(?<=App ID: )[^ ]+')

# --- 7️⃣ Fetch and override GoogleService-Info.plist ---
IOS_PLIST_PATH="../MobileApp/iosApp/iosApp/GoogleService-Info.plist"
echo "Fetching Firebase SDK config for iOS and overriding $IOS_PLIST_PATH..."
firebase apps:sdkconfig IOS "$IOS_APP_ID" > "$IOS_PLIST_PATH"
echo "✅ iOS GoogleService-Info.plist replaced."

# --- 8️⃣ Move to MobileApp and run Gradle refactor ---
cd ../MobileApp
echo "Running Gradle refactor to set package name and app name..."
./gradlew refactorPackage -PnewAppId="$PACKAGE_NAME" -PnewAppName="$APP_NAME" -PshouldUpdatePackageName=false

# --- 9️⃣ Create local.properties ---
echo "Creating local.properties..."
echo "sdk.dir=$HOME/Library/Android/sdk" > local.properties

echo "Installing ios dependencies..."
pod install --repo-update

echo "Running Gradle clean..."
./gradlew --no-daemon clean

echo "Running Gradle assembleDebug to force sync..."
./gradlew --no-daemon assembleDebug

# --- 🔟 Run Fastlane build ---
echo "Running Fastlane first_time_build..."
bundle exec fastlane android first_time_build organization:"Measify Kft"

echo "✅ Done! Firebase project and apps set up, SDK config files replaced, and first build completed."

cd ../  # go back to the root of cloned repo
NEW_GIT_REMOTE="git@github.com-personal:mirzemehdi/${APP_NAME}.git"
echo "Setting new Git remote origin to $NEW_GIT_REMOTE"
git remote set-url origin "$NEW_GIT_REMOTE"
echo "✅ Git remote updated."
