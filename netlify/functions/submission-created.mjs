// Runs automatically on Netlify every time a website form is submitted
// (Netlify only calls it for submissions that passed its spam filter).
// It sends the lead to HubSpot: creates or updates the contact, adds a note
// with everything they wrote, and creates a "Reply" task due today.
//
// Setup: in Netlify, Site configuration > Environment variables, add
//   HUBSPOT_TOKEN = the access token from your HubSpot private app
// The token never goes in this repository.

const API = 'https://api.hubapi.com';

// Form name -> what kind of lead it is
const LEAD_TYPES = {
  'buyer-consultation': 'New buyer lead',
  'seller-consultation': 'New seller lead',
  'relocation-consultation': 'Relocation lead',
  'home-value': 'New seller lead',
  'open-house': 'New buyer lead',
  contact: 'General inquiry',
};
const CONTACT_FORM_GOALS = {
  'Buy a home': 'New buyer lead',
  'Sell a home': 'New seller lead',
  'Find out what my home is worth': 'New seller lead',
  'Buy and sell': 'New seller lead',
  'Move to El Paso': 'Relocation lead',
};
const STAGES = ['New buyer lead', 'New seller lead', 'Relocation lead', 'General inquiry', 'Active client', 'Past client', 'Long-term prospect'];

// Custom fields created in HubSpot the first time this runs
const CUSTOM_PROPERTIES = [
  { name: 'cv_client_stage', label: 'Client stage', type: 'enumeration', fieldType: 'select',
    options: STAGES.map((s, i) => ({ label: s, value: s, displayOrder: i })) },
  { name: 'cv_lead_source_form', label: 'Lead source (website form)', type: 'string', fieldType: 'text' },
  { name: 'cv_first_landing_page', label: 'First landing page', type: 'string', fieldType: 'text' },
  { name: 'cv_first_visit_date', label: 'First website visit', type: 'string', fieldType: 'text' },
  { name: 'cv_date_received', label: 'Date lead received', type: 'date', fieldType: 'date' },
  { name: 'cv_referrer', label: 'Referring website', type: 'string', fieldType: 'text' },
  { name: 'cv_utm_source', label: 'Campaign source (utm_source)', type: 'string', fieldType: 'text' },
  { name: 'cv_utm_medium', label: 'Campaign medium (utm_medium)', type: 'string', fieldType: 'text' },
  { name: 'cv_utm_campaign', label: 'Campaign name (utm_campaign)', type: 'string', fieldType: 'text' },
  { name: 'cv_next_action', label: 'Next action', type: 'string', fieldType: 'text' },
  { name: 'cv_marketing_texts', label: 'Opted in: marketing texts', type: 'bool', fieldType: 'booleancheckbox',
    options: [{ label: 'Yes', value: 'true', displayOrder: 0 }, { label: 'No', value: 'false', displayOrder: 1 }] },
  { name: 'cv_marketing_emails', label: 'Opted in: marketing emails', type: 'bool', fieldType: 'booleancheckbox',
    options: [{ label: 'Yes', value: 'true', displayOrder: 0 }, { label: 'No', value: 'false', displayOrder: 1 }] },
  { name: 'cv_marketing_consent_record', label: 'Marketing consent record', type: 'string', fieldType: 'textarea' },
];

// Fields that are saved on the contact only if they're empty (first touch wins)
const FIRST_TOUCH = ['cv_first_landing_page', 'cv_first_visit_date', 'cv_referrer', 'cv_utm_source', 'cv_utm_medium', 'cv_utm_campaign', 'cv_lead_source_form', 'cv_date_received'];

