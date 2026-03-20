<?php
// Configuration
$repo_owner = 'CerberusITUK';
$repo_name  = 'daily-post-images';
$cache_file = __DIR__ . '/posts_cache.json';
$cache_time = 300; // Cache duration in seconds (5 minutes)
$posts_per_page = 24;

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
    global $repo_owner, $repo_name, $cache_file, $cache_time, $github_token;

    // Check cache first
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
        if ($count >= $total) break;
        
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

$all_posts_raw = get_posts();

$all_posts = [];
foreach ($all_posts_raw['posts'] as $item) {
    $all_posts[] = [
        'title'   => $item['title'] ?? 'Unknown',
        'summary' => $item['summary'] ?? '',
        'date'    => $item['date'] ?? '',
        'link'    => $item['link'] ?? '#',
        'source'  => $item['source'] ?? 'Unknown',
        'tags'    => $item['tags'] ?? [],
        'image'   => $item['image'] ?? null
    ];
}

$sort_order = isset($_GET['sort']) && $_GET['sort'] === 'asc' ? 'asc' : 'desc';

// Helper to convert DD/MM/YYYY to a sortable timestamp
function parse_uk_date($date_str) {
    if (empty($date_str)) return time();
    // Convert DD/MM/YYYY to YYYY-MM-DD for strtotime
    $parts = explode('/', $date_str);
    if (count($parts) === 3) {
        return strtotime("{$parts[2]}-{$parts[1]}-{$parts[0]}");
    }
    return strtotime($date_str);
}

// Sort by date
usort($all_posts, function($a, $b) use ($sort_order) {
    $timeA = parse_uk_date($a['date'] ?? '');
    $timeB = parse_uk_date($b['date'] ?? '');
    return $sort_order === 'asc' ? $timeA - $timeB : $timeB - $timeA;
});

$featured = null;
if (!empty($all_posts)) {
    $featured = array_shift($all_posts);
}

$total_posts = count($all_posts);

$current_page = isset($_GET['page']) ? max(1, (int)$_GET['page']) : 1;
$total_pages = ceil($total_posts / $posts_per_page);
if ($current_page > $total_pages && $total_pages > 0) {
    $current_page = $total_pages;
}

$offset = ($current_page - 1) * $posts_per_page;
$posts = array_slice($all_posts, $offset, $posts_per_page);

