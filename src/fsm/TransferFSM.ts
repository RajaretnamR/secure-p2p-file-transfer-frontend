export enum TransferState {
  IDLE = 'IDLE',
  PENDING = 'PENDING',
  SCHEDULING = 'SCHEDULING',
  UPLOADING = 'UPLOADING',
  AWAITING_ACKS = 'AWAITING_ACKS',
  REPAIRING = 'REPAIRING',
  COMPLETE = 'COMPLETE',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED'
}

export enum ChunkState {
  CHUNK_PENDING = 'CHUNK_PENDING',
  CHUNK_SENDING = 'CHUNK_SENDING',
  CHUNK_SENT = 'CHUNK_SENT',
  CHUNK_ACKED = 'CHUNK_ACKED',
  CHUNK_REQUEUE = 'CHUNK_REQUEUE',
  CHUNK_FAILED = 'CHUNK_FAILED'
}

export interface TransferConfig {
  maxAttempts: number;
  ackTimeoutMs: number;
  repairThreshold: number;
  redundancyFactor: number;
  chunkSize: number;
  concurrency: number;
}

export interface TransferStatus {
  transferId: string;
  state: TransferState;
  progress: number;
  bytesSent: number;
  totalBytes: number;
  speedBps: number;
  etaSec: number;
  startTime: number;
  lastActivity: number;
  error?: string;
  failedChunks: number[];
}

export interface ChunkStatus {
  transferId: string;
  chunkIndex: number;
  state: ChunkState;
  attempts: number;
  assignedPeer?: string;
  lastError?: string;
  timestamp: number;
  size: number;
}

export interface TransferEvent {
  type: string;
  transferId: string;
  timestamp: number;
  [key: string]: any;
}

export type EventCallback = (event: TransferEvent) => void;

export class TransferFSM {
  private state: TransferState = TransferState.IDLE;
  private config: TransferConfig;
  private eventListeners: Map<string, EventCallback[]> = new Map();
  private transfers: Map<string, TransferStatus> = new Map();
  private chunks: Map<string, ChunkStatus[]> = new Map();
  private activeTransfers: Set<string> = new Set();
  private transferQueue: string[] = [];
  private stats: Map<string, any> = new Map();

  constructor(config: Partial<TransferConfig> = {}) {
    this.config = {
      maxAttempts: 3,
      ackTimeoutMs: 5000,
      repairThreshold: 0.1, // 10% failed chunks trigger repair
      redundancyFactor: 1.2, // 20% extra chunks for redundancy
      chunkSize: 256 * 1024, // 256KB
      concurrency: 6,
      ...config
    };
  }

  // Public API methods
  start(transferId: string, file: File): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        if (this.state !== TransferState.IDLE) {
          throw new Error('FSM is not in IDLE state');
        }

        const totalChunks = Math.ceil(file.size / this.config.chunkSize);
        const transfer: TransferStatus = {
          transferId,
          state: TransferState.PENDING,
          progress: 0,
          bytesSent: 0,
          totalBytes: file.size,
          speedBps: 0,
          etaSec: 0,
          startTime: Date.now(),
          lastActivity: Date.now(),
          failedChunks: []
        };

        this.transfers.set(transferId, transfer);
        this.transferQueue.push(transferId);
        this.state = TransferState.PENDING;

        // Initialize chunks
        const chunkStatuses: ChunkStatus[] = [];
        for (let i = 0; i < totalChunks; i++) {
          const chunkSize = i === totalChunks - 1 ? file.size % this.config.chunkSize || this.config.chunkSize : this.config.chunkSize;
          chunkStatuses.push({
            transferId,
            chunkIndex: i,
            state: ChunkState.CHUNK_PENDING,
            attempts: 0,
            timestamp: Date.now(),
            size: chunkSize
          });
        }
        this.chunks.set(transferId, chunkStatuses);

        this.emit('transfer:update', {
          type: 'transfer:update',
          transferId,
          state: TransferState.PENDING,
          progress: 0,
          bytesSent: 0,
          totalBytes: file.size,
          speedBps: 0,
          etaSec: 0
        });

