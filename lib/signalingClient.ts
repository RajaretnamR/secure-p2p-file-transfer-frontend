import {
  ClientMessage,
  VersionedServerMessage,
  isVersionedServerMessage,
} from "@/lib/protocol";

type MessageHandler = (message: VersionedServerMessage) => void;
type StatusHandler = (connected: boolean) => void;

export class SignalingClient {
  private ws: WebSocket | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private connectTimeout: NodeJS.Timeout | null = null;

  private messageHandler?: MessageHandler;
  private statusHandler?: StatusHandler;

  private manuallyClosed = false;
  private isConnecting = false;
  private destroyed = false;

  private reconnectAttempts = 0;
  private lastPongTime = Date.now();

  private readonly HEARTBEAT_INTERVAL = 20000;
  private readonly PONG_TIMEOUT = 45000;
  private readonly CONNECT_TIMEOUT = 10000;
  private readonly MAX_RECONNECT_DELAY = 30000;

  connect(
    onMessage: MessageHandler,
    onStatusChange?: StatusHandler
  ): Promise<void> {
    if (this.destroyed) {
      return Promise.reject(new Error("Client destroyed"));
    }

    if (this.isConnecting) {
      return Promise.reject(new Error("Already connecting"));
    }

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log("[WS] Already connected");
      return Promise.resolve();
    }

    const wsUrl = process.env.NEXT_PUBLIC_SIGNALING_WS_URL;

    if (!wsUrl) {
      return Promise.reject(
        new Error(
          "NEXT_PUBLIC_SIGNALING_WS_URL is missing"
        )
      );
    }

    this.cleanupSocket(false);

    this.messageHandler = onMessage;
    this.statusHandler = onStatusChange;
    this.manuallyClosed = false;
    this.isConnecting = true;

    console.log("[WS] Connecting to:", wsUrl);

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      this.ws = ws;

      let settled = false;

this.connectTimeout = setTimeout(() => {
  if (
    this.ws &&
    this.ws.readyState === WebSocket.CONNECTING
  ) {
    console.error(
      "[WS] Connection timeout after 10s"
    );

    if (!settled) {
      settled = true;
      this.isConnecting = false;
      reject(
        new Error("WebSocket connection timeout")
      );
    }

    this.ws.close();
  }
}, this.CONNECT_TIMEOUT);

      ws.onopen = () => {
        if (this.destroyed) {
          ws.close();
          return;
        }

        console.log("[WS] Connected");

        if (this.connectTimeout) {
          clearTimeout(this.connectTimeout);
          this.connectTimeout = null;
        }

        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.lastPongTime = Date.now();

        this.startHeartbeat();

        this.statusHandler?.(true);

        if (!settled) {
          settled = true;
          resolve();
        }
      };

ws.onmessage = (event) => {
  if (this.destroyed) return;

  try {
    const parsed = JSON.parse(event.data);

    const msgType = parsed?.type?.toLowerCase?.();

    if (
      msgType === "pong" ||
      msgType === "heartbeat_ack" ||
      msgType === "heartbeatack"
    ) {
      this.lastPongTime = Date.now();
      console.log("[WS] Heartbeat ACK received");
      return;
    }

    if (!isVersionedServerMessage(parsed)) {
      console.warn(
        "[WS] Invalid server message:",
        parsed
      );
      return;
    }

    this.messageHandler?.(parsed);
  } catch (err) {
    console.error("[WS] Parse error:", err);
  }
};

      ws.onerror = (err) => {
        console.error("[WS] Error:", err);

        if (!settled) {
          settled = true;
          this.isConnecting = false;
          reject(
            new Error("WebSocket connection failed")
          );
        }
      };

      ws.onclose = (event) => {
        console.warn(
          "[WS CLOSED]",
          {
            code: event.code,
            reason: event.reason,
            wasClean: event.wasClean,
          }
        );

        if (this.connectTimeout) {
          clearTimeout(this.connectTimeout);
          this.connectTimeout = null;
        }

        this.isConnecting = false;
        this.stopHeartbeat();

        this.statusHandler?.(false);

        this.ws = null;

        if (
          !this.manuallyClosed &&
          !this.destroyed
        ) {
          this.scheduleReconnect();
        }
      };
    });
  }

  send(message: ClientMessage) {
    if (!this.ws) {
      console.warn(
        "[WS SEND FAILED] Socket does not exist"
      );
      return;
    }

    if (this.ws.readyState !== WebSocket.OPEN) {
      console.warn(
        "[WS SEND FAILED] Socket not open:",
        this.ws.readyState
      );
      return;
    }

    try {
      this.ws.send(
        JSON.stringify({
          version: "1",
          ...message,
        })
      );
    } catch (err) {
      console.error("[WS SEND ERROR]", err);
    }
  }

  disconnect() {
    console.log("[WS] Manual disconnect");

    this.manuallyClosed = true;
    this.cleanupSocket(true);
  }

  destroy() {
    console.log("[WS] Destroy client");

    this.destroyed = true;
    this.manuallyClosed = true;
    this.cleanupSocket(true);
  }

  private cleanupSocket(sendDisconnect: boolean) {
    this.stopHeartbeat();

    if (this.connectTimeout) {
      clearTimeout(this.connectTimeout);
      this.connectTimeout = null;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      try {
        if (
          sendDisconnect &&
          this.ws.readyState === WebSocket.OPEN
        ) {
          this.send({
            type: "disconnect",
          });
        }

        this.ws.onopen = null;
        this.ws.onmessage = null;
        this.ws.onerror = null;
        this.ws.onclose = null;

        this.ws.close();
      } catch (err) {
        console.error(
          "[WS CLEANUP ERROR]",
          err
        );
      }

      this.ws = null;
    }

    this.isConnecting = false;
  }

  private startHeartbeat() {
    this.stopHeartbeat();

    this.heartbeatTimer = setInterval(() => {
      const now = Date.now();
      const silence = now - this.lastPongTime;

      if (silence > this.PONG_TIMEOUT) {
        console.error(
          "[WS] Pong timeout. Closing socket."
        );

        this.ws?.close();
        return;
      }

      this.send({
        type: "heartbeat",
      });
    }, this.HEARTBEAT_INTERVAL);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private scheduleReconnect() {
    if (
      this.reconnectTimer ||
      this.manuallyClosed ||
      this.destroyed
    ) {
      return;
    }

    this.reconnectAttempts++;

    const delay = Math.min(
      3000 * this.reconnectAttempts,
      this.MAX_RECONNECT_DELAY
    );

    console.log(
      `[WS] Reconnecting in ${delay / 1000}s...`
    );

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;

      if (!this.messageHandler) {
        console.warn(
          "[WS] No message handler, skipping reconnect"
        );
        return;
      }

      this.connect(
        this.messageHandler,
        this.statusHandler
      ).catch((err) => {
        console.error(
          "[WS] Reconnect failed:",
          err
        );

        if (
          !this.manuallyClosed &&
          !this.destroyed
        ) {
          this.scheduleReconnect();
        }
      });
    }, delay);
  }
}