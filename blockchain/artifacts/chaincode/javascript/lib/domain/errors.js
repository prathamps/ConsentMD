'use strict';

/**
 * Typed chaincode errors.
 *
 * The message shapes are load-bearing: the adversarial security suite and the
 * API's error mapper both match on the leading token, so changing them changes
 * an externally observable contract. Each error carries a stable `code` so
 * callers never have to parse prose.
 */

class ChaincodeError extends Error {
  constructor(code, message) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
  }
}

/**
 * Authorization refused. Thrown -- never returned as a falsy value -- so a
 * caller cannot ignore it by forgetting to check a return value.
 */
class AccessDenied extends ChaincodeError {
  constructor(action, who, why = 'policy') {
    super(
      'ACCESS_DENIED',
      `ACCESS_DENIED action=${action} principal=${who && who.id} ` +
        `role=${(who && who.role) || 'none'} reason=${why}`
    );
    this.action = action;
  }
}

class NotFound extends ChaincodeError {
  constructor(kind, id) {
    super('NOT_FOUND', `NOT_FOUND ${kind} ${id} does not exist`);
    this.kind = kind;
    this.id = id;
  }
}

class Conflict extends ChaincodeError {
  constructor(message) {
    super('CONFLICT', `CONFLICT ${message}`);
  }
}

class InvalidArgument extends ChaincodeError {
  constructor(message) {
    super('INVALID_ARGUMENT', `INVALID_ARGUMENT ${message}`);
  }
}

module.exports = { ChaincodeError, AccessDenied, NotFound, Conflict, InvalidArgument };