function escape($str) {
    return htmlspecialchars($str ?? '', ENT_QUOTES, 'UTF-8');
}
?>
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Daily IT Gremlins – Cerberus IT</title>
    <meta name="description" content="Daily IT Gremlins delivers brutally honest IT outage news, witty commentary, and punchy summaries from Cerberus IT." />
    <meta property="og:title" content="Daily IT Gremlins – Cerberus IT" />
    <meta property="og:description" content="A daily log of outages, cyber mishaps, and sarcastic takes curated by Cerberus IT." />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="https://cerberus-it.co.uk/it-blog" />
    <meta property="og:image" content="https://cerberus-it.co.uk/images/daily-it-og.png" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Bangers&display=swap" rel="stylesheet" />
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
          <a href="#recent-posts">Latest News</a>
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
            <h1>Our slightly sarcastic view of the IT world.</h1>
            <p>
              We translate gnarly incident reports into sharp takes and human-friendly summaries. A daily dose of outage gossip, breach autopsies, and the harsh realities of enterprise IT.
            </p>
            <div class="hero-cta">
              <a class="btn primary" href="#recent-posts">Read the latest</a>
            </div>
            <ul class="hero-points">
              <li>⚡ Fresh outages every weekday</li>
              <li>🌀 Bite-sized insights</li>
              <li>🧩 Balanced EU/UK/US feed</li>
            </ul>
          </div>
          <div class="hero-highlight">
            <?php if ($featured): ?>
              <div class="panel panel-featured">
                <p class="text top-left"><?= escape($featured['date']) ?></p>
                <p class="text bottom-right">Source: <?= escape($featured['source']) ?></p>
                <div class="panel-body">
                  <h3><?= escape($featured['title']) ?></h3>
                  <p><?= escape($featured['summary']) ?></p>
                  <?php if (!empty($featured['image'])): ?>
                    <img src="<?= escape($featured['image']) ?>" alt="Featured post image" loading="lazy" />
                  <?php endif; ?>
                  <?php if (!empty($featured['tags'])): ?>
                    <div class="tag-row">
                      <?php foreach ($featured['tags'] as $tag): ?>
                        <span class="tag"><?= escape($tag) ?></span>
                      <?php endforeach; ?>
                    </div>
                  <?php endif; ?>
                </div>
                <a href="<?= escape($featured['link']) ?>" class="panel-link" target="_blank" rel="noopener">Open article →</a>
              </div>
            <?php else: ?>
              <div class="panel panel-featured placeholder">
                <div class="panel-body">
                  <h3>No drafts yet</h3>
                  <p>The gremlins are currently assembling the first outage report. Check back soon.</p>
                </div>
              </div>
            <?php endif; ?>
          </div>
        </div>
      </section>

      <section class="comic-section" id="recent-posts">
        <div class="shell">
          <div class="section-header">
            <div>
              <p class="eyebrow">Recent drops</p>
              <h2>Latest News</h2>
            </div>
            <div class="sort-controls">
              <a href="?sort=desc#recent-posts" class="btn <?= $sort_order === 'desc' ? 'primary' : 'secondary' ?> btn-small">Newest first</a>
              <a href="?sort=asc#recent-posts" class="btn <?= $sort_order === 'asc' ? 'primary' : 'secondary' ?> btn-small">Oldest</a>
            </div>
          </div>

          <?php if (empty($posts)): ?>
            <div class="placeholder-card">No stories available yet.</div>
          <?php else: ?>
            <article class="comic">
              <?php 
              $panel_variants = ['panel-large', 'panel-medium', 'panel-medium', 'panel-medium', 'panel-large', 'panel-medium', 'panel-medium', 'panel-medium', 'panel-large'];
              $index = 0;
              foreach ($posts as $post):
                  $variant = $panel_variants[$index % count($panel_variants)];
              ?>
                <div class="panel <?= $variant ?>">
                  <p class="text top-left"><?= escape($post['date']) ?></p>
                  <p class="text bottom-right">Source: <?= escape($post['source']) ?></p>
                  <div class="panel-body">
                    <h3><?= escape($post['title']) ?></h3>
                    <p><?= escape($post['summary']) ?></p>
                    <?php if (!empty($post['image'])): ?>
                      <img src="<?= escape($post['image']) ?>" alt="Post image" loading="lazy" />
                    <?php endif; ?>
                    <?php if (!empty($post['tags'])): ?>
                      <div class="tag-row">
                        <?php foreach ($post['tags'] as $tag): ?>
                          <span class="tag"><?= escape($tag) ?></span>
                        <?php endforeach; ?>
                      </div>
                    <?php endif; ?>
                  </div>
                  <a href="<?= escape($post['link']) ?>" class="panel-link" target="_blank" rel="noopener">Open article →</a>
                </div>
              <?php 
              $index++;
              endforeach; 
              ?>
            </article>

            <?php if ($total_pages > 1): ?>
            <div class="pagination">
                <?php if ($current_page > 1): ?>
                    <a href="?page=<?= $current_page - 1 ?>&sort=<?= $sort_order ?>#recent-posts" class="btn secondary">&laquo; Previous</a>
                <?php endif; ?>
                
                <span class="page-info">Page <?= $current_page ?> of <?= $total_pages ?></span>
                
                <?php if ($current_page < $total_pages): ?>
                    <a href="?page=<?= $current_page + 1 ?>&sort=<?= $sort_order ?>#recent-posts" class="btn secondary">Next &raquo;</a>
                <?php endif; ?>
            </div>
            <?php endif; ?>
            
          <?php endif; ?>
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
            <li><a href="https://linkedin.com/company/cerberus-it-uk" target="_blank" rel="noopener">LinkedIn</a></li>
            <li><a href="https://mastodon.social/@CerberusITUK" target="_blank" rel="noopener">Mastodon</a></li>
            <li><a href="https://github.com/CerberusITUK" target="_blank" rel="noopener">GitHub</a></li>
          </ul>
        </div>
      </div>
      <p class="footer-note">© <?= date('Y') ?> Cerberus IT. All rights reserved.</p>
    </footer>
  </body>
</html>
