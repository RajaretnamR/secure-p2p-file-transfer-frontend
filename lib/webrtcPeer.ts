import {
  IceCandidatePayload,
  DataChannelControlMessage,
} from "@/types/transfer";

type IceHandler = (
  candidate: IceCandidatePayload
) => void;

type StateHandler = (
  state: RTCPeerConnectionState
) => void;

type ControlMessageHandler = (
  message: DataChannelControlMessage
) => void;

type BinaryChunkHandler = (
  chunk: ArrayBuffer
) => void;

export class WebRTCPeer {
  private pc: RTCPeerConnection;
  private pendingCandidates: RTCIceCandidateInit[] = [];

  private onIceCandidate?: IceHandler;
  private onStateChange?: StateHandler;
  private onControlMessage?: ControlMessageHandler;
  private onBinaryChunk?: BinaryChunkHandler;

  private dataChannel?: RTCDataChannel;

  private readonly BUFFER_LIMIT =
    8 * 1024 * 1024;

  constructor(
    onIceCandidate?: IceHandler,
    onStateChange?: StateHandler
  ) {
    const stunUrl =
      process.env.NEXT_PUBLIC_STUN_URL ||
      "stun:stun.l.google.com:19302";

    const turnUrl =
      process.env.NEXT_PUBLIC_TURN_URL;

    const turnUsername =
      process.env.NEXT_PUBLIC_TURN_USERNAME;

    const turnPassword =
      process.env.NEXT_PUBLIC_TURN_PASSWORD;

    const iceServers: RTCIceServer[] = [
      {
        urls: [stunUrl],
      },
    ];

if (
  turnUrl &&
  turnUsername &&
  turnPassword
) {
  iceServers.push({
    urls: [
      turnUrl,
      `${turnUrl}?transport=tcp`,
      "turn:global.relay.metered.ca:443",
      "turns:global.relay.metered.ca:443?transport=tcp",
    ],
    username: turnUsername,
    credential: turnPassword,
  });
}

    console.log("[ICE SERVERS]", iceServers);

    this.pc = new RTCPeerConnection({
      iceServers,
      iceCandidatePoolSize: 10,
      iceTransportPolicy: "all",
    });

    this.onIceCandidate = onIceCandidate;
    this.onStateChange = onStateChange;

    this.attachPeerHandlers();
  }

  private attachPeerHandlers() {
    this.pc.onicecandidate = (event) => {
      if (!event.candidate) return;

      console.log(
        "[ICE CANDIDATE GENERATED]"
      );

      this.onIceCandidate?.({
        candidate:
          event.candidate.candidate,
        sdpMid:
          event.candidate.sdpMid,
        sdpMLineIndex:
          event.candidate.sdpMLineIndex,
      });
    };

    this.pc.onconnectionstatechange = () => {
      console.log(
        "[WEBRTC CONNECTION STATE]",
        this.pc.connectionState
      );

      this.onStateChange?.(
        this.pc.connectionState
      );
    };

    this.pc.oniceconnectionstatechange =
      () => {
        console.log(
          "[ICE CONNECTION STATE]",
          this.pc.iceConnectionState
        );
      };

    this.pc.onicegatheringstatechange =
      () => {
        console.log(
          "[ICE GATHERING STATE]",
          this.pc.iceGatheringState
        );
      };

    this.pc.onsignalingstatechange = () => {
      console.log(
        "[SIGNALING STATE]",
        this.pc.signalingState
      );
    };

    this.pc.onicecandidateerror = (
      event
    ) => {
     console.warn("[ICE candidate warning]", event.url);
    };

    this.pc.ondatachannel = (event) => {
      console.log(
        "[DATA CHANNEL RECEIVED]",
        event.channel.label
      );

      this.dataChannel =
        event.channel;

      this.setupDataChannelHandlers();
    };
  }

  setDataHandlers(
    onControlMessage: ControlMessageHandler,
    onBinaryChunk: BinaryChunkHandler
  ) {
    this.onControlMessage =
      onControlMessage;

    this.onBinaryChunk =
      onBinaryChunk;
  }

  createFileChannel() {
    this.dataChannel =
      this.pc.createDataChannel(
        "file-transfer",
        {
          ordered: true,
        }
      );

    this.setupDataChannelHandlers();
  }

  isDataChannelReady(): boolean {
    return (
      this.dataChannel?.readyState ===
      "open"
    );
  }

