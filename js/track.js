/* Google Analytics 4 with conversion events.
   Paste the Measurement ID (looks like G-XXXXXXXXXX) between the quotes to turn it on.
   No names, phone numbers, emails or addresses are ever sent to Google. */
(function () {
  var GA_ID = '';

  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  if (!/^G-[A-Z0-9]{4,}$/.test(GA_ID)) return;

  var s = document.createElement('script');
  s.async = true;
  s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
  document.head.appendChild(s);
  gtag('js', new Date());
  gtag('config', GA_ID);

  function where(el) {
    var box = el.closest('.quick, .hero, .band, .about, .contact, form, header, footer, .bar, .float, section[id], [id]:not(main)');
    if (!box) return 'page';
    return box.id || (box.className && String(box.className).split(' ')[0]) || box.tagName.toLowerCase();
  }

  // Calls, texts, emails and booking clicks
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    var h = a.getAttribute('href') || '', ev = null;
    if (h.indexOf('tel:') === 0) ev = 'phone_click';
    else if (h.indexOf('sms:') === 0) ev = 'text_click';
    else if (h.indexOf('mailto:') === 0) ev = 'email_click';
    else if (a.id === 'book' || /calendly\.com|meetings\.hubspot\.com|calendar\.app\.google/.test(h)) ev = 'booking_click';
    if (ev) gtag('event', ev, { link_location: where(a), page_path: location.pathname });
  });

  // A completed form = arriving on the thank-you page (counted once)
  if (location.pathname.indexOf('/thanks') === 0) {
    var lead = null, first = null;
    try { lead = JSON.parse(sessionStorage.getItem('cv_lead') || 'null'); } catch (e) {}
    try { first = JSON.parse(localStorage.getItem('cv_first') || 'null'); } catch (e) {}
    if (lead && !lead.tracked) {
      gtag('event', 'generate_lead', { form_type: lead.type || 'general', lead_landing_page: first ? first.landing : '' });
      lead.tracked = true;
      try { sessionStorage.setItem('cv_lead', JSON.stringify(lead)); } catch (e) {}
    }
  }
})();
