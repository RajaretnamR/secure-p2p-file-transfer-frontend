"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import { Html5QrcodeScanner } from "html5-qrcode";
import { SignalingClient } from "@/lib/signalingClient";
import { WebRTCPeer } from "@/lib/webrtcPeer";
import { VersionedServerMessage } from "@/lib/protocol";
import {
  ReceiverState,
  IceCandidatePayload,
  FileMetadata,
MultiFileMetadata,
  DataChannelControlMessage,
} from "@/types/transfer";
import { generateSHA256 } from "@/lib/hash";

function formatBytes(bytes: number) {
  return (bytes / 1024 / 1024).toFixed(2);
}

function formatEta(seconds: number) {
  if (!isFinite(seconds) || seconds < 0) return "--";

  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);

  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export default function ReceivePage() {
  const searchParams = useSearchParams();
  const [state, setState] = useState<ReceiverState>("idle");
  const [transferId, setTransferId] = useState("");
  const [statusText, setStatusText] =
    useState("Enter transfer code");
   const qrScannerRef = useRef<Html5QrcodeScanner | null>(null);

const [showScanner, setShowScanner] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);

const [incomingFile, setIncomingFile] =
  useState<MultiFileMetadata | null>(null);

  const [receiveProgress, setReceiveProgress] =
    useState(0);

  const [downloadUrl, setDownloadUrl] = useState("");
  const [receivedBytes, setReceivedBytes] =
    useState(0);

  const [receiveSpeed, setReceiveSpeed] =
    useState(0);

  const [etaSeconds, setEtaSeconds] =
    useState(0);

  const [isVerified, setIsVerified] =
    useState<boolean | null>(null);

  const signalingRef = useRef<SignalingClient | null>(null);
  const peerRef = useRef<WebRTCPeer | null>(null);
  const transferIdRef = useRef("");

  const receivedChunksRef = useRef<ArrayBuffer[]>([]);
  const expectedFileRef =
  useRef<MultiFileMetadata | null>(null);
  const receivedBytesRef = useRef(0);
  const transferStartTimeRef = useRef(0);
    const connectingRef = useRef(false);
  const downloadUrlRef = useRef("");

useEffect(() => {
  return () => {
    try {
      stopScanner();
    } catch (err) {
      console.error("Scanner cleanup failed", err);
    }

    if (peerRef.current) {
      peerRef.current.close();
      peerRef.current = null;
    }

    if (signalingRef.current) {
      signalingRef.current.disconnect();
      signalingRef.current = null;
    }

    if (downloadUrlRef.current) {
      URL.revokeObjectURL(downloadUrlRef.current);
      downloadUrlRef.current = "";
    }
  };
}, []);

const stopScanner = async () => {
  try {
    qrScannerRef.current?.clear();
    qrScannerRef.current = null;
  } catch (err) {
    console.warn(err);
  }
};

const startScanner = async () => {
  setShowScanner(true);

  setTimeout(() => {
    const scanner = new Html5QrcodeScanner(
      "qr-reader",
      {
        fps: 10,
        qrbox: {
          width: 250,
          height: 250,
        },
      },
      false
    );

    qrScannerRef.current = scanner;

    scanner.render(
      async (decodedText) => {
        try {
          const url = new URL(decodedText);

          const code =
            url.searchParams.get("code");

          if (!code) return;

          setTransferId(code);

          scanner.clear();
          qrScannerRef.current = null;

          setShowScanner(false);

          setTimeout(() => {
            connectAndJoin(code);
          }, 300);
        } catch (err) {
          console.error(err);
        }
      },
      (error) => {
        console.log(error);
      }
    );
  }, 300);
};

const resetReceiver = async () => {
  try {
    await stopScanner();

    if (peerRef.current) {
      peerRef.current.close();
      peerRef.current = null;
    }

    if (signalingRef.current) {
      signalingRef.current.disconnect();
      signalingRef.current = null;
    }

 if (downloadUrlRef.current) {
  URL.revokeObjectURL(downloadUrlRef.current);
  downloadUrlRef.current = "";
}
  } catch (err) {
    console.warn(err);
  }

  transferIdRef.current = "";
  receivedChunksRef.current = [];
  expectedFileRef.current = null;
  receivedBytesRef.current = 0;
  transferStartTimeRef.current = 0;

  setState("idle");
  setTransferId("");
  setStatusText("Enter transfer code");

  setWsConnected(false);
  setShowScanner(false);

  setIncomingFile(null);
  setDownloadUrl("");

  setReceiveProgress(0);
  setReceivedBytes(0);
  setReceiveSpeed(0);
  setEtaSeconds(0);

  setIsVerified(null);
};

