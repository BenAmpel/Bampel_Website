/* Netlify Identity: loads the widget only to finish an invite, recovery or confirmation link, which arrives as a
   #invite_token=... style hash on the home page. Moved out of site_head.html so the CSP needs no 'unsafe-inline'. */
(function () {
  if (!/[#&](invite|recovery|confirmation|email_change|access)_token=/.test(location.hash)) return;
  var s = document.createElement('script');
  s.src = 'https://identity.netlify.com/v1/netlify-identity-widget.js';
  s.onload = function () {
    if (!window.netlifyIdentity) return;
    window.netlifyIdentity.on('init', function (user) {
      if (!user) window.netlifyIdentity.on('login', function () { document.location.href = '/admin/'; });
    });
  };
  document.head.appendChild(s);
})();
