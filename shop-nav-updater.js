/**
 * neoKesan Footer Link Updater
 *
 * The v2 script created custom footer overrides that are now writable.
 * This script updates those overrides with proper URLs.
 *
 * PASTE into wp-admin browser console (F12 → Console) while logged in.
 */

(async function() {
  console.log('🔗 neoKesan Footer Link Updater\n');

  const API_ROOT = window.wpApiSettings?.root;
  const NONCE = window.wpApiSettings?.nonce;
  if (!NONCE) { console.error('❌ Not logged into wp-admin.'); return; }

  const headers = { 'Content-Type': 'application/json', 'X-WP-Nonce': NONCE };
  const api = async (method, path, body) => {
    const url = path.startsWith('http') ? path : API_ROOT + path;
    const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || res.status);
    return data;
  };

  try {
    // Get all footer template parts
    const parts = await api('GET', 'wp/v2/template-parts?per_page=100');
    const footers = parts.filter(p => p.area === 'footer');

    console.log(`Found ${footers.length} footer template part(s):\n`);

    for (const part of footers) {
      console.log(`📋 Editing: "${part.title?.raw}" (id: ${part.id})`);

      // Fetch full content
      const data = await api('GET', `wp/v2/template-parts/${encodeURIComponent(part.id)}`);
      let content = data.content?.raw || '';

      console.log('   Content preview:');
      console.log('   ' + content.substring(0, 300) + '\n');

      // Track changes
      let changes = 0;

      // Replace href="#" patterns with real URLs
      // We need to replace each unique occurrence
      if (content.includes('href="#"')) {
        // Get all nav-link blocks to see what labels they have
        const navLinks = content.match(/<!-- wp:navigation-link\s*({[^}]*})/g) || [];
        console.log(`   Found ${navLinks.length} navigation link block(s) in content`);

        // Collect unique labels and URLs from the content
        const labelMatches = content.match(/"label":"([^"]+)"/g) || [];
        console.log('   Labels found:', labelMessages(labelMatches));

        // Count how many "#" hrefs
        const hashCount = (content.match(/"#"/g) || []).length;
        console.log(`   Links with href="#": ${hashCount}`);

        if (hashCount > 0) {
          // Check if there's already a proper shop.neokesan.com link
          if (!content.includes('shop.neokesan.com')) {
            // Replace empty # links
            // First, let's get each navigation-link block and parse it
            const blocks = content.match(/<!-- wp:navigation-link\s*({[^}]+})\s*\/-->/g) || [];
            for (let i = 0; i < blocks.length; i++) {
              const block = blocks[i];
              if (block.includes('"url":"#"')) {
                // Extract label to determine the correct URL
                const labelMatch = block.match(/"label":"([^"]+)"/);
                const label = labelMatch ? labelMatch[1].toLowerCase() : '';

                let newUrl;
                if (label === 'blog' || label === 'events' || label === 'patterns' || label === 'themes') {
                  newUrl = 'https://neokesan.com/#learn';
                } else if (label === 'about' || label === 'faqs' || label === 'authors') {
                  newUrl = 'https://neokesan.com/#about';
                } else if (label === 'shop') {
                  newUrl = 'https://shop.neokesan.com/shop/';
                } else {
                  newUrl = 'https://neokesan.com';
                }

                const newBlock = block.replace('"url":"#"', `"url":"${newUrl}"`);
                content = content.replace(block, newBlock);
                console.log(`   → Updated "${labelMatch ? labelMatch[1] : '?'}" → ${newUrl}`);
                changes++;
              }
            }
          } else {
            console.log('   ⏭️ Already has shop.neokesan.com links');
          }
        }
      }

      // Update credit text
      if (/\btwenty\s*twenty-?five\b/i.test(content)) {
        content = content.replace(/\bTwenty\s*Twenty-?Five\b/gi, 'neoKesan');
        changes++;
        console.log('   → Updated "Twenty Twenty-Five" credit');
      }
      if (content.includes('Designed with WordPress')) {
        content = content.replace(/Designed with WordPress/i, 'Powered by neoKesan');
        changes++;
        console.log('   → Updated "Designed with WordPress" credit');
      }
      if (content.includes('Proudly powered by')) {
        // keep but maybe update text
      }

      if (changes > 0) {
        await api('PUT', `wp/v2/template-parts/${encodeURIComponent(part.id)}`, {
          content,
          status: 'publish',
        });
        console.log(`   ✅ Saved ${changes} change(s)\n`);
      } else {
        console.log('   ⏭️ No changes needed\n');
      }
    }

    console.log('='.repeat(60));
    console.log('✅ Done! Refresh the shop site to see footer updates.');
    console.log('='.repeat(60));

  } catch (err) {
    console.error('❌ Error:', err.message);
    console.error('   Full error:', err);
  }

  function labelMessages(matches) {
    return matches.map(m => m.replace(/"/g, '')).join(', ');
  }
})();
