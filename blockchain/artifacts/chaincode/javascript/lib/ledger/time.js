'use strict';

/**
 * Deterministic transaction timestamps.
 *
 * Every endorsing peer must compute the same value or the read/write sets
 * diverge and the transaction fails validation -- so this reads the timestamp
 * out of the proposal rather than calling Date.now().
 *
 * The previous implementation was:
 *
 *     const seconds = txTimestamp.seconds.low || txTimestamp.seconds;
 *
 * which is wrong twice over. protobufjs represents a 64-bit field as a Long
 * with {low, high}; taking `.low` alone truncates to 32 bits, and `||` treats
 * a legitimately-zero `.low` as absent and falls through to the Long object
 * itself, yielding `NaN` -> epoch 0. Both failures are silent.
 */

function txTimeMillis(ctx) {
  const ts = ctx.stub.getTxTimestamp();
  let seconds;
  if (ts.seconds === null || ts.seconds === undefined) {
    seconds = 0;
  } else if (typeof ts.seconds === 'object') {
    // Long (protobufjs) or google.protobuf.Timestamp decoded as an object.
    // toString() is exact for the full 64-bit range; Number() is safe because
    // seconds-since-epoch stays far below Number.MAX_SAFE_INTEGER.
    seconds = Number(ts.seconds.toString());
  } else {
    seconds = Number(ts.seconds);
  }
  const nanos = Number(ts.nanos || 0);
  return seconds * 1000 + Math.floor(nanos / 1e6);
}

const txTimeISO = (ctx) => new Date(txTimeMillis(ctx)).toISOString();

/** Same correction, for the {seconds, nanos} carried by history entries. */
function historyTimeISO(timestamp) {
  if (!timestamp) return null;
  const s = timestamp.seconds;
  let seconds;
  if (s === null || s === undefined) seconds = 0;
  else if (typeof s === 'object') seconds = Number(s.toString());
  else seconds = Number(s);
  return new Date(seconds * 1000 + Math.floor(Number(timestamp.nanos || 0) / 1e6)).toISOString();
}

module.exports = { txTimeMillis, txTimeISO, historyTimeISO };
