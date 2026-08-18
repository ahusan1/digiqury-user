import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const gradlePath = resolve(process.cwd(), 'node_modules/capacitor-razorpay/android/build.gradle');

if (!existsSync(gradlePath)) {
  console.log('Skip: capacitor-razorpay Android build.gradle not found.');
  process.exit(0);
}

const content = readFileSync(gradlePath, 'utf8');
let updated = content;

// jcenter() is deprecated and commonly blocked; prefer mavenCentral().
updated = updated.replace(/\bjcenter\s*\(\)/g, 'mavenCentral()');

// Use an explicit latest Razorpay checkout version and modern AndroidX dependencies for Android 14 compatibility.
updated = updated.replace(/implementation\s+'com\.razorpay:checkout:[^']+'/g, "implementation 'com.razorpay:checkout:1.6.41'");
updated = updated.replace(/implementation\s+'androidx\.core:core:[^']+'/g, "implementation 'androidx.core:core:1.17.0'");
updated = updated.replace(/implementation\s+'androidx\.appcompat:appcompat:[^']+'/g, "implementation 'androidx.appcompat:appcompat:1.7.1'");

if (updated !== content) {
  writeFileSync(gradlePath, updated, 'utf8');
  console.log('Patched capacitor-razorpay Android build.gradle: updated Maven repos and Razorpay/AndroidX dependency versions.');
} else {
  console.log('No changes needed in capacitor-razorpay Android build.gradle.');
}
