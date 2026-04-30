let socket = null;
let reconnectTimer = null;

function connect() {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;

  socket = new WebSocket('ws://localhost:19287');

  socket.onopen = () => {
    console.log('[ghimg] connected to Emacs');
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  socket.onclose = () => {
    console.log('[ghimg] disconnected, retrying in 3s');
    socket = null;
    if (!reconnectTimer) {
      reconnectTimer = setTimeout(connect, 3000);
    }
  };

  socket.onerror = (err) => {
    console.log('[ghimg] socket error', err);
  };

  socket.onmessage = async (event) => {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch (err) {
      console.error('[ghimg] bad message', err);
      return;
    }

    if (message.type === 'ping') return;

    if (message.type === 'upload') {
      try {
        const url = await uploadToGitHub(message.imageData, message.filename);
        socket.send(JSON.stringify({ type: 'upload-result', id: message.id, success: true, url }));
      } catch (err) {
        console.error('[ghimg] upload failed', err);
        socket.send(JSON.stringify({ type: 'upload-result', id: message.id, success: false, error: err.message || String(err) }));
      }
    }
  };
}

async function uploadToGitHub(base64Data, filename) {
  const binary = atob(base64Data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const file = new File([bytes], filename || 'image.png', { type: 'image/png' });

  const policyForm = new FormData();
  policyForm.append('name', file.name);
  policyForm.append('size', String(file.size));
  policyForm.append('content_type', file.type);

  const policyResp = await fetch('https://github.com/upload/policies/assets', {
    method: 'POST',
    body: policyForm,
    credentials: 'include',
    headers: {
      'GitHub-Verified-Fetch': 'true',
      'X-Requested-With': 'XMLHttpRequest',
      'Accept': 'application/json',
    },
  });
  if (!policyResp.ok) {
    const text = await policyResp.text().catch(() => '');
    console.error('[ghimg] policies/assets', policyResp.status, text);
    throw new Error(`policies/assets ${policyResp.status}: ${summarize(text)}`);
  }
  const policy = await policyResp.json();

  const s3Form = new FormData();
  for (const [k, v] of Object.entries(policy.form || {})) s3Form.append(k, v);
  s3Form.append('file', file, file.name);

  const s3Resp = await fetch(policy.upload_url, {
    method: 'POST',
    body: s3Form,
    headers: policy.header || {},
  });
  if (!s3Resp.ok) {
    const text = await s3Resp.text().catch(() => '');
    console.error('[ghimg] s3 upload', s3Resp.status, text);
    throw new Error(`s3 upload ${s3Resp.status}: ${summarize(text)}`);
  }

  const confirmForm = new FormData();
  confirmForm.append('authenticity_token', policy.asset_upload_authenticity_token);

  const confirmUrl = new URL(policy.asset_upload_url, 'https://github.com/').href;
  const confirmResp = await fetch(confirmUrl, {
    method: 'PUT',
    body: confirmForm,
    credentials: 'include',
    headers: {
      'Accept': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    },
  });
  if (!confirmResp.ok) {
    const text = await confirmResp.text().catch(() => '');
    console.error('[ghimg] confirm', confirmResp.status, text);
    throw new Error(`confirm ${confirmResp.status}: ${summarize(text)}`);
  }

  return policy.asset.href;
}

function summarize(text) {
  const titleMatch = text.match(/<title>([^<]+)<\/title>/i);
  if (titleMatch) return titleMatch[1].trim();
  const h1Match = text.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  if (h1Match) return h1Match[1].trim();
  return text.slice(0, 200);
}

connect();
