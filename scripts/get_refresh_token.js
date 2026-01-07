#!/usr/bin/env node
/*
Simple helper to obtain a refresh token for the Chrome Web Store API.
Usage:
  node scripts/get_refresh_token.js --client_id=<CLIENT_ID> --client_secret=<CLIENT_SECRET> [--port=8080]

Notes:
- Make sure your OAuth client allows the redirect URI http://localhost:<port>/ (add this URI in Google Cloud Console for the OAuth Client).
- The script will open a browser window to complete the consent flow, then exchange the code for tokens and print the refresh token.
- This script does not persist credentials; copy the refresh token and store it securely (GitHub Secrets).
*/

const http = require('http');
const https = require('https');
const { exec } = require('child_process');

function parseArgs() {
  const args = {};
  process.argv.slice(2).forEach(arg => {
    const m = arg.match(/^--([a-zA-Z0-9_\-]+)=(.*)$/);
    if (m) args[m[1]] = m[2];
  });
  return args;
}

(async function main() {
  const args = parseArgs();
  const clientId = args.client_id || process.env.WEBSTORE_CLIENT_ID;
  const clientSecret = args.client_secret || process.env.WEBSTORE_CLIENT_SECRET;
  const port = parseInt(args.port || process.env.OAUTH_PORT || '8080', 10);

  if (!clientId || !clientSecret) {
    console.error('Error: client_id and client_secret are required. Provide via --client_id and --client_secret or environment variables.');
    process.exit(1);
  }

  const scope = encodeURIComponent('https://www.googleapis.com/auth/chromewebstore');
  const redirectUri = `http://localhost:${port}/`;
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?response_type=code&client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}&access_type=offline&prompt=consent`;

  // Start a temporary HTTP server to receive the auth code
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://localhost:${port}`);
      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');

      if (error) {
        res.writeHead(200, {'Content-Type': 'text/html'});
        res.end(`<h3>OAuth error: ${error}</h3><p>Check the terminal for details and try again.</p>`);
        console.error('OAuth error:', error);
        server.close();
        return;
      }

      if (!code) {
        res.writeHead(200, {'Content-Type': 'text/html'});
        res.end('<h3>Waiting for authorization...</h3>');
        return;
      }

      // Exchange code for tokens
      const postData = `code=${encodeURIComponent(code)}&client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}&redirect_uri=${encodeURIComponent(redirectUri)}&grant_type=authorization_code`;
      const tokenReq = https.request({
        hostname: 'oauth2.googleapis.com',
        path: '/token',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(postData)
        }
      }, (tokenRes) => {
        let data = '';
        tokenRes.on('data', (chunk) => data += chunk);
        tokenRes.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.error) {
              res.writeHead(200, {'Content-Type': 'text/html'});
              res.end(`<h3>Error obtaining tokens</h3><pre>${JSON.stringify(parsed)}</pre>`);
              console.error('Token exchange error:', parsed);
            } else {
              res.writeHead(200, {'Content-Type': 'text/html'});
              res.end('<h3>Success! You can close this window.</h3><p>Copy the refresh_token from your terminal.</p>');
              console.log('\n=== OAuth tokens received ===');
              console.log('access_token:', parsed.access_token);
              console.log('expires_in:', parsed.expires_in);
              console.log('scope:', parsed.scope);
              console.log('token_type:', parsed.token_type);
              if (parsed.refresh_token) {
                console.log('\nRefresh token (store this in GitHub Secrets as WEBSTORE_REFRESH_TOKEN):');
                console.log(parsed.refresh_token);
                // Try to copy to clipboard if pbcopy exists (macOS)
                exec('which pbcopy', (err, stdout) => {
                  if (!err && stdout.trim()) {
                    const cp = exec('pbcopy');
                    cp.stdin.write(parsed.refresh_token);
                    cp.stdin.end();
                    console.log('(Refresh token copied to clipboard)');
                  }
                });
              } else {
                console.warn('\nNo refresh_token was returned. If this account previously consented, try the flow in an incognito window or add &prompt=consent (already set) and ensure you selected account and granted permissions.');
              }
            }
          } catch (e) {
            res.writeHead(200, {'Content-Type': 'text/html'});
            res.end('<h3>Unexpected response from token endpoint</h3>');
            console.error('Error parsing token response:', e, data);
          }
          server.close();
        });
      });
      tokenReq.on('error', (err) => {
        res.writeHead(200, {'Content-Type': 'text/html'});
        res.end('<h3>Token exchange failed</h3>');
        console.error('Token request error:', err);
        server.close();
      });
      tokenReq.write(postData);
      tokenReq.end();

    } catch (err) {
      console.error('Server error:', err);
      res.writeHead(500, {'Content-Type': 'text/plain'});
      res.end('Internal server error');
      server.close();
    }
  });

  server.listen(port, () => {
    console.log(`Listening for OAuth redirect on http://localhost:${port}/`);
    console.log('Opening browser to complete OAuth consent...');
    // Try to open the browser automatically
    const opener = process.env.BROWSER || (process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open');
    exec(`${opener} "${authUrl}"`, (err) => {
      if (err) {
        console.log('Failed to open browser automatically. Please open the following URL in your browser:');
        console.log(authUrl);
      }
    });
  });
})();