// Labels for the note, in a sensible reading order
const LABELS = {
  goal: 'Wants to', address: 'Property address', 'property-type': 'Property type',
  'currently-listed': 'Listed right now?', 'help-with': 'Wants help with', 'first-time': 'First-time buyer?',
  location: 'Where they want to live', 'preferred-areas': 'Preferred areas', budget: 'Budget',
  timeframe: 'Timeframe', timeline: 'Timeline', 'move-date': 'Moving when', 'moving-from': 'Moving from',
  military: 'Military move to Fort Bliss?', 'need-to-sell': 'Needs to sell first?', 'buy-or-rent': 'Buy or rent?',
  preapproved: 'Pre-approved?', 'preferred-day': 'Preferred day', 'preferred-time': 'Best time',
  questions: 'Questions', message: 'Message', source: 'Source',
};

const clean = (v) => (Array.isArray(v) ? v.join(', ') : v == null ? '' : String(v)).trim().slice(0, 2000);
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function buildLead(payload, now = new Date()) {
  const form = payload.form_name || (payload.data && payload.data['form-name']) || 'contact';
  const d = payload.data || {};
  const get = (k) => clean(d[k]);
  const [firstname, ...rest] = get('name').split(/\s+/).filter(Boolean);
  let stage = LEAD_TYPES[form] || 'General inquiry';
  if (form === 'contact' && CONTACT_FORM_GOALS[get('goal')]) stage = CONTACT_FORM_GOALS[get('goal')];
  const texts = get('marketing-texts') === 'yes';
  const emails = get('marketing-emails') === 'yes';
  const today = now.toLocaleDateString('en-CA', { timeZone: 'America/Denver' }); // El Paso time

  const props = {
    firstname: firstname || '',
    lastname: rest.join(' '),
    email: get('email').toLowerCase(),
    phone: get('phone'),
    cv_client_stage: stage,
    cv_lead_source_form: form,
    cv_first_landing_page: get('landing-page'),
    cv_first_visit_date: get('first-visit'),
    cv_date_received: today,
    cv_referrer: get('referrer'),
    cv_utm_source: get('utm-source'),
    cv_utm_medium: get('utm-medium'),
    cv_utm_campaign: get('utm-campaign'),
    cv_next_action: 'Reply today',
    hs_lead_status: 'NEW',
    lifecyclestage: 'lead',
  };
  if (get('address')) props.address = get('address');
  // Only record a "yes": an unchecked box never removes an earlier opt-in.
  const consent = [];
  if (texts) { props.cv_marketing_texts = 'true'; consent.push('texts'); }
  if (emails) { props.cv_marketing_emails = 'true'; consent.push('emails'); }
  if (consent.length) {
    props.cv_marketing_consent_record = `Opted in to marketing ${consent.join(' and ')} on ${now.toISOString()} via the "${form}" form on ${get('source-page') || 'the website'}.`;
  }
  for (const k of Object.keys(props)) if (props[k] === '') delete props[k];

  const rows = Object.keys(LABELS).filter((k) => get(k)).map((k) => `<li><b>${LABELS[k]}:</b> ${esc(get(k))}</li>`);
  const track = [
    ['Form', form], ['Sent from page', get('source-page')], ['First landing page', get('landing-page')],
    ['First visit', get('first-visit')], ['Referring site', get('referrer')],
    ['Campaign', [get('utm-source'), get('utm-medium'), get('utm-campaign')].filter(Boolean).join(' / ')],
    ['Marketing texts', texts ? 'Yes' : 'No'], ['Marketing emails', emails ? 'Yes' : 'No'],
  ].filter(([, v]) => v).map(([k, v]) => `<li><b>${k}:</b> ${esc(v)}</li>`);
  const note = `<p><b>${esc(stage)}</b> from the website</p><ul>${rows.join('')}</ul><p><b>How they found the site</b></p><ul>${track.join('')}</ul>`;

  const who = get('name') || 'new lead';
  const what = get('goal') || stage.replace(/^New /, '').replace(/ lead$/, '');
  return { form, stage, props, note, taskSubject: `Reply to ${who} (${what})`, taskBody: `New ${stage.toLowerCase()} from the "${form}" form. Call or text ${get('phone') || 'them'} today.` };
}

async function hs(path, token, opts = {}) {
  const res = await fetch(API + path, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok && res.status !== 404) throw new Error(`HubSpot ${opts.method || 'GET'} ${path} -> ${res.status}: ${text.slice(0, 300)}`);
  return { status: res.status, body };
}

