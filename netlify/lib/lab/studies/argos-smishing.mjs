// The ARGOS smishing-warning study (MISQ revision; IRB H26762), as a lab template: a study made from it starts from the
// smishing type's content (approved consent v1.3 text, debrief v1.2 draft, the stimulus bank in argos-smishing/bank.mjs).
// The bank is PROVISIONAL until the cue coding, detector scores and brand map are done (see bank.mjs); the type's
// validation refuses to approve the consent while it is.
import smishing from '../types/smishing.mjs';

export const ARGOS_SMISHING = {
  name: 'ARGOS smishing warnings (H26762)', icon: 'shield', type: 'smishing', minutes: 30,
  blurb: 'Ben Ampel\'s use-context study: 72 text messages in a phone frame, six warning conditions in a Latin square, tap-or-ignore with mock landing pages, a scam-likelihood slider and a tier read-back. Prolific, one sitting.',
  content: () => smishing.defaultContent()
};
