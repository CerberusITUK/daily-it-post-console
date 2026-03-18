export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const action = url.searchParams.get('action'); // 'approve', 'redo', 'redo_image'
    const summary = url.searchParams.get('summary') || '';
    const image = url.searchParams.get('image') || '';
    const hashtags = url.searchParams.get('hashtags') || '';
    const link = url.searchParams.get('link') || '';
    const date = url.searchParams.get('date') || '';
    const source_name = url.searchParams.get('source_name') || 'Source';
    const expires = url.searchParams.get('expires') || '';
    const signature = url.searchParams.get('sig') || '';

    const signingSecret = env.WORKER_SIGNING_SECRET || env.WORKER_SECRET_TOKEN;

    if (!signingSecret) {
      return new Response('Server misconfiguration', { status: 500 });
    }

    if (!['approve', 'redo', 'redo_image'].includes(action)) {
      return new Response('Invalid action', { status: 400 });
    }

    const expiresAt = Number.parseInt(expires, 10);
    if (!Number.isFinite(expiresAt) || expiresAt < Math.floor(Date.now() / 1000)) {
      return new Response('Unauthorized: Link expired', { status: 401 });
    }

    const signedPayload = [
      action,
      summary,
      image,
      hashtags,
      link,
      date,
      source_name,
      expires
    ].join('\n');

    const expectedSignature = await signPayload(signingSecret, signedPayload);

    if (!timingSafeEqual(signature, expectedSignature)) {
      return new Response('Unauthorized: Invalid signature', { status: 401 });
    }

    const ghUrl = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/actions/workflows/daily-it-news.yml/dispatches`;
    
    const body = {
      ref: 'main',
      inputs: {
        action: action,
        summary: summary,
        image: image,
        hashtags: hashtags,
        link: link,
        date: date,
        source_name: source_name
      }
    };

    const ghRes = await fetch(ghUrl, {
      method: 'POST',
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
        'User-Agent': 'Cloudflare-Worker-Approval',
        'X-GitHub-Api-Version': '2022-11-28'
      },
      body: JSON.stringify(body)
    });

    if (!ghRes.ok) {
      const errText = await ghRes.text();
      return new Response(`Failed to trigger GitHub Action: ${ghRes.status} ${errText}`, { status: 500 });
    }

    return new Response(`Success! Action '${action}' has been sent to GitHub. You can close this window.`, { 
      status: 200,
      headers: { 'Content-Type': 'text/html' }
    });
  }
};

async function signPayload(secret, payload) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return bufferToHex(signature);
}

function bufferToHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function timingSafeEqual(left, right) {
  if (!left || !right || left.length !== right.length) {
    return false;
  }

  let mismatch = 0;
  for (let i = 0; i < left.length; i += 1) {
    mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }

  return mismatch === 0;
}
