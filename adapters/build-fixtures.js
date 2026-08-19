/**
 * adapters — four virtual source systems + one retailer system.
 *
 * Each adapter is a pure function: a source-shaped mock record in, a
 * NORMALISED { header, payload } out. The records below differ in field
 * names, casing, date formats and nesting exactly as real ERP/MES/TMS/LIMS
 * exports do. The chaincode contains zero source-system branches — so if the
 * same validation path accepts all of them, source-system agnosticism is
 * demonstrated rather than asserted (Paper 3 §6.1, claim R5).
 *
 * Run: node adapters/build-fixtures.js   → writes adapters/fixtures/*.json
 */
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'fixtures');
fs.mkdirSync(OUT, { recursive: true });

const SCHEMA = 'scmt-header-v1';

/* ── source-shaped mock records (deliberately heterogeneous) ────────────── */

const ERP_RECORDS = [
  // SAP-style: uppercase keys, DDMMYYYY dates, plant codes
  { MATNR: 'LOT-A', WERKS: 'PLANT-01', ERDAT: '20072026', ERZET: '090000', MENGE: 600, MEINS: 'KG',
    LIFNR: 'Producer', DOCTYPE: 'GOODS_RECEIPT', BATCH_REF: 'GR-88120', _evt: 'C1' },
  { MATNR: 'LOT-B', WERKS: 'PLANT-01', ERDAT: '20072026', ERZET: '090500', MENGE: 400, MEINS: 'KG',
    LIFNR: 'Producer', DOCTYPE: 'GOODS_RECEIPT', BATCH_REF: 'GR-88121', _evt: 'C2' },
  { MATNR: 'LOT-D', WERKS: 'PLANT-02', ERDAT: '20072026', ERZET: '091500', MENGE: 500, MEINS: 'KG',
    LIFNR: 'Producer', DOCTYPE: 'GOODS_RECEIPT', BATCH_REF: 'GR-88140', _evt: 'D1' },
  { MATNR: 'LOT-E', WERKS: 'PLANT-03', ERDAT: '20072026', ERZET: '090000', MENGE: 250, MEINS: 'KG',
    LIFNR: 'Producer', DOCTYPE: 'GOODS_RECEIPT', BATCH_REF: 'GR-88160', _evt: 'S3-R1' },
];

const MES_RECORDS = [
  // OPC-UA style: nested job structure, ISO timestamps, consumed/produced arrays
  { job: { id: 'JOB-4471', line: 'BLEND-2', operator: 'op-3392' },
    timestamps: { start: '2026-07-20T09:08:00Z', end: '2026-07-20T09:41:00Z' },
    consumed: [{ lot: 'LOT-A', qty: 600 }, { lot: 'LOT-B', qty: 400 }],
    produced: [{ lot: 'LOT-C', qty: 1000 }],
    org: 'Processor', _evt: 'T1' },
];

const TMS_RECORDS = [
  // Carrier/WMS style: shipment envelope, epoch seconds, snake_case
  { shipment_id: 'SHP-70021', consignment: 'LOT-C', from_party: 'Processor',
    to_party: 'Carrier', dispatch_epoch: 1784540820, mode: 'ROAD',
    vehicle: 'BG-4471-KH', seal_no: 'SEAL-99312', _evt: 'TR1' },
  { shipment_id: 'SHP-70044', consignment: 'LOT-D', from_party: 'Producer',
    to_party: 'Distributor', dispatch_epoch: 1784539800, mode: 'ROAD',
    vehicle: 'BG-2210-PA', seal_no: 'SEAL-99450', _evt: 'TD1' },
  { shipment_id: 'SHP-70051', consignment: 'LOT-D', from_party: 'Distributor',
    to_party: 'Retailer', dispatch_epoch: 1784542800, mode: 'ROAD',
    vehicle: 'BG-8890-KT', seal_no: 'SEAL-99477', _evt: 'TD2' },
  { shipment_id: 'SHP-70090', consignment: 'LOT-E', from_party: 'Producer',
    to_party: 'Warehouse', dispatch_epoch: 1784539200, mode: 'ROAD',
    vehicle: 'BG-1122-AM', seal_no: 'SEAL-99510', _evt: 'S3-R5' },
];