useEffect(() => {
  const codeFromUrl = searchParams.get("code");

  if (!codeFromUrl) {
    return;
  }

  transferIdRef.current = codeFromUrl;
  setTransferId(codeFromUrl);

  const shouldReconnect =
    !signalingRef.current ||
    !wsConnected;

  if (!shouldReconnect) {
    return;
  }

  const initConnection = async () => {
    try {
      if (signalingRef.current) {
        signalingRef.current.disconnect();
        signalingRef.current = null;
      }

      if (peerRef.current) {
        peerRef.current.close();
        peerRef.current = null;
      }

      await connectAndJoin(codeFromUrl);

    } catch (err) {
      console.error("Receiver connect failed:", err);
      setState("failed");
      setStatusText("Failed to connect");
    }
  };

  initConnection();

}, [searchParams]);




const connectAndJoin = async (
  manualCode?: string
) => {
  if (connectingRef.current) {
    return;
  }

  const codeToUse = manualCode || transferId.trim();

  if (!codeToUse) {
    setStatusText("Transfer code required");
    return;
  }

  connectingRef.current = true;

  try {
    await stopScanner();

    if (signalingRef.current) {
      signalingRef.current.disconnect();
      signalingRef.current = null;
    }

    if (peerRef.current) {
      peerRef.current.close();
      peerRef.current = null;
    }

    receivedChunksRef.current = [];
    expectedFileRef.current = null;
    receivedBytesRef.current = 0;
    transferStartTimeRef.current = 0;

    if (downloadUrlRef.current) {
      URL.revokeObjectURL(downloadUrlRef.current);
      downloadUrlRef.current = "";
    }

    setDownloadUrl("");
    setWsConnected(false);

    transferIdRef.current = codeToUse;
    setTransferId(codeToUse);

    const signaling = new SignalingClient();
    signalingRef.current = signaling;

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
      role: "receiver",
    });

  } catch (err) {
    console.error(err);
    setState("failed");
    setStatusText("Failed to connect");
  } finally {
    connectingRef.current = false;
  }
};

  const handleControlMessage = async (
    message: DataChannelControlMessage
  ) => {
if (message.type === "files-meta") {
if (downloadUrlRef.current) {
  URL.revokeObjectURL(downloadUrlRef.current);
  downloadUrlRef.current = "";
  setDownloadUrl("");
}

  setIncomingFile(message.payload);
  expectedFileRef.current = message.payload;

  receivedChunksRef.current = [];
  receivedBytesRef.current = 0;
  transferStartTimeRef.current = performance.now();

  setReceivedBytes(0);
  setReceiveProgress(0);
  setReceiveSpeed(0);
  setEtaSeconds(0);
  setIsVerified(null);

  setStatusText(
    `Receiving ${message.payload.totalFiles} files...`
  );

  toast.success(
    `${message.payload.totalFiles} files incoming`
  );

  return;
}

if (message.type === "transfer-complete") {
  if (!expectedFileRef.current) return;

  const totalExpectedBytes =
    expectedFileRef.current.totalTransferSize;

  if (receivedBytesRef.current !== totalExpectedBytes) {
    setState("failed");
    setStatusText("File size mismatch");
    return;
  }

  setStatusText("Verifying file integrity...");

  const allBytesBlob = new Blob(receivedChunksRef.current);

  const downloadedFiles: {
    fileName: string;
    blob: Blob;
  }[] = [];

  let currentOffset = 0;

  for (const file of expectedFileRef.current.files) {
    const fileBlob = allBytesBlob.slice(
      currentOffset,
      currentOffset + file.fileSize,
      file.mimeType
    );

    const calculatedHash =
      await generateSHA256(fileBlob);

    if (calculatedHash !== file.sha256) {
      setIsVerified(false);
      toast.error("Integrity failed");
      setState("failed");
      setStatusText(
        `Hash mismatch for ${file.fileName}`
      );
      return;
    }

    downloadedFiles.push({
      fileName: file.fileName,
      blob: fileBlob,
    });

    currentOffset += file.fileSize;
  }

setIsVerified(true);
toast.success("Files verified");

if (downloadedFiles.length === 1) {
  const url = URL.createObjectURL(
    downloadedFiles[0].blob
  );

 downloadUrlRef.current = url;
setDownloadUrl(url);
  setStatusText("File received successfully");
} else {
  const JSZip = (await import("jszip")).default;

  const zip = new JSZip();

  for (const file of downloadedFiles) {
    zip.file(file.fileName, file.blob);
  }

  const zipBlob = await zip.generateAsync({
    type: "blob",
  });

  const zipUrl =
    URL.createObjectURL(zipBlob);

  downloadUrlRef.current = zipUrl;
setDownloadUrl(zipUrl);
  setStatusText("Files received successfully");
}

setState("completed");
  return;
}
  };

  const handleBinaryChunk = (chunk: ArrayBuffer) => {
    receivedChunksRef.current.push(chunk);

    receivedBytesRef.current += chunk.byteLength;

    setReceivedBytes(receivedBytesRef.current);

    if (expectedFileRef.current) {
      const progress =
        (receivedBytesRef.current /
          expectedFileRef.current.totalTransferSize) *
        100;

      setReceiveProgress(Math.min(progress, 100));

      const elapsedSeconds =
        (performance.now() -
          transferStartTimeRef.current) /
        1000;

      const speed =
        elapsedSeconds > 0
          ? receivedBytesRef.current /
            elapsedSeconds
          : 0;

        const remainingBytes =
          expectedFileRef.current.totalTransferSize -
          receivedBytesRef.current;

      const eta =
        speed > 0 ? remainingBytes / speed : 0;

      setReceiveSpeed(speed);
      setEtaSeconds(eta);
    }
  };

