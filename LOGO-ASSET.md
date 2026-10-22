# Transparent logo

Runtime asset: `public/daemoncore-logo-transparent.png` (1407 × 1118 RGBA PNG). The original opaque PNG remains at `public/daemoncore-logo.png` for reference. The runtime asset was produced with the built-in image editing tool, not the CLI/API fallback. Its alpha channel is verified by an automated test: transparent pixels reach 0 and opaque artwork reaches 255. No CSS blending or color-key trick is used.

Final edit prompt:

> Use case: background-extraction. Edit target: supplied DaemonCore Duplicate Hunter logo. Remove ONLY the entire gray checkerboard background, including the checkerboard texture in every hole, gap and negative space between spikes, beneath the magnifying-glass handle, between the logo and the nameplate, and around the outside silhouette. Those background pixels must become genuinely transparent alpha, not white, not black, not a painted checkerboard. Preserve the exact existing red, black, white and chrome logo artwork, all text reading DAEMONCORE and DUPLICATE HUNTER, spike edges, red glow, layout, proportions and trademark. Keep the black interior design surfaces and black nameplate as artwork; remove only background. Do not redesign, restyle, add text, simplify, or redraw the identity. Return a clean high resolution RGBA PNG with transparent background ready to overlay on a dark desktop app.
