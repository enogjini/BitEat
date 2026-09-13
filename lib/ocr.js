'use strict';

const path = require('path');
const os = require('os');
const { createWorker } = require('tesseract.js');

// Vendored trained data — menu items are Albanian, slips may mix Albanian and
// digits/Latin words, so both languages load together. Pointing `langPath` at
// this local folder (and turning `gzip` off, since these are plain
// .traineddata files) means recognition never reaches out to the network:
// no CDN fetch on a cold serverless start, and no network needed in tests/CI.
const TESSDATA_PATH = path.join(__dirname, 'tessdata');
const LANGS = 'sqi+eng';

let workerPromise = null;

function getWorker() {
  if (!workerPromise) {
    workerPromise = createWorker(LANGS, undefined, {
      langPath: TESSDATA_PATH,
      cachePath: os.tmpdir(),
      gzip: false,
    });
  }
  return workerPromise;
}

/** OCR an image buffer (JPEG/PNG/etc.) into raw text. */
async function recognizeText(buffer) {
  const worker = await getWorker();
  const { data } = await worker.recognize(buffer);
  return data.text;
}

module.exports = { recognizeText };
