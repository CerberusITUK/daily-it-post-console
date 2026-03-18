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
    const token = url.searchParams.get('token');

    // Simple security check
    if (token !== env.WORKER_SECRET_TOKEN) {
      return new Response('Unauthorized: Invalid token', { status: 401 });
    }

    if (!['approve', 'redo', 'redo_image'].includes(action)) {
      return new Response('Invalid action', { status: 400 });
    }

    // Call GitHub API to trigger the workflow
    // We will update daily-it-news.yml to accept workflow_dispatch inputs
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
