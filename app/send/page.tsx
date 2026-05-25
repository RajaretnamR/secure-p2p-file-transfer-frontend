"use client";
import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import QRCode from "qrcode";

import { SignalingClient } from "@/lib/signalingClient";
import { WebRTCPeer } from "@/lib/webrtcPeer";
import { VersionedServerMessage } from "@/lib/protocol";
import { generateSHA256 } from "@/lib/hash";

import {
  SenderState,
  IceCandidatePayload,
  FileMetadata,
} from "@/types/transfer";

const CHUNK_SIZE = 64 * 1024;

function formatBytes(bytes: number) {
  return (bytes / 1024 / 1024).toFixed(2);
}

function formatEta(seconds: number) {
  if (!isFinite(seconds) || seconds < 0) return "--";

  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);

  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export default function SendPage() {
  const [state, setState] =
    useState<SenderState>("idle");

  const [transferId, setTransferId] =
    useState("");

  const [statusText, setStatusText] =
    useState("Ready");

  const [receiverId, setReceiverId] =
    useState("");

  const [wsConnected, setWsConnected] =
    useState(false);
    
const [selectedFiles, setSelectedFiles] =
  useState<File[]>([]);

    const [isDragging, setIsDragging] = useState(false);

  const [transferProgress, setTransferProgress] =
    useState(0);

  const [isSending, setIsSending] =
    useState(false);

  const [bytesSent, setBytesSent] =
    useState(0);

  const [transferSpeed, setTransferSpeed] =
    useState(0);

  const [etaSeconds, setEtaSeconds] =
    useState(0);

  const [qrCodeUrl, setQrCodeUrl] =
    useState("");

  const signalingRef =
    useRef<SignalingClient | null>(null);

  const peerRef =
    useRef<WebRTCPeer | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);

  const transferIdRef = useRef("");
  const tokenRef = useRef("");
  const receiverIdRef = useRef("");

  const cancelTransferRef = useRef(false);
  const transferCompletedRef = useRef(false);
  const isSendingRef = useRef(false);

useEffect(() => {
  cancelTransferRef.current = false;

  const signaling = new SignalingClient();
  signalingRef.current = signaling;

  const connectSender = async () => {
    try {
      setState("connecting");
      setStatusText("Connecting to signaling server...");

      await signaling.connect(
        handleServerMessage,
        (connected) => {
          setWsConnected(connected);

          if (!connected) {
            setStatusText("Connection lost. Reconnecting...");
          }
        }
      );

      signaling.send({
        type: "register",
        role: "sender",
      });

    } catch (err) {
      console.error(err);
      setState("failed");
      setStatusText("Failed to connect");
    }
  };

  connectSender();

  return () => {
    cancelTransferRef.current = true;

    if (peerRef.current) {
      peerRef.current.close();
      peerRef.current = null;
    }

    if (signalingRef.current) {
      signalingRef.current.destroy();
      signalingRef.current = null;
    }
  };
}, []);

