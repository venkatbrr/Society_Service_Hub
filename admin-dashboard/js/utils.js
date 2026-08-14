// Shared helpers for the platform admin console.
//
// Loaded before every page controller. There is no bundler here — files are
// copied verbatim by build-admin.js — so everything hangs off `window`.

// ---------------------------------------------------------------------------
// Escaping
// ---------------------------------------------------------------------------

// Every value that reaches innerHTML must go through this. Resident names,
// business names and community names are all user-supplied.
function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// For values interpolated into an HTML attribute (data-*, value="…").
const escAttr = esc;

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function fmtMoney(value) {
  const n = Number(value || 0);
  return '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

function fmtNumber(value) {
  return Number(value || 0).toLocaleString('en-IN');
}

function fmtDate(value) {
  if (!value) return 'N/A';
  const d = new Date(value);
  if (isNaN(d.getTime())) return 'N/A';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtDateTime(value) {
  if (!value) return 'N/A';
  const d = new Date(value);
  if (isNaN(d.getTime())) return 'N/A';
  return d.toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit'
  });
}

// "3 days ago" / "just now" — used for last-activity columns where the exact
// timestamp matters less than whether a community has gone quiet.
function fmtRelative(value) {
  if (!value) return 'Never';
  const d = new Date(value);
  if (isNaN(d.getTime())) return 'Never';
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return minutes + 'm ago';
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours + 'h ago';
  const days = Math.floor(hours / 24);
  if (days < 30) return days + 'd ago';
  const months = Math.floor(days / 30);
  if (months < 12) return months + 'mo ago';
  return Math.floor(months / 12) + 'y ago';
}

function fmtTime(value) {
  if (!value) return '';
  // Postgres TIME arrives as "13:00:00".
  const parts = String(value).split(':');
  if (parts.length < 2) return String(value);
  const h = parseInt(parts[0], 10);
  const m = parts[1];
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return h12 + ':' + m + ' ' + suffix;
}

function pluralize(count, singular, plural) {
  return Number(count) === 1 ? singular : (plural || singular + 's');
}

// ---------------------------------------------------------------------------
// Badges
// ---------------------------------------------------------------------------

function badge(label, variant) {
  return '<span class="badge-pill badge-' + (variant || 'muted') + '">' + esc(label) + '</span>';
}

function statusBadge(status) {
  const map = {
    open: 'approved',
    active: 'approved',
    approved: 'approved',
    published: 'approved',
    completed: 'active',
    fulfilled: 'active',
    reviewed: 'active',
    pending: 'pending',
    closed: 'muted',
    dismissed: 'muted',
    inactive: 'rejected',
    cancelled: 'rejected',
    rejected: 'rejected',
    withdrawn: 'rejected',
    hidden: 'rejected'
  };
  const key = String(status || '').toLowerCase();
  const label = key ? key.charAt(0).toUpperCase() + key.slice(1) : 'Unknown';
  return badge(label, map[key] || 'muted');
}

function roleLabel(appRole) {
  if (appRole === 'president') return 'President';
  if (appRole === 'vice_president') return 'Vice President';
  if (appRole === 'admin') return 'Platform Admin';
  return 'Resident';
}

// ---------------------------------------------------------------------------
// WhatsApp
// ---------------------------------------------------------------------------

// Stored numbers are 10 digits; the country code is added at link time. The
// `whatsapp://` scheme does not work on web, so always use wa.me here.
function buildWhatsAppUrl(phone, text) {
  const digits = String(phone || '').replace(/[^0-9]/g, '');
  if (!digits) return null;
  const withCode = digits.length === 10 ? '91' + digits : digits;
  const base = 'https://wa.me/' + withCode;
  return text ? base + '?text=' + encodeURIComponent(text) : base;
}

// ---------------------------------------------------------------------------
// Errors and empty states
// ---------------------------------------------------------------------------

// A failed read must never look like an empty community — that is the exact
// failure mode that made the dashboard render zeroes for months.
function errorBanner(message, context) {
  return '<div class="alert alert-danger">' +
    '<strong>Could not load ' + esc(context || 'data') + '.</strong> ' +
    esc(message || 'Unknown error') +
    '</div>';
}

function emptyState(message) {
  return '<div class="empty-state">' + esc(message) + '</div>';
}

function emptyRow(colspan, message) {
  return '<tr><td colspan="' + colspan + '" class="empty-state">' + esc(message) + '</td></tr>';
}

// Throws on a Supabase error instead of letting the caller render `data ?? []`
// as a legitimately empty result.
function unwrap(result, context) {
  if (result && result.error) {
    const err = new Error(result.error.message || 'Request failed');
    err.context = context;
    throw err;
  }
  return (result && result.data) || [];
}

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------

function csvCell(value) {
  if (value == null) return '';
  const s = String(value);
  // Guard against spreadsheet formula injection from user-supplied names.
  const safe = /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
  return '"' + safe.replace(/"/g, '""') + '"';
}

// `columns` is [{ key, label, value? }]. Downloads client-side; no server hop.
function exportCsv(filename, columns, rows) {
  if (!rows || rows.length === 0) {
    alert('Nothing to export.');
    return;
  }

  const header = columns.map(c => csvCell(c.label)).join(',');
  const body = rows.map(row =>
    columns.map(c => csvCell(c.value ? c.value(row) : row[c.key])).join(',')
  ).join('\r\n');

  // The BOM makes Excel open UTF-8 (₹, emoji) correctly.
  const blob = new Blob(['﻿' + header + '\r\n' + body], {
    type: 'text/csv;charset=utf-8;'
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------

function debounce(fn, wait) {
  let timer = null;
  return function () {
    const args = arguments;
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), wait || 250);
  };
}

// Sorts an array of objects by key, coercing numerics and dates sensibly.
function sortRows(rows, key, direction) {
  const dir = direction === 'asc' ? 1 : -1;
  return rows.slice().sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    const an = Number(av);
    const bn = Number(bv);
    if (!isNaN(an) && !isNaN(bn) && av !== '' && bv !== '') return (an - bn) * dir;
    return String(av).localeCompare(String(bv)) * dir;
  });
}

// The dashboard and community pages both use "ALL" as the sentinel for the
// platform-wide view. Every RPC takes NULL to mean "every community", so the
// sentinel must be translated exactly once, here — passing the literal string
// "ALL" as a UUID is what made the whole dashboard read zero.
function normalizeCommunityId(value) {
  if (!value || value === 'ALL') return null;
  return value;
}

window.esc = esc;
window.escAttr = escAttr;
window.fmtMoney = fmtMoney;
window.fmtNumber = fmtNumber;
window.fmtDate = fmtDate;
window.fmtDateTime = fmtDateTime;
window.fmtRelative = fmtRelative;
window.fmtTime = fmtTime;
window.pluralize = pluralize;
window.badge = badge;
window.statusBadge = statusBadge;
window.roleLabel = roleLabel;
window.buildWhatsAppUrl = buildWhatsAppUrl;
window.errorBanner = errorBanner;
window.emptyState = emptyState;
window.emptyRow = emptyRow;
window.unwrap = unwrap;
window.exportCsv = exportCsv;
window.debounce = debounce;
window.sortRows = sortRows;
window.normalizeCommunityId = normalizeCommunityId;
