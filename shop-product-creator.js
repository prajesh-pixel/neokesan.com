/**
 * neoKesan WooCommerce Product Creator
 *
 * PASTE THIS ENTIRE SCRIPT into your browser's developer console (F12 → Console)
 * while logged into https://shop.neokesan.com/wp-admin/ as admin.
 *
 * It creates NeoPonic, NeoBloom, and NeoFolix products in WooCommerce
 * with prices, descriptions, categories, and stock settings.
 *
 * After running, note the product slugs/IDs shown — they'll be used
 * to update the main neokesan.com buttons.
 */

(async function() {
  console.log('🌱 neoKesan Product Creator starting...\n');

  // ============================================================
  // 1. PRODUCT DEFINITIONS
  // ============================================================

  const PRODUCTS = [
    {
      name: 'NeoPonic A + B',
      slug: 'neoponic',
      regular_price: '599',
      description: '<p>Complete two-part base nutrient for leafy greens, herbs, fruits and vegetables in every hydroponic system.</p><p>Simple mixing: 50 ml Part A + 50 ml Part B per reservoir fill. Works with NFT, DWC and Kratky systems.</p>',
      short_description: 'Complete base nutrients for all hydro systems — two-part formula for consistent results.',
      sku: 'NEO-PONIC-AB',
      categories: ['Hydroponics'],
      manage_stock: false,
      stock_status: 'instock',
      attributes: [
        { name: 'Includes', visible: true, options: ['Part A 500 ml', 'Part B 500 ml'] }
      ],
    },
    {
      name: 'NeoBloom X1',
      slug: 'neobloom-x1',
      regular_price: '649',
      description: '<p>Vegetative stage blooming formula with macro and micronutrients for vigorous flowering.</p><p>Use with NeoBloom X3 during vegetative growth before flowering begins.</p>',
      short_description: 'Vegetative stage bloom formula for strong structure and early flower development.',
      sku: 'NEO-BLOOM-X1',
      categories: ['Blooming'],
      manage_stock: false,
      stock_status: 'instock',
      attributes: [
        { name: 'Size', visible: true, options: ['500 ml'] }
      ],
    },
    {
      name: 'NeoBloom X2',
      slug: 'neobloom-x2',
      regular_price: '649',
      description: '<p>Flowering and fruiting stage formula for maximum fruit set and uniform sizing.</p><p>Use with NeoBloom X3 during the flowering and fruiting stage.</p>',
      short_description: 'Flowering stage formula for high yields and uniform fruit development.',
      sku: 'NEO-BLOOM-X2',
      categories: ['Blooming'],
      manage_stock: false,
      stock_status: 'instock',
      attributes: [
        { name: 'Size', visible: true, options: ['500 ml'] }
      ],
    },
    {
      name: 'NeoBloom X3',
      slug: 'neobloom-x3',
      regular_price: '449',
      description: '<p>Micronutrient and trace element supplement — always used alongside NeoBloom X1 or X2, never alone.</p><p>Contains zinc, iron, manganese, copper, boron, molybdenum and more for complete plant nutrition.</p>',
      short_description: 'Micronutrient supplement — use with X1 (veg) or X2 (flowering) for complete nutrition.',
      sku: 'NEO-BLOOM-X3',
      categories: ['Blooming'],
      manage_stock: false,
      stock_status: 'instock',
      attributes: [
        { name: 'Size', visible: true, options: ['500 ml'] }
      ],
    },
    {
      name: 'NeoBloom Full Set',
      slug: 'neobloom-set',
      regular_price: '999',
      description: '<p>Complete blooming system with all three NeoBloom solutions: X1 (Vegetative), X2 (Flowering), and X3 (Micro boost).</p><p>Everything you need from vegetative growth through flowering and fruiting.</p>',
      short_description: 'Complete bloom system — X1 + X2 + X3 for full-cycle flowering nutrition.',
      sku: 'NEO-BLOOM-SET',
      categories: ['Blooming'],
      manage_stock: false,
      stock_status: 'instock',
    },
    {
      name: 'NeoFolix X1 + X2',
      slug: 'neofolix',
      regular_price: '549',
      description: '<p>Targeted foliar nutrition for stronger leaves, faster recovery and healthier growth between regular feeds.</p><p>X1 for growth, X2 for recovery. Simple 2 ml per litre of water dosage.</p>',
      short_description: 'Foliar spray pair for vigorous leafy growth and stress recovery.',
      sku: 'NEO-FOLIX-X1X2',
      categories: ['Foliar'],
      manage_stock: false,
      stock_status: 'instock',
      attributes: [
        { name: 'Includes', visible: true, options: ['X1 Growth 250 ml', 'X2 Recovery 250 ml'] }
      ],
    },
  ];

  // ============================================================
  // 2. HELPER: API fetch with WP nonce (works from admin console)
  // ============================================================

  const API_ROOT = window.wpApiSettings?.root || 'https://shop.neokesan.com/wp-json/';
  const NONCE = window.wpApiSettings?.nonce;

  if (!NONCE) {
    console.error('❌ wpApiSettings not found. Make sure you are logged into WordPress admin.');
    console.error('   Navigate to any wp-admin page first (like Dashboard), then run this script.');
    return;
  }

  const headers = {
    'Content-Type': 'application/json',
    'X-WP-Nonce': NONCE,
  };

  async function api(method, path, body) {
    const url = path.startsWith('http') ? path : API_ROOT + path;
    const opts = { method, headers, credentials: 'same-origin' };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const res = await fetch(url, opts);
    const data = await res.json();
    if (!res.ok) throw new Error(`${method} ${path}: ${data.message || res.status} ${data.code || ''}`);
    return data;
  }

  // ============================================================
  // 3. HELPER: Try WooCommerce REST API (works from browser with session)
  // ============================================================

  let wcApiAvailable = false;

  async function tryWooCommerceAPI() {
    console.log('🔌 Checking WooCommerce REST API availability...');
    try {
      const res = await fetch(API_ROOT + 'wc/v3/products?per_page=1', {
        method: 'GET',
        headers,
        credentials: 'same-origin',
      });
      if (res.ok) {
        wcApiAvailable = true;
        console.log('   ✅ WooCommerce API is accessible from this session!');
        return true;
      }
      const data = await res.json();
      console.log(`   ⚠️ WooCommerce API returned ${res.status}: ${data.message || 'unknown'}`);
      return false;
    } catch (e) {
      console.log(`   ⚠️ WooCommerce API error: ${e.message}`);
      return false;
    }
  }

  async function createProductWC(product) {
    const data = {
      name: product.name,
      slug: product.slug,
      type: 'simple',
      regular_price: product.regular_price,
      description: product.description,
      short_description: product.short_description,
      sku: product.sku,
      manage_stock: product.manage_stock || false,
      stock_status: product.stock_status || 'instock',
      status: 'publish',
      categories: product.categories.map(c => ({ name: c })),
      attributes: product.attributes || [],
    };
    const result = await api('POST', 'wc/v3/products', data);
    return result;
  }

  // ============================================================
  // 4. HELPER: Create via WordPress REST API (fallback)
  // ============================================================

  async function createCategoryWP(name, slug) {
    try {
      const result = await api('POST', 'wp/v2/product_cat', { name, slug });
      console.log(`   ✅ Category "${name}" created (ID: ${result.id})`);
      return result;
    } catch (e) {
      // Category might already exist — try finding it
      try {
        const cats = await api('GET', `wp/v2/product_cat?search=${encodeURIComponent(name)}`);
        if (cats.length > 0) {
          console.log(`   ℹ️  Category "${name}" already exists (ID: ${cats[0].id})`);
          return cats[0];
        }
      } catch (_) {}
      console.warn(`   ⚠️ Could not create category "${name}": ${e.message}`);
      return null;
    }
  }

  async function createProductWP(product) {
    // Create category first
    const catResults = await Promise.all(
      product.categories.map(cat => createCategoryWP(cat, cat.toLowerCase()))
    );
    const catIds = catResults.filter(r => r !== null).map(r => r.id);

    const data = {
      title: product.name,
      slug: product.slug,
      content: product.description,
      excerpt: product.short_description,
      status: 'publish',
      product_cat: catIds,
    };
    const result = await api('POST', 'wp/v2/product', data);
    return result;
  }

  // ============================================================
  // 5. HELPER: Set WooCommerce meta via admin-ajax.php
  // ============================================================
  // This works because WooCommerce processes $_POST from admin-ajax

  async function setProductMetaViaAjax(postId, price, sku) {
    // Get the edit post nonce from the page
    const nonceMatch = document.body.innerHTML?.match(/wpApiSettings\.nonce\s*=\s*'([^']+)'/);
    const ajaxNonce = nonceMatch ? nonceMatch[1] : NONCE;

    try {
      const formData = new URLSearchParams();
      formData.append('action', 'woocommerce_save_attributes');
      formData.append('post_id', postId);
      formData.append('security', ajaxNonce);

      // Use the REST API endpoint for meta if available, else fallback
      await api('PUT', `wp/v2/product/${postId}`, {
        meta: {
          _regular_price: price,
          _price: price,
          _sku: sku || '',
          _stock_status: 'instock',
        }
      });
      console.log(`   ✅ Product #${postId}: price ₹${price}, SKU "${sku}" set`);
    } catch (e) {
      console.warn(`   ⚠️ Could not set price/SKU via REST: ${e.message}`);
      console.warn(`   → Please edit Product #${postId} manually to set price ₹${price}`);
      return false;
    }
    return true;
  }

  // ============================================================
  // 6. MAIN: Create all products
  // ============================================================

  const created = [];
  const wcAvailable = await tryWooCommerceAPI();

  for (const product of PRODUCTS) {
    console.log(`\n📦 Creating "${product.name}" (₹${product.regular_price})...`);

    try {
      let result;

      if (wcAvailable) {
        // Use full WooCommerce API
        try {
          result = await createProductWC(product);
          console.log(`   ✅ Created via WooCommerce API! ID: ${result.id}, Slug: ${result.slug}`);
        } catch (wcErr) {
          console.warn(`   ⚠️ WooCommerce API failed: ${wcErr.message}`);
          console.log(`   → Falling back to WordPress REST API...`);
          result = await createProductWP(product);
          console.log(`   ✅ Created via WordPress API! ID: ${result.id}, Slug: ${result.slug}`);
          // Try to set meta
          await setProductMetaViaAjax(result.id, product.regular_price, product.sku);
        }
      } else {
        // Use WordPress REST API
        result = await createProductWP(product);
        console.log(`   ✅ Basic product created! ID: ${result.id}, Slug: ${result.slug}`);
        // Try to set meta
        await setProductMetaViaAjax(result.id, product.regular_price, product.sku);
      }

      created.push({
        id: result.id,
        name: product.name,
        slug: product.slug || result.slug,
        price: product.regular_price,
      });

    } catch (err) {
      console.error(`   ❌ Failed to create "${product.name}": ${err.message}`);
    }
  }

  // ============================================================
  // 7. SUMMARY
  // ============================================================

  console.log('\n' + '='.repeat(60));
  console.log('📋 CREATION SUMMARY');
  console.log('='.repeat(60));

  if (created.length === 0) {
    console.log('\n❌ No products were created.');
    console.log('\nAlternative: Create products manually:');
    console.log('   1. Go to https://shop.neokesan.com/wp-admin/post-new.php?post_type=product');
    console.log('   2. Add each product with the details below:');
    for (const p of PRODUCTS) {
      console.log(`      - ${p.name}: ₹${p.regular_price} (SKU: ${p.sku})`);
    }
    console.log('\n   3. After creating, note the product URLs (e.g. /product/neoponic/)');
    console.log('      and share them so I can update the main site buttons.');
    return;
  }

  console.log(`\n✅ ${created.length}/${PRODUCTS.length} products created successfully!\n`);
  created.forEach(p => {
    console.log(`   ${p.name}`);
    console.log(`     ID: ${p.id}  |  Price: ₹${p.price}`);
    console.log(`     URL: https://shop.neokesan.com/product/${p.slug}/`);
    console.log(`     Add-to-cart: https://shop.neokesan.com/?add-to-cart=${p.id}`);
    console.log('');
  });

  console.log('📌 FOR THE MAIN SITE BUTTONS, use these URLs:');
  created.forEach(p => {
    console.log(`   ${p.name} → /product/${p.slug}/ or ?add-to-cart=${p.id}`);
  });

  console.log('\n📌 PRODUCT-SLUG MAPPING for main site:');
  created.forEach(p => {
    const key = p.name.toLowerCase().includes('ponic') ? 'ponic'
              : p.name.toLowerCase().includes('folix') ? 'folix'
              : p.name.toLowerCase().includes('bloom') ? 'bloom' : 'other';
    console.log(`   ${key}: slug="${p.slug}", id=${p.id}`);
  });

  console.log('\n✅ Done! Copy the slugs/IDs above — I need them to update the main site.');
})();
