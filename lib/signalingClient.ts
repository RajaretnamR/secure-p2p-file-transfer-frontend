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

  private messageHandler?: MessageHandler;
  private statusHandler?: StatusHandler;

  private manuallyClosed = false;
  private isConnecting = false;
  private destroyed = false;

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
      return Promise.resolve();
    }

    this.cleanupSocket(false);

    this.messageHandler = onMessage;
    this.statusHandler = onStatusChange;
    this.manuallyClosed = false;
    this.isConnecting = true;

    const wsUrl =
      process.env.NEXT_PUBLIC_SIGNALING_WS_URL ||
      "ws://127.0.0.1:8000/ws";

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      this.ws = ws;

      let settled = false;

      ws.onopen = () => {
        if (this.destroyed) {
          ws.close();
          return;
        }

        console.log("[WS] Connected");

        this.isConnecting = false;
        this.startHeartbeat();

        this.statusHandler?.(true);

        settled = true;
        resolve();
      };

      ws.onmessage = (event) => {
        if (this.destroyed) return;

        try {
          const parsed = JSON.parse(event.data);

          if (!isVersionedServerMessage(parsed)) {
            console.warn("[WS] Invalid message", parsed);
            return;
          }

          this.messageHandler?.(parsed);
        } catch (err) {
          console.error("[WS] Parse error", err);
        }
      };

      ws.onerror = (err) => {
        console.error("[WS] Error", err);

        if (!settled) {
          settled = true;
          this.isConnecting = false;
          reject(new Error("WebSocket connection failed"));
        }
      };

      ws.onclose = () => {
        console.warn("[WS] Closed");

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
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    this.ws.send(
      JSON.stringify({
        version: "1",
        ...message,
      })
    );
  }

  disconnect() {
    this.manuallyClosed = true;
    this.cleanupSocket(true);
  }

  destroy() {
    this.destroyed = true;
    this.manuallyClosed = true;
    this.cleanupSocket(true);
  }

  private cleanupSocket(sendDisconnect: boolean) {
    this.stopHeartbeat();

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
          this.send({ type: "disconnect" });
        }

        this.ws.onopen = null;
        this.ws.onmessage = null;
        this.ws.onerror = null;
        this.ws.onclose = null;

        this.ws.close();
      } catch {}

      this.ws = null;
    }

    this.isConnecting = false;
  }

  private startHeartbeat() {
    this.stopHeartbeat();

    this.heartbeatTimer = setInterval(() => {
      this.send({
        type: "heartbeat",
      });
    }, 20000);
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

    console.log("[WS] Reconnecting in 3s...");

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;

      if (!this.messageHandler) {
        return;
      }

      this.connect(
        this.messageHandler,
        this.statusHandler
      ).catch((err) => {
        console.error("[WS] Reconnect failed", err);
      });
    }, 3000);
  }
}