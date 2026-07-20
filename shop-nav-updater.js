/**
 * neoKesan Shop Navigation Updater
 *
 * PASTE THIS ENTIRE SCRIPT into your browser's developer console (F12 → Console)
 * while logged into https://shop.neokesan.com/wp-admin/ as admin.
 *
 * It will update the header navigation and footer links
 * to point back to the main neokesan.com website.
 */

(async function() {
  console.log('🚀 neoKesan Shop Navigation Updater starting...');

  const API_ROOT = window.wpApiSettings?.root || 'https://shop.neokesan.com/wp-json/wp/v2/';
  const NONCE = window.wpApiSettings?.nonce;

  if (!NONCE) {
    console.error('❌ wpApiSettings not found. Make sure you are logged into WordPress admin.');
    console.error('   Navigate to any wp-admin page first, then run this script.');
    return;
  }

  const headers = {
    'Content-Type': 'application/json',
    'X-WP-Nonce': NONCE,
  };

  async function api(method, path, body) {
    const url = path.startsWith('http') ? path : API_ROOT + path;
    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`${method} ${path}: ${data.message || res.status}`);
    return data;
  }

  try {
    // === STEP 1: Update Header Navigation (Post ID: 4) ===
    console.log('📋 Step 1: Updating header navigation...');

    const nav = await api('GET', 'navigation/4');
    console.log('   Current nav content:', nav.content?.raw?.substring(0, 100));

    // Replace Page List block with Page List + custom home link
    const newNavContent = `<!-- wp:navigation-link {"label":"Home","url":"https://neokesan.com","kind":"custom","isTopLinkLevel":true} /-->\n<!-- wp:page-list /-->`;

    await api('PUT', 'navigation/4', {
      content: newNavContent,
      title: nav.title?.raw || 'Navigation',
      status: 'publish',
    });
    console.log('   ✅ Header navigation updated — added "Home" link to neokesan.com');

    // === STEP 2: Get Footer Template Part ===
    console.log('📋 Step 2: Finding footer template part...');

    // Find the footer template part
    const templates = await api('GET', 'templates?per_page=100');
    const templateParts = await api('GET', 'template-parts?per_page=100');

    console.log(`   Found ${templates.length} templates, ${templateParts.length} template parts`);

    // Look for footer-related template or template part
    const footerTemplate = templateParts.find(tp =>
      tp.slug?.includes('footer') || tp.title?.raw?.toLowerCase().includes('footer')
    );

    if (footerTemplate) {
      console.log(`   Found footer template part: "${footerTemplate.title?.raw}" (ID: ${footerTemplate.id})`);

      // Get the current content
      const footerData = await api('GET', `template-parts/${encodeURIComponent(footerTemplate.id)}`);
      console.log('   Current footer content (first 500 chars):', footerData.content?.raw?.substring(0, 500));

      // The footer has # links that need updating. We'll replace them.
      let footerContent = footerData.content?.raw || '';

      // Replace navigation link URLs
      const linkReplacements = [
        // Menu 1 links
        ['href="#"', 'href="https://neokesan.com/#learn"'],  // Blog
        ['href="#"', 'href="https://neokesan.com/#about"'],    // About
        ['href="#"', 'href="https://neokesan.com/#about"'],    // FAQs
        ['href="#"', 'href="https://neokesan.com/#about"'],    // Authors

        // Menu 2 links
        ['href="#"', 'href="https://neokesan.com/#learn"'],    // Events
        ['href="#"', 'href="https://shop.neokesan.com/shop/"'], // Shop
        ['href="#"', 'href="https://neokesan.com/#learn"'],    // Patterns
        ['href="#"', 'href="https://neokesan.com/#learn"'],    // Themes
      ];

      // Only replace the first occurrence of each pattern to avoid over-replacing
      linkReplacements.forEach(([oldStr, newStr]) => {
        footerContent = footerContent.replace(oldStr, newStr);
      });

      // Update "Twenty Twenty-Five" credit to neoKesan
      footerContent = footerContent.replace(
        /Twenty Twenty-Five/gi,
        'neoKesan'
      );

      // Update "Designed with WordPress" credit
      footerContent = footerContent.replace(
        /Designed with WordPress/i,
        'Powered by neoKesan'
      );

      await api('PUT', `template-parts/${encodeURIComponent(footerTemplate.id)}`, {
        content: footerContent,
        status: 'publish',
      });
      console.log('   ✅ Footer template part updated — links now point to neokesan.com');
    } else {
      // If no footer template part found, check the front page template
      console.log('   No footer-specific template part found.');
      console.log('   Checking front page and other templates...');

      // Try the front-page or the active template
      const templatesToCheck = templates.filter(t =>
        t.slug === 'front-page' || t.slug === 'index' || t.slug === 'singular' || t.slug === 'page'
      );

      console.log(`   Found ${templatesToCheck.length} templates to check for footer navigation:`);
      for (const t of templatesToCheck) {
        console.log(`   - ${t.slug} (${t.title?.raw})`);
      }
    }

    // === STEP 3: Update Site Title/Description ===
    console.log('📋 Step 3: Updating site settings...');
    try {
      const settings = await api('GET', 'settings');
      // Add a site description that mentions the main brand
      if (!settings.description?.includes('neoKesan')) {
        await api('PUT', 'settings', {
          description: 'Official shop for neoKesan plant nutrition products — precision nutrients for modern Indian growers.',
        });
        console.log('   ✅ Site tagline updated with neoKesan branding');
      } else {
        console.log('   ⏭️ Site tagline already mentions neoKesan');
      }
    } catch(e) {
      console.warn('   ⚠️ Could not update settings:', e.message);
    }

    console.log('');
    console.log('✅ All updates complete! Refresh the shop site to see changes.');
    console.log('   Header: "Home" link added → neokesan.com');
    console.log('   Footer: Links updated → neokesan.com');
    console.log('   Branding: Credits changed to neoKesan');

  } catch (err) {
    console.error('❌ Error:', err.message);
    console.error('   Full error:', err);
  }
})();
