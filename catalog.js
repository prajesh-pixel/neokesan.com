/* neoKesan catalog.js — Phase 5 (0.6.0)
 *
 * window.NeoKesanCatalog — the product catalog used by every page that shows
 * products (homepage grid, header dropdown, product.html, admin.html). The
 * catalog lives in the {prefix}neokesan_products table on shop.neokesan.com and
 * is fetched over the public GET /neokesan/v1/products endpoint. This file owns:
 *
 *   - a bundled fallback copy of the seed catalog (works offline / backend-down)
 *   - a 24 h localStorage cache so snapshot() paints instantly on repeat visits
 *   - load(): fetch fresh -> cache -> notify subscribers (re-render)
 *
 * Rendering pattern (used by every consumer): paint immediately from snapshot(),
 * then re-render when load() resolves. No blank flash, and admin edits propagate
 * as soon as a fresh fetch lands.
 *
 * Load order on every page: catalog.js MUST come before shared-layout.js (the
 * header dropdown repopulation reads this object at DOMContentLoaded).
 */
(function () {
  'use strict';

  const API_BASE = 'https://shop.neokesan.com/wp-json/neokesan/v1/';
  const CACHE_KEY = 'neokesan_catalog_v1';
  const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

  /* Bundled fallback — the seed catalog, mirrored from
   * includes/data/products-seed.json. Stored in the same public-API payload
   * shape ({slug,name,asin,page,amazonUrl,data,updated_at}) so fallback and
   * live rows are interchangeable to every consumer. */
  const FALLBACK = [
    {
      slug: 'bloom',
      name: 'NeoBloom',
      asin: 'B0HBWZ4G26',
      page: 'product.html?key=bloom',
      amazonUrl: 'https://www.amazon.in/dp/B0HBWZ4G26',
      updated_at: '',
      data: {
        name: 'NeoBloom',
        family: 'X1, X2, X3',
        category: 'Blooming solution',
        badge: 'Blooming',
        word: 'BLOOM',
        accent: '#5546ae',
        soft: '#eeedfe',
        price: '749',
        description: 'A staged blooming system for vigorous flowering, improved pollination and maximum fruit set in hydroponic and soil setups.',
        formula: '50 ml X1 + 25 ml X3',
        variants: ['Full set', 'X1 - Vegetative', 'X2 - Flowering', 'X3 - Micro boost'],
        features: [
          ['Flower power', 'Balanced nutrition for vigorous flowering from early to late stage.'],
          ['Uniform fruiting', 'Supports consistent fruit set and sizing.'],
          ['Macro + micro', 'Complete essential nutrition across each stage.'],
          ['Hydro + soil', 'Works in NFT, DWC, Kratky and potting media.']
        ],
        guide: {
          hydro: [
            {
              label: 'Vegetative growth stage (before flowering)',
              tds: '800-1200 ppm',
              steps: [
                'Fill the reservoir with normal tap water. Ideal <strong>TDS &lt; 100 ppm</strong>.',
                'Mix <strong>50 ml NeoBloom-X1</strong> with <strong>25 ml NeoBloom-X3</strong> and wait 5-10 minutes.',
                'Check the TDS of the nutrient solution.',
                'Repeat the process until you reach your desired TDS.',
                'Check TDS every <strong>2-3 days</strong>. If TDS drops significantly, add 50 ml X1 + 25 ml X3.'
              ],
              tdsPanel: []
            },
            {
              label: 'Flowering and fruiting stage',
              tds: '1000-1600 ppm',
              steps: [
                'Fill the reservoir with normal tap water. Ideal <strong>TDS &lt; 100 ppm</strong>.',
                'Mix <strong>50 ml NeoBloom-X2</strong> with <strong>25 ml NeoBloom-X3</strong> and wait 5-10 minutes.',
                'Check the TDS of the nutrient solution.',
                'Repeat the process until you reach your desired TDS.',
                'Check TDS every <strong>2-3 days</strong>. If TDS drops significantly, add 50 ml X2 + 25 ml X3.'
              ],
              tdsPanel: []
            }
          ],
          soil: [
            {
              label: 'Vegetative growth stage',
              tds: '',
              steps: [
                'Take <strong>1 litre of water</strong> and mix <strong>2 ml NeoBloom-X1</strong> with <strong>1 ml NeoBloom-X3</strong>.',
                'Apply as a <strong>foliar spray</strong> on leaves or directly to the growing medium by hand watering.'
              ],
              tdsPanel: []
            },
            {
              label: 'Flowering and fruiting stage',
              tds: '',
              steps: [
                'Take <strong>1 litre of water</strong> and mix <strong>2 ml NeoBloom-X2</strong> with <strong>1 ml NeoBloom-X3</strong>.',
                'Apply as a <strong>foliar spray</strong> on leaves or directly to the growing medium by hand watering.'
              ],
              tdsPanel: []
            }
          ]
        },
        composition: [
          {
            id: 'bloom1',
            name: 'NeoBloom X1',
            desc: 'Vegetative stage macro formula',
            elements: [['Nitrogen (N)', '40.00'], ['Potassium (K)', '33.53'], ['Calcium (Ca)', '40.00'], ['Iron (Fe)', '0.60']],
            note: 'Use X1 + X3 together during vegetative growth stage.',
            ratio: '50 ml X1 + 25 ml X3',
            ratioLabel: 'Vegetative stage ratio'
          },
          {
            id: 'bloom2',
            name: 'NeoBloom X2',
            desc: 'Flowering stage macro formula',
            elements: [['Nitrogen (N)', '46.80'], ['Potassium (K)', '44.71'], ['Calcium (Ca)', '44.00'], ['Iron (Fe)', '0.60']],
            note: 'Use X2 + X3 together during flowering and fruiting stage.',
            ratio: '50 ml X2 + 25 ml X3',
            ratioLabel: 'Flowering stage ratio'
          },
          {
            id: 'bloom3',
            name: 'NeoBloom X3',
            desc: 'Micronutrient + trace element supplement',
            elements: [['Phosphorus (P)', '16.00'], ['Potassium (K)', '32.93'], ['Magnesium (Mg)', '20.00'], ['Sulphur (S)', '31.60'], ['Zinc (Zn)', '0.80'], ['Iron (Fe)', '0.40'], ['Manganese (Mn)', '0.10'], ['Copper (Cu)', '0.06'], ['Boron (B)', '0.10'], ['Molybdenum (Mo)', '0.02']],
            note: 'X3 is always used as a supplement alongside X1 or X2 — never alone.',
            ratio: 'Use with X1 or X2',
            ratioLabel: 'Always use X3 with'
          }
        ],
        images: [
          'assets/neobloom.jpeg',
          'assets/neobloom-group.jpeg',
          'assets/neobloom-x1.jpeg',
          'assets/neobloom-x2.jpeg',
          'assets/neobloom-x3.jpeg'
        ]
      }
    },
    {
      slug: 'ponic',
      name: 'NeoPonic',
      asin: 'B0HBX6WPTL',
      page: 'product.html?key=ponic',
      amazonUrl: 'https://www.amazon.in/dp/B0HBX6WPTL',
      updated_at: '',
      data: {
        name: 'NeoPonic',
        family: 'A & B',
        category: 'Hydroponic base nutrients',
        badge: 'Hydroponic',
        word: 'GROW',
        accent: '#087d60',
        soft: '#e2f5ed',
        price: '679',
        description: 'A complete two-part base nutrient for leafy greens, herbs, fruits and vegetables in every hydroponic system.',
        formula: '50 ml A + 50 ml B',
        variants: ['A + B set', 'Part A', 'Part B', 'Starter kit'],
        features: [
          ['Complete base', 'Daily nutrition from root development through harvest.'],
          ['Clean growth', 'Made for healthy, resilient leaves and roots.'],
          ['Easy mixing', 'Simple two-part routine for reliable results.'],
          ['System ready', 'Designed for Kratky, NFT and DWC systems.']
        ],
        guide: {
          hydro: [
            {
              label: '',
              tds: '',
              steps: [
                'Fill the reservoir with normal tap water. Ideal <strong>TDS &lt; 100 ppm</strong>.',
                'Mix <strong>50 ml neoPonic-A</strong> and <strong>50 ml neoPonic-B</strong> into the reservoir. Wait 5-10 minutes.',
                'Check the TDS of the nutrient solution with a TDS meter.',
                'Repeat the process until you reach your desired TDS level.',
                'Check TDS every <strong>2-3 days</strong>. If there is a significant drop in TDS, add 50 ml of each (A + B) again.'
              ],
              tdsPanel: [
                { range: '600-900 ppm', label: 'Leafy greens & herbs' },
                { range: '900-1200 ppm', label: 'Fruiting vegetables' }
              ]
            }
          ],
          soil: [
            {
              label: '',
              tds: '',
              steps: [
                'Take <strong>1 litre of water</strong> and mix <strong>2 ml neoPonic-A</strong> and <strong>2 ml neoPonic-B</strong> into it.',
                'Apply the solution either as a <strong>foliar spray</strong> on leaves or directly to the growing medium by hand watering.',
                'Use regularly for healthier, stronger, and more productive plants. Apply in the morning or evening for best results.'
              ],
              tdsPanel: []
            }
          ]
        },
        composition: [
          {
            id: 'pA',
            name: 'NeoPonic A',
            desc: 'Macro nutrient base (mg per 1 ml)',
            elements: [['Nitrogen (N)', '40.00'], ['Potassium (K)', '33.53'], ['Calcium (Ca)', '40.00'], ['Iron (Fe)', '0.60']],
            note: 'Part A provides the primary macronutrients essential for strong structure, cell division, and chlorophyll function.',
            ratio: '50 ml A',
            ratioSub: '+ 50 ml B'
          },
          {
            id: 'pB',
            name: 'NeoPonic B',
            desc: 'Micro and trace element formula (mg per 1 ml)',
            elements: [['Phosphorus (P)', '8.00'], ['Potassium (K)', '16.47'], ['Magnesium (Mg)', '10.00'], ['Sulphur (S)', '15.80'], ['Zinc (Zn)', '0.40'], ['Iron (Fe)', '0.20'], ['Manganese (Mn)', '0.05'], ['Copper (Cu)', '0.03'], ['Boron (B)', '0.05'], ['Molybdenum (Mo)', '0.01']],
            note: 'Part B delivers the full spectrum of micronutrients and trace elements required for healthy, productive plants.',
            tds: '600-1200 ppm',
            tdsLabel: 'Adjust by crop and growth stage'
          }
        ],
        images: [
          'assets/neoponic.jpeg',
          'assets/neoponic-group.jpeg',
          'assets/neoponic-a.jpeg',
          'assets/neoponic-b.jpeg'
        ]
      }
    },
    {
      slug: 'folix',
      name: 'NeoFolix',
      asin: 'B0HBXB8TQ9',
      page: 'product.html?key=folix',
      amazonUrl: 'https://www.amazon.in/dp/B0HBXB8TQ9',
      updated_at: '',
      data: {
        name: 'NeoFolix',
        family: 'X1 & X2',
        category: 'Foliar nutrition',
        badge: 'Foliar',
        word: 'FOLIAR',
        accent: '#1b9272',
        soft: '#e1f5ee',
        price: '699',
        description: 'Targeted foliar nutrition for stronger leaves, faster recovery and healthier growth between regular feeds.',
        formula: '2 ml in 1 litre water',
        variants: ['X1 + X2 set', 'X1 - Growth', 'X2 - Recovery', 'Leafy green kit'],
        features: [
          ['Fast uptake', 'Delivers vital nutrients through leaves when plants need support.'],
          ['Leafy growth', 'Encourages lush, vigorous foliage and colour.'],
          ['Recovery support', 'Helps plants recover from environmental stress.'],
          ['Simple spraying', 'Use on hydroponic, coco and soil-grown plants.']
        ],
        guide: {
          hydro: [
            {
              label: '',
              tds: '',
              steps: [
                'Mix the recommended dose with clean water.',
                'Spray evenly onto leaves, including undersides.',
                'Apply in the early morning or evening.',
                'Avoid spraying directly before harvest.'
              ],
              tdsPanel: []
            }
          ],
          soil: [
            {
              label: '',
              tds: '',
              steps: [
                'Mix the recommended dose with clean water.',
                'Apply around the root zone or as directed.',
                'Use in the morning or evening.',
                'Do not exceed the recommended concentration.'
              ],
              tdsPanel: []
            }
          ]
        },
        composition: null,
        images: [
          'assets/neofolix.jpeg',
          'assets/neofolix-group.jpeg',
          'assets/neofolix-x1.jpeg',
          'assets/neofolix-x2.jpeg'
        ]
      }
    }
  ];

  /* ------------------------------------------------------------- state */

  let current = null;        // in-memory catalog (array of public payloads)
  let subscribers = [];

  /* ------------------------------------------------------------- cache */

  function readCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.entries)) return null;
      if (Date.now() - parsed.fetched_at > CACHE_TTL_MS) return null;
      return parsed.entries;
    } catch (e) {
      return null;
    }
  }

  function writeCache(entries) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ fetched_at: Date.now(), entries }));
    } catch (e) { /* private mode / quota — non-fatal */ }
  }

  /* ------------------------------------------------------------- api */

  // Normalize one raw API row into the canonical public payload. Defensive
  // against a malformed row (missing slug/data) rather than crashing the page.
  function normalizeEntry(item) {
    if (!item || typeof item !== 'object' || !item.slug) return null;
    const data = (item.data && typeof item.data === 'object') ? item.data : {};
    return {
      slug: item.slug,
      name: item.name || data.name || item.slug,
      asin: item.asin || '',
      page: item.page || ('product.html?key=' + encodeURIComponent(item.slug)),
      amazonUrl: item.amazonUrl || (item.asin ? ('https://www.amazon.in/dp/' + item.asin) : ''),
      data,
      updated_at: item.updated_at || ''
    };
  }

  function snapshot() {
    const cached = readCache();
    current = cached && cached.length ? cached : FALLBACK;
    return current;
  }

  function notify() {
    subscribers.forEach(fn => { try { fn(current); } catch (e) { /* subscriber errors never break the loop */ } });
  }

  // Fetch the fresh public catalog, cache it, and notify consumers. Resolves to
  // whatever is current — fresh on success, the snapshot on any failure — so
  // callers can just re-render from the result.
  function load() {
    // 6 h cache-buster: Hostinger's CDN caches GETs for 7 days, which would hide
    // admin edits for a week. A bucket URL changes every 6 h, so the origin is
    // re-checked twice a day and edits appear within ~6 h.
    const bucket = Math.floor(Date.now() / 21600000);
    return fetch(API_BASE + 'products?cb=' + bucket)
      .then(res => {
        if (!res.ok) throw new Error('catalog request failed (' + res.status + ')');
        return res.json();
      })
      .then(list => {
        const entries = (Array.isArray(list) ? list : []).map(normalizeEntry).filter(Boolean);
        if (!entries.length) throw new Error('catalog empty');
        current = entries;
        writeCache(entries);
        notify();
        return entries;
      })
      .catch(() => snapshot());
  }

  function get(key) {
    if (!current) current = snapshot();
    for (let i = 0; i < current.length; i++) {
      if (current[i].slug === key) return current[i];
    }
    return null;
  }

  function list() {
    if (!current) current = snapshot();
    return current.slice();
  }

  function subscribe(fn) {
    if (typeof fn === 'function') subscribers.push(fn);
    return () => { subscribers = subscribers.filter(f => f !== fn); };
  }

  // Allow admin.js to push a freshly-mutated catalog straight into cache after a
  // save, without waiting for the next scheduled load().
  function setFresh(entries) {
    const normalized = (Array.isArray(entries) ? entries : []).map(normalizeEntry).filter(Boolean);
    if (normalized.length) {
      current = normalized;
      writeCache(normalized);
      notify();
    }
    return current;
  }

  /* ------------------------------------------------------------- boot */

  // Seed the in-memory catalog synchronously so get()/list() work immediately.
  snapshot();

  window.NeoKesanCatalog = { snapshot, load, get, list, subscribe, setFresh };
  console.log('[neoKesan] catalog v20260810c');
})();