const handleServerMessage = async (
  msg: VersionedServerMessage
) => {
  console.log("[SERVER]", msg);

  try {
    switch (msg.type) {
      case "registered": {
        setState("registered");
        setStatusText("Sender registered");

        // clear old session before creating fresh one
        setTransferId("");
        setQrCodeUrl("");
        transferIdRef.current = "";
        tokenRef.current = "";
        receiverIdRef.current = "";

        signalingRef.current?.send({
          type: "create-session",
        });

        break;
      }

      case "session-created": {
        setTransferId(msg.transferId);

        transferIdRef.current = msg.transferId;
        tokenRef.current = msg.token;

        const qrData = `${window.location.origin}/receive?code=${msg.transferId}`;

        try {
          const qrImage = await QRCode.toDataURL(qrData);
          setQrCodeUrl(qrImage);
        } catch (err) {
          console.error("QR generation failed", err);
          setState("failed");
          setStatusText("QR generation failed");
          return;
        }

        setState("waiting-receiver");
        setStatusText("Waiting for receiver...");

        break;
      }

      case "join-request": {
        setReceiverId(msg.receiverId);
        receiverIdRef.current = msg.receiverId;

        setStatusText("Receiver requested to join");

        break;
      }

      case "peer-joined": {
        console.log("Peer joined, starting connection");

        if (peerRef.current) {
          peerRef.current.close();
          peerRef.current = null;
        }

        await startPeerConnection();

        break;
      }

      case "relay-answer": {
        await peerRef.current?.receiveAnswer(msg.sdp);
        break;
      }

      case "relay-ice-candidate": {
        await peerRef.current?.addIceCandidate({
          candidate: msg.candidate,
          sdpMid: msg.sdpMid,
          sdpMLineIndex: msg.sdpMLineIndex,
        });
        break;
      }

      case "peer-disconnected": {
        if (transferCompletedRef.current) {
          toast.success("Transfer completed");
          break;
        }

        if (isSendingRef.current) {
          break;
        }

        if (peerRef.current) {
          peerRef.current.close();
          peerRef.current = null;
        }

        receiverIdRef.current = "";

        setState("waiting-receiver");
        setStatusText("Receiver disconnected. Waiting for new receiver...");

        break;
      }

      case "heartbeat-ack": {
        break;
      }

      case "error": {
        console.error("Server error:", msg.code, msg.message);

      if (msg.code === "SESSION_EXPIRED") {
        transferIdRef.current = "";
        tokenRef.current = "";
        receiverIdRef.current = "";

        setTransferId("");
        setQrCodeUrl("");

        setStatusText("Session expired. Recreating session...");

        signalingRef.current?.send({
          type: "create-session",
        });

        break;
      }

        if (
          msg.code === "ALREADY_REGISTERED" &&
          msg.message.includes("already registered")
        ) {
          console.warn("Ignoring already registered");
          break;
        }

        setState("failed");
        setStatusText(msg.message);

        break;
      }

      default:
        console.warn("Unhandled server message", msg);
    }
  } catch (err) {
    console.error("handleServerMessage crash:", err);
    setState("failed");
    setStatusText("Unexpected client error");
  }
};

  const startPeerConnection = async () => {
    const peer = new WebRTCPeer(
      (candidate: IceCandidatePayload) => {
        if (!transferIdRef.current) return;

        signalingRef.current?.send({
          type: "ice-candidate",
          transferId:
            transferIdRef.current,
          candidate:
            candidate.candidate,
          sdpMid: candidate.sdpMid,
          sdpMLineIndex:
            candidate.sdpMLineIndex,
        });
      },
      (connectionState) => {
        console.log(
          "[SEND] Peer state:",
          connectionState
        );

        if (
  connectionState === "connected"
) {
  setState("connected");
  setStatusText("CONNECTED");

  toast.success("Receiver connected");

  return;
}

        if (
          connectionState ===
          "disconnected"
        ) {
          if (
            transferCompletedRef.current
          ) {
            toast.success("Transfer completed");
            return;
          }

setState("failed");
setStatusText("Connection lost");

toast.error("Transfer failed");
          return;
        }

        if (
          connectionState === "closed"
        ) {
          if (
            transferCompletedRef.current
          ) {
           toast.success("Transfer completed");
            return;
          }

          setState("failed");
          setStatusText(
            "Connection closed"
          );

          toast.error("Transfer failed");
          return;
        }

        if (
          connectionState === "failed"
        ) {
          if (
            transferCompletedRef.current
          ) {
           toast.success("Transfer completed");
            return;
          }

          setState("failed");
          toast.error("Transfer failed");
        }
      }
    );

    peerRef.current = peer;

    peer.createFileChannel();

    const offerSdp =
      await peer.createOffer();

    signalingRef.current?.send({
      type: "offer",
      transferId:
        transferIdRef.current,
      sdp: offerSdp,
    });

    setState("peer-connecting");
    setStatusText(
      "Offer sent. Connecting..."
    );
  };

  const approveReceiver = () => {
    if (!receiverIdRef.current) return;

    signalingRef.current?.send({
      type: "approve-join",
      transferId:
        transferIdRef.current,
      token: tokenRef.current,
      receiverId:
        receiverIdRef.current,
    });
  };

  const handleFileSelect = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
const files = event.target.files;

if (!files?.length) return;

