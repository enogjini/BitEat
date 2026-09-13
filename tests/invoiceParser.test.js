'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { parseLines, matchToMenu } = require('../lib/invoiceParser');

const MENU = [
  { artikull_id: 1, emri: 'Birrë', cmimi: 250 },
  { artikull_id: 2, emri: 'Kafe Ekspres', cmimi: 100 },
  { artikull_id: 3, emri: 'Kafe Turke', cmimi: 100 },
  { artikull_id: 4, emri: 'Sallatë Fshati', cmimi: 350 },
];

describe('parseLines', () => {
  test('reads a leading quantity', () => {
    const [line] = parseLines('2x Birrë');
    assert.equal(line.sasia, 2);
    assert.equal(line.emriRaw, 'Birrë');
  });

  test('reads a trailing quantity', () => {
    const [line] = parseLines('Sallatë Fshati x3');
    assert.equal(line.sasia, 3);
    assert.equal(line.emriRaw, 'Sallatë Fshati');
  });

  test('defaults quantity to 1 when none is written', () => {
    const [line] = parseLines('Birrë');
    assert.equal(line.sasia, 1);
    assert.equal(line.emriRaw, 'Birrë');
  });

  test('strips a trailing price with a currency word', () => {
    const [line] = parseLines('Kafe Ekspres 100 Lek');
    assert.equal(line.cmimiRaw, 100);
    assert.equal(line.emriRaw, 'Kafe Ekspres');
  });

  test('strips a bare trailing price of three or more digits', () => {
    const [line] = parseLines('Sallatë Fshati 350');
    assert.equal(line.cmimiRaw, 350);
    assert.equal(line.emriRaw, 'Sallatë Fshati');
  });

  test('treats a bare 1-2 digit trailing number as a quantity, not a price', () => {
    const [line] = parseLines('Birrë 2');
    assert.equal(line.sasia, 2);
    assert.equal(line.cmimiRaw, null);
    assert.equal(line.emriRaw, 'Birrë');
  });

  test('reads a decimal price', () => {
    const [line] = parseLines('Ujë 1.5L 50.50');
    assert.equal(line.cmimiRaw, 50.5);
    assert.equal(line.emriRaw, 'Ujë 1.5L');
  });

  test('drops blank lines and whitespace-only lines', () => {
    const lines = parseLines('Birrë\n\n   \nKafe Ekspres');
    assert.equal(lines.length, 2);
  });

  test('drops a line that is only digits', () => {
    const lines = parseLines('123\nBirrë');
    assert.equal(lines.length, 1);
    assert.equal(lines[0].emriRaw, 'Birrë');
  });
});

describe('matchToMenu', () => {
  test('matches on an exact name', () => {
    const { matched, unmatched } = matchToMenu(parseLines('Birrë'), MENU);
    assert.equal(matched.length, 1);
    assert.equal(matched[0].artikull_id, 1);
    assert.equal(unmatched.length, 0);
  });

  test('matches through OCR noise and missing diacritics', () => {
    const { matched } = matchToMenu(parseLines('Sallate Fshat'), MENU);
    assert.equal(matched.length, 1);
    assert.equal(matched[0].artikull_id, 4);
  });

  test('carries the parsed quantity onto the matched line, and prices from the menu, not the photo', () => {
    const { matched } = matchToMenu(parseLines('3x Birrë 999'), MENU);
    assert.equal(matched[0].sasia, 3);
    assert.equal(matched[0].cmimi, 250, 'price always comes from the menu');
  });

  test('leaves gibberish unmatched', () => {
    const { matched, unmatched } = matchToMenu(parseLines('xkqjzvbwrt'), MENU);
    assert.equal(matched.length, 0);
    assert.equal(unmatched.length, 1);
  });

  test('leaves a short, low-confidence fragment unmatched rather than guessing', () => {
    const { matched, unmatched } = matchToMenu(parseLines('Kafe'), MENU);
    assert.equal(matched.length, 0);
    assert.equal(unmatched.length, 1);
  });

  test('leaves an ambiguous near-tie unmatched even when the top score is high', () => {
    // Two menu items one edit apart from each other: whichever one the OCR
    // text matches best, the runner-up is nearly as good a fit, so neither
    // clears the required margin over the other.
    const similarMenu = [
      { artikull_id: 10, emri: 'Kafe Machiato', cmimi: 150 },
      { artikull_id: 11, emri: 'Kafe Macchiato', cmimi: 150 },
    ];
    const { matched, unmatched } = matchToMenu(parseLines('Kafe Machiato'), similarMenu);
    assert.equal(matched.length, 0);
    assert.equal(unmatched.length, 1);
  });
});
