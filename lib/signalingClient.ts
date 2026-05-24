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

  connect(
    onMessage: MessageHandler,
    onStatusChange?: StatusHandler
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const wsUrl =
        process.env.NEXT_PUBLIC_SIGNALING_WS_URL ||
        "ws://127.0.0.1:8000/ws";

      this.messageHandler = onMessage;
      this.statusHandler = onStatusChange;
      this.manuallyClosed = false;

      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log("[WS] Connected");
        this.startHeartbeat();

        if (this.statusHandler) {
          this.statusHandler(true);
        }

        resolve();
      };

      this.ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);

          if (!isVersionedServerMessage(parsed)) {
            console.warn("[WS] Invalid message shape", parsed);
            return;
          }

          this.messageHandler?.(parsed);
        } catch (err) {
          console.error("[WS] Parse error", err);
        }
      };

        this.ws.onerror = () => {
        console.error("[WS] WebSocket connection failed");
        reject(new Error("WebSocket connection failed"));
        };

      this.ws.onclose = () => {
        console.warn("[WS] Closed");
        this.stopHeartbeat();

        if (this.statusHandler) {
          this.statusHandler(false);
        }

        if (!this.manuallyClosed) {
          this.scheduleReconnect();
        }
      };
    });
  }

  send(message: ClientMessage) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn("[WS] Cannot send, socket not open");
      return;
    }

    console.log("[WS] Sending:", message);
            this.ws.send(
        JSON.stringify({
            version: "1",
            ...message,
        })
        );
  }

        close() {
        this.manuallyClosed = true;
        this.stopHeartbeat();

        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        }
  disconnect() {
    this.manuallyClosed = true;
    this.stopHeartbeat();

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.send({ type: "disconnect" });
      this.ws.close();
      this.ws = null;
    }
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
    if (this.reconnectTimer) return;

    console.log("[WS] Reconnecting in 3s...");

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;

      if (this.messageHandler) {
        this.connect(this.messageHandler, this.statusHandler).catch((err) =>
          console.error("[WS] Reconnect failed", err)
        );
      }
    }, 3000);
  }
}