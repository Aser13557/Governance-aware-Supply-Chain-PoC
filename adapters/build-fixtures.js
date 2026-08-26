/**
 * adapters — five virtual source systems plus the negative-test fixtures.
 *
 * Each adapter is a pure function: a source-shaped mock record in, a
 * NORMALISED { header, payload } out. The records below differ in field names,
 * casing, date formats and nesting exactly as real ERP/MES/TMS/LIMS exports do.
 * The chaincode contains no source-system branches, so if one validation path
 * accepts all of them, source-system agnosticism is demonstrated rather than
 * asserted.
 *
 * Run: node adapters/build-fixtures.js  → adapters/fixtures/*.json
 */
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'fixtures');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const SCHEMA = 'scmt-header-v1';
const F = {};
const add = (o) => { F[o.header.eventID] = o; };

/* ── adapters: source shape → normalised { header, payload } ─────────────── */

// SAP-style: uppercase keys, DDMMYYYY date plus HHMMSS time, plant codes
const erp = (r) => ({
  header: {
    eventID: r._evt, eventType: 'Create', assetID: r.MATNR, actorOrg: r.LIFNR,
    timestamp: `${r.ERDAT.slice(4)}-${r.ERDAT.slice(2, 4)}-${r.ERDAT.slice(0, 2)}T${r.ERZET.slice(0, 2)}:${r.ERZET.slice(2, 4)}:${r.ERZET.slice(4)}Z`,
    predecessorIDs: [], schemaID: SCHEMA,
    quantity: { value: r.MENGE, unit: r.MEINS },
  },
  payload: {
    eventID: r._evt, sourceSystem: 'ERP', document: r.DOCTYPE, reference: r.BATCH_REF,
    site: r.WERKS, quantity: { value: r.MENGE, unit: r.MEINS }, raw: r,
  },
});

// OPC-UA style: nested job, ISO timestamps, consumed/produced arrays
const mes = (r) => ({
  header: {
    eventID: r._evt, eventType: 'Transform', assetID: r.produced[0].lot, actorOrg: r.org,
    timestamp: r.timestamps.end, predecessorIDs: r._preds, schemaID: SCHEMA,
    transform: {
      inputs: r.consumed.map((c) => ({ assetID: c.lot, quantity: c.qty })),
      outputs: r.produced.map((p) => ({ assetID: p.lot, quantity: p.qty })),
      unit: r.unit,
    },
  },
  payload: {
    eventID: r._evt, sourceSystem: 'MES', job: r.job.id, line: r.job.line, raw: r,
  },
});

// Carrier/WMS style: shipment envelope, epoch seconds, snake_case
const tms = (r) => ({
  header: {
    eventID: r._evt, eventType: 'Transfer', assetID: r.consignment,
    actorOrg: r.from_party, newCustodian: r.to_party,
    timestamp: new Date(r.dispatch_epoch * 1000).toISOString().replace(/\.\d+/, ''),
    predecessorIDs: r._preds, schemaID: SCHEMA,
  },
  payload: {
    eventID: r._evt, sourceSystem: 'TMS/WMS', shipment: r.shipment_id,
    mode: r.mode, vehicle: r.vehicle, seal: r.seal_no, raw: r,
  },
});

// Laboratory style: sample/test/result triples with an accreditation reference
const lims = (r) => ({
  header: {
    eventID: r._evt, eventType: 'Verify', assetID: r.subjectLot, actorOrg: r.lab,
    timestamp: r.reportedAt, predecessorIDs: r._preds, schemaID: SCHEMA,
  },
  payload: {
    eventID: r._evt, sourceSystem: 'LIMS', sample: r.sampleId,
    accreditation: r.accreditation, tests: r.tests, verdict: r.verdict, raw: r,
  },
});