  private setupDataChannelHandlers() {
    if (!this.dataChannel) return;

    this.dataChannel.binaryType =
      "arraybuffer";

    this.dataChannel.bufferedAmountLowThreshold =
      512 * 1024;

    this.dataChannel.onopen = () => {
      console.log(
        "[DATA CHANNEL OPEN]"
      );
    };

    this.dataChannel.onerror = (
      err
    ) => {
      console.error(
        "[DATA CHANNEL ERROR]",
        err
      );
    };

    this.dataChannel.onclose = () => {
      console.warn(
        "[DATA CHANNEL CLOSED]"
      );
    };

    this.dataChannel.onmessage =
      async (event) => {
        if (
          typeof event.data ===
          "string"
        ) {
          try {
            const parsed =
              JSON.parse(
                event.data
              ) as DataChannelControlMessage;

            this.onControlMessage?.(
              parsed
            );

            return;
          } catch {}
        }

        if (
          event.data instanceof
          ArrayBuffer
        ) {
          this.onBinaryChunk?.(
            event.data
          );
          return;
        }

        if (
          event.data instanceof Blob
        ) {
          const buffer =
            await event.data.arrayBuffer();

          this.onBinaryChunk?.(
            buffer
          );
        }
      };
  }

  sendControlMessage(
    message: DataChannelControlMessage
  ) {
    if (
      !this.isDataChannelReady()
    ) {
      throw new Error(
        "Data channel not ready"
      );
    }

    this.dataChannel!.send(
      JSON.stringify(message)
    );
  }

  async sendBinaryChunk(
    chunk: ArrayBuffer
  ) {
    if (
      !this.isDataChannelReady()
    ) {
      throw new Error(
        "Data channel not ready"
      );
    }

    if (
      this.dataChannel!
        .bufferedAmount >
      this.BUFFER_LIMIT
    ) {
      await new Promise<void>(
        (resolve) => {
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
        }
      );
    }

    this.dataChannel!.send(chunk);
  }

  async createOffer(): Promise<string> {
    console.log(
      "[CREATE OFFER]"
    );

    const offer =
      await this.pc.createOffer();

    await this.pc.setLocalDescription(
      offer
    );

    return offer.sdp || "";
  }

  async receiveOffer(
    sdp: string
  ): Promise<string> {
    console.log(
      "[RECEIVE OFFER]"
    );

    await this.pc.setRemoteDescription(
      {
        type: "offer",
        sdp,
      }
    );

    await this.flushPendingCandidates();

    const answer =
      await this.pc.createAnswer();

    await this.pc.setLocalDescription(
      answer
    );

    return answer.sdp || "";
  }

  async receiveAnswer(
    sdp: string
  ) {
    console.log(
      "[RECEIVE ANSWER]"
    );

    await this.pc.setRemoteDescription(
      {
        type: "answer",
        sdp,
      }
    );

    await this.flushPendingCandidates();
  }

  async addIceCandidate(
    candidate: IceCandidatePayload
  ) {
    const ice: RTCIceCandidateInit =
      {
        candidate:
          candidate.candidate,
        sdpMid:
          candidate.sdpMid,
        sdpMLineIndex:
          candidate.sdpMLineIndex,
      };

    if (
      !this.pc.remoteDescription
    ) {
      this.pendingCandidates.push(
        ice
      );
      return;
    }

    try {
      await this.pc.addIceCandidate(
        ice
      );
    } catch (err) {
      console.error(
        "[ICE ADD FAILED]",
        err
      );
    }
  }

  private async flushPendingCandidates() {
    for (const candidate of this
      .pendingCandidates) {
      try {
        await this.pc.addIceCandidate(
          candidate
        );
      } catch (err) {
        console.error(
          "[PENDING ICE FAILED]",
          err
        );
      }
    }

    this.pendingCandidates = [];
  }

  close() {
    console.warn(
      "[WEBRTC CLOSE]"
    );

    if (this.dataChannel) {
  this.dataChannel.onopen = null;
  this.dataChannel.onmessage = null;
  this.dataChannel.onerror = null;
  this.dataChannel.onclose = null;
  this.dataChannel.close();
}

    this.pc.onicecandidate = null;
    this.pc.onconnectionstatechange =
      null;
    this.pc.oniceconnectionstatechange =
      null;
    this.pc.onicegatheringstatechange =
      null;
    this.pc.onsignalingstatechange =
      null;
    this.pc.onicecandidateerror =
      null;
    this.pc.ondatachannel = null;

    this.pc.close();
  }
}