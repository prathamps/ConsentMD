'use strict';

/**
 * An in-memory ChaincodeStub good enough to exercise the real repositories.
 *
 * Deliberately NOT sinon.createStubInstance(ChaincodeStub): that stubs out
 * createCompositeKey/splitCompositeKey, which is exactly the key-derivation
 * logic that carried the DoctorProfile write/read mismatch. A test that mocks
 * the buggy layer cannot catch the bug. This implements the composite-key
 * format faithfully instead, so range scans, key collation and DN round-trips
 * are all really exercised.
 *
 * Reference: fabric-shim ChaincodeStub
 *   COMPOSITEKEY_NS        = U+0000
 *   MIN_UNICODE_RUNE_VALUE = U+0000
 *   key = NS + objectType + MIN + attr1 + MIN + attr2 + MIN ...
 */

const NS = '\u0000';
const MIN = '\u0000';

class FakeIterator {
  constructor(entries) {
    this.entries = entries;
    this.i = 0;
    this.closed = false;
  }
  async next() {
    if (this.i >= this.entries.length) return { done: true };
    return { done: false, value: this.entries[this.i++] };
  }
  async close() {
    this.closed = true;
  }
}

class FakeStub {
  /**
   * @param {object} [opts]
   * @param {string} [opts.txId]
   * @param {number} [opts.timestampSeconds] seconds since epoch
   */
  constructor(opts = {}) {
    this.state = new Map(); // key -> Buffer
    this.history = new Map(); // key -> [{txId, timestamp, isDelete, value}]
    this.events = [];
    this.txId = opts.txId || 'tx0';
    this._seconds = opts.timestampSeconds !== undefined ? opts.timestampSeconds : 1754640000;
    this.transient = new Map();
    // Instrumentation so tests can assert HOW a value was fetched -- this is
    // what lets a test prove the consent check is a getState and not a query.
    this.counters = { getState: 0, putState: 0, deleteState: 0, getQueryResult: 0, rangeScan: 0 };
  }

  setTxId(txId) {
    this.txId = txId;
    return this;
  }
  advanceTime(seconds) {
    this._seconds += seconds;
    return this;
  }

  getTxID() {
    return this.txId;
  }
  getTxTimestamp() {
    // Mirrors the protobufjs Long shape that broke the original timestamp
    // helper: a {low, high} object whose `low` can legitimately be 0.
    return {
      seconds: { low: this._seconds & 0xffffffff, high: 0, toString: () => String(this._seconds) },
      nanos: 0,
    };
  }
  getTransient() {
    return this.transient;
  }
  setEvent(name, payload) {
    this.events.push({ name, payload: payload.toString('utf8') });
  }

  // ---- state ------------------------------------------------------------

  async getState(key) {
    this.counters.getState++;
    return this.state.get(key) || Buffer.from('');
  }

  async putState(key, value) {
    this.counters.putState++;
    this.state.set(key, Buffer.from(value));
    this._appendHistory(key, value, false);
  }

  async deleteState(key) {
    this.counters.deleteState++;
    this.state.delete(key);
    this._appendHistory(key, Buffer.from(''), true);
  }

  _appendHistory(key, value, isDelete) {
    if (!this.history.has(key)) this.history.set(key, []);
    this.history.get(key).push({
      txId: this.txId,
      timestamp: { seconds: { toString: () => String(this._seconds) }, nanos: 0 },
      isDelete,
      value: Buffer.from(value),
    });
  }

  async getHistoryForKey(key) {
    return new FakeIterator(this.history.get(key) || []);
  }

  // ---- composite keys ---------------------------------------------------

  createCompositeKey(objectType, attributes) {
    if (typeof objectType !== 'string' || objectType.length === 0) {
      throw new Error('objectType must be a non-empty string');
    }
    let key = NS + objectType + MIN;
    for (const a of attributes) {
      if (typeof a !== 'string') throw new Error('composite key attributes must be strings');
      key += a + MIN;
    }
    return key;
  }

  splitCompositeKey(compositeKey) {
    const result = { objectType: null, attributes: [] };
    if (compositeKey && compositeKey.length > 1 && compositeKey[0] === NS) {
      const parts = compositeKey.substring(1).split(MIN);
      if (parts.length > 0) {
        result.objectType = parts[0];
        // The trailing delimiter yields a final empty element; drop it.
        if (parts[parts.length - 1] === '') parts.pop();
        result.attributes = parts.slice(1);
      }
    }
    return result;
  }

  async getStateByPartialCompositeKey(objectType, attributes) {
    this.counters.rangeScan++;
    const prefix = this.createCompositeKey(objectType, attributes);
    // Fabric returns keys in lexical order; Map preserves insertion order, so
    // sort explicitly or a test would pass for the wrong reason.
    const entries = [...this.state.entries()]
      .filter(([k]) => k.startsWith(prefix))
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, value]) => ({ key, value }));
    return new FakeIterator(entries);
  }

  async getStateByPartialCompositeKeyWithPagination(objectType, attributes, pageSize, bookmark) {
    const all = await this.getStateByPartialCompositeKey(objectType, attributes);
    const entries = all.entries;
    const start = bookmark ? entries.findIndex((e) => e.key === bookmark) + 1 : 0;
    const page = entries.slice(start, start + (pageSize || entries.length));
    const nextBookmark =
      start + page.length < entries.length && page.length > 0 ? page[page.length - 1].key : '';
    return {
      iterator: new FakeIterator(page),
      metadata: { fetchedRecordsCount: page.length, bookmark: nextBookmark },
    };
  }

  // ---- rich query -------------------------------------------------------

  /**
   * Minimal Mango evaluator: equality predicates only, which is all the
   * chaincode ever emits. Anything else throws rather than silently matching,
   * so a test cannot pass against a selector this stub does not really support.
   */
  async getQueryResult(queryString) {
    this.counters.getQueryResult++;
    const query = JSON.parse(queryString);
    const selector = query.selector || {};
    for (const [k, v] of Object.entries(selector)) {
      if (v !== null && typeof v === 'object') {
        throw new Error(`FakeStub.getQueryResult supports equality selectors only, got ${k}: ${JSON.stringify(v)}`);
      }
    }
    const entries = [];
    for (const [key, buf] of this.state.entries()) {
      const raw = buf.toString('utf8');
      if (!raw) continue;
      let doc;
      try {
        doc = JSON.parse(raw);
      } catch (_) {
        continue;
      }
      if (Object.entries(selector).every(([k, v]) => doc[k] === v)) {
        entries.push({ key, value: buf });
      }
    }
    entries.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    return new FakeIterator(entries);
  }
}

/** Matches the fabric-shim ClientIdentity surface the chaincode actually uses. */
class FakeClientIdentity {
  constructor(id, mspId, attrs = {}) {
    this._id = id;
    this._mspId = mspId;
    this._attrs = attrs;
  }
  getID() {
    return this._id;
  }
  getMSPID() {
    return this._mspId;
  }
  getAttributeValue(name) {
    return name in this._attrs ? this._attrs[name] : null;
  }
  assertAttributeValue(name, value) {
    return this.getAttributeValue(name) === value;
  }
}

/** A transaction context: one stub shared across calls, identity swapped per caller. */
function makeCtx(stub, identity) {
  return { stub, clientIdentity: identity };
}

module.exports = { FakeStub, FakeClientIdentity, FakeIterator, makeCtx, NS, MIN };