const retailer = (r) => ({
  header: {
    eventID: r._evt, eventType: 'Recall', assetID: r.product, actorOrg: r.initiator,
    timestamp: r.openedAt, predecessorIDs: r._preds, schemaID: SCHEMA,
  },
  payload: {
    eventID: r._evt, sourceSystem: 'Retailer system', case: r.caseRef,
    reason: r.reason, authority: r.authority, raw: r,
  },
});

const ACC = 'ISO/IEC 17025:2017 · BG-ACC-118';

/* ── S1 · LOT-C recall investigation ─────────────────────────────────────── */

add(erp({ MATNR: 'LOT-A', WERKS: 'PLANT-01', ERDAT: '20072026', ERZET: '090000',
  MENGE: 600, MEINS: 'KG', LIFNR: 'Producer', DOCTYPE: 'GOODS_RECEIPT', BATCH_REF: 'GR-88120', _evt: 'C1' }));
add(erp({ MATNR: 'LOT-B', WERKS: 'PLANT-01', ERDAT: '20072026', ERZET: '090500',
  MENGE: 400, MEINS: 'KG', LIFNR: 'Producer', DOCTYPE: 'GOODS_RECEIPT', BATCH_REF: 'GR-88121', _evt: 'C2' }));
add(mes({ job: { id: 'JOB-4471', line: 'BLEND-2' },
  timestamps: { start: '2026-07-20T09:08:00Z', end: '2026-07-20T09:41:00Z' },
  consumed: [{ lot: 'LOT-A', qty: 600 }, { lot: 'LOT-B', qty: 400 }],
  produced: [{ lot: 'LOT-C', qty: 1000 }], unit: 'KG',
  org: 'Processor', _preds: ['C1', 'C2'], _evt: 'T1' }));
add(tms({ shipment_id: 'SHP-70021', consignment: 'LOT-C', from_party: 'Processor',
  to_party: 'Carrier', dispatch_epoch: 1784540820, mode: 'ROAD',
  vehicle: 'BG-4471-KH', seal_no: 'SEAL-99312', _preds: ['T1'], _evt: 'TR1' }));
add(lims({ sampleId: 'SMP-2211', subjectLot: 'LOT-C', lab: 'Laboratory', accreditation: ACC,
  tests: [{ analyte: 'Salmonella spp.', method: 'ISO 6579-1', result: 'NOT DETECTED' }],
  reportedAt: '2026-07-20T09:53:00Z', verdict: 'PASS', _preds: ['TR1'], _evt: 'V1' }));
add(retailer({ caseRef: 'RCL-2026-014', product: 'LOT-C', initiator: 'Retailer',
  reason: 'consumer complaint cluster - suspected contamination', authority: 'BFSA',
  openedAt: '2026-07-20T10:22:00Z', _preds: ['V1'], _evt: 'R1' }));
// after the recall is cleared, the same custodian transfers onward
add(tms({ shipment_id: 'SHP-70099', consignment: 'LOT-C', from_party: 'Carrier',
  to_party: 'Retailer', dispatch_epoch: 1784545200, mode: 'ROAD',
  vehicle: 'BG-9911-CT', seal_no: 'SEAL-99600', _preds: ['R1'], _evt: 'TR3' }));

/* ── S2 · LOT-D audit pack ───────────────────────────────────────────────── */

add(erp({ MATNR: 'LOT-D', WERKS: 'PLANT-02', ERDAT: '20072026', ERZET: '091500',
  MENGE: 500, MEINS: 'KG', LIFNR: 'Producer', DOCTYPE: 'GOODS_RECEIPT', BATCH_REF: 'GR-88140', _evt: 'D1' }));
add(tms({ shipment_id: 'SHP-70044', consignment: 'LOT-D', from_party: 'Producer',
  to_party: 'Distributor', dispatch_epoch: 1784539800, mode: 'ROAD',
  vehicle: 'BG-2210-PA', seal_no: 'SEAL-99450', _preds: ['D1'], _evt: 'TD1' }));
