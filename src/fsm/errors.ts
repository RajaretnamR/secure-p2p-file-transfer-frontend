export enum ErrorCode {
  // Network errors
  ERR_TIMEOUT = 'ERR_TIMEOUT',
  ERR_CONN_RESET = 'ERR_CONN_RESET',
  ERR_NETWORK_UNREACHABLE = 'ERR_NETWORK_UNREACHABLE',
  ERR_PEER_UNREACHABLE = 'ERR_PEER_UNREACHABLE',
  
  // Transfer errors
  ERR_MAX_RETRIES = 'ERR_MAX_RETRIES',
  ERR_NO_PEERS = 'ERR_NO_PEERS',
  ERR_INSUFFICIENT_BANDWIDTH = 'ERR_INSUFFICIENT_BANDWIDTH',
  ERR_QUOTA_EXCEEDED = 'ERR_QUOTA_EXCEEDED',
  
  // Data integrity errors
  ERR_INTEGRITY = 'ERR_INTEGRITY',
  ERR_HASH_MISMATCH = 'ERR_HASH_MISMATCH',
  ERR_CHUNK_CORRUPT = 'ERR_CHUNK_CORRUPT',
  
  // Protocol errors
  ERR_INVALID_STATE = 'ERR_INVALID_STATE',
  ERR_PROTOCOL_VIOLATION = 'ERR_PROTOCOL_VIOLATION',
  ERR_VERSION_MISMATCH = 'ERR_VERSION_MISMATCH',
  
  // System errors
  ERR_MEMORY_LIMIT = 'ERR_MEMORY_LIMIT',
  ERR_DISK_FULL = 'ERR_DISK_FULL',
  ERR_PERMISSION_DENIED = 'ERR_PERMISSION_DENIED',
  
  // User errors
  ERR_USER_CANCELLED = 'ERR_USER_CANCELLED',
  ERR_FILE_TOO_LARGE = 'ERR_FILE_TOO_LARGE',
  ERR_UNSUPPORTED_FORMAT = 'ERR_UNSUPPORTED_FORMAT'
}

