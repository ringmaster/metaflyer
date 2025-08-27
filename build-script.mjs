import { copyFileSync, mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';

// Ensure build directory exists
if (!existsSync('build')) {
    mkdirSync('build', { recursive: true });
}

// Copy required files to build directory
copyFileSync('manifest.json', 'build/manifest.json');
copyFileSync('styles.css', 'build/styles.css');

console.log('✅ Copied manifest.json and styles.css to build directory');