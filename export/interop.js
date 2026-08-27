#!/usr/bin/env node
/**
 * interop.js - the export half of semantic interoperability (R1).
 *
 * The adapters normalise heterogeneous source records INTO the evidence
 * schema. These mappings take the anchored evidence back OUT into the two
 * vocabularies the architecture claims compatibility with, so the claim is
 * demonstrated in both directions rather than only at ingestion.
 *
 * Mapping follows the conceptual model §3.3 and the architecture's Table IV:
 *   Create, Transfer, Verify, Recall  -> EPCIS ObjectEvent
 *   Transform                          -> EPCIS TransformationEvent
 *   lineage links                      -> PROV derivation relations
 *   actor organization                 -> PROV agent attribution
 *
 * The exports are compatible in structure and vocabulary. No conformance
 * certification is claimed, which matches the bounded interoperability claim
 * the architecture itself makes.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const RESULTS = path.join(ROOT, 'results');
const CHANNEL = process.env.CHANNEL || 'mychannel';
const CC = process.env.CC_NAME || 'evidence';

const ccQuery = (fn, ...args) => JSON.parse(execFileSync('peer',
  ['chaincode', 'query', '-C', CHANNEL, '-n', CC, '-c', JSON.stringify({ function: fn, Args: args })],
  { encoding: 'utf8', env: process.env }).trim());

const g = (s) => `\x1b[0;32m${s}\x1b[0m`;
const urn = (id) => `urn:evidence:event:${id}`;
const lot = (id) => `urn:evidence:lot:${id}`;
const org = (o) => `urn:evidence:org:${encodeURIComponent(o)}`;

/* ── EPCIS 2.0 / CBV ─────────────────────────────────────────────────────── */

// CBV business steps for the five verbs. Recall has no exact CBV step, so it
// maps to the closest published step and the divergence is recorded in the
// document rather than hidden.
const BIZ_STEP = {
  Create:    'urn:epcglobal:cbv:bizstep:commissioning',
  Transform: 'urn:epcglobal:cbv:bizstep:commissioning',
  Transfer:  'urn:epcglobal:cbv:bizstep:shipping',
  Verify:    'urn:epcglobal:cbv:bizstep:inspecting',
  Recall:    'urn:epcglobal:cbv:bizstep:holding',
};
const DISPOSITION = {
  Create:    'urn:epcglobal:cbv:disp:active',
  Transform: 'urn:epcglobal:cbv:disp:active',
  Transfer:  'urn:epcglobal:cbv:disp:in_transit',
  Verify:    'urn:epcglobal:cbv:disp:active',
  Recall:    'urn:epcglobal:cbv:disp:recalled',
};

function epcisEvent(h) {
  const base = {
    eventID: urn(h.eventID),
    eventTime: h.timestamp,
    recordTime: h.boundAt,
    eventTimeZoneOffset: '+00:00',
    bizStep: BIZ_STEP[h.eventType],
    disposition: DISPOSITION[h.eventType],
    'evidence:actorOrg': h.actorOrg,
    'evidence:policyHash': h.policyHash,
    'evidence:policyVersion': h.policyVersion,
    'evidence:payloadHash': h.payloadHash,
    'evidence:predecessorIDs': (h.predecessorIDs || []).map(urn),
  };
  if (h.eventType === 'Transform') {
    return {
      type: 'TransformationEvent',
      ...base,
      inputEPCList: h.transform.inputs.map((i) => lot(i.assetID)),
      outputEPCList: h.transform.outputs.map((o) => lot(o.assetID)),
      inputQuantityList: h.transform.inputs.map((i) => ({ epcClass: lot(i.assetID), quantity: i.quantity, uom: h.transform.unit })),
      outputQuantityList: h.transform.outputs.map((o) => ({ epcClass: lot(o.assetID), quantity: o.quantity, uom: h.transform.unit })),
    };
  }
  const ev = { type: 'ObjectEvent', ...base, action: h.eventType === 'Create' ? 'ADD' : 'OBSERVE', epcList: [lot(h.assetID)] };
  if (h.eventType === 'Create' && h.quantity) {
    ev.quantityList = [{ epcClass: lot(h.assetID), quantity: h.quantity.value, uom: h.quantity.unit }];
  }
  if (h.eventType === 'Transfer') {
    ev.sourceList = [{ type: 'urn:epcglobal:cbv:sdt:owning_party', source: org(h.actorOrg) }];
    ev.destinationList = [{ type: 'urn:epcglobal:cbv:sdt:owning_party', destination: org(h.newCustodian) }];
  }
  return ev;
}

