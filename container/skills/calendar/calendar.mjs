#!/usr/bin/env node
/**
 * Calendar skill helper — reads a Google Calendar iCal feed and outputs events.
 * No external dependencies; uses Node 22 native fetch and a lightweight VEVENT parser.
 *
 * Usage:
 *   node calendar.mjs --today
 *   node calendar.mjs --days 7
 *   node calendar.mjs --search "Meeting"
 *   node calendar.mjs --days 14 --search "Caritas"
 */

// ── CLI args ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

function flag(name) {
  return args.includes(name);
}
function option(name) {
  const idx = args.indexOf(name);
  return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : null;
}

const isToday = flag('--today');
const daysArg = option('--days');
const searchArg = option('--search');
const days = isToday ? 1 : parseInt(daysArg ?? '7', 10);

if (flag('--help') || flag('-h')) {
  console.log(`Usage: node calendar.mjs [--today] [--days N] [--search "text"]

  --today         Show today's events only
  --days N        Show events for the next N days (default: 7)
  --search "txt"  Filter by text in title, location, or description
  --help          Show this help`);
  process.exit(0);
}

// ── Fetch iCal data ─────────────────────────────────────────────────────────

const icalUrl = process.env.CALENDAR_ICAL_URL;
if (!icalUrl) {
  console.error('Error: CALENDAR_ICAL_URL is not set.');
  process.exit(1);
}

let icalText;
try {
  const res = await fetch(icalUrl);
  if (!res.ok) {
    console.error(`Error: Calendar fetch failed (HTTP ${res.status}).`);
    process.exit(1);
  }
  icalText = await res.text();
} catch (err) {
  console.error(`Error: Could not reach calendar service (${err.code ?? err.message}).`);
  process.exit(1);
}

// ── iCal parser ─────────────────────────────────────────────────────────────

/**
 * Unfold lines per RFC 5545 §3.1 — continuation lines start with a single
 * space or tab and should be joined to the previous line.
 */
function unfold(text) {
  return text.replace(/\r\n[ \t]/g, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function parseIcalDate(value) {
  // Strip any TZID parameter prefix: TZID=Europe/Berlin:20260319T090000
  const raw = value.includes(':') ? value.split(':').pop() : value;
  if (!raw) return null;

  // DATE-only: 20260319
  if (/^\d{8}$/.test(raw)) {
    const y = +raw.slice(0, 4), m = +raw.slice(4, 6) - 1, d = +raw.slice(6, 8);
    return { date: new Date(y, m, d), allDay: true };
  }

  // DATE-TIME: 20260319T090000 or 20260319T090000Z
  const match = raw.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (!match) return null;

  const [, yr, mo, dy, hh, mm, ss, utc] = match;
  const date = utc
    ? new Date(Date.UTC(+yr, +mo - 1, +dy, +hh, +mm, +ss))
    : new Date(+yr, +mo - 1, +dy, +hh, +mm, +ss);
  return { date, allDay: false };
}

function unescapeIcal(str) {
  return str
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

function parseEvents(text) {
  const unfolded = unfold(text);
  const events = [];
  const blocks = unfolded.split('BEGIN:VEVENT');

  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i].split('END:VEVENT')[0];
    const lines = block.split('\n');

    const props = {};
    for (const line of lines) {
      // Property line: NAME;PARAMS:VALUE or NAME:VALUE
      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) continue;
      const left = line.slice(0, colonIdx);
      const value = line.slice(colonIdx + 1);
      // Extract property name (before any ;PARAM)
      const semiIdx = left.indexOf(';');
      const propName = (semiIdx === -1 ? left : left.slice(0, semiIdx)).toUpperCase();
      const fullKey = left.toUpperCase();

      // For date fields, keep the full left side (contains TZID etc.)
      if (propName === 'DTSTART' || propName === 'DTEND') {
        props[propName] = { full: fullKey, value };
      } else if (!props[propName]) {
        props[propName] = value;
      }
    }

    const dtStart = props.DTSTART ? parseIcalDate(`${props.DTSTART.full}:${props.DTSTART.value}`) : null;
    const dtEnd = props.DTEND ? parseIcalDate(`${props.DTEND.full}:${props.DTEND.value}`) : null;

    if (!dtStart) continue;

    events.push({
      summary: unescapeIcal(props.SUMMARY ?? '(Kein Titel)'),
      location: props.LOCATION ? unescapeIcal(props.LOCATION) : null,
      description: props.DESCRIPTION ? unescapeIcal(props.DESCRIPTION) : null,
      start: dtStart,
      end: dtEnd,
      status: props.STATUS ?? null,
    });
  }

  return events;
}

// ── Filter & sort ───────────────────────────────────────────────────────────

const now = new Date();
const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
const endRange = new Date(startOfToday);
endRange.setDate(endRange.getDate() + days);

let events = parseEvents(icalText);

// Filter cancelled events
events = events.filter(e => e.status !== 'CANCELLED');

// Filter by date range: event overlaps with [startOfToday, endRange)
events = events.filter(e => {
  const eStart = e.start.date;
  const eEnd = e.end ? e.end.date : (e.start.allDay ? new Date(eStart.getTime() + 86400000) : eStart);
  return eStart < endRange && eEnd > startOfToday;
});

// Filter by search term
if (searchArg) {
  const term = searchArg.toLowerCase();
  events = events.filter(e => {
    const haystack = [e.summary, e.location, e.description].filter(Boolean).join(' ').toLowerCase();
    return haystack.includes(term);
  });
}

// Sort by start date
events.sort((a, b) => a.start.date - b.start.date);

// ── Output ──────────────────────────────────────────────────────────────────

if (events.length === 0) {
  const rangeDesc = isToday ? 'heute' : `in den nächsten ${days} Tagen`;
  const searchDesc = searchArg ? ` mit "${searchArg}"` : '';
  console.log(`Keine Termine ${rangeDesc}${searchDesc} gefunden.`);
  process.exit(0);
}

const rangeLabel = isToday ? 'Heute' : `Nächste ${days} Tage`;
const searchLabel = searchArg ? ` (Filter: "${searchArg}")` : '';
console.log(`=== ${rangeLabel}${searchLabel} — ${events.length} Termin${events.length !== 1 ? 'e' : ''} ===\n`);

const dateFmt = new Intl.DateTimeFormat('de-DE', {
  weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric',
});
const timeFmt = new Intl.DateTimeFormat('de-DE', {
  hour: '2-digit', minute: '2-digit',
});

let lastDateStr = '';

for (const ev of events) {
  const dateStr = dateFmt.format(ev.start.date);

  // Group header for new days
  if (dateStr !== lastDateStr) {
    if (lastDateStr) console.log('');
    console.log(`── ${dateStr} ──`);
    lastDateStr = dateStr;
  }

  // Time or all-day marker
  const timeStr = ev.start.allDay
    ? '  Ganztägig'
    : `  ${timeFmt.format(ev.start.date)}${ev.end ? ' – ' + timeFmt.format(ev.end.date) : ''}`;

  console.log(`${timeStr}  ${ev.summary}`);
  if (ev.location) console.log(`    Ort: ${ev.location}`);
  if (ev.description) {
    const desc = ev.description.trim();
    if (desc.length > 200) {
      console.log(`    ${desc.slice(0, 200)}…`);
    } else {
      console.log(`    ${desc}`);
    }
  }
}
