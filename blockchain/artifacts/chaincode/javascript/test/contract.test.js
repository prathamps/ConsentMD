'use strict';

const { expect } = require('chai');
const MedicalConsentContract = require('../lib/MedicalConsentContract');
const { FakeStub, FakeClientIdentity, makeCtx } = require('./support/FakeStub');

// Org1 = doctors, Org2 = patients. (The READMEs had this inverted; the CA
// enrollment script and the API bootstrap are the ground truth.)
const DOC1 = new FakeClientIdentity('x509::/CN=bench-doctor-000', 'Org1MSP', { organization: 'doctor' });
const DOC2 = new FakeClientIdentity('x509::/CN=bench-doctor-001', 'Org1MSP', { organization: 'doctor' });
const PAT1 = new FakeClientIdentity('x509::/CN=bench-patient-000', 'Org2MSP', { organization: 'patient' });
const PAT2 = new FakeClientIdentity('x509::/CN=bench-patient-001', 'Org2MSP', { organization: 'patient' });
/** Threat model P2: the API's own identity -- enrolled, valid, but no role attribute. */
const SERVICE = new FakeClientIdentity('x509::/CN=consentmd-api-service', 'Org1MSP', {});

const denied = async (fn) => {
  try {
    await fn();
  } catch (e) {
    return e;
  }
  throw new Error('expected the call to be denied, but it succeeded');
};

