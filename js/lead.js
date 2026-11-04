/* Records how a visitor found the site (first landing page, campaign tags,
   referring site) and adds it to every form as hidden fields. Stays in the
   visitor's browser and in the form submission only; never sent to analytics. */
(function () {
  var q = new URLSearchParams(location.search);
  function store(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function load(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function cleanRef(r) { try { var u = new URL(r); return u.hostname === location.hostname ? '' : u.origin + u.pathname; } catch (e) { return ''; } }

  var first = null;
  try { first = JSON.parse(load('cv_first') || 'null'); } catch (e) {}
  if (!first) {
    first = { landing: location.pathname, ref: cleanRef(document.referrer), date: new Date().toLocaleDateString('en-CA') };
    store('cv_first', JSON.stringify(first));
  }
  var utm = { source: q.get('utm_source'), medium: q.get('utm_medium'), campaign: q.get('utm_campaign') };
  if (utm.source || utm.campaign) store('cv_utm', JSON.stringify(utm));
  else { try { utm = JSON.parse(load('cv_utm') || '{}'); } catch (e) { utm = {}; } }

  function set(f, name, val) { var el = f.querySelector('input[name="' + name + '"]'); if (el && val) el.value = String(val).slice(0, 200); }
  document.querySelectorAll('form[data-netlify]').forEach(function (f) {
    set(f, 'landing-page', first.landing);
    set(f, 'first-visit', first.date);
    set(f, 'referrer', first.ref);
    set(f, 'source-page', location.pathname);
    set(f, 'utm-source', utm.source); set(f, 'utm-medium', utm.medium); set(f, 'utm-campaign', utm.campaign);
    f.addEventListener('submit', function () {
      var n = f.querySelector('[name="name"]');
      try { sessionStorage.setItem('cv_lead', JSON.stringify({ type: f.getAttribute('data-lead-type') || 'general', first: n ? n.value.trim().split(/\s+/)[0] : '' })); } catch (e) {}
    });
  });
})();
