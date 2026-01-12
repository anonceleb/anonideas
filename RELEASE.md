Release checklist — Chrome Web Store

This file documents the steps we take before publishing a new release.

Pre-release checks
- [x] Update `manifest.json` version field (semantic). Example: 1.0.1
- [x] Run `node scripts/check_release.js` to validate manifest and icon files
- [x] Ensure `icons/` contains 16, 48, and 128 sized icons (PNG preferred). Add proper artwork (not placeholder).
- [x] Run `scripts/build_extension.sh` to produce `dist/wordle-solver-extension-<version>.zip`.

Packaging
- Upload `dist/wordle-solver-extension-<version>.zip` to the Chrome Web Store dashboard.
- Fill store listing: short description, detailed description, at least 1 screenshot (recommended 640x400), icon, privacy policy URL, and contact info.

Privacy & Permissions
- Ensure `manifest.json` only requests necessary permissions (we currently request `activeTab` and `storage`, and host permissions for gist and optional host patterns for Wordle sites).
- Provide a privacy policy. If you don't have a published URL, host a short privacy page (e.g., GitHub Pages) and link to it in the store listing.

Post-publish
- Tag the release in git and create a release note summarizing changes and user-visible improvements.
- Monitor the dashboard for any policy or scanning issues.
