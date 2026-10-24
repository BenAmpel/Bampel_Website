/* Shared publications.json loader — caches a single fetch for all consumers. */
(function () {
  var _promise = null;
  window.loadPublications = function () {
    if (!_promise) {
      _promise = fetch('/data/publications.json')
        .then(function (r) { return r.ok ? r.json() : []; })
        .catch(function () { return []; });
    }
    return _promise;
  };
})();
