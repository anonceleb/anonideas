// DEPRECATED: This script previously fetched and wrote `data/wordlist.txt` from an external gist.
// It is intentionally left as a placeholder for historical reasons. The extension now uses the
// bundled `data/wordlist.txt` at runtime and does not attempt to auto-update the packaged file.
// If you need to refresh the canonical list locally, either use a separate utility outside of
// the packaged extension, or run the following command manually (one-off):
// curl -sSf 'https://gist.githubusercontent.com/dracos/dd0668f281e685bad51479e5acaadb93/raw/valid-wordle-words.txt' > data/wordlist.txt

console.log('scripts/update_wordlist.js is deprecated and should not be used.');
