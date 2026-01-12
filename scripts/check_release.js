#!/usr/bin/env node
// Simple release checks for Chrome Web Store packaging
const fs = require('fs');
const path = require('path');
const manifestPath = path.join(__dirname, '..', 'manifest.json');
function fail(msg) { console.error('RELEASE CHECK FAILED:', msg); process.exit(2); }
if (!fs.existsSync(manifestPath)) fail('manifest.json missing');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
if (!manifest.name) fail('manifest "name" is missing');
if (!manifest.version) fail('manifest "version" is missing');
if (!manifest.description) fail('manifest "description" is missing');
if (!manifest.icons) fail('manifest.icons is missing');
const icons = manifest.icons;
['16','48','128'].forEach(k => {
  if (!icons[k]) fail(`manifest.icons is missing size ${k}`);
  const p = path.join(__dirname, '..', icons[k]);
  if (!fs.existsSync(p)) fail(`Icon file missing: ${icons[k]} (${p})`);
});
console.log('Release checks passed ✅');
process.exit(0);
