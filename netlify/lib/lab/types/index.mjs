// Registered study types. To add a type: write types/<id>.mjs (see alert-triage.mjs and vignettes.mjs
// for the interface), its participant renderer static/lab/engine/types/<id>.js, optionally its admin
// editor static/lab/engine/types/<id>-admin.js, and add it here.
import alertTriage from './alert-triage.mjs';
import vignettes from './vignettes.mjs';
import game from './game.mjs';
import multimodal from './multimodal.mjs';
import reaction from './reaction.mjs';
import smishing from './smishing.mjs';

export const TYPES = { [alertTriage.id]: alertTriage, [vignettes.id]: vignettes, [game.id]: game, [multimodal.id]: multimodal, [reaction.id]: reaction, [smishing.id]: smishing };
