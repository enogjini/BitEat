'use strict';

/**
 * Stand-in for lib/ocr.js so tests never run real Tesseract recognition.
 * A test sets what "the photo" reads as with `fakeOcr.setText(...)`, or makes
 * recognition fail with `fakeOcr.setError(...)`; defaults to empty text
 * (nothing recognized).
 */

let text = '';
let error = null;

function setText(t) {
  text = t;
  error = null;
}

function setError(err) {
  error = err;
}

function reset() {
  text = '';
  error = null;
}

async function recognizeText() {
  if (error) throw error;
  return text;
}

module.exports = { recognizeText, setText, setError, reset };