const LIMS_RECORDS = [
  // Laboratory style: sample/test/result triples, accreditation reference
  { sampleId: 'SMP-2211', subjectLot: 'LOT-C', lab: 'Laboratory',
    accreditation: 'ISO/IEC 17025:2017 · BG-ACC-118',
    tests: [{ analyte: 'Salmonella spp.', method: 'ISO 6579-1', result: 'NOT DETECTED' },
            { analyte: 'Moisture', method: 'AOAC 934.01', result: '11.4 %' }],
    reportedAt: '2026-07-20T09:53:00Z', verdict: 'PASS', _evt: 'V1' },
  { sampleId: 'SMP-2240', subjectLot: 'LOT-D', lab: 'Laboratory',
    accreditation: 'ISO/IEC 17025:2017 · BG-ACC-118',
    tests: [{ analyte: 'Heavy metals (Pb)', method: 'EN 14083', result: '<0.02 mg/kg' }],
    reportedAt: '2026-07-20T10:07:00Z', verdict: 'PASS', _evt: 'VD1' },
  { sampleId: 'SMP-2301', subjectLot: 'LOT-E', lab: 'Laboratory',
    accreditation: 'ISO/IEC 17025:2017 · BG-ACC-118',
    tests: [{ analyte: 'Moisture', method: 'AOAC 934.01', result: '10.8 %' }],
    reportedAt: '2026-07-20T09:05:00Z', verdict: 'PASS', _evt: 'S3-R2' },
  { sampleId: 'SMP-2302', subjectLot: 'LOT-E', lab: 'Laboratory',
    accreditation: 'ISO/IEC 17025:2017 · BG-ACC-118',
    tests: [{ analyte: 'Aflatoxin B1', method: 'EN 15851', result: '<0.1 µg/kg' }],
    reportedAt: '2026-07-20T09:09:00Z', verdict: 'PASS', _evt: 'S3-R3' },
  { sampleId: 'SMP-2340', subjectLot: 'LOT-E', lab: 'Laboratory',
    accreditation: 'ISO/IEC 17025:2017 · BG-ACC-118',
    tests: [{ analyte: 'Moisture (re-test)', method: 'AOAC 934.01', result: '10.6 %' }],
    reportedAt: '2026-07-20T09:16:00Z', verdict: 'PASS', _evt: 'S3-R4' },
];

const RETAILER_RECORDS = [
  { caseRef: 'RCL-2026-014', product: 'LOT-C', initiator: 'Retailer',
    reason: 'consumer complaint cluster — suspected contamination',
    authority: 'BFSA', openedAt: '2026-07-20T10:22:00Z', _evt: 'R1' },
];

/* ── adapters: source shape → normalised { header, payload } ────────────── */

// SAP-style ERDAT (DDMMYYYY) + ERZET (HHMMSS) → RFC3339
const sapTime = (d, t = '090000') =>
  `${d.slice(4)}-${d.slice(2, 4)}-${d.slice(0, 2)}T${t.slice(0, 2)}:${t.slice(2, 4)}:${t.slice(4)}Z`;

const erp = (r) => ({
  header: { eventID: r._evt, eventType: 'Create', assetID: r.MATNR, actorOrg: r.LIFNR,
            timestamp: sapTime(r.ERDAT, r.ERZET), predecessorIDs: [], schemaID: SCHEMA },
  payload: { eventID: r._evt, sourceSystem: 'ERP', document: r.DOCTYPE, reference: r.BATCH_REF,
             site: r.WERKS, quantity: { value: r.MENGE, unit: r.MEINS }, raw: r },
});

const mes = (r) => ({
  header: {
    eventID: r._evt, eventType: 'Transform', assetID: r.produced[0].lot, actorOrg: r.org,
    timestamp: r.timestamps.end, predecessorIDs: ['C1', 'C2'], schemaID: SCHEMA,
    transform: {
      inputs: r.consumed.map((c) => ({ assetID: c.lot, quantity: c.qty })),
      outputs: r.produced.map((p) => ({ assetID: p.lot, quantity: p.qty })),
      tolerance: 0.5,
    },
  },
  payload: { eventID: r._evt, sourceSystem: 'MES', job: r.job.id, line: r.job.line,
             durationMin: 33, raw: r },
});

const tms = (r, preds) => ({
  header: { eventID: r._evt, eventType: 'Transfer', assetID: r.consignment,
            actorOrg: r.from_party, newCustodian: r.to_party,
            timestamp: new Date(r.dispatch_epoch * 1000).toISOString().replace(/\.\d+/, ''),
            predecessorIDs: preds, schemaID: SCHEMA },
  payload: { eventID: r._evt, sourceSystem: 'TMS/WMS', shipment: r.shipment_id,
             mode: r.mode, vehicle: r.vehicle, seal: r.seal_no, raw: r },
});

