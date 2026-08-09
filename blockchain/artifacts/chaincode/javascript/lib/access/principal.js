'use strict';

/**
 * The caller's identity.
 *
 * This module is the ONLY place in the chaincode that reads attributes off the
 * client identity. Everything downstream consumes the frozen object returned
 * by `principalOf`, so there is exactly one place to audit for "where does the
 * role come from?".
 *
 * The role is taken from an attribute embedded in the caller's X.509
 * enrollment certificate, which is signed by the org CA and carried inside the
 * signed transaction proposal. It is never read from a transaction argument,
 * and never from any claim the application tier asserts -- which is what makes
 * a compromised application gateway unable to elevate its own role.
 */

/** CA attribute name embedded at registration as `organization=<role>:ecert`. */
const ROLE_ATTR = 'organization';

const DOCTOR = 'doctor';
const PATIENT = 'patient';

/**
 * @param {Context} ctx Fabric transaction context.
 * @returns {{id: string, mspId: string, role: (string|null)}} frozen principal.
 */
function principalOf(ctx) {
  const cid = ctx.clientIdentity;
  // getAttributeValue returns null when the attribute is absent from the cert.
  // Note this is deliberately NOT assertAttributeValue: that returns a boolean
  // and silently conflates "attribute missing" with "attribute has some other
  // value", which is precisely how an identity with no attributes at all was
  // previously able to look like a failed consent check rather than a
  // misconfigured enrollment.
  const role = cid.getAttributeValue(ROLE_ATTR);
  return Object.freeze({
    id: cid.getID(),
    mspId: cid.getMSPID(),
    role: role === undefined ? null : role,
  });
}

module.exports = { principalOf, ROLE_ATTR, DOCTOR, PATIENT };
