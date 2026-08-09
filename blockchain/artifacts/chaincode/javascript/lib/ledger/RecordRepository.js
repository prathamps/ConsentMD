'use strict';

const K = require('./keys');
const { NotFound } = require('../domain/errors');
const { newMedicalRecord } = require('../domain/assets');
const { collectKeyAttributes, collectHistory } = require('./iterate');

const EMPTY = Buffer.from('');

class RecordRepository {
  async find(ctx, recordId) {
    K.assertKeySafe('recordId', recordId);
    const buf = await ctx.stub.getState(K.recordKey(ctx.stub, recordId));
    if (!buf || buf.length === 0) return null;
    return JSON.parse(buf.toString('utf8'));
  }

  async get(ctx, recordId) {
    const record = await this.find(ctx, recordId);
    if (!record) throw new NotFound('MedicalRecord', recordId);
    return record;
  }

  async create(ctx, fields) {
    const record = newMedicalRecord(fields);
    await ctx.stub.putState(record.recordId, Buffer.from(JSON.stringify(record)));
    await ctx.stub.putState(
      K.recordByPatientKey(ctx.stub, record.patientId, record.recordId),
      EMPTY
    );
    if (record.fileHash) {
      // Caller-scoped duplicate detection. This replaces
      // assetExistsByQuery({fileHash}), which accepted an arbitrary selector
      // from any identity and so doubled as an existence oracle over the whole
      // ledger.
      await ctx.stub.putState(
        K.recordByHashKey(ctx.stub, record.patientId, record.fileHash),
        Buffer.from(record.recordId)
      );
    }
    return record;
  }

  async put(ctx, record) {
    await ctx.stub.putState(record.recordId, Buffer.from(JSON.stringify(record)));
    return record;
  }

  /** Does this patient already hold a record for this content hash? */
  async findIdByHash(ctx, patientId, fileHash) {
    const buf = await ctx.stub.getState(K.recordByHashKey(ctx.stub, patientId, fileHash));
    return !buf || buf.length === 0 ? null : buf.toString('utf8');
  }

  async clearFile(ctx, record) {
    if (record.fileHash) {
      await ctx.stub.deleteState(
        K.recordByHashKey(ctx.stub, record.patientId, record.fileHash)
      );
    }
    const updated = { ...record, fileName: null, s3ObjectKey: null, fileHash: null };
    return this.put(ctx, updated);
  }

  /** A patient's own records, by range scan over the pointer index. */
  async listForPatient(ctx, patientId, pageSize, bookmark) {
    const res = await ctx.stub.getStateByPartialCompositeKeyWithPagination(
      K.OBJ.IDX_RECORD_BY_PATIENT,
      [patientId],
      pageSize,
      bookmark
    );
    const attrs = await collectKeyAttributes(ctx.stub, res.iterator);
    const records = [];
    for (const [, recordId] of attrs) {
      const r = await this.find(ctx, recordId);
      if (r) records.push(r);
    }
    return { records, bookmark: res.metadata.bookmark };
  }

  async history(ctx, recordId) {
    return collectHistory(await ctx.stub.getHistoryForKey(recordId));
  }
}

module.exports = RecordRepository;
