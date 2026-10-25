const ROLES = Object.freeze({
  VOTER: 'Voter',
  OBSERVER: 'Observer',
  FACILITATOR: 'Facilitator'
});

const ROLE_VALUES = Object.freeze(Object.values(ROLES));

const MAX_FACILITATORS = 2;

function isValidRole(role) {
  return ROLE_VALUES.includes(role);
}

function isObserver(role) {
  return role === ROLES.OBSERVER;
}

function isFacilitator(role) {
  return role === ROLES.FACILITATOR;
}

function canVote(role) {
  return role === ROLES.VOTER || role === ROLES.FACILITATOR;
}

function canRevealVotes(role) {
  return isFacilitator(role);
}

function canResetVotes(role) {
  return isFacilitator(role);
}

function canChangeRole(actorRole, actorId, targetId) {
  return actorId === targetId || isFacilitator(actorRole);
}

function getAssignedLoginRole(requestedRole, currentFacilitatorId) {
  if (requestedRole === ROLES.FACILITATOR && currentFacilitatorId) {
    return ROLES.VOTER;
  }
  return requestedRole;
}

module.exports = {
  MAX_FACILITATORS,
  ROLES,
  ROLE_VALUES,
  canChangeRole,
  canResetVotes,
  canRevealVotes,
  canVote,
  getAssignedLoginRole,
  isFacilitator,
  isObserver,
  isValidRole
};