const handleServerMessage = async (
  msg: VersionedServerMessage
) => {
  console.log("[SERVER]", msg);

  try {
    switch (msg.type) {
      case "registered": {
        if (!transferIdRef.current) {
          setState("failed");
          setStatusText("Invalid transfer code");
          return;
        }

        signalingRef.current?.send({
          type: "join-session",
          transferId: transferIdRef.current,
        });

        setState("joining");
        setStatusText("Joining session...");
        break;
      }

      case "session-joined": {
        if (peerRef.current) {
          peerRef.current.close();
          peerRef.current = null;
        }

        const peer = new WebRTCPeer(
          (candidate: IceCandidatePayload) => {
            signalingRef.current?.send({
              type: "ice-candidate",
              transferId: transferIdRef.current,
              candidate: candidate.candidate,
              sdpMid: candidate.sdpMid,
              sdpMLineIndex: candidate.sdpMLineIndex,
            });
          },
          (connectionState) => {
            console.log(
              "[RECEIVE] Peer state:",
              connectionState
            );

            if (connectionState === "connected") {
              setState("connected");
              setStatusText("CONNECTED");

              toast.success("Connected to sender");
            }

            if (
              connectionState === "failed" ||
              connectionState === "disconnected" ||
              connectionState === "closed"
            ) {
              setState("failed");
              setStatusText("Peer connection lost");
            }
          }
        );

        peer.setDataHandlers(
          handleControlMessage,
          handleBinaryChunk
        );

        peerRef.current = peer;

        break;
      }

      case "relay-offer": {
        if (!peerRef.current) {
          console.warn("Peer missing, creating fallback peer");

          const peer = new WebRTCPeer(
            (candidate: IceCandidatePayload) => {
              signalingRef.current?.send({
                type: "ice-candidate",
                transferId: transferIdRef.current,
                candidate: candidate.candidate,
                sdpMid: candidate.sdpMid,
                sdpMLineIndex: candidate.sdpMLineIndex,
              });
            },
            (connectionState) => {
              if (connectionState === "connected") {
                setState("connected");
                setStatusText("CONNECTED");
              }
            }
          );

          peer.setDataHandlers(
            handleControlMessage,
            handleBinaryChunk
          );

          peerRef.current = peer;
        }

        const answer =
          await peerRef.current.receiveOffer(msg.sdp);

        signalingRef.current?.send({
          type: "answer",
          transferId: transferIdRef.current,
          sdp: answer,
        });

        setState("peer-connecting");
        setStatusText("Connecting peer...");

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
        if (peerRef.current) {
          peerRef.current.close();
          peerRef.current = null;
        }

        setState("failed");
        setStatusText("Sender disconnected");

        toast.error("Sender disconnected");

        break;
      }

      case "heartbeat-ack": {
        break;
      }

      case "error": {
        console.error("Server error:", msg.code, msg.message);

        if (msg.code === "SESSION_EXPIRED") {
          setState("failed");
          setStatusText("Session expired");
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
    console.error("Receiver handler crash:", err);
    setState("failed");
    setStatusText("Unexpected client error");
  }
};


return (
  <div className="min-h-screen relative overflow-hidden bg-black text-white">
    {/* Background Glow */}
    <div className="absolute inset-0 pointer-events-none">
      <div className="absolute top-[-120px] left-[-120px] h-80 w-80 rounded-full bg-cyan-500/10 blur-3xl" />
      <div className="absolute top-[20%] right-[-120px] h-96 w-96 rounded-full bg-purple-500/10 blur-3xl" />
      <div className="absolute bottom-[-120px] left-[35%] h-80 w-80 rounded-full bg-blue-500/10 blur-3xl" />
    </div>

    <div className="relative z-10 container mx-auto px-6 py-8">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6 mb-10">
        <div>
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/10 bg-white/5 backdrop-blur-xl mb-5">
            <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-sm font-medium text-white/90">
              Receiver Workspace Active
            </span>
          </div>

          <h1 className="text-5xl md:text-6xl font-bold tracking-tight leading-tight">
            Secure File
            <span className="block bg-gradient-to-r from-cyan-300 via-white to-purple-300 bg-clip-text text-transparent">
              Receiver Dashboard
            </span>
          </h1>

          <p className="mt-5 text-lg text-gray-400 max-w-3xl leading-relaxed">
            Receive files securely from connected devices using transfer codes,
            QR pairing, live progress tracking, and integrity verification.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full md:w-auto">
          <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl px-5 py-5 min-w-[180px]">
            <p className="text-xs uppercase tracking-widest text-gray-400 mb-2">
              Session
            </p>

            <p
              className={`text-lg font-semibold ${
                downloadUrl
                  ? "text-green-400"
                  : wsConnected
                  ? "text-cyan-300"
                  : "text-red-400"
              }`}
            >
              {downloadUrl
                ? "Completed"
                : wsConnected
                ? "Connected"
                : "Disconnected"}
            </p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl px-5 py-5 min-w-[180px]">
            <p className="text-xs uppercase tracking-widest text-gray-400 mb-2">
              State
            </p>

            <p className="text-lg font-semibold text-purple-300">
              {state}
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

      {/* Connection Section */}
      {state !== "completed" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-10">

          {/* Connect Card */}
          <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-2xl p-8 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <div>
                <p className="text-xs uppercase tracking-widest text-gray-400 mb-2">
                  Pairing Session
                </p>

                <h2 className="text-2xl font-bold">
                  Connect To Sender
                </h2>
              </div>

              <div className="h-14 w-14 rounded-2xl bg-cyan-500/10 border border-cyan-400/20 flex items-center justify-center text-2xl">
                🔗
              </div>
            </div>

            <input
              type="text"
              value={transferId}
              onChange={(e) =>
                setTransferId(e.target.value)
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  connectAndJoin();
                }
              }}
              placeholder="Enter transfer code"
              className="w-full px-5 py-5 rounded-2xl bg-black/40 border border-white/10 text-white placeholder:text-gray-500 outline-none focus:border-cyan-400 transition-all"
            />

            <button
              disabled={
                state === "connecting" ||
                state === "joining" ||
                state === "peer-connecting"
              }
              onClick={() => connectAndJoin()}
              className="w-full mt-5 px-6 py-5 rounded-2xl bg-gradient-to-r from-green-500 to-emerald-600 font-semibold text-lg hover:scale-[1.02] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Connect Securely
            </button>

            <button
              onClick={startScanner}
              className="w-full mt-4 px-6 py-5 rounded-2xl bg-gradient-to-r from-blue-500 to-cyan-600 font-semibold text-lg hover:scale-[1.02] transition-all duration-300"
            >
              Scan QR Instead
            </button>
          </div>

          {/* Scanner Card */}
          <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-2xl p-8 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <div>
                <p className="text-xs uppercase tracking-widest text-gray-400 mb-2">
                  QR Scanner
                </p>

                <h2 className="text-2xl font-bold">
                  Quick Device Pairing
                </h2>
              </div>

              <div className="h-14 w-14 rounded-2xl bg-purple-500/10 border border-purple-400/20 flex items-center justify-center text-2xl">
                📷
              </div>
            </div>

                        {showScanner ? (
              <div className="rounded-3xl border border-white/10 bg-black/30 p-6">
                <p className="text-sm text-gray-400 mb-5 text-center">
                  Scan sender QR code to connect instantly
                </p>

                <div
                  id="qr-reader"
                  className="overflow-hidden rounded-2xl"
                ></div>

                <button
                  onClick={async () => {
                    await stopScanner();
                    setShowScanner(false);
                  }}
                  className="w-full mt-5 px-6 py-4 rounded-2xl bg-gradient-to-r from-red-500 to-rose-600 font-semibold hover:scale-[1.02] transition-all duration-300"
                >
                  Close Scanner
                </button>
              </div>
            ) : (
              <div className="rounded-3xl border border-white/10 bg-black/30 p-10 flex flex-col items-center justify-center text-center min-h-[320px]">
                <div className="text-6xl mb-5">
                  📱
                </div>

                <h3 className="text-2xl font-bold mb-3">
                  QR Pairing Ready
                </h3>

                <p className="text-gray-400 leading-relaxed max-w-md">
                  Use the scanner to instantly pair with sender device without manually entering transfer code.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Incoming Transfer Dashboard */}
      {incomingFile && (
        <div className="space-y-10">

          {/* Analytics */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-5">
            <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl p-6">
              <p className="text-xs uppercase tracking-widest text-gray-400 mb-2">
                Files
              </p>

              <p className="text-3xl font-bold text-cyan-300">
                {incomingFile.totalFiles}
              </p>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl p-6">
              <p className="text-xs uppercase tracking-widest text-gray-400 mb-2">
                Total Size
              </p>

              <p className="text-xl font-bold text-white">
                {formatBytes(
                  incomingFile.totalTransferSize
                )} MB
              </p>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl p-6">
              <p className="text-xs uppercase tracking-widest text-gray-400 mb-2">
                Received
              </p>

              <p className="text-xl font-bold text-green-400">
                {formatBytes(receivedBytes)} MB
              </p>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl p-6">
              <p className="text-xs uppercase tracking-widest text-gray-400 mb-2">
                Speed
              </p>

              <p className="text-xl font-bold text-purple-300">
                {formatBytes(receiveSpeed)} MB/s
              </p>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl p-6">
              <p className="text-xs uppercase tracking-widest text-gray-400 mb-2">
                ETA
              </p>

              <p className="text-xl font-bold text-yellow-300">
                {formatEta(etaSeconds)}
              </p>
            </div>
          </div>

          {/* Progress + File List */}
          <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-2xl p-8 shadow-2xl">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 mb-8">
              <div>
                <p className="text-xs uppercase tracking-widest text-gray-400 mb-2">
                  Transfer Progress
                </p>

                <h2 className="text-2xl font-bold">
                  Live Receive Tracking
                </h2>
              </div>

              <div className="text-right">
                <p className="text-sm text-gray-400">
                  Completion
                </p>

                <p className="text-4xl font-bold text-cyan-300">
                  {receiveProgress.toFixed(1)}%
                </p>
              </div>
            </div>

            <div className="w-full h-6 rounded-full bg-black/40 overflow-hidden border border-white/10 mb-8">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-400 via-cyan-500 to-purple-500 transition-all duration-300"
                style={{
                  width: `${receiveProgress}%`,
                }}
              />
            </div>

            <div>
              <p className="text-lg font-semibold mb-5">
                Incoming Files
              </p>

              <div className="max-h-80 overflow-y-auto rounded-3xl border border-white/10 bg-black/30 p-5 space-y-3">
                {incomingFile.files.map((file) => (
                  <div
                    key={`${file.fileName}-${file.fileSize}`}
                    className="flex items-center justify-between rounded-2xl border border-white/5 bg-white/5 px-5 py-4"
                  >
                    <div className="flex items-center gap-4">
                      <div className="text-2xl">
                        📄
                      </div>

                      <div>
                        <p className="font-medium break-all">
                          {file.fileName}
                        </p>

                        <p className="text-sm text-gray-400">
                          Receiving securely
                        </p>
                      </div>
                    </div>

                    <p className="text-sm text-cyan-300 font-semibold">
                      {formatBytes(file.fileSize)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>

                    {/* Verification + Actions */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

            {/* Verification */}
            <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-2xl p-8 shadow-2xl">
              <p className="text-xs uppercase tracking-widest text-gray-400 mb-3">
                Integrity Verification
              </p>

              <h2 className="text-2xl font-bold mb-6">
                Security Validation
              </h2>

              {isVerified === true && (
                <div className="rounded-2xl border border-green-400/20 bg-green-500/10 p-5">
                  <p className="text-green-400 font-semibold text-lg">
                    SHA-256 Verified ✅
                  </p>

                  <p className="text-sm text-gray-300 mt-2">
                    File integrity verified successfully. Transfer is secure and untampered.
                  </p>
                </div>
              )}

              {isVerified === false && (
                <div className="rounded-2xl border border-red-400/20 bg-red-500/10 p-5">
                  <p className="text-red-400 font-semibold text-lg">
                    File Integrity Failed ❌
                  </p>

                  <p className="text-sm text-gray-300 mt-2">
                    Integrity mismatch detected. Download should not be trusted.
                  </p>
                </div>
              )}

              {isVerified === null && (
                <div className="rounded-2xl border border-yellow-400/20 bg-yellow-500/10 p-5">
                  <p className="text-yellow-300 font-semibold text-lg">
                    Verification Pending
                  </p>

                  <p className="text-sm text-gray-300 mt-2">
                    Waiting for transfer completion and integrity validation.
                  </p>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-2xl p-8 shadow-2xl">
              <p className="text-xs uppercase tracking-widest text-gray-400 mb-3">
                Transfer Actions
              </p>

              <h2 className="text-2xl font-bold mb-6">
                Controls
              </h2>

              {state !== "completed" && (
                <button
                  onClick={resetReceiver}
                  className="w-full px-6 py-5 rounded-2xl bg-gradient-to-r from-red-500 to-rose-600 font-semibold text-lg hover:scale-[1.02] transition-all duration-300"
                >
                  Cancel Receive
                </button>
              )}

              {state === "completed" && downloadUrl && (
                <a
                  href={downloadUrl}
                  download={
                    incomingFile.totalFiles > 1
                      ? "received-files.zip"
                      : "received-file"
                  }
                  className="block w-full text-center px-6 py-5 rounded-2xl bg-gradient-to-r from-blue-500 to-cyan-600 font-semibold text-lg hover:scale-[1.02] transition-all duration-300"
                >
                  {incomingFile.totalFiles > 1
                    ? "Download ZIP Package"
                    : "Download Received File"}
                </a>
              )}

              {state === "completed" && (
                <button
                  onClick={resetReceiver}
                  className="w-full mt-5 px-6 py-5 rounded-2xl bg-gradient-to-r from-green-500 to-emerald-600 font-semibold text-lg hover:scale-[1.02] transition-all duration-300"
                >
                  Receive Another Transfer
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="mt-14 border-t border-white/10 pt-8 text-center">
        <p className="text-sm text-gray-400">
          Secure browser-to-browser receiving powered by WebRTC
        </p>

        <p className="text-xs text-white/50 mt-3">
          Private • Fast • Verified • Real-Time Transfer
        </p>
      </div>

    </div>
  </div>
);

}