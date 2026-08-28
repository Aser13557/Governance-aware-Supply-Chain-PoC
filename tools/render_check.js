#!/usr/bin/env node
/**
 * render_check.js - verifies what the replay console will DISPLAY.
 *
 * Why this exists: the artifact gate checks values and verdicts, and it passed
 * every run while the console was showing invented timestamps, a governance act
 * labelled as a policy anchoring, a query placed before the events it
 * contained, an "active policy" panel contradicting its own log, and check rows
 * rendered through the submission template with placeholder dashes. None of
 * those touched an artifact, so nothing could catch them except looking at the
 * output - which meant they survived until someone sent a screenshot.
 *
 * This reproduces the console's line-building rules and asserts on the result,
 * so a presentation defect fails the run like any other.
 *
 * The rules below MUST match console/replay.html. When one changes, change
 * both: a drift between them defeats the purpose of the check.
 */
const fs = require('fs');
const path = require('path');

const R = path.join(__dirname, '..', 'results');
const feed = JSON.parse(fs.readFileSync(path.join(R, 'replay.json'), 'utf8'));

const g = (s) => `\x1b[0;32m${s}\x1b[0m`;
const r = (s) => `\x1b[0;31m${s}\x1b[0m`;
const problems = [];
const fail = (scenario, id, msg) => problems.push(`${scenario} ${id || ''}: ${msg}`);

/* ── the console's own rules, reproduced ─────────────────────────────────── */

const beatTime = (b) =>
  Object.prototype.hasOwnProperty.call(b, 'at')
    ? (b.at ? String(b.at).slice(11, 19) + 'Z' : '')
    : '<<INVENTED>>';           // the demo clock would fire here

function headLine(b) {
  if (b.kind === 'info') return b.text;
  if (b.kind === 'claim') return b.text.replace(/<[^>]+>/g, '');
  if (b.kind === 'query') return `> ${b.label}`;
  if (b.kind === 'tamper') return '> tamper test';
  if (b.kind === 'gov') {
    const act = b.act || 'AnchorPolicy';
    const when = (act === 'AnchorPolicy' ? ' effectiveFrom ' : ' at ') + b.ef;
    return `GOVERNANCE - ${act} ${b.v} - hash ${b.hash} -${when}`;
  }
  const mode = b.mode || (b.type === 'Governance' ? 'governance' : 'submission');
  if (mode === 'check') {
    return `> check - ${b.id} - ${b.condition}` + (b.spec ? ` - specified in ${b.spec}` : '');
  }
  if (mode === 'governance') {
    return `> governance act - ${b.id} - attempted by ${b.actor}`;
  }
  return `> submit - ${b.id} - ${b.type} - ${b.asset} - actor ${b.actor}`
    + (b.source ? ` - source ${b.source}` : '')
    + (b.preds && b.preds.length ? ` - preds {${b.preds.join(', ')}}` : '');
}

/* ── assertions ──────────────────────────────────────────────────────────── */

const show = process.argv.includes('--print');

