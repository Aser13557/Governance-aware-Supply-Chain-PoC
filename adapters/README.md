# adapters

Five pure mapping functions, one per source system. Each takes a source-shaped
record and returns the same normalised `{header, payload}` pair: the ERP
records are SAP-style with uppercase keys and split date/time fields, the MES
records a nested job with consumed/produced arrays, the TMS records a shipment
envelope with epoch seconds and snake_case, the LIMS records sample-test-result
structures with an accreditation reference.

The adapters are the only place source-system knowledge exists. The chaincode
receives normalised headers and never branches on provenance, which is what
scenario S1 tests.

`build-fixtures.js` also emits the negative fixtures. Each names the bracketed
tag its rejection must carry; the runner asserts the match.
