Publishing to Chrome Web Store — Step-by-step

This document explains how to create OAuth credentials and obtain a refresh token for the Chrome Web Store API, and how to configure GitHub Actions to publish your extension automatically.

1) Create a Google Cloud Project & OAuth credentials
- Go to https://console.cloud.google.com/ and create a project (or reuse an existing one).
- Enable the "Chrome Web Store API" for the project (APIs & Services → Library → search "Chrome Web Store API" → Enable).
- Create OAuth consent screen (External or Internal depending on your needs). Fill required fields.
- Create OAuth credentials (Credentials → Create Credentials → OAuth Client ID).
  - Application type: "Desktop app" or "Web application" works for this flow. Note the Client ID and Client Secret.

2) Generate a refresh token (OAuth 2 flow)
Option A — OAuth 2 Playground (recommended for simplicity):
- Open https://developers.google.com/oauthplayground
- Click the gear icon (top right) and check "Use your own OAuth credentials" and paste Client ID & Client Secret.
- In Step 1, enter the scope: https://www.googleapis.com/auth/chromewebstore
- Click "Authorize APIs" and complete the Google sign-in prompt.
- In Step 2, click "Exchange authorization code for tokens" — you will receive an access token and a refresh token.
- Copy the refresh token securely.

Option B — Use the included script `scripts/get_refresh_token.js` to obtain a refresh token (preferred for reproducibility).

    # Example usage (from project root):
    node scripts/get_refresh_token.js --client_id=<CLIENT_ID> --client_secret=<CLIENT_SECRET> --port=8080

Make sure you add a redirect URI of `http://localhost:8080/` (or your chosen port) to the OAuth client in Google Cloud Console before running the script.

Note: The script prints the `refresh_token` to the terminal and attempts to copy it to clipboard on macOS; copy it into your GitHub repository secrets as `WEBSTORE_REFRESH_TOKEN`.

3) Get your extension ID
- Upload your first ZIP to the Chrome Web Store Developer Dashboard or check an existing extension to find the EXTENSION ID for the listing.

4) Set GitHub repository secrets
- In the GitHub repository Settings → Secrets → Actions, add the following:
  - WEBSTORE_CLIENT_ID
  - WEBSTORE_CLIENT_SECRET
  - WEBSTORE_REFRESH_TOKEN
  - EXTENSION_ID

5) Trigger the GitHub Action
- Use the `Publish to Chrome Web Store` workflow (manually via the Actions UI: Workflow dispatch) or create a release — the workflow will package the extension and upload it.
- The workflow includes a guard: it will only run the publish step when the required secrets are present.

Notes & tips
- Keep your refresh token and client secrets private; treat them like credentials.
- When testing, use an unlisted/limited rollout to verify behavior before a full public release.
- Make sure your manifest is up-to-date (`version` bump) for a new release.
- If you want the workflow to only publish on tags, modify the `on:` triggers accordingly.

If you want, I can walk you through the OAuth Playground steps and add sanitized commands to a script that requests a refresh token using curl or Node.js.