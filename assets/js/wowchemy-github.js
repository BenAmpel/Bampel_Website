import {hugoEnvironment} from '@params';

/* ---------------------------------------------------------------------------
 * GitHub API.
 * --------------------------------------------------------------------------- */

function printLatestRelease(selector, repo) {
  if (hugoEnvironment === 'production') {
    // fetch, not jQuery's $.getJSON (theme plan stage 2).
    fetch('https://api.github.com/repos/' + repo + '/tags')
      .then(function (r) {
        if (!r.ok) throw new Error(r.status + ' ' + r.statusText);
        return r.json();
      })
      .then(function (json) {
        let release = json[0];
        document.querySelectorAll(selector).forEach((el) => el.append(' ' + release.name));
      })
      .catch(function (error) {
        console.log('Request Failed: ' + error);
      });
  }
}

export {printLatestRelease};