setSelectedFiles(Array.from(files));
    setTransferProgress(0);
    setBytesSent(0);
    setTransferSpeed(0);
    setEtaSeconds(0);

    transferCompletedRef.current =
      false;

    toast.success("File selected");
  };

  const cancelTransfer = () => {
    cancelTransferRef.current = true;
    isSendingRef.current = false;

    setIsSending(false);

    setStatusText(
      "Transfer cancelled"
    );
  };

  const copyTransferCode = async () => {
  if (!transferId) return;

  try {
    await navigator.clipboard.writeText(transferId);
    toast.success("Code copied");
  } catch (err) {
    console.error(err);
    setStatusText("Copy failed");
  }
};

const resetSender = async () => {
  try {
    if (peerRef.current) {
      peerRef.current.close();
      peerRef.current = null;
    }

    if (signalingRef.current) {
      signalingRef.current.destroy();
      signalingRef.current = null;
    }
  } catch (err) {
    console.warn(err);
  }

  transferCompletedRef.current = false;
  transferIdRef.current = "";
  tokenRef.current = "";
  receiverIdRef.current = "";
  isSendingRef.current = false;
  cancelTransferRef.current = false;

  setState("idle");
  setTransferId("");
  setStatusText("Ready");
  setQrCodeUrl("");

  setSelectedFiles([]);
  setTransferProgress(0);
  setBytesSent(0);
  setTransferSpeed(0);
  setEtaSeconds(0);

  setWsConnected(false);

  const signaling = new SignalingClient();
  signalingRef.current = signaling;

  try {
    await signaling.connect(
      handleServerMessage,
      setWsConnected
    );

    signaling.send({
      type: "register",
      role: "sender",
    });

  } catch (err) {
    console.error(err);
    toast.error("Reconnect failed");
    setState("failed");
    setStatusText("Reconnect failed");
  }
};

  const sendFile = async () => {
      if (
        !selectedFiles.length ||
        !peerRef.current
      ) {
        return;
      }

    if (
      !peerRef.current.isDataChannelReady()
    ) {
      setStatusText(
        "Data channel not ready"
      );
      return;
    }

    isSendingRef.current = true;
    transferCompletedRef.current =
      false;

    cancelTransferRef.current = false;

    setIsSending(true);
    setTransferProgress(0);
    setBytesSent(0);
    setTransferSpeed(0);
    setEtaSeconds(0);

setStatusText(
  "Generating SHA-256 hashes..."
);

const totalTransferSize =
  selectedFiles.reduce(
    (sum, file) => sum + file.size,
    0
  );

const filesMetadata: FileMetadata[] = [];

for (const file of selectedFiles) {
  const sha256 =
    await generateSHA256(file);

  const totalChunks = Math.ceil(
    file.size / CHUNK_SIZE
  );

  filesMetadata.push({
    fileName: file.name,
    fileSize: file.size,
    mimeType:
      file.type ||
      "application/octet-stream",
    totalChunks,
    chunkSize: CHUNK_SIZE,
    sha256,
  });
}

await peerRef.current.sendControlMessage({
  type: "files-meta",
  payload: {
    files: filesMetadata,
    totalFiles: selectedFiles.length,
    totalTransferSize,
  },
});

setStatusText("Sending files...");

const startTime = performance.now();
let totalBytesSent = 0;

for (const file of selectedFiles) {
  let offset = 0;

  while (offset < file.size) {
    if (cancelTransferRef.current) {
      return;
    }

    const chunk = file.slice(
      offset,
      offset + CHUNK_SIZE
    );

    const buffer =
      await chunk.arrayBuffer();

    await peerRef.current.sendBinaryChunk(
      buffer
    );

    offset += buffer.byteLength;
    totalBytesSent += buffer.byteLength;

    const progress = Math.min(
      (totalBytesSent /
        totalTransferSize) *
        100,
      100
    );

    const elapsedSeconds =
      (performance.now() -
        startTime) /
      1000;

    const speed =
      elapsedSeconds > 0
        ? totalBytesSent /
          elapsedSeconds
        : 0;

    const remainingBytes =
      totalTransferSize -
      totalBytesSent;

    const eta =
      speed > 0
        ? remainingBytes / speed
        : 0;

    setBytesSent(totalBytesSent);
    setTransferProgress(progress);
    setTransferSpeed(speed);
    setEtaSeconds(eta);
  }
}

    console.log("SENDING TRANSFER COMPLETE");

    await peerRef.current.sendControlMessage({
      type: "transfer-complete",
    });

    transferCompletedRef.current = true;
    isSendingRef.current = false;

    setTransferProgress(100);
    setIsSending(false);
    setState("connected");
    // setState("completed"); 

   toast.success("Transfer completed");
  };

  const handleDragOver = (
  e: React.DragEvent<HTMLDivElement>
) => {
  e.preventDefault();
  setIsDragging(true);
};

