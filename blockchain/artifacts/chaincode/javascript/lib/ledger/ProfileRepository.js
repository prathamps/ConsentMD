'use strict';

const K = require('./keys');
const { NotFound } = require('../domain/errors');
const { newDoctorProfile } = require('../domain/assets');

/**
 * Doctor profiles.
 *
 * The original code wrote profiles under createCompositeKey('DoctorProfile',
 * [doctorId]) but read them back through a plain-key helper, so every profile
 * lookup missed. Both sides now go through ledger/keys.js.
 */
class ProfileRepository {
  async find(ctx, doctorId) {
    K.assertKeySafe('doctorId', doctorId);
    const buf = await ctx.stub.getState(K.profileKey(ctx.stub, doctorId));
    if (!buf || buf.length === 0) return null;
    return JSON.parse(buf.toString('utf8'));
  }

  async get(ctx, doctorId) {
    const profile = await this.find(ctx, doctorId);
    if (!profile) throw new NotFound('DoctorProfile', doctorId);
    return profile;
  }

  /** Consent may only be granted to an identity that has registered as a doctor. */
  async mustExist(ctx, doctorId) {
    await this.get(ctx, doctorId);
  }

  async upsert(ctx, { doctorId, name, specialization, registeredAt }) {
    const profile = newDoctorProfile({ doctorId, name, specialization, registeredAt });
    await ctx.stub.putState(
      K.profileKey(ctx.stub, doctorId),
      Buffer.from(JSON.stringify(profile))
    );
    return profile;
  }
}

module.exports = ProfileRepository;
