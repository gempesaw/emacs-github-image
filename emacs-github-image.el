;;; emacs-github-image.el --- Upload images to GitHub CDN -*- lexical-binding: t; -*-

;; Author: Dan Gempesaw
;; Version: 1.0.0
;; Package-Requires: ((emacs "27.1") (websocket "1.13"))
;; Keywords: tools, convenience
;; URL: https://github.com/gempesaw/emacs-github-image

;;; Code:

(require 'websocket)

(defvar emacs-github-image-port 19287)
(defvar emacs-github-image--server nil)
(defvar emacs-github-image--clients nil)
(defvar emacs-github-image--pending-requests (make-hash-table :test 'equal))
(defvar emacs-github-image--request-id 0)
(defvar emacs-github-image--ping-timer nil)

(defun emacs-github-image--start-server ()
  "Start the WebSocket server."
  (unless emacs-github-image--server
    (setq emacs-github-image--server
          (websocket-server
           emacs-github-image-port
           :on-open (lambda (ws)
                      (push ws emacs-github-image--clients)
                      (message "GitHub Image: Extension connected"))
           :on-close (lambda (ws)
                       (setq emacs-github-image--clients
                             (delete ws emacs-github-image--clients))
                       (message "GitHub Image: Extension disconnected"))
           :on-message #'emacs-github-image--handle-message))
    (setq emacs-github-image--ping-timer
          (run-with-timer 30 30 #'emacs-github-image--ping))
    (message "GitHub Image: Server started on port %d" emacs-github-image-port)))

(defun emacs-github-image--stop-server ()
  "Stop the WebSocket server."
  (when emacs-github-image--ping-timer
    (cancel-timer emacs-github-image--ping-timer)
    (setq emacs-github-image--ping-timer nil))
  (when emacs-github-image--server
    (websocket-server-close emacs-github-image--server)
    (setq emacs-github-image--server nil)
    (setq emacs-github-image--clients nil)
    (message "GitHub Image: Server stopped")))

(defun emacs-github-image--ping ()
  "Send ping to all connected clients."
  (dolist (ws emacs-github-image--clients)
    (ignore-errors
      (websocket-send-text ws (json-encode '((type . "ping")))))))

(defun emacs-github-image--handle-message (_ws frame)
  "Handle incoming message from extension."
  (let* ((payload (websocket-frame-text frame))
         (data (json-parse-string payload :object-type 'alist))
         (type (alist-get 'type data))
         (id (alist-get 'id data)))
    (when (string= type "upload-result")
      (let ((callback (gethash id emacs-github-image--pending-requests)))
        (when callback
          (remhash id emacs-github-image--pending-requests)
          (funcall callback data))))))

(defun emacs-github-image--get-clipboard-image ()
  "Get image from clipboard using pngpaste (macOS)."
  (let ((temp-file (make-temp-file "emacs-github-image-" nil ".png")))
    (if (zerop (call-process "pngpaste" nil nil nil temp-file))
        (with-temp-buffer
          (set-buffer-multibyte nil)
          (insert-file-contents-literally temp-file)
          (delete-file temp-file)
          (base64-encode-string (buffer-string) t))
      (delete-file temp-file)
      nil)))

(defun emacs-github-image--upload (image-data callback)
  "Upload IMAGE-DATA to GitHub and call CALLBACK with result."
  (unless emacs-github-image--clients
    (error "No browser extension connected"))
  (let* ((id (format "req-%d" (cl-incf emacs-github-image--request-id)))
         (msg (json-encode
               `((type . "upload")
                 (id . ,id)
                 (imageData . ,image-data)
                 (filename . ,(format "image-%s.png" (format-time-string "%Y%m%d-%H%M%S")))))))
    (puthash id callback emacs-github-image--pending-requests)
    (websocket-send-text (car emacs-github-image--clients) msg)))

;;;###autoload
(defun emacs-github-image-upload ()
  "Upload clipboard image to GitHub and insert markdown at point."
  (interactive)
  (let ((image-data (emacs-github-image--get-clipboard-image))
        (marker (point-marker)))
    (unless image-data
      (error "No image in clipboard"))
    (message "Uploading image to GitHub...")
    (emacs-github-image--upload
     image-data
     (lambda (result)
       (if (eq (alist-get 'success result) t)
           (let ((url (alist-get 'url result)))
             (with-current-buffer (marker-buffer marker)
               (save-excursion
                 (goto-char marker)
                 (insert (format "<img src=\"%s\" />" url))))
             (message "Image uploaded: %s" url))
         (message "Upload failed: %s" (alist-get 'error result)))))))

;;;###autoload
(define-minor-mode emacs-github-image-mode
  "Minor mode to enable GitHub image uploads."
  :global t
  :lighter " GHImg"
  (if emacs-github-image-mode
      (emacs-github-image--start-server)
    (emacs-github-image--stop-server)))

(provide 'emacs-github-image)
;;; emacs-github-image.el ends here