const handleDragLeave = () => {
  setIsDragging(false);
};

const handleDrop = (
  e: React.DragEvent<HTMLDivElement>
) => {
  e.preventDefault();
  setIsDragging(false);

const files = Array.from(e.dataTransfer.files);

if (!files.length) return;

setSelectedFiles(files);

  setTransferProgress(0);
  setBytesSent(0);
  setTransferSpeed(0);
  setEtaSeconds(0);

  transferCompletedRef.current = false;

  toast.success("File selected");
};

  
return (
  <div className="min-h-screen relative overflow-hidden bg-black text-white">
    {/* Background Glow */}
    <div className="absolute inset-0 pointer-events-none">
      <div className="absolute top-[-120px] left-[-120px] h-80 w-80 rounded-full bg-cyan-500/10 blur-3xl" />
      <div className="absolute top-[20%] right-[-100px] h-96 w-96 rounded-full bg-purple-500/10 blur-3xl" />
      <div className="absolute bottom-[-120px] left-[35%] h-80 w-80 rounded-full bg-blue-500/10 blur-3xl" />
    </div>

    <div className="relative z-10 container mx-auto px-6 py-8">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6 mb-10">
        <div>
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/10 bg-white/5 backdrop-blur-xl mb-5">
            <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-sm font-medium text-white/90">
              Sender Workspace Active
            </span>
          </div>

          <h1 className="text-5xl md:text-6xl font-bold tracking-tight leading-tight">
            Secure File
            <span className="block bg-gradient-to-r from-cyan-300 via-white to-purple-300 bg-clip-text text-transparent">
              Transfer Dashboard
            </span>
          </h1>

          <p className="mt-5 text-lg text-gray-400 max-w-3xl leading-relaxed">
            Transfer files directly between devices using secure peer-to-peer
            connection with QR pairing, integrity verification, and real-time transfer analytics.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full md:w-auto">
          <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl px-5 py-5 min-w-[180px]">
            <p className="text-xs uppercase tracking-widest text-gray-400 mb-2">
              WebSocket
            </p>
            <p
              className={`text-lg font-semibold ${
                wsConnected ? "text-green-400" : "text-red-400"
              }`}
            >
              {wsConnected ? "Connected" : "Disconnected"}
            </p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl px-5 py-5 min-w-[180px]">
            <p className="text-xs uppercase tracking-widest text-gray-400 mb-2">
              Session State
            </p>
            <p className="text-lg font-semibold text-cyan-300">
              {transferProgress === 100 ? "completed" : state}
            </p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl px-5 py-5 min-w-[180px]">
            <p className="text-xs uppercase tracking-widest text-gray-400 mb-2">
              Status
            </p>
            <p className="text-sm font-medium text-white/90 leading-relaxed">
              {statusText}
            </p>
          </div>
        </div>
      </div>

      {/* Pairing Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-10">

        {/* Transfer Code Card */}
        <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-2xl p-8 shadow-2xl">
          <div className="flex items-center justify-between mb-6">
            <div>
              <p className="text-xs uppercase tracking-widest text-gray-400 mb-2">
                Pairing Session
              </p>
              <h2 className="text-2xl font-bold">
                Device Connection
              </h2>
            </div>

            <div className="h-14 w-14 rounded-2xl bg-cyan-500/10 border border-cyan-400/20 flex items-center justify-center text-2xl">
              🔐
            </div>
          </div>

          {transferId && (
            <div className="rounded-2xl border border-white/10 bg-black/30 p-5 mb-5">
              <p className="text-sm text-gray-400 mb-2">
                Transfer Code
              </p>

              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <p className="text-2xl font-bold tracking-[0.25em] text-cyan-300 break-all">
                  {transferId}
                </p>

                <button
                  onClick={copyTransferCode}
                  className="px-5 py-3 rounded-2xl bg-white text-black font-semibold hover:scale-105 transition-all duration-300"
                >
                  Copy Code
                </button>
              </div>
            </div>
          )}

          {receiverId && state === "waiting-receiver" && (
            <button
              onClick={approveReceiver}
              className="w-full mt-4 px-6 py-4 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 font-semibold text-white hover:scale-[1.02] transition-all duration-300"
            >
              Approve Receiver Connection
            </button>
          )}
        </div>

        {/* QR Section */}
        <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-2xl p-8 shadow-2xl">
          <div className="flex items-center justify-between mb-6">
            <div>
              <p className="text-xs uppercase tracking-widest text-gray-400 mb-2">
                QR Pairing
              </p>
              <h2 className="text-2xl font-bold">
                Scan To Connect
              </h2>
            </div>

            <div className="h-14 w-14 rounded-2xl bg-purple-500/10 border border-purple-400/20 flex items-center justify-center text-2xl">
              📱
            </div>
          </div>

          {qrCodeUrl && (
            <div className="flex flex-col items-center justify-center rounded-3xl border border-white/10 bg-black/30 p-8">
              <p className="text-sm text-gray-400 mb-5">
                Receiver can scan this QR to join instantly
              </p>

              <img
                src={qrCodeUrl}
                alt="Transfer QR"
                className="w-64 h-64 bg-white p-4 rounded-3xl shadow-2xl"
              />
            </div>
          )}
        </div>
      </div>

            {/* Connected Transfer Workspace */}
      {state === "connected" && (
        <>
          {/* Upload + Analytics */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 mb-10">

            {/* Upload Zone */}
            <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-2xl p-8 shadow-2xl">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <p className="text-xs uppercase tracking-widest text-gray-400 mb-2">
                    Upload Workspace
                  </p>
                  <h2 className="text-2xl font-bold">
                    Select Files To Transfer
                  </h2>
                </div>

                <div className="h-14 w-14 rounded-2xl bg-blue-500/10 border border-blue-400/20 flex items-center justify-center text-2xl">
                  📂
                </div>
              </div>

              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`w-full rounded-3xl border-2 border-dashed p-14 text-center cursor-pointer transition-all duration-300 ${
                  isDragging
                    ? "border-green-400 bg-green-500/10 scale-[1.01]"
                    : "border-white/20 bg-black/30 hover:border-cyan-400/40 hover:bg-white/5"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  onChange={handleFileSelect}
                  className="hidden"
                />

                <div className="text-6xl mb-5">
                  {isDragging ? "📥" : "📁"}
                </div>

                <p className="text-2xl font-semibold">
                  {isDragging
                    ? "Drop files here"
                    : "Drag & Drop files here"}
                </p>

                <p className="text-gray-400 mt-3 text-base">
                  or click to browse from your device
                </p>

                <div className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10">
                  <span className="text-sm text-gray-300">
                    Multi-file transfer supported
                  </span>
                </div>
              </div>
            </div>

            {/* Analytics */}
            <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-2xl p-8 shadow-2xl">
              <div className="mb-6">
                <p className="text-xs uppercase tracking-widest text-gray-400 mb-2">
                  Live Analytics
                </p>
                <h2 className="text-2xl font-bold">
                  Transfer Metrics
                </h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="rounded-2xl border border-white/10 bg-black/30 p-5">
                  <p className="text-xs text-gray-400 uppercase tracking-widest mb-2">
                    Files
                  </p>
                  <p className="text-3xl font-bold text-cyan-300">
                    {selectedFiles.length}
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/30 p-5">
                  <p className="text-xs text-gray-400 uppercase tracking-widest mb-2">
                    Total Size
                  </p>
                  <p className="text-xl font-bold text-white">
                    {formatBytes(
                      selectedFiles.reduce(
                        (sum, file) => sum + file.size,
                        0
                      )
                    )}
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/30 p-5">
                  <p className="text-xs text-gray-400 uppercase tracking-widest mb-2">
                    Sent
                  </p>
                  <p className="text-xl font-bold text-green-400">
                    {formatBytes(bytesSent)}
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/30 p-5">
                  <p className="text-xs text-gray-400 uppercase tracking-widest mb-2">
                    Speed
                  </p>
                  <p className="text-xl font-bold text-purple-300">
                    {formatBytes(transferSpeed)}/s
                  </p>
                </div>

                <div className="sm:col-span-2 rounded-2xl border border-white/10 bg-black/30 p-5">
                  <p className="text-xs text-gray-400 uppercase tracking-widest mb-2">
                    Estimated Time Remaining
                  </p>
                  <p className="text-2xl font-bold text-yellow-300">
                    {formatEta(etaSeconds)}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* File Details + Progress */}
          {selectedFiles.length > 0 && (
            <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-2xl p-8 shadow-2xl mb-10">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 mb-8">
                <div>
                  <p className="text-xs uppercase tracking-widest text-gray-400 mb-2">
                    Transfer Progress
                  </p>
                  <h2 className="text-2xl font-bold">
                    Real-Time Transfer Tracking
                  </h2>
                </div>

                <div className="text-right">
                  <p className="text-sm text-gray-400">
                    Completion
                  </p>
                  <p className="text-4xl font-bold text-cyan-300">
                    {transferProgress.toFixed(1)}%
                  </p>
                </div>
              </div>

              <div className="w-full h-6 rounded-full bg-black/40 overflow-hidden border border-white/10 mb-8">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-500 transition-all duration-300"
                  style={{
                    width: `${transferProgress}%`,
                  }}
                />
              </div>

              <div>
                <p className="text-lg font-semibold mb-5">
                  Selected Files
                </p>

                <div className="max-h-80 overflow-y-auto rounded-3xl border border-white/10 bg-black/30 p-5 space-y-3">
                  {selectedFiles.map((file) => (
                    <div
                      key={`${file.name}-${file.size}`}
                      className="flex items-center justify-between rounded-2xl border border-white/5 bg-white/5 px-5 py-4"
                    >
                      <div className="flex items-center gap-4">
                        <div className="text-2xl">
                          📄
                        </div>

                        <div>
                          <p className="font-medium break-all">
                            {file.name}
                          </p>

                          <p className="text-sm text-gray-400">
                            Ready for secure transfer
                          </p>
                        </div>
                      </div>

                      <p className="text-sm text-cyan-300 font-semibold">
                        {formatBytes(file.size)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

                    {/* Action Buttons */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-10">
            {!transferCompletedRef.current && (
              <button
                onClick={sendFile}
                disabled={
                  !selectedFiles.length ||
                  isSending
                }
                className="px-6 py-5 rounded-3xl font-semibold text-lg bg-gradient-to-r from-green-500 to-emerald-600 hover:scale-[1.02] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 shadow-2xl"
              >
                {isSending
                  ? "Sending Securely..."
                  : "Start Secure Transfer"}
              </button>
            )}

            <button
              onClick={resetSender}
              className="px-6 py-5 rounded-3xl font-semibold text-lg bg-gradient-to-r from-yellow-500 to-orange-500 hover:scale-[1.02] transition-all duration-300 shadow-2xl"
            >
              Create New Session
            </button>

            {isSending && (
              <button
                onClick={cancelTransfer}
                className="px-6 py-5 rounded-3xl font-semibold text-lg bg-gradient-to-r from-red-500 to-rose-600 hover:scale-[1.02] transition-all duration-300 shadow-2xl"
              >
                Cancel Transfer
              </button>
            )}
          </div>
        </>
      )}

      {/* Footer */}
      <div className="mt-12 border-t border-white/10 pt-8 text-center">
        <p className="text-sm text-gray-400">
          Secure browser-to-browser file transfer powered by WebRTC
        </p>

        <p className="text-xs text-white/50 mt-3">
          Private • Fast • Verified • Multi-File Transfer
        </p>
      </div>

    </div>
  </div>
);

}