Word Frequency Data Attribution

Source: Hermit Dave - FrequencyWords
- Repository: https://github.com/hermitdave/FrequencyWords
- File used: content/2018/en/en_50k.txt (raw)

Notes:
- This repository provides word frequency lists compiled from various corpora and is a convenient, widely-used source for English word frequencies.
- Please review the source repository and its license/attribution requirements before publishing the extension. I included this data as a convenience; if you prefer a different source or need a specific license, let me know and I will rebuild using your preferred dataset.

How it was used:
- `scripts/build_wordfreq.js` fetches the raw list, filters for 5-letter words that are present in `data/wordlist.txt`, and writes `data/word_freq.json` mapping words to numeric frequency scores.
- `data/word_freq.json` is optional; if present, the solver will prefer words with higher frequency when entropies tie.

If you need a different source (e.g., SUBTLEX, Google Ngrams, or another curated list), I can switch to it and add the appropriate attribution and license note.