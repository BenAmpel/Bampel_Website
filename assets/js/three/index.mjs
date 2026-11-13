import '../footprint-globe.mjs';
import { supported } from './core.mjs';
import * as graph from './graph.mjs';
import * as fan from './fan.mjs';
import * as hero from './hero.mjs';
import * as heroData from './hero-data.mjs';

window.Site3D = { supported, graph, fan, hero, heroData, globe: window.FootprintGlobe };
