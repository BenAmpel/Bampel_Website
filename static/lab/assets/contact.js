/* CCAIR Behavioral Lab: contact links.
   Every "contact", "request access", or "trouble signing in" link in the lab is a mailto: link that opens the visitor's own
   email app with a prepared message. Nothing is sent from the page and nothing is stored. The same code runs in the browser
   (window.LabContact) and in the tests (require). The static pages carry the same links written out in HTML; a test checks
   that those match what this file builds. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api; else root.LabContact = api;
})(this, function () {
  'use strict';
  var TO = 'bampel@gsu.edu', SUBJECT = 'CCAIR Behavioral Lab';
  var TEMPLATES = {
    access: ['Name:', 'Institution and email:', 'Study (title and short description):', 'IRB status:', 'What you need:'],
    signin: ['Name:', 'Email you use to sign in:', 'What happened:'],
    contact: ['Name:', 'Your message:']
  };
  function mailto(lines, subject) {
    return 'mailto:' + TO + '?subject=' + encodeURIComponent(subject || SUBJECT) + '&body=' + encodeURIComponent(lines.join('\n'));
  }
  // For a participant: the study name, the study ID only when the person is signed in, and room for the question. Never an email address.
  function participantLines(studyName, studyId) {
    var lines = [];
    if (studyName) lines.push('Study: ' + String(studyName).replace(/[\r\n]+/g, ' ').slice(0, 120));
    if (studyId && /^[A-Za-z0-9-]{4,40}$/.test(studyId)) lines.push('Study ID: ' + studyId);
    lines.push('', 'Your question:', '');
    return lines;
  }
  return {
    TO: TO, SUBJECT: SUBJECT, TEMPLATES: TEMPLATES, mailto: mailto, participantLines: participantLines,
    access: function () { return mailto(TEMPLATES.access); },
    signin: function () { return mailto(TEMPLATES.signin); },
    contact: function () { return mailto(TEMPLATES.contact); },
    participant: function (studyName, studyId) { return mailto(participantLines(studyName, studyId)); }
  };
});
