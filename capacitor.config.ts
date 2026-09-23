import type { CapacitorConfig } from "@capacitor/cli";

// The Android app (APK) is the same web app, bundled into a native shell.
const config: CapacitorConfig = {
  appId: "io.github.dylancleverdon.cafejobs",
  appName: "Cafe Jobs",
  webDir: "dist/android-web",
  android: {
    allowMixedContent: false,
  },
};

export default config;