const lims = (r, preds) => ({
  header: { eventID: r._evt, eventType: 'Verify', assetID: r.subjectLot, actorOrg: r.lab,
            timestamp: r.reportedAt, predecessorIDs: preds, schemaID: SCHEMA },
  payload: { eventID: r._evt, sourceSystem: 'LIMS', sample: r.sampleId,
             accreditation: r.accreditation, tests: r.tests, verdict: r.verdict, raw: r },
});

const retailer = (r, preds) => ({
  header: { eventID: r._evt, eventType: 'Recall', assetID: r.product, actorOrg: r.initiator,
            timestamp: r.openedAt, predecessorIDs: preds, schemaID: SCHEMA },
  payload: { eventID: r._evt, sourceSystem: 'Retailer system', case: r.caseRef,
             reason: r.reason, authority: r.authority, raw: r },
});

/* ── assemble the canonical fixture set ─────────────────────────────────── */

const byEvt = (arr, id) => arr.find((r) => r._evt === id);
const F = {};
const add = (o) => { F[o.header.eventID] = o; };

// S1 — LOT-C recall chain (six events, four source systems)
add(erp(byEvt(ERP_RECORDS, 'C1')));
add(erp(byEvt(ERP_RECORDS, 'C2')));
add(mes(byEvt(MES_RECORDS, 'T1')));
add(tms(byEvt(TMS_RECORDS, 'TR1'), ['T1']));
add(lims(byEvt(LIMS_RECORDS, 'V1'), ['TR1']));
add(retailer(byEvt(RETAILER_RECORDS, 'R1'), ['V1']));

// S2 — LOT-D audit chain (four events, no recall)
add(erp(byEvt(ERP_RECORDS, 'D1')));
add(tms(byEvt(TMS_RECORDS, 'TD1'), ['D1']));
add(lims(byEvt(LIMS_RECORDS, 'VD1'), ['TD1']));
add(tms(byEvt(TMS_RECORDS, 'TD2'), ['VD1']));

// S3 — LOT-E policy-binding chain (3 records under v1.0, 2 under v2.0)
add(erp(byEvt(ERP_RECORDS, 'S3-R1')));
add(lims(byEvt(LIMS_RECORDS, 'S3-R2'), ['S3-R1']));
add(lims(byEvt(LIMS_RECORDS, 'S3-R3'), ['S3-R2']));
add(lims(byEvt(LIMS_RECORDS, 'S3-R4'), ['S3-R3']));
add(tms(byEvt(TMS_RECORDS, 'S3-R5'), ['S3-R4']));

/* Negative-test fixtures — must be REJECTED by the chaincode.
   TR-X: Retailer attempts a Transfer while Carrier is custodian → custody continuity
   TR2 : Carrier attempts a Transfer after the recall lock is set → recall lock     */
F['TR-X'] = {
  header: { eventID: 'TR-X', eventType: 'Transfer', assetID: 'LOT-C', actorOrg: 'Retailer',
            newCustodian: 'Distributor', timestamp: '2026-07-20T09:58:00Z',
            predecessorIDs: ['V1'], schemaID: SCHEMA },
  payload: { eventID: 'TR-X', sourceSystem: 'TMS/WMS', note: 'negative test — wrong custodian' },
  expectReject: 'custody continuity',
};
F['TR2'] = {
  header: { eventID: 'TR2', eventType: 'Transfer', assetID: 'LOT-C', actorOrg: 'Carrier',
            newCustodian: 'Retailer', timestamp: '2026-07-20T10:31:00Z',
            predecessorIDs: ['R1'], schemaID: SCHEMA },
  payload: { eventID: 'TR2', sourceSystem: 'TMS/WMS', note: 'negative test — asset under recall' },
  expectReject: 'recall lock',
};

/* ── write fixtures ─────────────────────────────────────────────────────── */
let n = 0;
for (const [id, o] of Object.entries(F)) {
  fs.writeFileSync(path.join(OUT, `${id}.header.json`), JSON.stringify(o.header, null, 2));
  fs.writeFileSync(path.join(OUT, `${id}.payload.json`), JSON.stringify(o.payload, null, 2));
  n++;
}
const manifest = Object.entries(F).map(([id, o]) => ({
  eventID: id, eventType: o.header.eventType, assetID: o.header.assetID,
  actorOrg: o.header.actorOrg, sourceSystem: o.payload.sourceSystem || 'n/a',
  expectReject: o.expectReject || null,
}));
fs.writeFileSync(path.join(OUT, '_manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`fixtures written: ${n} events → ${OUT}`);
console.table(manifest);