describe('MedicalConsentContract', () => {
  let cc;
  let stub;
  let n;

  const as = (identity) => makeCtx(stub, identity);
  const tx = (id) => {
    stub.setTxId(id || `tx${++n}`);
    return stub;
  };

  beforeEach(async () => {
    cc = new MedicalConsentContract();
    stub = new FakeStub();
    n = 0;
    tx('tx-profile-1');
    await cc.registerDoctorProfile(as(DOC1), 'Dr Alice', 'cardiology');
    tx('tx-profile-2');
    await cc.registerDoctorProfile(as(DOC2), 'Dr Bob', 'oncology');
  });

  const createRecord = async (identity = PAT1, txId = 'tx-rec-1') => {
    tx(txId);
    return JSON.parse(
      await cc.createPatientRecord(as(identity), 'scan.pdf', 'records/org2/abc/scan.pdf', 'a'.repeat(64), 'chest x-ray')
    );
  };

  describe('doctor profiles', () => {
    it('round-trips through the composite key (the write/read mismatch bug)', async () => {
      const profile = JSON.parse(await cc.getDoctorProfile(as(PAT1), DOC1.getID()));
      expect(profile.name).to.equal('Dr Alice');
      expect(profile.doctorId).to.equal(DOC1.getID());
    });

    it('refuses registration from a patient', async () => {
      const err = await denied(() => cc.registerDoctorProfile(as(PAT1), 'Not A Doctor', 'x'));
      expect(err.code).to.equal('ACCESS_DENIED');
    });

    it('refuses registration from an identity with no role attribute (P2)', async () => {
      const err = await denied(() => cc.registerDoctorProfile(as(SERVICE), 'Service', 'x'));
      expect(err.code).to.equal('ACCESS_DENIED');
    });
  });

  describe('record creation', () => {
    it('assigns a tx-derived id and records the owner from the certificate', async () => {
      const rec = await createRecord();
      expect(rec.recordId).to.equal('record_tx-rec-1');
      expect(rec.patientId).to.equal(PAT1.getID());
      expect(rec.archived).to.equal(false);
    });

    it('produces a real ISO timestamp, not epoch 0', async () => {
      const rec = await createRecord();
      expect(rec.createdAt).to.match(/^20\d\d-/);
      expect(new Date(rec.createdAt).getTime()).to.be.greaterThan(1_600_000_000_000);
    });

    it('refuses record creation by a doctor on the patient path', async () => {
      const err = await denied(() => cc.createPatientRecord(as(DOC1), 'f', 'k', 'h', 'd'));
      expect(err.code).to.equal('ACCESS_DENIED');
    });
  });

  describe('consent and the read rule', () => {
    it('lets the owning patient read their own record without any consent', async () => {
      const rec = await createRecord();
      const read = JSON.parse(await cc.getRecordById(as(PAT1), rec.recordId));
      expect(read.recordId).to.equal(rec.recordId);
    });

    it('denies a doctor with no consent', async () => {
      const rec = await createRecord();
      const err = await denied(() => cc.getRecordById(as(DOC1), rec.recordId));
      expect(err.code).to.equal('ACCESS_DENIED');
    });

    it('allows a doctor after consent is granted', async () => {
      const rec = await createRecord();
      tx('tx-grant-1');
      await cc.grantConsent(as(PAT1), rec.recordId, DOC1.getID());
      const read = JSON.parse(await cc.getRecordById(as(DOC1), rec.recordId));
      expect(read.recordId).to.equal(rec.recordId);
    });

    it('denies again immediately after revocation', async () => {
      const rec = await createRecord();
      tx('tx-grant-1');
      await cc.grantConsent(as(PAT1), rec.recordId, DOC1.getID());
      tx('tx-revoke-1');
      await cc.revokeConsent(as(PAT1), rec.recordId, DOC1.getID());
      const err = await denied(() => cc.getRecordById(as(DOC1), rec.recordId));
      expect(err.code).to.equal('ACCESS_DENIED');
    });

    it('does not leak consent across doctors', async () => {
      const rec = await createRecord();
      tx('tx-grant-1');
      await cc.grantConsent(as(PAT1), rec.recordId, DOC1.getID());
      const err = await denied(() => cc.getRecordById(as(DOC2), rec.recordId));
      expect(err.code).to.equal('ACCESS_DENIED');
    });

    it('denies the no-attribute service identity even when consent exists (P2)', async () => {
      const rec = await createRecord();
      tx('tx-grant-1');
      await cc.grantConsent(as(PAT1), rec.recordId, DOC1.getID());
      const err = await denied(() => cc.getRecordById(as(SERVICE), rec.recordId));
      expect(err.code).to.equal('ACCESS_DENIED');
    });

    it('resolves consent with a single getState and no rich query', async () => {
      const rec = await createRecord();
      tx('tx-grant-1');
      await cc.grantConsent(as(PAT1), rec.recordId, DOC1.getID());
      const before = { ...stub.counters };
      await cc.getRecordById(as(DOC1), rec.recordId);
      expect(stub.counters.getQueryResult - before.getQueryResult).to.equal(0);
      // one getState for the record, one for the consent
      expect(stub.counters.getState - before.getState).to.equal(2);
    });

    it('the rich-query read path reaches the same decision but does query CouchDB', async () => {
      const rec = await createRecord();
      tx('tx-grant-1');
      await cc.grantConsent(as(PAT1), rec.recordId, DOC1.getID());

      const before = { ...stub.counters };
      const read = JSON.parse(await cc.getRecordByIdRichQuery(as(DOC1), rec.recordId));
      expect(read.recordId).to.equal(rec.recordId);
      expect(stub.counters.getQueryResult - before.getQueryResult).to.equal(1);

      // Same authorization outcome for the negative case -- this is what makes
      // the two paths a valid controlled comparison rather than two systems.
      const err = await denied(() => cc.getRecordByIdRichQuery(as(DOC2), rec.recordId));
      expect(err.code).to.equal('ACCESS_DENIED');
    });

    it('refuses consent granted by a non-owner', async () => {
      const rec = await createRecord();
      tx('tx-grant-1');
      const err = await denied(() => cc.grantConsent(as(PAT2), rec.recordId, DOC1.getID()));
      expect(err.code).to.equal('ACCESS_DENIED');
    });

    it('refuses consent to an unregistered doctor', async () => {
      const rec = await createRecord();
      tx('tx-grant-1');
      const err = await denied(() => cc.grantConsent(as(PAT1), rec.recordId, 'x509::/CN=ghost'));
      expect(err.code).to.equal('NOT_FOUND');
    });

    it('rejects a duplicate grant instead of creating a second consent', async () => {
      const rec = await createRecord();
      tx('tx-grant-1');
      await cc.grantConsent(as(PAT1), rec.recordId, DOC1.getID());
      tx('tx-grant-2');
      const err = await denied(() => cc.grantConsent(as(PAT1), rec.recordId, DOC1.getID()));
      expect(err.code).to.equal('CONFLICT');
    });

    it('supports revoke then re-grant on one consent asset, preserving history', async () => {
      const rec = await createRecord();
      tx('tx-grant-1');
      await cc.grantConsent(as(PAT1), rec.recordId, DOC1.getID());
      tx('tx-revoke-1');
      await cc.revokeConsent(as(PAT1), rec.recordId, DOC1.getID());
      tx('tx-grant-2');
      const regranted = JSON.parse(await cc.grantConsent(as(PAT1), rec.recordId, DOC1.getID()));
      expect(regranted.status).to.equal('granted');
      expect(regranted.regrantedAt).to.be.a('string');
      // Access is restored.
      const read = JSON.parse(await cc.getRecordById(as(DOC1), rec.recordId));
      expect(read.recordId).to.equal(rec.recordId);
    });

    it('refuses a double revoke', async () => {
      const rec = await createRecord();
      tx('tx-grant-1');
      await cc.grantConsent(as(PAT1), rec.recordId, DOC1.getID());
      tx('tx-revoke-1');
      await cc.revokeConsent(as(PAT1), rec.recordId, DOC1.getID());
      tx('tx-revoke-2');
      const err = await denied(() => cc.revokeConsent(as(PAT1), rec.recordId, DOC1.getID()));
      expect(err.code).to.equal('CONFLICT');
    });
  });

  describe('principal-scoped listings', () => {
    it('returns only the calling patient own records', async () => {
      await createRecord(PAT1, 'tx-a');
      await createRecord(PAT1, 'tx-b');
      await createRecord(PAT2, 'tx-c');

      const mine = JSON.parse(await cc.listMyRecords(as(PAT1), '', ''));
      expect(mine.records.map((r) => r.recordId).sort()).to.deep.equal(['record_tx-a', 'record_tx-b']);

      const theirs = JSON.parse(await cc.listMyRecords(as(PAT2), '', ''));
      expect(theirs.records.map((r) => r.recordId)).to.deep.equal(['record_tx-c']);
    });

    it('lists only actively-consented records for a doctor', async () => {
      const a = await createRecord(PAT1, 'tx-a');
      const b = await createRecord(PAT1, 'tx-b');
      tx('g1');
      await cc.grantConsent(as(PAT1), a.recordId, DOC1.getID());
      tx('g2');
      await cc.grantConsent(as(PAT1), b.recordId, DOC1.getID());
      tx('r1');
      await cc.revokeConsent(as(PAT1), a.recordId, DOC1.getID());

      const granted = JSON.parse(await cc.listGrantedRecords(as(DOC1), '', ''));
      expect(granted.records.map((r) => r.recordId)).to.deep.equal(['record_tx-b']);
    });

    it('keeps revoked consents visible to the patient for audit', async () => {
      const rec = await createRecord();
      tx('g1');
      await cc.grantConsent(as(PAT1), rec.recordId, DOC1.getID());
      tx('r1');
      await cc.revokeConsent(as(PAT1), rec.recordId, DOC1.getID());

      const mine = JSON.parse(await cc.listMyConsents(as(PAT1), '', ''));
      expect(mine.consents).to.have.length(1);
      expect(mine.consents[0].status).to.equal('revoked');
      expect(mine.consents[0].revokedAt).to.be.a('string');
    });

    it('denies listings to the wrong role and to the service identity', async () => {
      expect((await denied(() => cc.listMyRecords(as(DOC1), '', ''))).code).to.equal('ACCESS_DENIED');
      expect((await denied(() => cc.listGrantedRecords(as(PAT1), '', ''))).code).to.equal('ACCESS_DENIED');
      expect((await denied(() => cc.listMyRecords(as(SERVICE), '', ''))).code).to.equal('ACCESS_DENIED');
    });

    it('paginates with a bookmark and caps the page size', async () => {
      for (let i = 0; i < 5; i++) await createRecord(PAT1, `tx-p${i}`);
      const page1 = JSON.parse(await cc.listMyRecords(as(PAT1), '2', ''));
      expect(page1.records).to.have.length(2);
      expect(page1.bookmark).to.be.a('string').and.not.equal('');
      const page2 = JSON.parse(await cc.listMyRecords(as(PAT1), '2', page1.bookmark));
      expect(page2.records).to.have.length(2);
      const ids = [...page1.records, ...page2.records].map((r) => r.recordId);
      expect(new Set(ids).size).to.equal(4, 'pages must not overlap');
    });
  });

  describe('caller-scoped duplicate detection', () => {
    it('finds the caller own record by hash and never another patient', async () => {
      const rec = await createRecord(PAT1, 'tx-a');
      const mine = JSON.parse(await cc.recordExistsForHash(as(PAT1), 'a'.repeat(64)));
      expect(mine).to.deep.equal({ exists: true, recordId: rec.recordId });

      // PAT2 stored nothing, so the same hash must not be visible to them.
      const theirs = JSON.parse(await cc.recordExistsForHash(as(PAT2), 'a'.repeat(64)));
      expect(theirs.exists).to.equal(false);
    });
  });

  describe('the removed open query surface', () => {
    it('no longer exposes findAssetsByQuery or assetExistsByQuery', () => {
      expect(cc.findAssetsByQuery).to.equal(undefined);
      expect(cc.assetExistsByQuery).to.equal(undefined);
    });
  });

  describe('whoAmI preflight', () => {
    it('reports the role parsed from the certificate', async () => {
      expect(JSON.parse(await cc.whoAmI(as(DOC1)))).to.deep.equal({
        id: DOC1.getID(),
        mspId: 'Org1MSP',
        role: 'doctor',
      });
    });

    it('reports a null role for an identity enrolled without the attribute', async () => {
      // This is the exact misconfiguration that made the original benchmark
      // measure a missing certificate attribute rather than consent enforcement.
      expect(JSON.parse(await cc.whoAmI(as(SERVICE))).role).to.equal(null);
    });
  });

  describe('key-space safety', () => {
    it('rejects an id containing the composite-key separator', async () => {
      const err = await denied(() => cc.getRecordById(as(PAT1), `record_x\u0000forged`));
      expect(err.message).to.match(/NUL/);
    });
  });
});