        resolve();
      } catch (error) {
        reject(error);
      }
    });
  }

  pause(transferId: string): void {
    const transfer = this.transfers.get(transferId);
    if (transfer && transfer.state === TransferState.UPLOADING) {
      transfer.state = TransferState.PENDING;
      this.emit('transfer:update', {
        type: 'transfer:update',
        transferId,
        state: TransferState.PENDING,
        progress: transfer.progress,
        bytesSent: transfer.bytesSent,
        totalBytes: transfer.totalBytes,
        speedBps: transfer.speedBps,
        etaSec: transfer.etaSec
      });
    }
  }

  resume(transferId: string): void {
    const transfer = this.transfers.get(transferId);
    if (transfer && transfer.state === TransferState.PENDING) {
      transfer.state = TransferState.UPLOADING;
      this.emit('transfer:update', {
        type: 'transfer:update',
        transferId,
        state: TransferState.UPLOADING,
        progress: transfer.progress,
        bytesSent: transfer.bytesSent,
        totalBytes: transfer.totalBytes,
        speedBps: transfer.speedBps,
        etaSec: transfer.etaSec
      });
    }
  }

  cancel(transferId: string): void {
    const transfer = this.transfers.get(transferId);
    if (transfer) {
      transfer.state = TransferState.CANCELLED;
      this.activeTransfers.delete(transferId);
      this.emit('transfer:update', {
        type: 'transfer:update',
        transferId,
        state: TransferState.CANCELLED,
        progress: transfer.progress,
        bytesSent: transfer.bytesSent,
        totalBytes: transfer.totalBytes,
        speedBps: 0,
        etaSec: 0
      });
    }
  }

  getStatus(transferId: string): TransferStatus | undefined {
    return this.transfers.get(transferId);
  }

  on(event: string, callback: EventCallback): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(callback);
  }

  off(event: string, callback: EventCallback): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  // Internal methods
  private emit(event: string, data: any): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach(callback => {
        try {
          callback({ ...data, timestamp: Date.now() });
        } catch (error) {
          console.error('Error in event callback:', error);
        }
      });
    }
  }

  // Chunk management
  updateChunkStatus(transferId: string, chunkIndex: number, state: ChunkState, peerId?: string, error?: string): void {
    const chunks = this.chunks.get(transferId);
    if (chunks && chunks[chunkIndex]) {
      const chunk = chunks[chunkIndex];
      chunk.state = state;
      chunk.timestamp = Date.now();
      
      if (peerId) chunk.assignedPeer = peerId;
      if (error) chunk.lastError = error;
      
      if (state === ChunkState.CHUNK_FAILED) {
        chunk.attempts++;
      }

      this.emit('chunk:update', {
        type: 'chunk:update',
        transferId,
        chunkIndex,
        state,
        attempts: chunk.attempts,
        assignedPeer: chunk.assignedPeer,
        lastError: chunk.lastError,
        timestamp: chunk.timestamp
      });

      this.updateTransferProgress(transferId);
    }
  }

  private updateTransferProgress(transferId: string): void {
    const transfer = this.transfers.get(transferId);
    const chunks = this.chunks.get(transferId);
    
    if (!transfer || !chunks) return;

    const totalChunks = chunks.length;
    const completedChunks = chunks.filter(c => c.state === ChunkState.CHUNK_ACKED).length;
    const failedChunks = chunks.filter(c => c.state === ChunkState.CHUNK_FAILED).length;
    
    transfer.progress = completedChunks / totalChunks;
    transfer.bytesSent = completedChunks * this.config.chunkSize;
    transfer.lastActivity = Date.now();

    // Calculate speed and ETA
    const elapsed = (Date.now() - transfer.startTime) / 1000;
    transfer.speedBps = elapsed > 0 ? transfer.bytesSent / elapsed : 0;
    transfer.etaSec = transfer.speedBps > 0 ? (transfer.totalBytes - transfer.bytesSent) / transfer.speedBps : 0;

    // Check if repair is needed
    if (failedChunks / totalChunks > this.config.repairThreshold && transfer.state === TransferState.UPLOADING) {
      transfer.state = TransferState.REPAIRING;
      this.emit('transfer:update', {
        type: 'transfer:update',
        transferId,
        state: TransferState.REPAIRING,
        progress: transfer.progress,
        bytesSent: transfer.bytesSent,
        totalBytes: transfer.totalBytes,
        speedBps: transfer.speedBps,
        etaSec: transfer.etaSec
      });
    }

    // Check if transfer is complete
    if (completedChunks === totalChunks) {
      transfer.state = TransferState.COMPLETE;
      this.activeTransfers.delete(transferId);
      this.emit('transfer:update', {
        type: 'transfer:update',
        transferId,
        state: TransferState.COMPLETE,
        progress: 1,
        bytesSent: transfer.totalBytes,
        totalBytes: transfer.totalBytes,
        speedBps: transfer.speedBps,
        etaSec: 0
      });
    }

    // Check if transfer should fail
    if (failedChunks > 0 && chunks.some(c => c.attempts >= this.config.maxAttempts)) {
      transfer.state = TransferState.FAILED;
      transfer.error = 'Max retries reached for failed chunks';
      transfer.failedChunks = chunks
        .filter(c => c.state === ChunkState.CHUNK_FAILED)
        .map(c => c.chunkIndex);
      
      this.emit('transfer:error', {
        type: 'transfer:error',
        transferId,
        code: 'ERR_MAX_RETRIES',
        message: 'Max retries reached for failed chunks',
        failedChunks: transfer.failedChunks,
        timestamp: Date.now()
      });
    }
  }

  // Configuration
  updateConfig(newConfig: Partial<TransferConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  getConfig(): TransferConfig {
    return { ...this.config };
  }

  // Statistics
  getStats(transferId: string): any {
    return this.stats.get(transferId) || {};
  }

  exportTransferLog(transferId: string): any {
    const transfer = this.transfers.get(transferId);
    const chunks = this.chunks.get(transferId);
    const stats = this.stats.get(transferId);
    
    return {
      transfer,
      chunks,
      stats,
      exportTime: Date.now()
    };
  }
}