add(lims({ sampleId: 'SMP-2240', subjectLot: 'LOT-D', lab: 'Laboratory', accreditation: ACC,
  tests: [{ analyte: 'Heavy metals (Pb)', method: 'EN 14083', result: '<0.02 mg/kg' }],
  reportedAt: '2026-07-20T10:07:00Z', verdict: 'PASS', _preds: ['TD1'], _evt: 'VD1' }));
add(tms({ shipment_id: 'SHP-70051', consignment: 'LOT-D', from_party: 'Distributor',
  to_party: 'Retailer', dispatch_epoch: 1784542800, mode: 'ROAD',
  vehicle: 'BG-8890-KT', seal_no: 'SEAL-99477', _preds: ['VD1'], _evt: 'TD2' }));

/* ── S3 · LOT-E policy binding, plus the policy-effect pair ──────────────── */

add(erp({ MATNR: 'LOT-E', WERKS: 'PLANT-03', ERDAT: '20072026', ERZET: '090000',
  MENGE: 250, MEINS: 'KG', LIFNR: 'Producer', DOCTYPE: 'GOODS_RECEIPT', BATCH_REF: 'GR-88160', _evt: 'S3-R1' }));
add(lims({ sampleId: 'SMP-2301', subjectLot: 'LOT-E', lab: 'Laboratory', accreditation: ACC,
  tests: [{ analyte: 'Moisture', method: 'AOAC 934.01', result: '10.8 %' }],
  reportedAt: '2026-07-20T09:05:00Z', verdict: 'PASS', _preds: ['S3-R1'], _evt: 'S3-R2' }));
add(lims({ sampleId: 'SMP-2302', subjectLot: 'LOT-E', lab: 'Laboratory', accreditation: ACC,
  tests: [{ analyte: 'Aflatoxin B1', method: 'EN 15851', result: '<0.1 ug/kg' }],
  reportedAt: '2026-07-20T09:09:00Z', verdict: 'PASS', _preds: ['S3-R2'], _evt: 'S3-R3' }));
add(lims({ sampleId: 'SMP-2340', subjectLot: 'LOT-E', lab: 'Laboratory', accreditation: ACC,
  tests: [{ analyte: 'Moisture (re-test)', method: 'AOAC 934.01', result: '10.6 %' }],
  reportedAt: '2026-07-20T09:16:00Z', verdict: 'PASS', _preds: ['S3-R3'], _evt: 'S3-R4' }));
add(tms({ shipment_id: 'SHP-70090', consignment: 'LOT-E', from_party: 'Producer',
  to_party: 'Warehouse', dispatch_epoch: 1784539200, mode: 'ROAD',
  vehicle: 'BG-1122-AM', seal_no: 'SEAL-99510', _preds: ['S3-R4'], _evt: 'S3-R5' }));

// Policy-effect pair: an identical 0.4 KG imbalance, once under each regime.
// Accepted under v1.0 (tolerance 0.5); rejected under v2.0 (tolerance 0.25).
add(erp({ MATNR: 'LOT-F', WERKS: 'PLANT-03', ERDAT: '20072026', ERZET: '093000',
  MENGE: 1000, MEINS: 'KG', LIFNR: 'Producer', DOCTYPE: 'GOODS_RECEIPT', BATCH_REF: 'GR-88170', _evt: 'S3-P1' }));
add(mes({ job: { id: 'JOB-4490', line: 'DRY-1' },
  timestamps: { start: '2026-07-20T09:32:00Z', end: '2026-07-20T09:35:00Z' },
  consumed: [{ lot: 'LOT-F', qty: 1000 }], produced: [{ lot: 'LOT-G', qty: 999.6 }],
  unit: 'KG', org: 'Producer', _preds: ['S3-P1'], _evt: 'S3-P2' }));
