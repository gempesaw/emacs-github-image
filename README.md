# emacs-github-image

Upload images from your clipboard to GitHub's CDN directly from Emacs. Perfect for adding screenshots to PR descriptions in Magit.

## How it works

1. Emacs runs a WebSocket server
2. A browser extension connects to it (using your existing GitHub session cookie)
3. When you call `emacs-github-image-upload`, Emacs grabs the clipboard image and sends it to the extension
4. The extension uploads directly to GitHub's `user-attachments` endpoint via `fetch` (no tab navigation, no DOM scraping) and returns the URL
5. Emacs inserts the markdown at point

The WebSocket lives in an MV3 offscreen document so it survives service-worker termination — you should not need to reload the extension between uses.

## Debugging

- Extension logs: `chrome://extensions` → Emacs GitHub Image → "Inspect views: offscreen.html"
- If `policies/assets` returns 401/403, you're logged out of github.com in this browser profile
- If S3 upload returns 403 with `RequestTimeTooSkewed`, your system clock is off

## Requirements

- Emacs 27.1+
- `websocket` package from MELPA
- `pngpaste` (macOS): `brew install pngpaste`
- Chrome/Firefox with the extension loaded

## Installation

### Emacs

```elisp
;; Add to load-path
(add-to-list 'load-path "~/opt/emacs-github-image")
(require 'emacs-github-image)

;; Start the server
(emacs-github-image-mode 1)

;; Bind to a key
(global-set-key (kbd "C-c i") #'emacs-github-image-upload)
```

### Browser Extension

#### Chrome
1. Go to `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `extension/` directory

#### Firefox
1. Go to `about:debugging#/runtime/this-firefox`
2. Click "Load Temporary Add-on"
3. Select `extension/manifest.json`

## Usage

1. Copy an image to your clipboard (screenshot, right-click image, etc.)
2. In Emacs, position point where you want the markdown
3. Run `M-x emacs-github-image-upload` or your keybinding
4. The markdown `![image](url)` is inserted at point

## Notes

- You must be logged into GitHub in the browser where the extension is loaded
- The extension auto-reconnects if Emacs restarts
- Images are uploaded to the same CDN GitHub uses for pasted images in issues/PRs