export interface ErrorDetails {
  code: ErrorCode;
  message: string;
  technicalDetails: string;
  userMessage: string;
  recommendedActions: string[];
  retryable: boolean;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

export const ERROR_DETAILS: Record<ErrorCode, ErrorDetails> = {
  [ErrorCode.ERR_TIMEOUT]: {
    code: ErrorCode.ERR_TIMEOUT,
    message: 'Upload timed out for chunk',
    technicalDetails: 'Network operation exceeded configured timeout threshold',
    userMessage: 'Upload timed out — network too slow or unstable',
    recommendedActions: ['Retry Transfer', 'Use TURN Server', 'Check network connection', 'Try later'],
    retryable: true,
    severity: 'MEDIUM'
  },
  
  [ErrorCode.ERR_CONN_RESET]: {
    code: ErrorCode.ERR_CONN_RESET,
    message: 'Peer disconnected while sending chunk',
    technicalDetails: 'WebRTC connection was reset or peer went offline',
    userMessage: 'Peer disconnected unexpectedly during transfer',
    recommendedActions: ['Retry Transfer', 'Check peer is online', 'Use TURN Server', 'Try different peer'],
    retryable: true,
    severity: 'MEDIUM'
  },
  
  [ErrorCode.ERR_NETWORK_UNREACHABLE]: {
    code: ErrorCode.ERR_NETWORK_UNREACHABLE,
    message: 'Network is unreachable',
    technicalDetails: 'No network connectivity detected',
    userMessage: 'No internet connection available',
    recommendedActions: ['Check network connection', 'Try again when online', 'Use mobile hotspot'],
    retryable: true,
    severity: 'HIGH'
  },
  
  [ErrorCode.ERR_PEER_UNREACHABLE]: {
    code: ErrorCode.ERR_PEER_UNREACHABLE,
    message: 'Peer is not reachable',
    technicalDetails: 'Peer is offline or behind restrictive NAT',
    userMessage: 'Cannot reach the other peer',
    recommendedActions: ['Check peer is online', 'Use TURN Server', 'Try different peer', 'Check firewall settings'],
    retryable: true,
    severity: 'MEDIUM'
  },
  
  [ErrorCode.ERR_MAX_RETRIES]: {
    code: ErrorCode.ERR_MAX_RETRIES,
    message: 'Max retries reached for failed chunks',
    technicalDetails: 'Chunks failed after maximum retry attempts',
    userMessage: 'Transfer failed after multiple retry attempts',
    recommendedActions: ['Check network stability', 'Use TURN Server', 'Try smaller file', 'Contact support'],
    retryable: false,
    severity: 'HIGH'
  },
  
  [ErrorCode.ERR_NO_PEERS]: {
    code: ErrorCode.ERR_NO_PEERS,
    message: 'No peers available to send chunk',
    technicalDetails: 'No active peers in the network',
    userMessage: 'No other peers available for transfer',
    recommendedActions: ['Wait for peers to join', 'Invite more peers', 'Use TURN Server', 'Try later'],
    retryable: true,
    severity: 'MEDIUM'
  },
  
  [ErrorCode.ERR_INSUFFICIENT_BANDWIDTH]: {
    code: ErrorCode.ERR_INSUFFICIENT_BANDWIDTH,
    message: 'Insufficient bandwidth for transfer',
    technicalDetails: 'Network bandwidth below minimum threshold',
    userMessage: 'Network too slow for this transfer',
    recommendedActions: ['Wait for better connection', 'Use smaller file', 'Try during off-peak hours', 'Check network usage'],
    retryable: true,
    severity: 'MEDIUM'
  },
  
  [ErrorCode.ERR_QUOTA_EXCEEDED]: {
    code: ErrorCode.ERR_QUOTA_EXCEEDED,
    message: 'Transfer quota exceeded',
    technicalDetails: 'Daily/monthly transfer limit reached',
    userMessage: 'Transfer limit reached for today',
    recommendedActions: ['Wait until tomorrow', 'Upgrade plan', 'Use different account', 'Contact support'],
    retryable: false,
    severity: 'LOW'
  },
  
  [ErrorCode.ERR_INTEGRITY]: {
    code: ErrorCode.ERR_INTEGRITY,
    message: 'Chunk failed integrity check',
    technicalDetails: 'Chunk hash verification failed',
    userMessage: 'File data corrupted during transfer',
    recommendedActions: ['Retry Transfer', 'Check file source', 'Use different file', 'Contact support'],
    retryable: true,
    severity: 'HIGH'
  },
  
  [ErrorCode.ERR_HASH_MISMATCH]: {
    code: ErrorCode.ERR_HASH_MISMATCH,
    message: 'File hash mismatch after transfer',
    technicalDetails: 'Final file hash does not match expected value',
    userMessage: 'File may be corrupted or incomplete',
    recommendedActions: ['Retry Transfer', 'Verify file source', 'Check for malware', 'Contact support'],
    retryable: true,
    severity: 'HIGH'
  },
  
  [ErrorCode.ERR_CHUNK_CORRUPT]: {
    code: ErrorCode.ERR_CHUNK_CORRUPT,
    message: 'Chunk data is corrupted',
    technicalDetails: 'Chunk data integrity check failed',
    userMessage: 'Part of the file was corrupted during transfer',
    recommendedActions: ['Retry Transfer', 'Use TURN Server', 'Check network stability', 'Try smaller chunks'],
    retryable: true,
    severity: 'MEDIUM'
  },
  
  [ErrorCode.ERR_INVALID_STATE]: {
    code: ErrorCode.ERR_INVALID_STATE,
    message: 'Invalid transfer state transition',
    technicalDetails: 'FSM attempted invalid state change',
    userMessage: 'Transfer encountered an internal error',
    recommendedActions: ['Refresh page', 'Restart transfer', 'Contact support'],
    retryable: false,
    severity: 'HIGH'
  },
  
  [ErrorCode.ERR_PROTOCOL_VIOLATION]: {
    code: ErrorCode.ERR_PROTOCOL_VIOLATION,
    message: 'Protocol violation detected',
    technicalDetails: 'Peer sent invalid protocol message',
    userMessage: 'Transfer protocol error with peer',
    recommendedActions: ['Try different peer', 'Update application', 'Contact support'],
    retryable: false,
    severity: 'HIGH'
  },
  
  [ErrorCode.ERR_VERSION_MISMATCH]: {
    code: ErrorCode.ERR_VERSION_MISMATCH,
    message: 'Protocol version mismatch',
    technicalDetails: 'Peer uses incompatible protocol version',
    userMessage: 'Incompatible version with peer',
    recommendedActions: ['Update application', 'Use compatible peer', 'Contact support'],
    retryable: false,
    severity: 'MEDIUM'
  },
  
  [ErrorCode.ERR_MEMORY_LIMIT]: {
    code: ErrorCode.ERR_MEMORY_LIMIT,
    message: 'Memory limit exceeded',
    technicalDetails: 'Browser memory usage exceeded threshold',
    userMessage: 'File too large for available memory',
    recommendedActions: ['Close other tabs', 'Use smaller file', 'Restart browser', 'Use desktop app'],
    retryable: true,
    severity: 'MEDIUM'
  },
  
  [ErrorCode.ERR_DISK_FULL]: {
    code: ErrorCode.ERR_DISK_FULL,
    message: 'Insufficient disk space',
    technicalDetails: 'Target device has insufficient storage',
    userMessage: 'Not enough space to save file',
    recommendedActions: ['Free up disk space', 'Use different location', 'Use smaller file', 'Check storage'],
    retryable: true,
    severity: 'HIGH'
  },
  
  [ErrorCode.ERR_PERMISSION_DENIED]: {
    code: ErrorCode.ERR_PERMISSION_DENIED,
    message: 'Permission denied for file operation',
    technicalDetails: 'File system permission error',
    userMessage: 'Cannot access or save file due to permissions',
    recommendedActions: ['Check file permissions', 'Run as administrator', 'Use different location', 'Contact IT support'],
    retryable: false,
    severity: 'MEDIUM'
  },
  
  [ErrorCode.ERR_USER_CANCELLED]: {
    code: ErrorCode.ERR_USER_CANCELLED,
    message: 'Transfer cancelled by user',
    technicalDetails: 'User explicitly cancelled the transfer',
    userMessage: 'Transfer was cancelled',
    recommendedActions: ['Start new transfer', 'Check file selection'],
    retryable: false,
    severity: 'LOW'
  },
  
  [ErrorCode.ERR_FILE_TOO_LARGE]: {
    code: ErrorCode.ERR_FILE_TOO_LARGE,
    message: 'File size exceeds maximum limit',
    technicalDetails: 'File size above configured maximum',
    userMessage: 'File is too large for transfer',
    recommendedActions: ['Use smaller file', 'Split file into parts', 'Use different method', 'Contact support'],
    retryable: false,
    severity: 'MEDIUM'
  },
  
  [ErrorCode.ERR_UNSUPPORTED_FORMAT]: {
    code: ErrorCode.ERR_UNSUPPORTED_FORMAT,
    message: 'Unsupported file format',
    technicalDetails: 'File type not supported by transfer protocol',
    userMessage: 'This file type is not supported',
    recommendedActions: ['Convert file format', 'Use different file', 'Check supported formats', 'Contact support'],
    retryable: false,
    severity: 'LOW'
  }
};

export function getErrorDetails(code: ErrorCode): ErrorDetails {
  return ERROR_DETAILS[code] || {
    code: ErrorCode.ERR_PROTOCOL_VIOLATION,
    message: 'Unknown error occurred',
    technicalDetails: 'Unrecognized error code',
    userMessage: 'An unexpected error occurred',
    recommendedActions: ['Try again', 'Contact support'],
    retryable: true,
    severity: 'MEDIUM'
  };
}

export function formatErrorMessage(code: ErrorCode, context?: string): string {
  const details = getErrorDetails(code);
  let message = details.userMessage;
  
  if (context) {
    message += ` — ${context}`;
  }
  
  return message;
}

export function isRetryableError(code: ErrorCode): boolean {
  return getErrorDetails(code).retryable;
}

export function getErrorSeverity(code: ErrorCode): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
  return getErrorDetails(code).severity;
}