add(erp({ MATNR: 'LOT-H', WERKS: 'PLANT-03', ERDAT: '20072026', ERZET: '094000',
  MENGE: 1000, MEINS: 'KG', LIFNR: 'Producer', DOCTYPE: 'GOODS_RECEIPT', BATCH_REF: 'GR-88180', _evt: 'S3-P3' }));
add(mes({ job: { id: 'JOB-4491', line: 'DRY-1' },
  timestamps: { start: '2026-07-20T09:42:00Z', end: '2026-07-20T09:45:00Z' },
  consumed: [{ lot: 'LOT-H', qty: 1000 }], produced: [{ lot: 'LOT-I', qty: 999.6 }],
  unit: 'KG', org: 'Producer', _preds: ['S3-P3'], _evt: 'S3-P4' }));

/* ── negative fixtures ───────────────────────────────────────────────────────
   Each isolates one condition. `expectReject` names the bracketed tag the
   chaincode must return, and the runner asserts the tag matches — a rejection
   for the wrong reason is treated as a failure, not a pass.                  */

const neg = (id, header, payload, expectReject) =>
  add({ header: { eventID: id, schemaID: SCHEMA, ...header }, payload: { eventID: id, ...payload }, expectReject });

// custody continuity: a party that is not the current custodian moves the lot
neg('N-CUSTODY', {
  eventType: 'Transfer', assetID: 'LOT-C', actorOrg: 'Retailer', newCustodian: 'Distributor',
  timestamp: '2026-07-20T09:58:00Z', predecessorIDs: ['V1'],
}, { note: 'negative test - submitter is not the custodian' }, 'custody continuity');

// recall lock: the correct custodian moves a lot that is under recall
neg('N-RECALL-TRANSFER', {
  eventType: 'Transfer', assetID: 'LOT-C', actorOrg: 'Carrier', newCustodian: 'Retailer',
  timestamp: '2026-07-20T10:31:00Z', predecessorIDs: ['R1'],
}, { note: 'negative test - asset under recall' }, 'recall lock');

// recall lock: a recalled lot may not be transformed out of the recall either
neg('N-RECALL-TRANSFORM', {
  eventType: 'Transform', assetID: 'LOT-Z', actorOrg: 'Carrier',
  timestamp: '2026-07-20T10:33:00Z', predecessorIDs: ['R1'],
  transform: { inputs: [{ assetID: 'LOT-C', quantity: 1000 }], outputs: [{ assetID: 'LOT-Z', quantity: 1000 }], unit: 'KG' },
}, { note: 'negative test - transforming a recalled lot' }, 'recall lock');

// quantity conservation: imbalance beyond the tolerance in force
neg('N-QTY-TOLERANCE', {
  eventType: 'Transform', assetID: 'LOT-Q1', actorOrg: 'Producer',
  timestamp: '2026-07-20T11:00:00Z', predecessorIDs: ['D1'],
  transform: { inputs: [{ assetID: 'LOT-D', quantity: 100 }], outputs: [{ assetID: 'LOT-Q1', quantity: 90 }], unit: 'KG' },
}, { note: 'negative test - 10 KG imbalance' }, 'quantity conservation');

// quantity conservation: consuming more of a lot than remains
neg('N-QTY-AVAILABLE', {
  eventType: 'Transform', assetID: 'LOT-Q2', actorOrg: 'Producer',
  timestamp: '2026-07-20T11:02:00Z', predecessorIDs: ['D1'],
  transform: { inputs: [{ assetID: 'LOT-D', quantity: 5000 }], outputs: [{ assetID: 'LOT-Q2', quantity: 5000 }], unit: 'KG' },
}, { note: 'negative test - input exceeds remaining quantity' }, 'quantity conservation');

// quantity conservation: units that cannot be balanced
neg('N-QTY-UNIT', {
  eventType: 'Transform', assetID: 'LOT-Q3', actorOrg: 'Producer',
  timestamp: '2026-07-20T11:04:00Z', predecessorIDs: ['D1'],
  transform: { inputs: [{ assetID: 'LOT-D', quantity: 100 }], outputs: [{ assetID: 'LOT-Q3', quantity: 100 }], unit: 'L' },
}, { note: 'negative test - litres against kilograms' }, 'quantity conservation');

