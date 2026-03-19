<?php
// Configuration
$repo_owner = 'CerberusITUK';
$repo_name  = 'daily-post-images';
$cache_file = __DIR__ . '/posts_cache.json';
$cache_time = 300; // Cache duration in seconds (5 minutes)
$max_posts  = 9;

// Optional token support: either define GITHUB_CONTENT_TOKEN in config.php or set env var
$github_token = getenv('GITHUB_CONTENT_TOKEN') ?: (defined('GITHUB_CONTENT_TOKEN') ? GITHUB_CONTENT_TOKEN : null);

// Assuming this index.php runs in /public_html/it-blog/
// We look two levels up for config.php outside public_html
$config_path = dirname(__DIR__, 2) . '/config.php';

if (!$github_token && file_exists($config_path)) {
    require_once $config_path;
    if (defined('GITHUB_CONTENT_TOKEN')) {
        $github_token = GITHUB_CONTENT_TOKEN;
    }
}

function fetch_github_json($url) {
    global $github_token;

    $headers = "User-Agent: CerberusIT-Blog-Script\r\nAccept: application/vnd.github+json\r\n";
    if ($github_token) {
        $headers .= "Authorization: Bearer {$github_token}\r\n";
    }

    $options = [
        "http" => [
            "method" => "GET",
            "header" => $headers
        ]
    ];
    $context = stream_context_create($options);
    $response = @file_get_contents($url, false, $context);
    return $response ? json_decode($response, true) : null;
}

function get_posts() {
    global $repo_owner, $repo_name, $cache_file, $cache_time, $max_posts;

    // Check cache
    if (file_exists($cache_file) && (time() - filemtime($cache_file)) < $cache_time) {
        $data = json_decode(file_get_contents($cache_file), true);
        if ($data && isset($data['posts'])) {
            return $data;
        }
    }

    // Fetch index of results
    $index_url = "https://api.github.com/repos/{$repo_owner}/{$repo_name}/contents/results";
    $files = fetch_github_json($index_url);
    
    if (!$files || !is_array($files)) {
        // Fallback to cache if GitHub API fails (e.g., rate limit)
        if (file_exists($cache_file)) {
            return json_decode(file_get_contents($cache_file), true);
        }
        return ['posts' => [], 'total' => 0];
    }

    $json_files = array_filter($files, function($f) {
        return isset($f['type']) && $f['type'] === 'file' && substr($f['name'], -5) === '.json';
    });

    // Sort files descending by name (assuming name correlates to date/job id)
    usort($json_files, function($a, $b) {
        return strcmp($b['name'], $a['name']);
    });

    $posts = [];
    $total = count($json_files);

    // Hydrate top N posts
    $count = 0;
    foreach ($json_files as $file) {
        if ($count >= $max_posts) break;
        
        $post_data = fetch_github_json($file['download_url']);
        if ($post_data) {
            // Parse summary for title
            $summary_parts = explode('.', $post_data['summary'] ?? '', 2);
            $title = trim($summary_parts[0]) ?: 'Daily IT Gremlins';
            
            // Format hashtags
            $hashtags = $post_data['hashtags'] ?? [];
            if (is_string($hashtags)) {
                $hashtags = array_filter(explode(' ', $hashtags));
            }

            $posts[] = [
                'title'   => $title,
                'summary' => $post_data['summary'] ?? '',
                'image'   => $post_data['image'] ?? '',
                'link'    => $post_data['article_link'] ?? '#',
                'date'    => $post_data['article_date'] ?? '',
                'source'  => $post_data['source_name'] ?? 'Source',
                'tags'    => array_slice($hashtags, 0, 2)
            ];
            $count++;
        }
    }

    $result = ['posts' => $posts, 'total' => $total];
    
    // Save to cache
    if (!empty($posts)) {
        file_put_contents($cache_file, json_encode($result));
    }
    
    return $result;
}

$data = get_posts();
$posts = $data['posts'];
$total = $data['total'];

