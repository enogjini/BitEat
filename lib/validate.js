'use strict';

/**
 * Small input predicates shared by the write routes. Each returns a boolean;
 * the route decides the message. Kept deliberately tiny — the API has a
 * handful of field shapes and no need for a schema library.
 */

function isPosInt(v) {
  return Number.isInteger(v) && v > 0;
}

/** parseInt with the guarantee that the whole value was numeric ("3", 3 → 3; "3x" → NaN). */
function toInt(v) {
  if (typeof v === 'number') return Number.isInteger(v) ? v : NaN;
  if (typeof v === 'string' && /^-?\d+$/.test(v.trim())) return parseInt(v, 10);
  return NaN;
}

function toPosInt(v) {
  const n = toInt(v);
  return isPosInt(n) ? n : NaN;
}

function isFiniteNumber(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

/** A monetary amount: finite, not negative. Strings such as "12.50" are accepted. */
function toMoney(v) {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return isFiniteNumber(n) && n >= 0 ? n : NaN;
}

function isNonEmptyString(v, max = 200) {
  return typeof v === 'string' && v.trim().length > 0 && v.length <= max;
}

function isIsoDate(v) {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
}

function isTime(v) {
  return typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(v);
}

/** Today's date in UTC, matching Postgres' CURRENT_DATE on a UTC server. */
function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

module.exports = {
  isPosInt,
  toInt,
  toPosInt,
  isFiniteNumber,
  toMoney,
  isNonEmptyString,
  isIsoDate,
  isTime,
  todayIso,
};
