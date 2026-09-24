/* neoKesan — the single QR renderer.
 *
 * Loaded two ways, from these files:
 *   - admin.html        as the browser globals `NeoKesanQR` / `NeoKesanQRLogo`
 *   - scripts/sync-qr.js via require()
 *
 * Both paths produce byte-identical SVG, so the code previewed in the admin
 * panel is exactly the code that gets committed and printed.
 *
 * Why this is hand-built instead of using a library such as qr-code-styling:
 *
 *   1. White background. qrcode.js emits a transparent background. Product
 *      packaging is dark green, and dark modules on a dark plate do not scan —
 *      the white plate is not cosmetic, it is what makes the code readable, so
 *      it is baked into the SVG here.
 *   2. Quiet zone. The spec minimum is 4 modules of clear space. It is emitted
 *      explicitly rather than left to the caller to remember.
 *   3. Error correction H (30% recovery) — printed surfaces get scuffed, and
 *      this is the level that survives it.
 *   4. One renderer. A library would have to be vendored twice, because this
 *      repo has no bundler and its CI runs bare `node` with no package.json and
 *      no install step. Two renderers means the preview can silently drift from
 *      what is on the box. The styling below is a small delta on a run-length
 *      emitter we already have — not a different engine.
 *
 * Output is deliberately deterministic: no timestamps, no generated-at comment.
 * The sync script only commits when the files actually changed, and a timestamp
 * would make every run a diff.
 */
