# Changelog

## Unreleased
- fix: position-aware tie-breaker to avoid alphabetical suggestion ties (e.g., PLANE) and apply tie-breaker consistently across code paths 🔧
- fix: copy page script `nonce` when injecting extension script to reduce CSP console warnings 🔐
- feat: UI now shows total possible matches and displays top 5 suggestions with entropy scores ✅
- feat: allow leaving tiles blank and edit each tile individually (up to 5 letters); blank tiles are treated as unknowns when fetching suggestions ✍️

### Test Summary
- Added unit tests for tie-breaker behavior (PLANE and partial patterns like `P L A _ E`) and for word frequency fallback. All tests pass on CI (Node 18).

