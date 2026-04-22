class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

class NotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NotFoundError';
  }
}

class UnauthorizedError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

const TakeoutStatus = {
  ACTIVE: 'Active',
  PROPOSED_TAKEOUT: 'ProposedTakeout',
  TAKEN_OUT: 'TakenOut',
  REJECTED: 'Rejected'
};

const ResponseApprovalStatus = {
  SUBMITTED: 'Submitted',
  REJECTED_BY_ADMIN: 'RejectedByAdmin',
  PENDING_IT_LEAD: 'PendingITLead',
  PENDING_ADMIN_TAKEOUT_DECISION: 'PendingAdminTakeoutDecision',
  APPROVED_FINAL: 'ApprovedFinal'
};

const ApprovalAction = {
  PROPOSED: 'Proposed',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled'
};

module.exports = {
  ApprovalAction,
  NotFoundError,
  ResponseApprovalStatus,
  TakeoutStatus,
  UnauthorizedError,
  ValidationError
};