// verification integrity: the attestation digest is not a SHA-256 value
neg('N-VERIFY-DIGEST', {
  eventType: 'Verify', assetID: 'LOT-D', actorOrg: 'Laboratory',
  timestamp: '2026-07-20T11:06:00Z', predecessorIDs: ['TD2'],
  _forcePayloadHash: 'not-a-digest',
}, { note: 'negative test - malformed attestation digest' }, 'verification integrity');

// verification integrity (v2.0 only): the custodian attests to its own lot
neg('N-VERIFY-SELF', {
  eventType: 'Verify', assetID: 'LOT-E', actorOrg: 'Warehouse',
  timestamp: '2026-07-20T11:08:00Z', predecessorIDs: ['S3-R5'],
}, { note: 'negative test - self-attestation by the current custodian' }, 'verification integrity');

// asset state: a lot fully consumed by a transformation can no longer move
neg('N-CONSUMED', {
  eventType: 'Transfer', assetID: 'LOT-A', actorOrg: 'Producer', newCustodian: 'Carrier',
  timestamp: '2026-07-20T11:10:00Z', predecessorIDs: ['T1'],
}, { note: 'negative test - transferring a consumed lot' }, 'asset');

// schema: an event type outside the five-event vocabulary
neg('N-SCHEMA-TYPE', {
  eventType: 'Inspect', assetID: 'LOT-D', actorOrg: 'Laboratory',
  timestamp: '2026-07-20T11:12:00Z', predecessorIDs: [],
}, { note: 'negative test - unknown event type' }, 'schema');

// lineage: a predecessor that was never anchored
neg('N-PREDECESSOR', {
  eventType: 'Verify', assetID: 'LOT-D', actorOrg: 'Laboratory',
  timestamp: '2026-07-20T11:14:00Z', predecessorIDs: ['NO-SUCH-EVENT'],
}, { note: 'negative test - unknown predecessor' }, 'lineage');

// duplicate: re-anchoring an existing event identifier
neg('N-DUPLICATE', {
  eventType: 'Create', assetID: 'LOT-DUP', actorOrg: 'Producer',
  timestamp: '2026-07-20T11:16:00Z', predecessorIDs: [],
  quantity: { value: 10, unit: 'KG' }, _forceEventID: 'D1',
}, { note: 'negative test - duplicate event identifier' }, 'duplicate');

/* ── write ───────────────────────────────────────────────────────────────── */

let n = 0;
for (const [id, o] of Object.entries(F)) {
  const hdr = { ...o.header };
  if (hdr._forceEventID) { hdr.eventID = hdr._forceEventID; delete hdr._forceEventID; }
  delete hdr._forcePayloadHash;
  fs.writeFileSync(path.join(OUT, `${id}.header.json`), JSON.stringify(hdr, null, 2));
  fs.writeFileSync(path.join(OUT, `${id}.payload.json`), JSON.stringify(o.payload, null, 2));
  if (o.header._forcePayloadHash) {
    fs.writeFileSync(path.join(OUT, `${id}.forcehash`), o.header._forcePayloadHash);
  }
  n++;
}
const manifest = Object.entries(F).map(([id, o]) => ({
  eventID: id, eventType: o.header.eventType, assetID: o.header.assetID,
  actorOrg: o.header.actorOrg, sourceSystem: o.payload.sourceSystem || 'n/a',
  expectReject: o.expectReject || null,
}));
fs.writeFileSync(path.join(OUT, '_manifest.json'), JSON.stringify(manifest, null, 2));

const pos = manifest.filter((m) => !m.expectReject).length;
console.log(`fixtures written: ${n} events (${pos} admissible, ${n - pos} negative tests) -> ${OUT}`);
