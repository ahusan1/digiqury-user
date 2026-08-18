import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const gradlePath = resolve(process.cwd(), 'android/capacitor-cordova-android-plugins/build.gradle');

if (!existsSync(gradlePath)) {
  console.log('Skip: capacitor-cordova build.gradle not found.');
  process.exit(0);
}

const content = readFileSync(gradlePath, 'utf8');
const updated = content.replace(/\n\s*flatDir\s*\{[\s\S]*?\n\s*\}\s*(?=\n\})/g, '');

if (updated !== content) {
  writeFileSync(gradlePath, updated, 'utf8');
  console.log('Removed flatDir block from capacitor-cordova-android-plugins/build.gradle');
} else {
  console.log('No flatDir block found, nothing to change.');
}
