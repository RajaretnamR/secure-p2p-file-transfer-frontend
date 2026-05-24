import {
  IceCandidatePayload,
  DataChannelControlMessage,
} from "@/types/transfer";

type IceHandler = (candidate: IceCandidatePayload) => void;
type StateHandler = (state: RTCPeerConnectionState) => void;
type ControlMessageHandler = (
  message: DataChannelControlMessage
) => void;
type BinaryChunkHandler = (chunk: ArrayBuffer) => void;

export class WebRTCPeer {
  private pc: RTCPeerConnection;
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private onIceCandidate?: IceHandler;
  private onStateChange?: StateHandler;
  private onControlMessage?: ControlMessageHandler;
  private onBinaryChunk?: BinaryChunkHandler;
  private dataChannel?: RTCDataChannel;

  private readonly BUFFER_LIMIT = 4 * 1024 * 1024;

  constructor(
    onIceCandidate?: IceHandler,
    onStateChange?: StateHandler
  ) {
    const stunUrl =
      process.env.NEXT_PUBLIC_STUN_URL ||
      "stun:stun.l.google.com:19302";

    const turnUrl = process.env.NEXT_PUBLIC_TURN_URL;
    const turnUsername = process.env.NEXT_PUBLIC_TURN_USERNAME;
    const turnPassword = process.env.NEXT_PUBLIC_TURN_PASSWORD;

    const iceServers: RTCIceServer[] = [
      {
        urls: stunUrl,
      },
    ];

    if (turnUrl && turnUsername && turnPassword) {
      iceServers.push({
        urls: turnUrl,
        username: turnUsername,
        credential: turnPassword,
      });
    }

    this.pc = new RTCPeerConnection({
      iceServers,
    });

    this.onIceCandidate = onIceCandidate;
    this.onStateChange = onStateChange;

    this.pc.onicecandidate = (event) => {
      if (!event.candidate) return;

      this.onIceCandidate?.({
        candidate: event.candidate.candidate,
        sdpMid: event.candidate.sdpMid,
        sdpMLineIndex: event.candidate.sdpMLineIndex,
      });
    };

    this.pc.onconnectionstatechange = () => {
      console.log("[WEBRTC] State:", this.pc.connectionState);
      this.onStateChange?.(this.pc.connectionState);
    };

    this.pc.ondatachannel = (event) => {
      console.log(
        "[WEBRTC] Data channel received:",
        event.channel.label
      );

      this.dataChannel = event.channel;
      this.setupDataChannelHandlers();
    };
  }

  setDataHandlers(
    onControlMessage: ControlMessageHandler,
    onBinaryChunk: BinaryChunkHandler
  ) {
    this.onControlMessage = onControlMessage;
    this.onBinaryChunk = onBinaryChunk;
  }

  createFileChannel() {
    this.dataChannel =
      this.pc.createDataChannel("file-transfer");

    this.setupDataChannelHandlers();
  }

  isDataChannelReady(): boolean {
    return this.dataChannel?.readyState === "open";
  }

  private setupDataChannelHandlers() {
    if (!this.dataChannel) return;

    this.dataChannel.binaryType = "arraybuffer";
    this.dataChannel.bufferedAmountLowThreshold = 512 * 1024;

    this.dataChannel.onopen = () => {
      console.log("[DATA] Channel opened");
    };

    this.dataChannel.onerror = (err) => {
      console.warn("[DATA] Channel warning:", err);
    };

    this.dataChannel.onclose = () => {
      console.log("[DATA] Channel closed normally");
    };

          this.dataChannel.onmessage = async (event) => {
            if (typeof event.data === "string") {
              try {
                const parsed =
                  JSON.parse(event.data) as DataChannelControlMessage;

                this.onControlMessage?.(parsed);
                return;
              } catch {
                // not json, continue
              }
            }

            if (event.data instanceof Blob) {
              const text = await event.data.text();

              try {
                const parsed =
                  JSON.parse(text) as DataChannelControlMessage;

                this.onControlMessage?.(parsed);
                return;
              } catch {
                const buffer =
                  await event.data.arrayBuffer();

                this.onBinaryChunk?.(buffer);
                return;
              }
            }

            if (event.data instanceof ArrayBuffer) {
              this.onBinaryChunk?.(event.data);
            }
          };
  }

  sendControlMessage(message: DataChannelControlMessage) {
    if (!this.isDataChannelReady()) {
      throw new Error("Data channel not ready");
    }

    this.dataChannel!.send(JSON.stringify(message));
  }

  async sendBinaryChunk(chunk: ArrayBuffer) {
    if (!this.isDataChannelReady()) {
      throw new Error("Data channel not ready");
    }

    if (this.dataChannel!.bufferedAmount > this.BUFFER_LIMIT) {
      await new Promise<void>((resolve) => {
        const handler = () => {
          this.dataChannel?.removeEventListener(
            "bufferedamountlow",
            handler
          );
          resolve();
        };

        this.dataChannel?.addEventListener(
          "bufferedamountlow",
          handler
        );
      });
    }

    this.dataChannel!.send(chunk);
  }

  async createOffer(): Promise<string> {
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    return offer.sdp || "";
  }

  async receiveOffer(sdp: string): Promise<string> {
    await this.pc.setRemoteDescription({
      type: "offer",
      sdp,
    });

    await this.flushPendingCandidates();

    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);

    return answer.sdp || "";
  }

  async receiveAnswer(sdp: string) {
    await this.pc.setRemoteDescription({
      type: "answer",
      sdp,
    });

    await this.flushPendingCandidates();
  }

  async addIceCandidate(candidate: IceCandidatePayload) {
    const ice: RTCIceCandidateInit = {
      candidate: candidate.candidate,
      sdpMid: candidate.sdpMid,
      sdpMLineIndex: candidate.sdpMLineIndex,
    };

    if (!this.pc.remoteDescription) {
      this.pendingCandidates.push(ice);
      return;
    }

    await this.pc.addIceCandidate(ice);
  }

  private async flushPendingCandidates() {
    for (const candidate of this.pendingCandidates) {
      await this.pc.addIceCandidate(candidate);
    }

    this.pendingCandidates = [];
  }

  close() {
    if (this.dataChannel) {
      this.dataChannel.close();
    }

    this.pc.close();
  }
}