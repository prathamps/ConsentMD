'use strict';

const { historyTimeISO } = require('./time');

/**
 * Iterator draining helpers.
 *
 * Every iterator is closed in a `finally`, including on the error path. The
 * previous code closed iterators only on the success path, so a parse failure
 * mid-scan leaked the iterator for the life of the transaction.
 */

/** Drain a state iterator into [{key, record}]. */
async function collectStates(iterator) {
  const out = [];
  try {
    let res = await iterator.next();
    while (!res.done) {
      if (res.value && res.value.value) {
        const raw = res.value.value.toString('utf8');
        let record;
        try {
          record = JSON.parse(raw);
        } catch (_) {
          record = raw;
        }
        out.push({ key: res.value.key, record });
      }
      res = await iterator.next();
    }
  } finally {
    await iterator.close();
  }
  return out;
}

/** Drain a composite-key iterator, returning only the split attributes. */
async function collectKeyAttributes(stub, iterator) {
  const out = [];
  try {
    let res = await iterator.next();
    while (!res.done) {
      if (res.value && res.value.key) {
        out.push(stub.splitCompositeKey(res.value.key).attributes);
      }
      res = await iterator.next();
    }
  } finally {
    await iterator.close();
  }
  return out;
}

/** Drain a history iterator into [{txId, timestamp, isDelete, value}]. */
async function collectHistory(iterator) {
  const out = [];
  try {
    let res = await iterator.next();
    while (!res.done) {
      if (res.value) {
        const raw = res.value.value ? res.value.value.toString('utf8') : '';
        let value;
        try {
          value = raw ? JSON.parse(raw) : null;
        } catch (_) {
          value = raw;
        }
        out.push({
          txId: res.value.txId || res.value.tx_id,
          // Uses the corrected 64-bit-safe conversion, not `.seconds.low`.
          timestamp: historyTimeISO(res.value.timestamp),
          isDelete: Boolean(res.value.isDelete || res.value.is_delete),
          value,
        });
      }
      res = await iterator.next();
    }
  } finally {
    await iterator.close();
  }
  return out;
}

/** Return only the first entry of an iterator, then close it. Used for existence checks. */
async function firstOrNull(iterator) {
  try {
    const res = await iterator.next();
    if (res.done || !res.value) return null;
    const raw = res.value.value ? res.value.value.toString('utf8') : '';
    try {
      return raw ? JSON.parse(raw) : {};
    } catch (_) {
      return {};
    }
  } finally {
    await iterator.close();
  }
}

module.exports = { collectStates, collectKeyAttributes, collectHistory, firstOrNull };
