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

// ── RRULE helpers ───────────────────────────────────────────────────────────

const DAY_MAP = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
const SUPPORTED_FREQ = new Set(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']);

function parseRRule(value) {
  const parts = {};
  for (const part of value.split(';')) {
    if (!part) continue;
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    parts[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1);
  }
  return parts;
}

function parseUntil(s) {
  const parsed = parseIcalDate(s);
  if (!parsed) return null;
  // For DATE-only UNTIL, treat as end-of-day so same-day events still fit.
  if (parsed.allDay) return new Date(parsed.date.getTime() + 86400000 - 1);
  return parsed.date;
}

function parseByDay(s) {
  const m = s.match(/^(-?\d+)?(SU|MO|TU|WE|TH|FR|SA)$/);
  if (!m) return null;
  return {
    ordinal: m[1] ? parseInt(m[1], 10) : null,
    weekday: DAY_MAP[m[2]],
  };
}

function nthWeekdayOfMonth(year, month, weekday, ordinal) {
  if (ordinal > 0) {
    const first = new Date(year, month, 1);
    const offset = (weekday - first.getDay() + 7) % 7;
    const day = 1 + offset + (ordinal - 1) * 7;
    const lastDay = new Date(year, month + 1, 0).getDate();
    return day > lastDay ? null : day;
  }
  const lastDate = new Date(year, month + 1, 0);
  const offset = (lastDate.getDay() - weekday + 7) % 7;
  const day = lastDate.getDate() - offset + (ordinal + 1) * 7;
  return day < 1 ? null : day;
}

function makeInstance(master, instStart, duration) {
  return {
    summary: master.summary,
    location: master.location,
    description: master.description,
    start: { date: new Date(instStart), allDay: master.start.allDay },
    end: master.end
      ? { date: new Date(instStart.getTime() + duration), allDay: master.end.allDay }
      : null,
    status: master.status,
  };
}

function expandRRule(master, rrule, exdates, rangeStart, rangeEnd) {
  const freq = rrule.FREQ;
  if (!SUPPORTED_FREQ.has(freq)) return [master];

  const interval = Math.max(1, parseInt(rrule.INTERVAL ?? '1', 10) || 1);
  const count = rrule.COUNT ? parseInt(rrule.COUNT, 10) : Infinity;
  const until = rrule.UNTIL ? parseUntil(rrule.UNTIL) : null;
  const wkstDay = DAY_MAP[rrule.WKST] ?? 1;

  const masterStart = master.start.date;
  const masterEnd = master.end ? master.end.date : null;
  const duration = masterEnd
    ? masterEnd.getTime() - masterStart.getTime()
    : (master.start.allDay ? 86400000 : 0);

  const instances = [];
  let generated = 0;
  const MAX_ITER = 5000;

  // Returns false to stop expansion entirely.
  const tryAdd = (instStart) => {
    if (until && instStart > until) return false;
    if (generated >= count) return false;
    if (instStart >= rangeEnd) return false;
    generated++;
    if (!exdates.has(instStart.getTime())) {
      const instEnd = new Date(instStart.getTime() + duration);
      if (instEnd > rangeStart) {
        instances.push(makeInstance(master, instStart, duration));
      }
    }
    return true;
  };

  if (freq === 'DAILY') {
    const cursor = new Date(masterStart);
    for (let iter = 0; iter < MAX_ITER; iter++) {
      if (cursor >= rangeEnd) break;
      if (!tryAdd(new Date(cursor))) break;
      cursor.setDate(cursor.getDate() + interval);
    }
  } else if (freq === 'WEEKLY') {
    const byDayList = rrule.BYDAY
      ? rrule.BYDAY.split(',').map(s => {
          const m = s.trim().match(/^-?\d*(SU|MO|TU|WE|TH|FR|SA)$/);
          return m ? DAY_MAP[m[1]] : undefined;
        }).filter(d => d !== undefined)
      : [masterStart.getDay()];

    if (byDayList.length === 0) byDayList.push(masterStart.getDay());

    const sortedDays = [...byDayList].sort(
      (a, b) => ((a - wkstDay + 7) % 7) - ((b - wkstDay + 7) % 7),
    );

    const weekStart = new Date(
      masterStart.getFullYear(), masterStart.getMonth(), masterStart.getDate(),
    );
    while (weekStart.getDay() !== wkstDay) {
      weekStart.setDate(weekStart.getDate() - 1);
    }

    weekLoop:
    for (let iter = 0; iter < MAX_ITER; iter++) {
      if (weekStart >= rangeEnd) break;
      for (const wd of sortedDays) {
        const offset = (wd - wkstDay + 7) % 7;
        const inst = new Date(weekStart);
        inst.setDate(inst.getDate() + offset);
        inst.setHours(
          masterStart.getHours(), masterStart.getMinutes(), masterStart.getSeconds(), 0,
        );
        if (inst < masterStart) continue;
        if (!tryAdd(inst)) break weekLoop;
      }
      weekStart.setDate(weekStart.getDate() + 7 * interval);
    }
  } else if (freq === 'MONTHLY') {
    let year = masterStart.getFullYear();
    let month = masterStart.getMonth();

    monthLoop:
    for (let iter = 0; iter < MAX_ITER; iter++) {
      if (new Date(year, month, 1) >= rangeEnd) break;

      const days = [];
      if (rrule.BYDAY) {
        for (const part of rrule.BYDAY.split(',')) {
          const parsed = parseByDay(part.trim());
          if (!parsed || parsed.ordinal === null) continue;
          const d = nthWeekdayOfMonth(year, month, parsed.weekday, parsed.ordinal);
          if (d !== null) days.push(d);
        }
      } else if (rrule.BYMONTHDAY) {
        const lastDay = new Date(year, month + 1, 0).getDate();
        for (const part of rrule.BYMONTHDAY.split(',')) {
          const n = parseInt(part.trim(), 10);
          if (Number.isNaN(n)) continue;
          if (n > 0 && n <= lastDay) days.push(n);
          else if (n < 0 && lastDay + n + 1 >= 1) days.push(lastDay + n + 1);
        }
      } else {
        days.push(masterStart.getDate());
      }

      days.sort((a, b) => a - b);
      for (const d of days) {
        const inst = new Date(
          year, month, d,
          masterStart.getHours(), masterStart.getMinutes(), masterStart.getSeconds(),
        );
        if (inst < masterStart) continue;
        if (!tryAdd(inst)) break monthLoop;
      }

      month += interval;
      while (month > 11) { month -= 12; year++; }
    }
  } else if (freq === 'YEARLY') {
    const cursor = new Date(masterStart);
    for (let iter = 0; iter < MAX_ITER; iter++) {
      if (cursor >= rangeEnd) break;
      if (!tryAdd(new Date(cursor))) break;
      cursor.setFullYear(cursor.getFullYear() + interval);
    }
  }

  return instances;
}

function parseEvents(text) {
  const unfolded = unfold(text);
  const events = [];
  const blocks = unfolded.split('BEGIN:VEVENT');

  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i].split('END:VEVENT')[0];
    const lines = block.split('\n');

    const props = {};
    const exdateRaw = [];
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
      } else if (propName === 'EXDATE') {
        // EXDATE may appear multiple times and carry comma-separated values
        exdateRaw.push({ full: fullKey, value });
      } else if (!props[propName]) {
        props[propName] = value;
      }
    }

    const dtStart = props.DTSTART ? parseIcalDate(`${props.DTSTART.full}:${props.DTSTART.value}`) : null;
    const dtEnd = props.DTEND ? parseIcalDate(`${props.DTEND.full}:${props.DTEND.value}`) : null;

    if (!dtStart) continue;

    const exdates = new Set();
    for (const ex of exdateRaw) {
      for (const v of ex.value.split(',')) {
        const parsed = parseIcalDate(`${ex.full}:${v}`);
        if (parsed) exdates.add(parsed.date.getTime());
      }
    }

    events.push({
      summary: unescapeIcal(props.SUMMARY ?? '(Kein Titel)'),
      location: props.LOCATION ? unescapeIcal(props.LOCATION) : null,
      description: props.DESCRIPTION ? unescapeIcal(props.DESCRIPTION) : null,
      start: dtStart,
      end: dtEnd,
      status: props.STATUS ?? null,
      rrule: props.RRULE ? parseRRule(props.RRULE) : null,
      exdates,
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

// Filter cancelled events (master series)
events = events.filter(e => e.status !== 'CANCELLED');

// Expand RRULE masters into concrete instances within [startOfToday, endRange)
const expanded = [];
for (const ev of events) {
  if (ev.rrule) {
    expanded.push(...expandRRule(ev, ev.rrule, ev.exdates, startOfToday, endRange));
  } else {
    expanded.push(ev);
  }
}
events = expanded;

// Filter by date range: event overlaps with [startOfToday, endRange)
// (Expansion already respects this, but single events still need it.)
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