function epcis(assetID) {
  const lineage = ccQuery('GetLineageByAsset', assetID);
  const headers = [...lineage.nodes]
    .sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1))
    .map((n) => ccQuery('GetHeader', n.eventID));

  const doc = {
    '@context': [
      'https://ref.gs1.org/standards/epcis/2.0.0/epcis-context.jsonld',
      { evidence: 'urn:evidence:vocab:' },
    ],
    type: 'EPCISDocument',
    schemaVersion: '2.0',
    creationDate: new Date().toISOString(),
    'evidence:scope': lot(assetID),
    'evidence:mappingNote':
      'Create/Transfer/Verify/Recall map to ObjectEvent and Transform to TransformationEvent, per the conceptual model. ' +
      'Recall has no exact CBV business step; it is expressed as holding with disposition recalled, and the divergence is stated here rather than concealed. ' +
      'Structural and vocabulary compatibility is claimed; conformance certification is not.',
    epcisBody: { eventList: headers.map(epcisEvent) },
  };
  fs.writeFileSync(path.join(RESULTS, 'S2_epcis_export.json'), JSON.stringify(doc, null, 2));
  const kinds = doc.epcisBody.eventList.reduce((a, e) => (a[e.type] = (a[e.type] || 0) + 1, a), {});
  console.log(`   ${g('PASS')} EPCIS 2.0 export - ${headers.length} events (` +
    Object.entries(kinds).map(([k, v]) => `${v} ${k}`).join(', ') + `) -> results/S2_epcis_export.json`);
  return doc;
}

/* ── PROV-O ──────────────────────────────────────────────────────────────── */

function prov(assetID) {
  const lineage = ccQuery('GetLineageByAsset', assetID);
  const headers = [...lineage.nodes]
    .sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1))
    .map((n) => ccQuery('GetHeader', n.eventID));

  const graph = [];
  const agents = new Set();
  const entities = new Set();

  for (const h of headers) {
    agents.add(h.actorOrg);

    // every event is an Activity attributed to the submitting organization
    const activity = {
      '@id': urn(h.eventID),
      '@type': 'prov:Activity',
      'prov:startedAtTime': h.timestamp,
      'prov:wasAssociatedWith': { '@id': org(h.actorOrg) },
      'evidence:eventType': h.eventType,
      'evidence:policyHash': h.policyHash,
      'evidence:policyVersion': h.policyVersion,
    };
    // lineage links are derivation relations between activities
    if ((h.predecessorIDs || []).length) {
      activity['prov:wasInformedBy'] = h.predecessorIDs.map((p) => ({ '@id': urn(p) }));
    }
    graph.push(activity);

    if (h.eventType === 'Transform') {
      for (const i of h.transform.inputs) {
        entities.add(i.assetID);
        activity['prov:used'] = (activity['prov:used'] || []).concat([{ '@id': lot(i.assetID) }]);
      }
      for (const o of h.transform.outputs) {
        entities.add(o.assetID);
        graph.push({
          '@id': lot(o.assetID),
          '@type': 'prov:Entity',
          'prov:wasGeneratedBy': { '@id': urn(h.eventID) },
          'prov:wasAttributedTo': { '@id': org(h.actorOrg) },
          'prov:wasDerivedFrom': h.transform.inputs.map((i) => ({ '@id': lot(i.assetID) })),
        });
      }
    } else {
      entities.add(h.assetID);
      if (h.eventType === 'Create') {
        graph.push({
          '@id': lot(h.assetID),
          '@type': 'prov:Entity',
          'prov:wasGeneratedBy': { '@id': urn(h.eventID) },
          'prov:wasAttributedTo': { '@id': org(h.actorOrg) },
        });
      } else {
        activity['prov:used'] = [{ '@id': lot(h.assetID) }];
      }
    }
  }
  for (const a of agents) {
    graph.push({ '@id': org(a), '@type': 'prov:Agent', 'prov:label': a });
  }

  const doc = {
    '@context': {
      prov: 'http://www.w3.org/ns/prov#',
      evidence: 'urn:evidence:vocab:',
    },
    'evidence:scope': lot(assetID),
    'evidence:mappingNote':
      'Events map to prov:Activity, lots to prov:Entity, organizations to prov:Agent; ' +
      'predecessor links become prov:wasInformedBy and transformation inputs become prov:wasDerivedFrom.',
    '@graph': graph,
  };
  fs.writeFileSync(path.join(RESULTS, 'S2_prov_export.json'), JSON.stringify(doc, null, 2));
  const counts = graph.reduce((a, n) => (a[n['@type']] = (a[n['@type']] || 0) + 1, a), {});
  console.log(`   ${g('PASS')} PROV-O export - ` +
    Object.entries(counts).map(([k, v]) => `${v} ${k.replace('prov:', '')}`).join(', ') +
    ` -> results/S2_prov_export.json`);
  return doc;
}

