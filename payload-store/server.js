/**
 * payload-store — off-ledger evidence payload custody (Paper 2 R3).
 *
 * Content-addressed: the SHA-256 digest of the stored bytes IS the identifier
 * anchored on-ledger. Retrieval recomputes the digest over the bytes on disk
 * and reports verified true/false — which is what makes silent tampering
 * detectable from anchored evidence alone (Paper 3 §6.2 tamper test).
 *
 * Role gate is deliberately minimal (a header string). Documented in the paper
 * as an instantiation simplification: the architecture places disclosure
 * control here, the PoC demonstrates the placement, not an IAM product.
 */
const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PAYLOAD_PORT || 4000;
const DATA = path.join(__dirname, 'data');
const INDEX = path.join(DATA, 'index.json');
const ROLES = ['operator', 'auditor', 'authority'];

fs.mkdirSync(DATA, { recursive: true });
if (!fs.existsSync(INDEX)) fs.writeFileSync(INDEX, '{}');

const app = express();
app.use(express.json({ limit: '2mb' }));

const readIndex = () => JSON.parse(fs.readFileSync(INDEX, 'utf8'));
const writeIndex = (i) => fs.writeFileSync(INDEX, JSON.stringify(i, null, 2));
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

/* POST /payload  → { hash, bytes, storedAt }
   Bytes are frozen at store time and never re-serialised, so the digest
   stays stable across reads. */
app.post('/payload', (req, res) => {
  const bytes = Buffer.from(JSON.stringify(req.body));
  const hash = sha256(bytes);
  fs.writeFileSync(path.join(DATA, hash + '.json'), bytes);
  const idx = readIndex();
  idx[hash] = {
    hash,
    bytes: bytes.length,
    storedAt: new Date().toISOString(),
    eventID: req.body.eventID || null,
    sourceSystem: req.body.sourceSystem || null,
  };
  writeIndex(idx);
  res.json(idx[hash]);
});

/* GET /payload/:hash  (header X-Role required) → { payload, verified, ... } */
app.get('/payload/:hash', (req, res) => {
  const role = (req.get('X-Role') || '').toLowerCase();
  if (!ROLES.includes(role)) {
    return res.status(403).json({
      error: `ACCESS DENIED: header X-Role must be one of ${ROLES.join('|')}`,
    });
  }
  const file = path.join(DATA, req.params.hash + '.json');
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'payload not found' });

  const bytes = fs.readFileSync(file);
  const recomputed = sha256(bytes);
  const verified = recomputed === req.params.hash;
  res.json({
    hash: req.params.hash,
    recomputed,
    verified,
    role,
    payload: verified ? JSON.parse(bytes.toString()) : null,
    note: verified ? 'integrity confirmed' : 'INTEGRITY FAILURE: stored bytes do not match the anchored digest',
  });
});

/* GET /verify/:hash — verification only, no disclosure (used by audit packs) */
app.get('/verify/:hash', (req, res) => {
  const file = path.join(DATA, req.params.hash + '.json');
  if (!fs.existsSync(file)) return res.json({ hash: req.params.hash, verified: false, reason: 'missing' });
  const recomputed = sha256(fs.readFileSync(file));
  res.json({ hash: req.params.hash, recomputed, verified: recomputed === req.params.hash });
});

app.get('/health', (_, res) => res.json({ ok: true, stored: Object.keys(readIndex()).length }));

app.listen(PORT, () => console.log(`payload-store listening on :${PORT} (data: ${DATA})`));
