#!/usr/bin/env node
/**
 * validation_surface.js - one row per admission check the chaincode performs,
 * with the rejection that demonstrates it.
 *
 * The purpose is completeness: a claim that a check exists is weaker than a
 * captured rejection carrying that check's own tag. Any check listed here
 * without corresponding evidence fails the report.
 */
const fs = require('fs');
const path = require('path');
const RESULTS = path.join(__dirname, '..', 'results');
const REJ = path.join(RESULTS, 'rejections');

const CHECKS = [
  ['totality',               'S0_totality_rejection.txt', 'no governance policy in force at submission', 'architecture 5.1'],
  ['custody continuity',     'N-CUSTODY.txt',             'transfer by a party that is not the current custodian', 'model 3.6'],
  ['recall lock',            'N-RECALL-TRANSFER.txt',     'transfer of a lot under recall', 'model 3.6'],
  ['recall lock',            'N-RECALL-TRANSFORM.txt',    'transformation consuming a lot under recall', 'model 3.6 / 3.8'],
  ['quantity conservation',  'N-QTY-TOLERANCE.txt',       'imbalance beyond the tolerance in force', 'model 3.6'],
  ['quantity conservation',  'N-QTY-AVAILABLE.txt',       'consuming more of a lot than remains', 'model 3.6'],
  ['quantity conservation',  'N-QTY-UNIT.txt',            'inputs and outputs in different units', 'model 3.6'],
  ['quantity conservation',  'S3-P4.txt',                 'imbalance admissible under v1.0, refused under v2.0', 'architecture R4'],
  ['verification integrity', 'N-VERIFY-DIGEST.txt',       'malformed attestation digest', 'model 3.6'],
  ['verification integrity', 'N-VERIFY-SELF.txt',         'self-attestation by the current custodian, refused under v2.0', 'architecture R4'],
  ['asset',                  'N-CONSUMED.txt',            'transfer of a fully consumed lot', 'model 3.6 (derived)'],
  ['schema',                 'N-SCHEMA-TYPE.txt',         'event type outside the five-event vocabulary', 'model 3.2'],
  ['lineage',                'N-PREDECESSOR.txt',         'predecessor that was never anchored', 'model 3.3'],
  ['duplicate',              'N-DUPLICATE.txt',           're-anchoring an existing event identifier', 'immutability'],
  ['change control',         'N-POLICY-NONADMIN.txt',     'policy anchored by a non-admin organization', 'model 3.5'],
  ['change control',         'N-CLEAR-NONADMIN.txt',      'recall cleared by a non-admin organization', 'model 3.5'],
  ['retroactivity',          'N-POLICY-RETRO.txt',        'validity start earlier than the anchoring time', 'architecture 5.1'],
  ['ordering',               'N-POLICY-ORDER.txt',        'validity start at or before a version already scheduled', 'architecture 5.1'],
];

const rows = CHECKS.map(([tag, file, condition, source]) => {
  const p = file.startsWith('S0_') || file.startsWith('S3_')
    ? path.join(RESULTS, file) : path.join(REJ, file);
  const alt = path.join(REJ, file);
  const chosen = fs.existsSync(p) ? p : (fs.existsSync(alt) ? alt : null);
  const message = chosen ? fs.readFileSync(chosen, 'utf8').trim() : null;
  const tagged = message ? message.includes(`[${tag}]`) : false;
  return { tag, condition, source, evidence: file, captured: !!message, correctlyTagged: tagged, message };
});

const missing = rows.filter((x) => !x.captured || !x.correctlyTagged);
const out = {
  totalChecks: rows.length,
  demonstrated: rows.length - missing.length,
  rows,
  verdict: { allChecksDemonstrated: missing.length === 0 },
  generatedAt: new Date().toISOString(),
};
fs.writeFileSync(path.join(RESULTS, 'S4_validation_surface.json'), JSON.stringify(out, null, 2));

const md = ['# Validation surface', '',
  `Every admission check the chaincode performs, with the captured rejection that demonstrates it.`, '',
  '| Check | Condition | Source | Evidence | Correctly tagged |', '|---|---|---|---|---|',
  ...rows.map((x) => `| \`[${x.tag}]\` | ${x.condition} | ${x.source} | \`${x.evidence}\` | ${x.correctlyTagged ? 'yes' : '**NO**'} |`),
  '', `${out.demonstrated} of ${out.totalChecks} checks demonstrated by a correctly tagged rejection.`, ''];
fs.writeFileSync(path.join(RESULTS, 'S4_validation_surface.md'), md.join('\n'));

const g = (s) => `\x1b[0;32m${s}\x1b[0m`, r = (s) => `\x1b[0;31m${s}\x1b[0m`;
console.log(`   ${missing.length === 0 ? g('PASS') : r('FAIL')} ${out.demonstrated}/${out.totalChecks} checks demonstrated`);
missing.forEach((x) => console.log(`   ${r('missing')} [${x.tag}] ${x.evidence}`));
console.log('   -> results/S4_validation_surface.json, .md');
if (missing.length) process.exit(1);