$featured = !empty($posts) ? $posts[0] : null;
$sarcasm_count = (int)round($total * 1.4);

function escape($str) {
    return htmlspecialchars($str ?? '', ENT_QUOTES, 'UTF-8');
}

function trim_summary($text) {
    if (!$text) return '';
    return strlen($text) > 180 ? substr($text, 0, 177) . '…' : $text;
}
?>
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Daily IT Gremlins – Cerberus IT</title>
    <meta name="description" content="Daily IT Gremlins delivers brutally honest IT outage news, witty commentary, and Bluesky-ready summaries from Cerberus IT." />
    <meta property="og:title" content="Daily IT Gremlins – Cerberus IT" />
    <meta property="og:description" content="A daily log of outages, cyber mishaps, and sarcastic takes curated by Cerberus IT." />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="https://cerberus-it.co.uk/it-blog" />
    <meta property="og:image" content="https://cerberus-it.co.uk/images/daily-it-og.png" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet" />
    <link rel="stylesheet" href="./styles.css" />
    <link rel="canonical" href="https://cerberus-it.co.uk/it-blog" />
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "Blog",
        "name": "Daily IT Gremlins",
        "url": "https://cerberus-it.co.uk/it-blog",
        "description": "Daily summaries of IT outages and cybersecurity mishaps with a sarcastic edge.",
        "publisher": {
          "@type": "Organization",
          "name": "Cerberus IT",
          "url": "https://cerberus-it.co.uk"
        }
      }
    </script>
  </head>
  <body>
    <header class="site-header">
      <div class="shell">
        <div class="branding">
          <span class="logo-sigil">CI</span>
          <div>
            <p class="eyebrow">Cerberus IT</p>
            <p class="brand-title">Daily IT Gremlins</p>
          </div>
        </div>
        <nav class="primary-nav" aria-label="Main navigation">
          <a href="https://cerberus-it.co.uk" target="_blank" rel="noopener">Home</a>
          <a href="#recent-posts">Latest Posts</a>
          <a href="#newsletter">Newsletter</a>
          <a href="mailto:hello@cerberus-it.co.uk">Contact</a>
        </nav>
      </div>
    </header>

    <main>
      <section class="hero">
        <div class="shell hero-grid">
          <div class="hero-copy">
            <p class="eyebrow">Daily outage intel</p>
            <h1>Outage gossip, breach autopsies, and sarcastic IT truth.</h1>
            <p>
              We translate gnarly incident reports into sharp takes, human-friendly summaries, and ready-to-share
              posts. Pick a story, let the AI riff, and ship it to Bluesky or your execs.
            </p>
            <div class="hero-cta">
              <a class="btn primary" href="https://dailyitconsole.netlify.app" target="_blank" rel="noopener">Launch Console</a>
              <a class="btn ghost" href="#recent-posts">Browse latest</a>
            </div>
            <ul class="hero-points">
              <li>⚡ Fresh AI draft every weekday</li>
              <li>🌀 Bluesky-ready copy &amp; images</li>
              <li>🧩 Balanced EU/UK/US feed</li>
            </ul>
          </div>
          <div class="hero-highlight">
            <div class="highlight-card">
              <p class="eyebrow">Featured pull</p>
              <?php if ($featured): ?>
                  <h2><?= escape($featured['title']) ?></h2>
                  <p><?= escape($featured['summary']) ?></p>
                  <div class="highlight-meta">
                      <?= escape($featured['source']) ?> &bull; <?= escape($featured['date']) ?>
                  </div>
                  <a href="<?= escape($featured['link']) ?>" class="btn secondary" target="_blank" rel="noopener">Read source article</a>
              <?php else: ?>
                  <h2>No drafts yet</h2>
                  <p>Run the Daily IT console to generate your first story.</p>
                  <a href="https://dailyitconsole.netlify.app" class="btn secondary" target="_blank" rel="noopener">Launch console</a>
              <?php endif; ?>
            </div>
          </div>
        </div>
      </section>

      <section class="metrics">
        <div class="shell metric-grid">
          <article>
            <p class="metric-value"><?= number_format($total) ?></p>
            <p class="metric-label">Stories analysed</p>
          </article>
          <article>
            <p class="metric-value"><?= number_format($sarcasm_count) ?></p>
            <p class="metric-label">AI zingers delivered</p>
          </article>
          <article>
            <p class="metric-value"><?= count($posts) ?></p>
            <p class="metric-label">Bluesky posts shipped</p>
          </article>
        </div>
      </section>

      <section class="posts" id="recent-posts">
        <div class="shell">
          <div class="section-header">
            <div>
              <p class="eyebrow">Recent drops</p>
              <h2>Latest Daily IT Gremlins</h2>
            </div>
            <a class="btn ghost" href="https://github.com/CerberusITUK/daily-post-images" target="_blank" rel="noopener">View raw feed</a>
          </div>
          
          <div class="posts-grid">
            <?php if (empty($posts)): ?>
                <div class="placeholder-card">No stories available yet.</div>
            <?php else: ?>
                <?php foreach ($posts as $post): ?>
                <article class="post-card">
                    <h3><?= escape($post['title']) ?></h3>
                    <p><?= escape(trim_summary($post['summary'])) ?></p>
                    <p class="post-meta"><?= escape($post['source']) ?> &bull; <?= escape($post['date']) ?></p>
                    <div class="tag-row">
                        <?php foreach ($post['tags'] as $tag): ?>
                            <span class="tag"><?= escape($tag) ?></span>
                        <?php endforeach; ?>
                    </div>
                    <a href="<?= escape($post['link']) ?>" target="_blank" rel="noopener" class="btn ghost" style="margin-top: auto;">Open article</a>
                </article>
                <?php endforeach; ?>
            <?php endif; ?>
          </div>
        </div>
      </section>

      <section class="newsletter" id="newsletter">
        <div class="shell newsletter-grid">
          <div>
            <p class="eyebrow">Stay notified</p>
            <h2>Get the Daily IT Gremlins report in your inbox.</h2>
            <p>
              Receive one snark-soaked summary each weekday plus the occasional deep-dive on outages, ransomware, and
              compliance facepalms. No spam, no fluff.
            </p>
          </div>
          <form class="newsletter-form" action="https://cerberus-it.co.uk" method="POST">
            <label for="email" class="sr-only">Email address</label>
            <input type="email" id="email" name="email" placeholder="you@company.com" required />
            <button type="submit" class="btn primary">Join the list</button>
            <p class="form-footnote">We’ll confirm before sending anything. Unsubscribe anytime.</p>
          </form>
        </div>
      </section>
    </main>

    <footer class="site-footer">
      <div class="shell footer-grid">
        <div>
          <span class="logo-sigil">CI</span>
          <p>Security-first IT managed services from the grumpy engineers at Cerberus IT.</p>
        </div>
        <div>
          <p class="eyebrow">Links</p>
          <ul>
            <li><a href="https://cerberus-it.co.uk" target="_blank" rel="noopener">Cerberus IT</a></li>
            <li><a href="https://github.com/CerberusITUK/dailypost" target="_blank" rel="noopener">GitHub repo</a></li>
            <li><a href="mailto:hello@cerberus-it.co.uk">Contact</a></li>
          </ul>
        </div>
        <div>
          <p class="eyebrow">Follow</p>
          <ul>
            <li><a href="https://bsky.app/profile/dailyit.news" target="_blank" rel="noopener">Bluesky</a></li>
            <li><a href="https://linkedin.com/company/cerberus-it-uk" target="_blank" rel="noopener">LinkedIn</a></li>
            <li><a href="https://github.com/CerberusITUK" target="_blank" rel="noopener">GitHub</a></li>
          </ul>
        </div>
      </div>
      <p class="footer-note">© <?= date('Y') ?> Cerberus IT. All rights reserved.</p>
    </footer>
  </body>
</html>