for (const [sc, beats] of Object.entries(feed.scenarios)) {
  if (show) console.log(`\n===== ${sc} =====`);

  // the panel must not claim there is no policy while the log binds one
  const anchors = beats.some((b) => b.kind === 'gov' && (b.act || 'AnchorPolicy') === 'AnchorPolicy');
  const declares = beats[0] && beats[0].pol;
  if (!anchors && !declares) {
    fail(sc, '', 'no policy declared and none anchored on screen: the active-policy panel would read "none anchored" while the log shows bindings');
  }

  for (const b of beats) {
    const t = beatTime(b);
    const head = headLine(b);
    if (show) console.log(`  ${(t || '        ').padEnd(10)} ${head}`);

    if (t === '<<INVENTED>>') fail(sc, b.id, 'beat has no "at" key, so the console would substitute its demo clock');

    // no placeholder standing in for a real field
    if (/(?:^|[ (])-(?:$|[ )])/.test(head.replace(/ - /g, ' | '))) {
      fail(sc, b.id, `placeholder in a rendered field: "${head}"`);
    }
    if (/undefined|null|\[object/.test(head)) fail(sc, b.id, `unrendered value: "${head}"`);

    // a check row is not a submission
    if (b.mode === 'check') {
      if (b.asset || b.actor || b.source) fail(sc, b.id, 'check row carries submission fields it should not have');
      if (!b.condition || !b.spec) fail(sc, b.id, 'check row is missing its condition or specifying clause');
    }
    if (b.mode === 'submission' && b.kind === 'submit') {
      for (const f of ['type', 'asset', 'actor']) if (!b[f]) fail(sc, b.id, `submission missing ${f}`);
    }
    if (b.kind === 'gov' && !b.act) fail(sc, b.id, 'governance beat does not say which act it is');

    // every displayed line of a query must be a string with content
    if (b.kind === 'query') {
      if (!b.label) fail(sc, b.id, 'query beat has no label');
      (b.lines || []).forEach((l, i) => {
        if (typeof l !== 'string' || !l.trim()) fail(sc, b.label, `query line ${i} is empty`);
        if (/undefined|null/.test(l)) fail(sc, b.label, `query line ${i} shows an unrendered value: "${l}"`);
      });
    }
  }

  // a query result must not appear before the events it reports on
  const lastSubmit = beats.map((b, i) => (b.kind === 'submit' ? i : -1)).reduce((a, b) => Math.max(a, b), -1);
  const lineage = beats.findIndex((b) => b.kind === 'query' && /GetLineageByAsset|GetTraceMetrics/.test(b.label || ''));
  if (lineage > -1 && lastSubmit > lineage) {
    fail(sc, '', 'a lineage or metrics query is shown before a submission it includes');
  }
}

/* ── scope statements: a figure quoted on one tab must name its own scope ── */
const s2 = feed.scenarios.S2 || [];
const interop = s2.find((b) => b.kind === 'query' && /interoper/i.test(b.label || ''));
if (interop && !/LOT-/.test(interop.label)) {
  fail('S2', '', 'the interoperability beat quotes an event count without naming the lot it covers');
}

/* ── phase 2: provenance ─────────────────────────────────────────────────
 * Well-formed is not the same as true. This phase traces each displayed value
 * back to the artifact it claims to come from, so the console cannot show a
 * value the run did not produce.
 * ------------------------------------------------------------------------ */
const readJSON = (f) => { try { return JSON.parse(fs.readFileSync(path.join(R, f), 'utf8')); } catch { return null; } };
const readTxt = (f) => { try { return fs.readFileSync(path.join(R, f), 'utf8').trim(); } catch { return null; } };
const short = (h) => (h ? h.slice(0, 6) + '...' + h.slice(-5) : '-');

const events = {};
try {
  for (const f of fs.readdirSync(path.join(R, 'events'))) {
    const h = readJSON(path.join('events', f));
    if (h && h.eventID) events[h.eventID] = h;
  }
} catch { /* events not present */ }
const rejections = {};
try {
  for (const f of fs.readdirSync(path.join(R, 'rejections'))) {
    if (f.endsWith('.raw.txt')) continue;
    rejections[f.replace(/\.txt$/, '')] = readTxt(path.join('rejections', f));
  }
} catch { /* none */ }
const policies = (readTxt('policies.ndjson') || '').split('\n').filter(Boolean).map((l) => JSON.parse(l));

for (const [sc, beats] of Object.entries(feed.scenarios)) {
  for (const b of beats) {
    if (b.kind === 'submit') {
      const h = events[b.id];
      if (!h) { fail(sc, b.id, 'shown as anchored but no header artifact exists'); continue; }
      if (b.type !== h.eventType) fail(sc, b.id, `shows type ${b.type}, header says ${h.eventType}`);
      if (b.asset !== h.assetID) fail(sc, b.id, `shows asset ${b.asset}, header says ${h.assetID}`);
      if (b.actor !== h.actorOrg) fail(sc, b.id, `shows actor ${b.actor}, header says ${h.actorOrg}`);
      if (b.bind !== h.policyVersion) fail(sc, b.id, `shows policy ${b.bind}, header bound ${h.policyVersion}`);
      if (b.at !== h.boundAt) fail(sc, b.id, `shows time ${b.at}, header boundAt ${h.boundAt}`);
      if (b.bindHash !== short(h.policyHash)) fail(sc, b.id, 'shown hash does not abbreviate the bound hash');
      if (JSON.stringify(b.preds || []) !== JSON.stringify(h.predecessorIDs || []))
        fail(sc, b.id, 'shown predecessors differ from the header');
    } else if (b.kind === 'reject') {
      const src = rejections[b.id] || (/(^C1$|totality)/.test(b.id) ? readTxt('S0_totality_rejection.txt') : null);
      if (src === null || src === undefined) fail(sc, b.id, 'shows a rejection with no captured message behind it');
      else if (b.err.trim() !== src.trim()) fail(sc, b.id, 'displayed message differs from the captured file');
    } else if (b.kind === 'gov') {
      const act = b.act || 'AnchorPolicy';
      if (act === 'AnchorPolicy') {
        const p = policies.find((x) => x.version === b.v);
        if (!p) fail(sc, b.v, 'anchoring shown with no entry in policies.ndjson');
        else {
          if (b.hash !== short(p.hash)) fail(sc, b.v, 'shown hash does not abbreviate the anchored hash');
          if (b.ef !== p.effectiveFrom) fail(sc, b.v, `shows effectiveFrom ${b.ef}, registry says ${p.effectiveFrom}`);
        }
      } else if (act === 'ClearRecall') {
        const c = (readJSON('S1_recall_status.json') || {}).clearance;
        if (!c) fail(sc, act, 'clearance shown with no clearance artifact');
        else if (b.ef !== c.clearedAt || b.hash !== short(c.policyHash))
          fail(sc, act, 'clearance beat does not match the recorded clearance');
      } else if (act === 'OpenDispute' || act === 'ResolveDispute') {
        const d = readJSON('S5_dispute.json');
        const want = d && (act === 'OpenDispute' ? d.openedAt : d.resolvedAt);
        if (!d) fail(sc, act, 'dispute act shown with no dispute artifact');
        else if (b.ef !== want) fail(sc, act, `shows ${b.ef}, dispute artifact says ${want}`);
      } else if (act === 'DeclareEmergency') {
        const e = (readJSON('S5_emergencies.json') || [])[0];
        if (!e) fail(sc, act, 'emergency shown with no registry entry');
        else if (b.ef !== e.declaredAt || !b.note.includes(e.until) || !b.note.includes(short(e.decisionHash)))
          fail(sc, act, 'emergency beat omits or misstates its deadline, decision digest or time');
      }
    }
  }
}

console.log(`\nrendered ${Object.values(feed.scenarios).reduce((n, b) => n + b.length, 0)} beats across ${Object.keys(feed.scenarios).length} scenarios,`);
console.log('each traced back to the artifact it reports');
if (problems.length) {
  console.log(r(`\n${problems.length} presentation problem(s):`));
  problems.forEach((p) => console.log(r('  ' + p)));
  process.exit(1);
}
console.log(g('every rendered line is well formed, correctly scoped, and matches its source artifact'));