(function (root, factory) {
	if (typeof module === 'object' && module.exports) {
		module.exports = factory(require('./qrcode.js'), require('./qr-logo.js'));
	} else {
		root.NeoKesanQR = factory(root.qrcode, root.NeoKesanQRLogo);
	}
}(typeof self !== 'undefined' ? self : this, function (qrcode, logoAsset) {
	'use strict';

	/* The printed link lives here so the admin preview and the sync script can
	   never disagree about what a slug resolves to. */
	var SITE = 'https://neokesan.com';
	var PATH = '/q/';

	var QUIET_ZONE = 4;   // modules of clear space, the spec minimum
	var EC_LEVEL = 'H';   // 30% recovery
	var DEFAULT_SCALE = 8; // px per module at the SVG's nominal size

	var DEFAULT_INK = '#000000';
	var FOREST = '#063f35'; // the brand's darkest green, used as the darkening anchor

	/* WCAG contrast against the white plate. Below OK the code is still legible
	   but the margin is thin; below MIN a pale accent reads as background to a
	   scanner camera and the code fails outright. */
	var OK_CONTRAST = 4.5;
	var MIN_CONTRAST = 3.0;

	function escXml(s) {
		return String(s == null ? '' : s)
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;');
	}

	function round3(v) {
		return Math.round(v * 1000) / 1000;
	}

	function hex2(v) {
		var s = Math.max(0, Math.min(255, Math.round(v))).toString(16);
		return s.length === 1 ? '0' + s : s;
	}

	/**
	 * Parse `#rgb` or `#rrggbb` into component bytes.
	 *
	 * @param {string} color A hex colour with a leading '#'.
	 * @return {?Array<number>} `[r, g, b]`, or null if it is not a hex colour.
	 */
	function parseHex(color) {
		if (typeof color !== 'string') return null;
		var s = color.trim().replace(/^#/, '');
		if (/^[0-9a-fA-F]{3}$/.test(s)) {
			s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
		}
		if (!/^[0-9a-fA-F]{6}$/.test(s)) return null;
		return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
	}

	/**
	 * Is this something we can ink a code with?
	 *
	 * Exported so callers can reject a bad accent before it reaches the renderer,
	 * rather than discovering it as a silently-black preview.
	 *
	 * @param {string} color Candidate colour.
	 * @return {boolean} True for `#rgb` / `#rrggbb`.
	 */
	function isHexColor(color) {
		return parseHex(color) !== null;
	}

	function toHex(rgb) {
		return '#' + hex2(rgb[0]) + hex2(rgb[1]) + hex2(rgb[2]);
	}

	// WCAG relative luminance — the sRGB transfer function, then the standard
	// 0.2126/0.7152/0.0722 weighting.
	function luminance(rgb) {
		var lin = rgb.map(function (v) {
			var s = v / 255;
			return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
		});
		return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
	}

	function contrastOnWhite(rgb) {
		return 1.05 / (luminance(rgb) + 0.05);
	}

	function mix(a, b, t) {
		return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
	}

	/**
	 * Make an ink colour safe to print on the white plate.
	 *
	 * This is what makes "add a product and its code is generated for you" safe:
	 * a pale accent (the mint `#75d7b5`, say) is nearly invisible to a scanner
	 * camera, so it gets darkened toward the brand forest until it clears the
	 * minimum contrast. Everything already shipping passes untouched — folix
	 * `#1b9272` sits at 3.9:1, which is warned about but not altered.
	 *
	 * @param {string} color The product's accent.
	 * @return {{color: string, contrast: number, adjusted: boolean, warn: boolean}}
	 *   `color` is what to draw with, `contrast` is the ratio against white,
	 *   `adjusted` means we changed it, `warn` means it is worth telling someone.
	 */
	function resolveInk(color) {
		var rgb = parseHex(color);
		if (!rgb) {
			return {
				color: DEFAULT_INK,
				contrast: contrastOnWhite(parseHex(DEFAULT_INK)),
				adjusted: true,
				warn: true
			};
		}

		var ratio = contrastOnWhite(rgb);
		if (ratio >= OK_CONTRAST) {
			return { color: toHex(rgb), contrast: ratio, adjusted: false, warn: false };
		}
		if (ratio >= MIN_CONTRAST) {
			return { color: toHex(rgb), contrast: ratio, adjusted: false, warn: true };
		}

		// Step toward the forest until it clears the floor. Stepping in whole
		// tenths and taking the first pass makes this deterministic, which the
		// zero-diff sync depends on.
		var anchor = parseHex(FOREST);
		var best = toHex(anchor);
		for (var i = 1; i <= 10; i++) {
			var candidate = mix(rgb, anchor, i / 10);
			if (contrastOnWhite(candidate) >= MIN_CONTRAST) {
				best = toHex(candidate);
				break;
			}
		}
		return {
			color: best,
			contrast: contrastOnWhite(parseHex(best)),
			adjusted: true,
			warn: true
		};
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

	// The three 7x7 finder patterns. Everything else is data.
	function isFinder(row, col, n) {
		if (row < 7 && col < 7) return true;
		if (row < 7 && col >= n - 7) return true;
		if (row >= n - 7 && col < 7) return true;
		return false;
	}

	// One horizontal run per line of dark modules, rather than one path segment
	// per module — same picture, far fewer bytes. `want` selects the region so
	// the finder patterns can be pulled out into their own path.
	function runPath(qr, n, margin, want) {
		var d = [];
		for (var r = 0; r < n; r++) {
			var c = 0;
			while (c < n) {
				if (!qr.isDark(r, c) || !want(r, c)) { c++; continue; }
				var start = c;
				while (c < n && qr.isDark(r, c) && want(r, c)) { c++; }
				var len = c - start;
				d.push('M' + (start + margin) + ' ' + (r + margin) + 'h' + len + 'v1h-' + len + 'z');
			}
		}
		return d.join('');
	}

	/**
	 * Where the logo sits, in module units.
	 *
	 * Derived from the grid size rather than hard-coded, so a long URL that
	 * pushes a code to a higher QR version does not end up with a wordmark that
	 * covers a third of it.
	 *
	 * 9-of-33 is the reference image's proportion (it is a 29-module code with a
	 * 9-module logo). The block is then grown outward to whole module boundaries
	 * symmetrically about the centre, which is what keeps it on the grid; the
	 * slack left over vertically is the white ring between the wordmark and the
	 * nearest dots. For a 33-module code that gives 9x7 — 63 modules, 5.8% of
	 * the grid, comfortably inside H-level's 30% recovery budget.
	 *
	 * @param {number} n Module count of the code.
	 * @param {number} aspect Logo width divided by logo height.
	 * @return {{x: number, y: number, wide: number, high: number, logoW: number, logoH: number}}
	 */
	function logoBox(n, aspect) {
		var logoW = Math.round(n * 9 / 33);
		var logoH = logoW / aspect;
		var centre = n / 2;

		var left = Math.floor(centre - logoW / 2);
		var right = Math.ceil(centre + logoW / 2);
		var top = Math.floor(centre - logoH / 2);
		var bottom = Math.ceil(centre + logoH / 2);

		return {
			x: left,
			y: top,
			wide: right - left,
			high: bottom - top,
			logoW: logoW,
			logoH: logoH
		};
	}

	/**
	 * Build a print-ready SVG for a URL.
	 *
	 * @param {string} text The URL to encode.
	 * @param {Object} [opts] Optional overrides.
	 * @param {number} [opts.margin=4] Quiet zone in modules.
	 * @param {number} [opts.scale=8] Pixels per module at nominal size (SVG scales losslessly regardless).
	 * @param {string} [opts.accent] Product accent; run through the contrast guard.
	 * @param {string} [opts.eye] Finder colour. Defaults to the resolved accent.
	 * @param {string} [opts.dark='#000000'] Module colour used verbatim when `accent` is absent.
	 * @param {string} [opts.light='#ffffff'] Background plate colour.
	 * @param {string} [opts.label] Accessible label / SVG title.
	 * @param {Object|false} [opts.logo] `false` for no wordmark; an object
	 *   `{dataUri, width, height}` to override; omitted for the bundled one.
	 * @return {string} A complete SVG document.
	 */
	function buildQrSvg(text, opts) {
		opts = opts || {};

		var margin = opts.margin == null ? QUIET_ZONE : opts.margin;
		var scale = opts.scale == null ? DEFAULT_SCALE : opts.scale;
		var light = opts.light || '#ffffff';
		var label = opts.label || text;

		var ink = opts.accent != null ? resolveInk(opts.accent).color : (opts.dark || DEFAULT_INK);
		var eye = opts.eye || ink;

		var logo = opts.logo === false ? null : (opts.logo || logoAsset);

		var qr = makeQr(text);

		var n = qr.getModuleCount();
		var total = n + margin * 2;

		var body = runPath(qr, n, margin, function (r, c) { return !isFinder(r, c, n); });
		var eyes = runPath(qr, n, margin, function (r, c) { return isFinder(r, c, n); });

		// Same colour is the normal case, so fold the finders back in rather than
		// paying for a second path element that would be filled identically.
		if (eye === ink) body += eyes;

		var out = '<?xml version="1.0" encoding="UTF-8"?>\n' +
			'<svg xmlns="http://www.w3.org/2000/svg" version="1.1" ' +
			'width="' + (total * scale) + '" height="' + (total * scale) + '" ' +
			'viewBox="0 0 ' + total + ' ' + total + '" ' +
			// Without this the rasterizer anti-aliases module edges and can leave
			// hairline gaps that break scanning at small print sizes.
			'shape-rendering="crispEdges" ' +
			'role="img" aria-label="' + escXml(label) + '">' +
			'<title>' + escXml(label) + '</title>' +
			'<rect width="' + total + '" height="' + total + '" fill="' + light + '"/>' +
			'<path d="' + body + '" fill="' + ink + '"/>';

		// Only worth its own element when the corners are inked differently; the
		// caller's default is a single accent, and then this is the same path.
		if (eye !== ink) {
			out += '<path d="' + eyes + '" fill="' + eye + '"/>';
		}

		if (logo && logo.dataUri) {
			var box = logoBox(n, logo.width / logo.height);
			// The knockout first, then the wordmark on top of it. The gaps the
			// knockout opens up are covered by error correction H.
			out += '<rect x="' + (box.x + margin) + '" y="' + (box.y + margin) + '" ' +
				'width="' + box.wide + '" height="' + box.high + '" fill="' + light + '"/>' +
				'<image x="' + round3(box.x + margin + (box.wide - box.logoW) / 2) + '" ' +
				'y="' + round3(box.y + margin + (box.high - box.logoH) / 2) + '" ' +
				'width="' + round3(box.logoW) + '" height="' + round3(box.logoH) + '" ' +
				'href="' + escXml(logo.dataUri) + '"/>';
		}

		return out + '</svg>\n';
	}

	/**
	 * The module grid behind a code, as plain rows of 0/1.
	 *
	 * qrcode.js can hand back a GIF data URL, but not a PNG, and its 2d-context
	 * renderer hard-codes the colours and draws no quiet zone. The admin panel
	 * rasterises the SVG instead, so what it downloads matches what is beside it
	 * on screen; this stays for anything that wants the raw grid.
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
		logoBox: logoBox,
		resolveInk: resolveInk,
		isHexColor: isHexColor,
		SITE: SITE,
		PATH: PATH,
		QUIET_ZONE: QUIET_ZONE,
		EC_LEVEL: EC_LEVEL,
		DEFAULT_SCALE: DEFAULT_SCALE,
		OK_CONTRAST: OK_CONTRAST,
		MIN_CONTRAST: MIN_CONTRAST
	};
}));
