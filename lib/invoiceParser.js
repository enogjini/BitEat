'use strict';

/**
 * Turns raw OCR text from a photographed order slip into menu lines. Pure
 * functions, no I/O — easy to unit test against canned OCR output and safe
 * to run without ever touching a real image or the database.
 */

// A price line ends in either a decimal amount, a Lek/ALL suffix, or a bare
// number of 3+ digits (typical menu prices run 100+ Lek; a bare 1-2 digit
// trailing number is far more likely to be a quantity than a price).
const TRAILING_DECIMAL_PRICE = /(?:^|\s)(\d+[.,]\d{1,2})\s*(?:lek|all|l)?\s*$/i;
const TRAILING_LABELED_PRICE = /(?:^|\s)(\d+)\s*(?:lek|all)\s*$/i;
const TRAILING_BARE_PRICE = /(?:^|\s)(\d{3,})\s*$/;

const LEADING_QTY = /^(\d{1,2})\s*[xX×]?\s+(?=\S)/;
const TRAILING_QTY = /(?:^|\s)[xX×]?\s*(\d{1,2})\s*$/;

function parseNumber(raw) {
  if (!raw) return null;
  const n = Number(String(raw).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** Split OCR text into candidate `{ rawLine, sasia, emriRaw, cmimiRaw }` entries. */
function parseLines(rawText) {
  return String(rawText || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((rawLine) => {
      let rest = rawLine;
      let cmimiRaw = null;

      const priceMatch = rest.match(TRAILING_DECIMAL_PRICE) || rest.match(TRAILING_LABELED_PRICE) || rest.match(TRAILING_BARE_PRICE);
      if (priceMatch) {
        cmimiRaw = parseNumber(priceMatch[1]);
        rest = rest.slice(0, priceMatch.index).trim();
      }

      let sasia = 1;
      const prefixMatch = rest.match(LEADING_QTY);
      if (prefixMatch) {
        sasia = parseInt(prefixMatch[1], 10);
        rest = rest.slice(prefixMatch[0].length).trim();
      } else {
        const suffixMatch = rest.match(TRAILING_QTY);
        if (suffixMatch) {
          sasia = parseInt(suffixMatch[1], 10);
          rest = rest.slice(0, suffixMatch.index).trim();
        }
      }

      return { rawLine, sasia: sasia > 0 ? sasia : 1, emriRaw: rest.trim(), cmimiRaw };
    })
    .filter((line) => line.emriRaw.length > 0);
}

/** Drop Unicode combining marks (U+0300-U+036F) left behind by NFD decomposition. */
function stripCombiningMarks(str) {
  let out = '';
  for (const ch of str) {
    const code = ch.codePointAt(0);
    if (code >= 0x0300 && code <= 0x036f) continue;
    out += ch;
  }
  return out;
}

/** Lowercase, drop Albanian diacritics and punctuation, collapse whitespace. */
function normalize(str) {
  const decomposed = String(str || '')
    .toLowerCase()
    .replace(/ë/g, 'e')
    .replace(/ç/g, 'c')
    .normalize('NFD');
  return stripCombiningMarks(decomposed)
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const curr = [i];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = curr;
  }
  return prev[n];
}

/** 0 (no resemblance) to 1 (identical), edit distance relative to the longer string. */
function similarity(a, b) {
  if (!a || !b) return 0;
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
}

// A match must be a good absolute fit AND clearly better than the runner-up —
// two menu items that both loosely resemble the OCR'd text are treated as
// unmatched rather than guessed, since there is no confirmation screen.
const MIN_CONFIDENCE = 0.72;
const MIN_MARGIN = 0.08;

/**
 * Match parsed lines against `menuItems` (`{artikull_id, emri, cmimi}`).
 * Returns `{ matched: [{artikull_id, sasia, emri, cmimi, confidence, rawLine}], unmatched: [{rawLine}] }`.
 * The OCR'd price (`cmimiRaw`) is only ever a matching signal — the price on
 * a matched line always comes from the menu, never from the photo.
 */
function matchToMenu(parsedLines, menuItems) {
  const candidates = menuItems.map((item) => ({ item, norm: normalize(item.emri) }));
  const matched = [];
  const unmatched = [];

  for (const line of parsedLines) {
    const norm = normalize(line.emriRaw);
    let best = null;
    let bestScore = -1;
    let secondScore = -1;

    for (const c of candidates) {
      const score = similarity(norm, c.norm);
      if (score > bestScore) {
        secondScore = bestScore;
        bestScore = score;
        best = c.item;
      } else if (score > secondScore) {
        secondScore = score;
      }
    }

    if (best && bestScore >= MIN_CONFIDENCE && bestScore - secondScore >= MIN_MARGIN) {
      matched.push({
        artikull_id: best.artikull_id,
        sasia: line.sasia,
        emri: best.emri,
        cmimi: best.cmimi,
        confidence: Number(bestScore.toFixed(2)),
        rawLine: line.rawLine,
      });
    } else {
      unmatched.push({ rawLine: line.rawLine });
    }
  }

  return { matched, unmatched };
}

module.exports = { parseLines, matchToMenu };
