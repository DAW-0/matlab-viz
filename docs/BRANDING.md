# MATLAB Viz icon

The original artwork is `media/marketplace-icon.svg`. It is repository-owned
MIT-licensed vector artwork, not a MathWorks logo and not a claim of endorsement.
Four corner nodes represent a small dependency graph. The warm upper-left node
is the inspection anchor: two blue arrows point into it, while the green arrow
points out toward the lower-right node to suggest impact exploration. Colors
are an illustration, not a new meaning assigned to actual analyzed graph links.

The font-free vector uses a self-contained dark rounded tile, thick strokes,
separate arrowheads and generous spacing for small marketplace thumbnails.
No remote images, embedded bitmap, fonts, script or SVG filters are needed.
The extension's monochrome `media/icon.svg` remains separate for editor theming.

The manifest references the 256-by-256 `media/marketplace-icon.png` and sets a
matching gallery banner. Both vector source and PNG are shipped in the VSIX.
Generate and verify with:

```powershell
npm run icon:build
npm run icon:check
```

The pinned `@resvg/resvg-js` renderer is a development dependency only. Generated
PNG bytes are checked in, so installed extensions do not rasterize icons or load
the renderer. CI/tests check pixel dimensions, four-node source geometry,
self-contained markup, exact SVG-to-PNG reproduction and package inclusion.
Review the icon at thumbnail sizes after changing its paths or colors.