/* ── cross-check ─────────────────────────────────────────────────────────── */

function verify(assetID) {
  const e = JSON.parse(fs.readFileSync(path.join(RESULTS, 'S2_epcis_export.json'), 'utf8'));
  const p = JSON.parse(fs.readFileSync(path.join(RESULTS, 'S2_prov_export.json'), 'utf8'));
  const lineage = ccQuery('GetLineageByAsset', assetID);

  const epcisIds = e.epcisBody.eventList.map((x) => x.eventID).sort();
  const provActs = p['@graph'].filter((n) => n['@type'] === 'prov:Activity').map((n) => n['@id']).sort();
  const anchored = lineage.nodes.map((n) => urn(n.eventID)).sort();

  const report = {
    asset: assetID,
    anchoredEvents: anchored.length,
    epcisEvents: epcisIds.length,
    provActivities: provActs.length,
    everyAnchoredEventExported: JSON.stringify(epcisIds) === JSON.stringify(anchored)
                             && JSON.stringify(provActs) === JSON.stringify(anchored),
    everyExportedEventCarriesItsPolicyReference:
      e.epcisBody.eventList.every((x) => !!x['evidence:policyHash']) &&
      p['@graph'].filter((n) => n['@type'] === 'prov:Activity').every((n) => !!n['evidence:policyHash']),
    transformationsAsTransformationEvents:
      e.epcisBody.eventList.filter((x) => x.type === 'TransformationEvent').length ===
      lineage.nodes.filter((n) => n.eventType === 'Transform').length,
    generatedAt: new Date().toISOString(),
  };
  report.verdict = report.everyAnchoredEventExported
    && report.everyExportedEventCarriesItsPolicyReference
    && report.transformationsAsTransformationEvents;

  fs.writeFileSync(path.join(RESULTS, 'S2_interop_check.json'), JSON.stringify(report, null, 2));
  console.log(`   ${report.verdict ? g('PASS') : '\x1b[0;31mFAIL\x1b[0m'} interoperability check - ` +
    `${report.anchoredEvents} anchored events exported to both vocabularies, each carrying its policy reference`);
  if (!report.verdict) process.exit(1);
}

(() => {
  const [cmd, a] = process.argv.slice(2);
  try {
    if (cmd === 'epcis') epcis(a);
    else if (cmd === 'prov') prov(a);
    else if (cmd === 'all') { epcis(a); prov(a); verify(a); }
    else {
      console.error('usage: interop.js epcis <asset> | prov <asset> | all <asset>');
      process.exit(1);
    }
  } catch (err) {
    console.error('interop export failed:', err.message);
    process.exit(1);
  }
})();
