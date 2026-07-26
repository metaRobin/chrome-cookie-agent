# Privacy Policy — Cookie Agent Bridge

_Last updated: 2026-07-26_

## Overview
**Cookie Agent Bridge** is an open-source Chrome extension that lets a **local** AI agent (or any program running on the same machine) read the cookies stored in *your own* Chrome browser, so the agent can act on your behalf using your existing login sessions. It is a developer/automation tool. There is no account, no telemetry, and no remote backend.

## What data the extension accesses
- **Browser cookies** stored in your Chrome profile (the same data you can inspect at `chrome://settings/cookies`).
- The extension requests the `cookies` permission and `https://*/*` / `http://*/*` host permissions **only** so it can read cookies for whatever domain you (or your local agent) explicitly request. It does not read anything else (no page content, no browsing history, no form data).

## How that data is used
- Cookies are read **only** in response to an explicit request:
  1. You click the extension icon and test manually from the popup, **or**
  2. A local program calls the loopback endpoint `http://127.0.0.1:9898/cookies?url=…` that you started yourself.
- The extension never initiates cookie access on its own.

## Where the data goes (this is the important part)
- Cookies are returned **only over the local loopback interface (`127.0.0.1`)**, to the single local process that asked for them.
- **Nothing is ever transmitted to any remote server, third party, or to the developer.** The companion service (`host.js`) binds exclusively to `127.0.0.1`; it is unreachable from the network.
- No cookie value is ever written to disk by the extension. The optional companion service writes only connection diagnostics (never cookie contents) to a local temporary log file (`/tmp/chrome-cookie-host.log`).

## Storage of data
- The extension itself stores nothing. Cookies always live in Chrome; they are held in memory only for the duration of a request and then discarded.
- No analytics, no crash reporting, no identifiers.

## Your control
- Uninstalling the extension immediately stops all cookie access.
- Stopping the companion service (`host.js`) closes the local bridge. It only listens on `127.0.0.1` and is not exposed externally.
- You can revoke the `cookies` permission at any time via `chrome://extensions`.

## Open source & auditability
The full source code is public at <https://github.com/metaRobin/chrome-cookie-agent> so anyone can verify exactly what the extension does.

## Contact
Questions or security concerns: open an issue at <https://github.com/metaRobin/chrome-cookie-agent/issues>.
