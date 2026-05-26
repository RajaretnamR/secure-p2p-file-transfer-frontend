import {
  ClientMessage,
  VersionedServerMessage,
  isVersionedServerMessage,
} from "@/lib/protocol";

type MessageHandler = (
  message: VersionedServerMessage
) => void;

type StatusHandler = (
  connected: boolean
) => void;

export class SignalingClient {
  private ws: WebSocket | null = null;
  private heartbeatTimer: NodeJS.Timeout | null =
    null;
  private reconnectTimer: NodeJS.Timeout | null =
    null;
  private connectTimeout: NodeJS.Timeout | null =
    null;

  private messageHandler?: MessageHandler;
  private statusHandler?: StatusHandler;

  private manuallyClosed = false;
  private isConnecting = false;
  private destroyed = false;

  private reconnectAttempts = 0;
  private lastPongTime = Date.now();

  private readonly HEARTBEAT_INTERVAL = 20000;
  private readonly PONG_TIMEOUT = 45000;
  private readonly CONNECT_TIMEOUT = 30000;
  private readonly MAX_RECONNECT_DELAY = 30000;

  connect(
    onMessage: MessageHandler,
    onStatusChange?: StatusHandler
  ): Promise<void> {
    if (this.destroyed) {
      return Promise.reject(
        new Error("Client destroyed")
      );
    }

    if (this.isConnecting) {
      return Promise.reject(
        new Error("Already connecting")
      );
    }

    if (
      this.ws &&
      this.ws.readyState === WebSocket.OPEN
    ) {
      return Promise.resolve();
    }

    const wsUrl =
      process.env.NEXT_PUBLIC_SIGNALING_WS_URL;

    if (!wsUrl) {
      return Promise.reject(
        new Error(
          "NEXT_PUBLIC_SIGNALING_WS_URL missing"
        )
      );
    }

    this.cleanupSocket(false);

    this.messageHandler = onMessage;
    this.statusHandler = onStatusChange;
    this.manuallyClosed = false;
    this.isConnecting = true;

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      this.ws = ws;

      let settled = false;

      this.connectTimeout = setTimeout(() => {
        if (ws.readyState === WebSocket.CONNECTING) {
          console.error(
            "[WS] Connection timeout"
          );

          if (!settled) {
            settled = true;
            this.isConnecting = false;
            reject(
              new Error(
                "WebSocket connection timeout"
              )
            );
          }

          ws.close();
        }
      }, this.CONNECT_TIMEOUT);

      ws.onopen = () => {
        if (this.destroyed || this.ws !== ws) {
          ws.close();
          return;
        }

        if (this.connectTimeout) {
          clearTimeout(this.connectTimeout);
          this.connectTimeout = null;
        }

        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.lastPongTime = Date.now();

        this.startHeartbeat(ws);

        this.statusHandler?.(true);

        if (!settled) {
          settled = true;
          resolve();
        }
      };

      ws.onmessage = (event) => {
        if (
          this.destroyed ||
          this.ws !== ws
        ) {
          return;
        }

        try {
          const parsed = JSON.parse(
            event.data
          );

          const msgType =
            parsed?.type?.toLowerCase?.();

          if (
            msgType === "pong" ||
            msgType === "heartbeat_ack" ||
            msgType === "heartbeatack"
          ) {
            this.lastPongTime = Date.now();
            return;
          }

          if (
            !isVersionedServerMessage(parsed)
          ) {
            return;
          }

          this.messageHandler?.(parsed);
        } catch (err) {
          console.error(
            "[WS Parse Error]",
            err
          );
        }
      };

      ws.onerror = (err) => {
        console.error(
          "[WS Error]",
          err
        );
      };

      ws.onclose = (event) => {
        console.warn(
          "[WS CLOSED]",
          event.code
        );

        if (this.connectTimeout) {
          clearTimeout(this.connectTimeout);
          this.connectTimeout = null;
        }

        this.stopHeartbeat();

        if (this.ws === ws) {
          this.ws = null;
        }

        this.isConnecting = false;

        this.statusHandler?.(false);

        if (
          !settled &&
          event.code !== 1000
        ) {
          settled = true;
          reject(
            new Error(
              "WebSocket closed before connect"
            )
          );
        }

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
    if (
      !this.ws ||
      this.ws.readyState !==
        WebSocket.OPEN
    ) {
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
      console.error(
        "[WS SEND ERROR]",
        err
      );
    }
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

  private cleanupSocket(
    sendDisconnect: boolean
  ) {
    this.stopHeartbeat();

    if (this.connectTimeout) {
      clearTimeout(this.connectTimeout);
      this.connectTimeout = null;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    const socket = this.ws;

    if (!socket) {
      this.isConnecting = false;
      return;
    }

    try {
      if (
        sendDisconnect &&
        socket.readyState ===
          WebSocket.OPEN
      ) {
        socket.send(
          JSON.stringify({
            version: "1",
            type: "disconnect",
          })
        );
      }

      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;

      socket.close();
    } catch {}

    this.ws = null;
    this.isConnecting = false;
  }

  private startHeartbeat(
    ws: WebSocket
  ) {
    this.stopHeartbeat();

    this.heartbeatTimer = setInterval(() => {
      if (this.ws !== ws) {
        return;
      }

      const silence =
        Date.now() - this.lastPongTime;

      if (
        silence > this.PONG_TIMEOUT
      ) {
        ws.close();
        return;
      }

      this.send({
        type: "heartbeat",
      });
    }, this.HEARTBEAT_INTERVAL);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(
        this.heartbeatTimer
      );
      this.heartbeatTimer = null;
    }
  }

  private scheduleReconnect() {
    if (
      this.reconnectTimer ||
      this.manuallyClosed ||
      this.destroyed ||
      !this.messageHandler
    ) {
      return;
    }

    this.reconnectAttempts++;

    const delay = Math.min(
      this.reconnectAttempts * 1000,
      this.MAX_RECONNECT_DELAY
    );

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;

      this.connect(
        this.messageHandler!,
        this.statusHandler
      ).catch(() => {
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