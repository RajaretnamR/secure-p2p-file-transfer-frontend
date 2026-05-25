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
  <div className="min-h-screen flex flex-col items-center justify-center gap-6 p-6 bg-black text-white">
    <h1 className="text-4xl font-bold">
      Receiver
    </h1>

    <div className="border border-gray-700 rounded-xl p-6 w-full max-w-md space-y-4">
      <p>
        <strong>Session:</strong>{" "}
        {downloadUrl
          ? "Completed"
          : wsConnected
          ? "Connected"
          : "Disconnected"}
      </p>

      <p>
        <strong>State:</strong> {state}
      </p>

      <p>
        <strong>Status:</strong> {statusText}
      </p>

      {state !== "completed" && (
        <>
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
            className="w-full p-3 rounded bg-black border border-gray-600"
          />

          <button
  disabled={
    state === "connecting" ||
    state === "joining" ||
    state === "peer-connecting"
  }
  onClick={() => connectAndJoin()}
            className="bg-green-600 px-4 py-3 rounded w-full"
          >
            Connect
          </button>

          <button
            onClick={startScanner}
            className="bg-blue-600 px-4 py-3 rounded w-full"
          >
            Scan QR
          </button>
        </>
      )}

      {showScanner && state !== "completed" && (
        <div className="mt-4 p-4 bg-gray-900 rounded-lg">
          <div id="qr-reader"></div>

          <button
            onClick={async () => {
              await stopScanner();
              setShowScanner(false);
            }}
            className="bg-red-600 px-4 py-2 rounded w-full mt-3"
          >
            Close Scanner
          </button>
        </div>
      )}

      {incomingFile && (
        <div className="space-y-2">
          <p>
            Files: {incomingFile.totalFiles}
          </p>

          <p>
            Size:{" "}
            {formatBytes(
              incomingFile.totalTransferSize
            )}{" "}
            MB
          </p>

          <p>
            Received:{" "}
            {formatBytes(receivedBytes)} MB
          </p>

          <p>
            Speed: {formatBytes(receiveSpeed)} MB/s
          </p>

          <p>ETA: {formatEta(etaSeconds)}</p>

          <div className="mt-4">
            <div className="flex justify-between text-sm mb-1">
              <span>Progress</span>
              <span>{receiveProgress.toFixed(1)}%</span>
            </div>

            <div className="w-full bg-gray-700 rounded-full h-4 overflow-hidden">
              <div
                className="bg-blue-500 h-4 transition-all duration-300"
                style={{
                  width: `${receiveProgress}%`,
                }}
              />
            </div>

            {state !== "completed" && (
              <button
                onClick={resetReceiver}
                className="bg-red-600 px-4 py-3 rounded w-full mt-4"
              >
                Cancel Receive
              </button>
            )}
          </div>

          <div className="mt-4 max-h-40 overflow-y-auto rounded border p-2">
            {incomingFile.files.map((file) => (
              <div
                key={`${file.fileName}-${file.fileSize}`}
                className="text-sm"
              >
                {file.fileName} (
                {formatBytes(file.fileSize)})
              </div>
            ))}
          </div>

          {isVerified === true && (
            <p className="text-green-400 font-semibold">
              SHA-256 Verified ✅
            </p>
          )}

          {isVerified === false && (
            <p className="text-red-400 font-semibold">
              File Integrity Failed ❌
            </p>
          )}

          {state === "completed" &&
            downloadUrl && (
              <a
                href={downloadUrl}
                download={
                  incomingFile.totalFiles > 1
                    ? "received-files.zip"
                    : "received-file"
                }
                className="block text-center bg-blue-600 px-4 py-3 rounded"
              >
                {incomingFile.totalFiles > 1
                  ? "Download ZIP"
                  : "Download File"}
              </a>
            )}

          {state === "completed" && (
            <button
              onClick={resetReceiver}
              className="bg-green-600 px-4 py-3 rounded w-full"
            >
              Receive Another File
            </button>
          )}
        </div>
      )}
    </div>
  </div>
);

}