/* neoKesan — the single QR renderer.
 *
 * Loaded two ways, from this one file:
 *   - admin.html        as the browser global `NeoKesanQR`
 *   - scripts/sync-qr.js via require()
 *
 * Both paths produce byte-identical SVG, so the code previewed in the admin
 * panel is exactly the code that gets committed and printed.
 *
 * Why this is hand-built instead of using the library's own createSvgTag():
 *
 *   1. White background. qrcode.js emits a transparent background. Product
 *      packaging is dark green, and dark modules on a dark plate do not scan —
 *      the white plate is not cosmetic, it is what makes the code readable, so
 *      it is baked into the SVG here.
 *   2. Quiet zone. The spec minimum is 4 modules of clear space. It is emitted
 *      explicitly rather than left to the caller to remember.
 *   3. Error correction H (30% recovery) — printed surfaces get scuffed, and
 *      this is the level that survives it.
 *
 * Output is deliberately deterministic: no timestamps, no generated-at comment.
 * The sync script only commits when the files actually changed, and a timestamp
 * would make every run a diff.
 */
(function (root, factory) {
	if (typeof module === 'object' && module.exports) {
		module.exports = factory(require('./qrcode.js'));
	} else {
		root.NeoKesanQR = factory(root.qrcode);
	}
}(typeof self !== 'undefined' ? self : this, function (qrcode) {
	'use strict';

	/* The printed link lives here so the admin preview and the sync script can
	   never disagree about what a slug resolves to. */
	var SITE = 'https://neokesan.com';
	var PATH = '/q/';

	var QUIET_ZONE = 4;   // modules of clear space, the spec minimum
	var EC_LEVEL = 'H';   // 30% recovery
	var DEFAULT_SCALE = 8; // px per module at the SVG's nominal size

	function escXml(s) {
		return String(s == null ? '' : s)
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;');
	}

	/**
	 * The permanent URL a slug encodes. This is what gets printed.
	 *
	 * @param {string} slug QR slug, e.g. "bloom".
	 * @return {string} Absolute URL.
	 */
	function qrLink(slug) {
		// The trailing slash is deliberate: q/<slug>/ is a directory containing
		// an index.html, and GitHub Pages 301-redirects a request for a
		// directory without one. Encoding the slash means a scan resolves in a
		// single hop, which matters when someone is holding a phone at arm's
		// length from printed packaging.
		return SITE + PATH + slug + '/';
	}

	/**
	 * Encode a string. Both the SVG and the raster path go through here, so a
	 * printed code and an on-screen preview can never disagree.
	 *
	 * @param {string} text The URL to encode.
	 * @return {Object} A made qrcode.js instance.
	 */
	function makeQr(text) {
		var qr = qrcode(0, EC_LEVEL); // 0 = auto-size to the smallest version that fits
		qr.addData(text);
		qr.make();
		return qr;
	}

	/**
	 * Build a print-ready SVG for a URL.
	 *
	 * @param {string} text The URL to encode.
	 * @param {Object} [opts] Optional overrides.
	 * @param {number} [opts.margin=4] Quiet zone in modules.
	 * @param {number} [opts.scale=8] Pixels per module at nominal size (SVG scales losslessly regardless).
	 * @param {string} [opts.dark='#000000'] Module colour.
	 * @param {string} [opts.light='#ffffff'] Background plate colour.
	 * @param {string} [opts.label] Accessible label / SVG title.
	 * @return {string} A complete SVG document.
	 */
	function buildQrSvg(text, opts) {
		opts = opts || {};

		var margin = opts.margin == null ? QUIET_ZONE : opts.margin;
		var scale = opts.scale == null ? DEFAULT_SCALE : opts.scale;
		var dark = opts.dark || '#000000';
		var light = opts.light || '#ffffff';
		var label = opts.label || text;

		var qr = makeQr(text);

		var n = qr.getModuleCount();
		var total = n + margin * 2;

		// One horizontal run per line of dark modules, rather than one path
		// segment per module — same picture, far fewer bytes.
		var path = [];
		for (var r = 0; r < n; r++) {
			var c = 0;
			while (c < n) {
				if (!qr.isDark(r, c)) {
					c++;
					continue;
				}
				var start = c;
				while (c < n && qr.isDark(r, c)) {
					c++;
				}
				var len = c - start;
				path.push('M' + (start + margin) + ' ' + (r + margin) + 'h' + len + 'v1h-' + len + 'z');
			}
		}

		// viewBox is in module units, so the nominal px size sets a sane default
		// print size while width/height stay trivially scalable for a printer.
		return '<?xml version="1.0" encoding="UTF-8"?>\n' +
			'<svg xmlns="http://www.w3.org/2000/svg" version="1.1" ' +
			'width="' + (total * scale) + '" height="' + (total * scale) + '" ' +
			'viewBox="0 0 ' + total + ' ' + total + '" ' +
			// Without this the rasterizer anti-aliases module edges and can leave
			// hairline gaps that break scanning at small print sizes.
			'shape-rendering="crispEdges" ' +
			'role="img" aria-label="' + escXml(label) + '">' +
			'<title>' + escXml(label) + '</title>' +
			'<rect width="' + total + '" height="' + total + '" fill="' + light + '"/>' +
			'<path d="' + path.join('') + '" fill="' + dark + '"/>' +
			'</svg>\n';
	}

	/**
	 * The module grid behind a code, as plain rows of 0/1.
	 *
	 * qrcode.js can hand back a GIF data URL, but not a PNG, and its 2d-context
	 * renderer hard-codes the colours and draws no quiet zone. So a PNG export
	 * has to rasterise the grid itself — on a canvas, which is what this is for.
	 *
	 * @param {string} text The URL to encode.
	 * @param {number} [margin=4] Quiet zone in modules.
	 * @return {{count: number, margin: number, size: number, rows: Array<Array<number>>}}
	 */
	function buildMatrix(text, margin) {
		if (margin == null) margin = QUIET_ZONE;

		var qr = makeQr(text);
		var n = qr.getModuleCount();
		var rows = [];
		for (var r = 0; r < n; r++) {
			var row = [];
			for (var c = 0; c < n; c++) {
				row.push(qr.isDark(r, c) ? 1 : 0);
			}
			rows.push(row);
		}
		return { count: n, margin: margin, size: n + margin * 2, rows: rows };
	}

	return {
		buildQrSvg: buildQrSvg,
		buildMatrix: buildMatrix,
		qrLink: qrLink,
		SITE: SITE,
		PATH: PATH,
		QUIET_ZONE: QUIET_ZONE,
		EC_LEVEL: EC_LEVEL,
		DEFAULT_SCALE: DEFAULT_SCALE
	};
}));
