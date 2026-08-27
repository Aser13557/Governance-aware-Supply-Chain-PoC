#!/usr/bin/env node
/**
 * disclosure_tiers.js - evidence that audit access is tiered.
 *
 * The architecture distinguishes public lineage visibility, consortium-internal
 * evidence visibility and authority-facing audit visibility. A store that
 * merely required some credential would satisfy none of that distinction, so
 * each tier is exercised against the same digest and the outcomes recorded.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const RESULTS = path.join(__dirname, '..', 'results');
const PAYLOAD_URL = process.env.PAYLOAD_URL || 'http://localhost:4000';
const CHANNEL = process.env.CHANNEL || 'mychannel';
const CC = process.env.CC_NAME || 'evidence';

const ccQuery = (fn, ...args) => JSON.parse(execFileSync('peer',
  ['chaincode', 'query', '-C', CHANNEL, '-n', CC, '-c', JSON.stringify({ function: fn, Args: args })],
  { encoding: 'utf8', env: process.env }).trim());

(async () => {
  const h = ccQuery('GetHeader', 'VD1');
  const tiers = ['public', 'operator', 'authority'];
  const rows = [];

  for (const tier of tiers) {
    const r = await fetch(`${PAYLOAD_URL}/payload/${h.payloadHash}`, { headers: { 'X-Role': tier } });
    const body = await r.json();
    rows.push({
      tier, status: r.status,
      integrityConfirmed: body.verified === true,
      payloadDisclosed: body.payload !== null && body.payload !== undefined,
      message: body.error || body.note,
    });
  }
  const nocred = await fetch(`${PAYLOAD_URL}/payload/${h.payloadHash}`);
  const nb = await nocred.json();
  rows.push({ tier: '(none)', status: nocred.status, integrityConfirmed: false, payloadDisclosed: false, message: nb.error });

  const out = {
    digest: h.payloadHash, event: 'VD1', tiers: rows,
    verdict: {
      publicMayConfirmIntegrityWithoutContent:
        rows[0].integrityConfirmed === true && rows[0].payloadDisclosed === false,
      consortiumMayRetrieveContent: rows[1].payloadDisclosed === true,
      authorityMayRetrieveContent: rows[2].payloadDisclosed === true,
      unauthenticatedRefused: rows[3].payloadDisclosed === false,
    },
    generatedAt: new Date().toISOString(),
  };
  out.verdict.allTiersBehaveAsSpecified = Object.values(out.verdict).every(Boolean);
  fs.writeFileSync(path.join(RESULTS, 'S5_disclosure_tiers.json'), JSON.stringify(out, null, 2));

  const g = (s) => `\x1b[0;32m${s}\x1b[0m`, r = (s) => `\x1b[0;31m${s}\x1b[0m`;
  rows.forEach((x) => console.log(
    `   ${x.tier.padEnd(10)} status ${x.status}  integrity ${x.integrityConfirmed ? 'confirmed' : '-'}  content ${x.payloadDisclosed ? 'disclosed' : 'withheld'}`));
  console.log(`   ${out.verdict.allTiersBehaveAsSpecified ? g('PASS') : r('FAIL')} three visibility tiers behave as specified -> results/S5_disclosure_tiers.json`);
  if (!out.verdict.allTiersBehaveAsSpecified) process.exit(1);
})();
