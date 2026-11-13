// One bundle for every 3D view on the site (built by scripts/build-three.mjs into static/vendor/three/<version>/site-3d.min.js).
// Pages load it lazily, only when a 3D view scrolls near the screen, and keep their 2D charts when WebGL is missing.
import '../footprint-globe.mjs'; // sets window.FootprintGlobe
import { supported } from './core.mjs';
import * as graph from './graph.mjs';
import * as fan from './fan.mjs';

window.Site3D = { supported, graph, fan, globe: window.FootprintGlobe };
