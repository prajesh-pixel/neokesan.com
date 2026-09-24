/* neoKesan — the wordmark that sits in the middle of every QR code.
 *
 * A data URI rather than a file the SVG points at, because a printed code has to
 * be self-contained: the SVG gets rasterised by print shops, dropped into label
 * tools, and opened offline, and an external reference to /assets/... breaks in
 * all three. Inlining also keeps the admin preview identical to the committed
 * qr.svg, and keeps the canvas PNG export untainted.
 *
 * Loaded two ways, exactly like qr-render.js:
 *   - admin.html          as the browser global `NeoKesanQRLogo`
 *   - scripts/sync-qr.js  via require()
 *
 * Derived from ref/neo_logo.png — 1080x1080, but 86% of that is transparent
 * padding and the ink is only 1018x585. To regenerate:
 *
 *   1. crop to the alpha bounding box plus an 8px pad
 *   2. resize to 320px wide with LANCZOS   (1.72:1 at that point)
 *   3. quantise to 32 colours (FASTOCTREE), save an optimised PNG
 *
 * That lands at 3090 bytes, 4120 as base64. 320px across a wordmark printed
 * ~7mm wide is past 600dpi, and the extra palette entries cost well under a
 * kilobyte over a flat single-colour version — worth it, because 32 colours
 * keeps the antialiasing on the letterforms instead of banding it.
 *
 * Deliberately NOT vectorised. Tracing would print better still, but it needs
 * potrace plus an eyeball on the result, which is a job for a human with a proof.
 */
(function (root, factory) {
	if (typeof module === 'object' && module.exports) {
		module.exports = factory();
	} else {
		root.NeoKesanQRLogo = factory();
	}
}(typeof self !== 'undefined' ? self : this, function () {
	'use strict';

	// Intrinsic size of the image below, in pixels. The renderer uses the
	// ratio to work out how tall the knockout has to be for a given width.
	var WIDTH = 320;
	var HEIGHT = 186;

	var DATA_URI = 'data:image/png;base64,' +
		'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';

	return {
		dataUri: DATA_URI,
		width: WIDTH,
		height: HEIGHT
	};
}));