async function ensureProperties(token) {
  for (const p of CUSTOM_PROPERTIES) {
    const r = await hs(`/crm/v3/properties/contacts/${p.name}`, token);
    if (r.status === 404) {
      await hs('/crm/v3/properties/contacts', token, { method: 'POST', body: JSON.stringify({ ...p, groupName: 'contactinformation' }) });
    }
  }
}

async function findContact(token, props) {
  const keep = ['cv_client_stage', ...FIRST_TOUCH].join(',');
  if (props.email) {
    const r = await hs(`/crm/v3/objects/contacts/${encodeURIComponent(props.email)}?idProperty=email&properties=${keep}`, token);
    if (r.status === 200) return r.body;
  }
  if (props.phone) {
    const r = await hs('/crm/v3/objects/contacts/search', token, { method: 'POST', body: JSON.stringify({
      filterGroups: [{ filters: [{ propertyName: 'phone', operator: 'EQ', value: props.phone }] }], properties: keep.split(','), limit: 1 }) });
    if (r.body && r.body.results && r.body.results[0]) return r.body.results[0];
  }
  return null;
}

export async function sendToHubSpot(payload, token, now = new Date()) {
  const lead = buildLead(payload, now);
  await ensureProperties(token);

  const existing = await findContact(token, lead.props);
  let id;
  if (existing) {
    id = existing.id;
    const update = { ...lead.props };
    const ep = existing.properties || {};
    for (const k of FIRST_TOUCH) if (ep[k]) delete update[k];          // keep how they first found you
    if (['Active client', 'Past client'].includes(ep.cv_client_stage)) { // don't demote a client back to "lead"
      delete update.cv_client_stage; delete update.lifecyclestage; delete update.hs_lead_status;
    }
    await hs(`/crm/v3/objects/contacts/${id}`, token, { method: 'PATCH', body: JSON.stringify({ properties: update }) });
  } else {
    id = (await hs('/crm/v3/objects/contacts', token, { method: 'POST', body: JSON.stringify({ properties: lead.props }) })).body.id;
  }

  const owners = (await hs('/crm/v3/owners?limit=1', token)).body;
  const ownerId = owners && owners.results && owners.results[0] ? owners.results[0].id : undefined;
  const ts = now.toISOString();

  await hs('/crm/v3/objects/notes', token, { method: 'POST', body: JSON.stringify({
    properties: { hs_timestamp: ts, hs_note_body: lead.note, ...(ownerId ? { hubspot_owner_id: ownerId } : {}) },
    associations: [{ to: { id }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 202 }] }] }) });

  await hs('/crm/v3/objects/tasks', token, { method: 'POST', body: JSON.stringify({
    properties: { hs_timestamp: ts, hs_task_subject: lead.taskSubject, hs_task_body: lead.taskBody,
      hs_task_status: 'NOT_STARTED', hs_task_priority: 'HIGH', hs_task_type: 'CALL', ...(ownerId ? { hubspot_owner_id: ownerId } : {}) },
    associations: [{ to: { id }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 204 }] }] }) });

  return { id, stage: lead.stage, updated: Boolean(existing) };
}

export const handler = async (event) => {
  const token = process.env.HUBSPOT_TOKEN;
  if (!token) { console.log('HUBSPOT_TOKEN not set; lead kept in Netlify Forms only.'); return { statusCode: 200, body: 'skipped' }; }
  try {
    const { payload } = JSON.parse(event.body);
    const r = await sendToHubSpot(payload, token);
    console.log(`HubSpot: ${r.updated ? 'updated' : 'created'} contact ${r.id} as ${r.stage}`);
    return { statusCode: 200, body: 'ok' };
  } catch (err) {
    // The lead is still saved in Netlify Forms and emailed to John, so nothing is lost.
    console.error('HubSpot sync failed:', err.message);
    return { statusCode: 200, body: 'hubspot error logged' };
  }
};
