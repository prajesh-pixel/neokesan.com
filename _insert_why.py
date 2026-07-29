import re

with open('index.html', 'r', encoding='utf-8') as f:
    content = f.read()

why_section = '    <section class="section why-section" id="why"><div class="shell"><div class="section-heading"><h2 class="section-title">Why neoKesan?</h2></div><div class="why-grid"><article class="why-card"><div class="why-icon"><svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M24 6 C14 10 10 18 12 26 C16 22 20 16 24 14 C22 22 20 30 20 38 L24 38 C24 30 26 22 24 14 C28 16 32 22 36 26 C38 18 34 10 24 6Z"/><path d="M14 38 Q24 34 34 38" stroke-dasharray="2 2"/></svg></div><h4>Environment Sustainability</h4><p>Soil-less farming drastically reduces chemical runoff. Our formulations are engineered to leave zero harmful residue in the ecosystem.</p></article><article class="why-card"><div class="why-icon"><svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="8" width="13" height="13" rx="2"/><rect x="27" y="8" width="13" height="13" rx="2"/><rect x="8" y="27" width="13" height="13" rx="2"/><rect x="27" y="27" width="13" height="13" rx="2"/><line x1="14" y1="21" x2="14" y2="27" stroke-dasharray="2 1"/><line x1="34" y1="21" x2="34" y2="27" stroke-dasharray="2 1"/><line x1="21" y1="14" x2="27" y2="14" stroke-dasharray="2 1"/><line x1="21" y1="34" x2="27" y2="34" stroke-dasharray="2 1"/></svg></div><h4>Space Utilization</h4><p>Grow 5&times; more plants in the same footprint. Vertical stacking and compact hydroponic systems make balconies and kitchens into productive gardens.</p></article><article class="why-card"><div class="why-icon"><svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M24 8 C24 8 10 22 10 30 A14 14 0 0 0 38 30 C38 22 24 8 24 8Z"/><path d="M18 32 Q22 28 26 32"/></svg></div><h4>Water Efficiency</h4><p>Hydroponics uses up to 90% less water than traditional soil farming. Recirculating systems further minimise waste &mdash; every drop counts.</p></article><article class="why-card"><div class="why-icon"><svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8 L18 26 L8 40 L40 40 L30 26 L30 8 Z"/><line x1="18" y1="8" x2="30" y2="8"/><line x1="12" y1="32" x2="36" y2="32"/><circle cx="22" cy="35" r="1.5" fill="#1ca579" stroke="none"/><circle cx="27" cy="36" r="1" fill="#75d7b5" stroke="none"/></svg></div><h4>Custom Formulation</h4><p>Every neoKesan solution is lab-formulated for Indian growing conditions &mdash; climate, water quality, and crop varieties unique to our region.</p></article><article class="why-card"><div class="why-icon"><svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="24" y1="40" x2="24" y2="12"/><polyline points="16,20 24,12 32,20"/><path d="M24 28 C20 24 14 24 10 27"/><path d="M24 34 C28 30 34 30 38 33"/></svg></div><h4>Faster Growth &amp; Higher Yields</h4><p>Nutrient-rich water delivered directly to roots speeds up growth cycles by 30&ndash;50%. More harvests per year, more yield per plant.</p></article><article class="why-card"><div class="why-icon"><svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="24" cy="16" r="6"/><path d="M12 40 C12 32 36 32 36 40"/><path d="M30 22 Q38 22 38 30 L38 36 L32 33 H20 Q14 33 14 27 V22 Q14 16 20 16"/><line x1="20" y1="26" x2="28" y2="26"/><line x1="20" y1="29" x2="26" y2="29"/></svg></div><h4>Expert Support</h4><p>Our agronomy team is available via WhatsApp, email, and consultation calls. From setup to harvest &mdash; we&rsquo;re with you every step.</p></article></div></div></section>\n'

# Find the boundary between how section end and explore-wrap start
old = 'journey.</p></article></div></div></section>\n    <section class="section explore-wrap">'
new = 'journey.</p></article></div></div></section>\n' + why_section + '    <section class="section explore-wrap">'

count = content.count(old)
print(f'Found {count} occurrences')

if count == 1:
    content = content.replace(old, new)
    with open('index.html', 'w', encoding='utf-8') as f:
        f.write(content)
    print('Replacement done successfully')
else:
    print(f'Expected 1 occurrence, found {count}')
    # Show the actual characters around the boundary
    idx = content.find('journey.</p>')
    if idx >= 0:
        print(f'Found at index {idx}')
        print(repr(content[idx:idx+300]))
