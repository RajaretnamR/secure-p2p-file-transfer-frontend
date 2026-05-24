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
    const signaling = new SignalingClient();
    signalingRef.current = signaling;

    signaling
      .connect(handleServerMessage, setWsConnected)
      .then(() => {
        setState("connecting");
        setStatusText(
          "Connected to signaling server"
        );

        signaling.send({
          type: "register",
          role: "sender",
        });
      })
      .catch((err) => {
        console.error(err);
        setState("failed");
        setStatusText("Failed to connect");
      });

    return () => {
      cancelTransferRef.current = true;

      peerRef.current?.close();
      signaling.disconnect();
    };
  }, []);

  const handleServerMessage = async (
    msg: VersionedServerMessage
  ) => {
    console.log("[SERVER]", msg);

    switch (msg.type) {
      case "registered":
        setState("registered");
        setStatusText("Sender registered");

        signalingRef.current?.send({
          type: "create-session",
        });
        break;

      case "session-created": {
        setTransferId(msg.transferId);

        transferIdRef.current = msg.transferId;
        tokenRef.current = msg.token;

        const qrData =
          `${window.location.origin}/receive?code=${msg.transferId}`;

        const qrImage =
          await QRCode.toDataURL(qrData);

        setQrCodeUrl(qrImage);

        setState("waiting-receiver");
        setStatusText(
          "Waiting for receiver..."
        );

        break;
      }

        case "join-request":
          setReceiverId(msg.receiverId);

          receiverIdRef.current =
            msg.receiverId;

          setStatusText(
            "Receiver requested to join"
          );

          break;

           case "peer-joined":
            console.log(
              "Peer joined, starting connection"
            );

            if (peerRef.current) {
              peerRef.current.close();
              peerRef.current = null;
            }

            await startPeerConnection();

            break;

      case "relay-answer":
        await peerRef.current?.receiveAnswer(
          msg.sdp
        );
        break;

      case "relay-ice-candidate":
        await peerRef.current?.addIceCandidate({
          candidate: msg.candidate,
          sdpMid: msg.sdpMid,
          sdpMLineIndex:
            msg.sdpMLineIndex,
        });
        break;

                case "peer-disconnected":
            if (transferCompletedRef.current) {
              toast.success("Transfer completed");
              break;
            }

            if (
              state === "peer-connecting" ||
              state === "waiting-receiver"
            ) {
              console.log(
                "Ignoring disconnect during connection setup"
              );
              break;
            }

            if (!isSendingRef.current) {
              setState("failed");
              setStatusText(
                "Receiver disconnected"
              );
            }

            break;

      case "error":
        setState("failed");
        setStatusText(msg.message);
        break;
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
      signalingRef.current.close();
      signalingRef.current = null;
    }
  } catch (err) {
    console.warn(err);
  }

  transferCompletedRef.current = false;
  transferIdRef.current = "";

  setState("idle");
  setTransferId("");
  setStatusText("Ready");

 setSelectedFiles([]);

  setTransferProgress(0);
  setBytesSent(0);
  setTransferSpeed(0);
  setEtaSeconds(0);

  setWsConnected(false);

  const signaling = new SignalingClient();
  signalingRef.current = signaling;

  try {
    await signaling.connect(handleServerMessage, setWsConnected);

    signaling.send({
      type: "register",
      role: "sender",
    });

    signaling.send({
      type: "create-session",
    });
  } catch (err) {
    console.error(err);
    toast.error("Reconnect failed");
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
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 p-6 bg-black text-white">
      <h1 className="text-4xl font-bold">
        Sender
      </h1>

      <div className="border border-gray-700 rounded-xl p-6 w-full max-w-md space-y-4">
        <p>
          <strong>WebSocket:</strong>{" "}
          {wsConnected
            ? "Connected"
            : "Disconnected"}
        </p>

        <p>
          <strong>State:</strong>{" "}
          {transferProgress === 100
            ? "completed"
            : state}
        </p>

        <p>
          <strong>Status:</strong>{" "}
          {statusText}
        </p>

        {transferId && (
          <div className="flex items-center justify-between gap-3">
              <p>
                <strong>Transfer Code:</strong> {transferId}
              </p>

              <button
                onClick={copyTransferCode}
                className="bg-gray-700 hover:bg-gray-600 px-3 py-1 rounded text-sm"
              >
                📋 Copy
              </button>
          </div>
        )}

        {qrCodeUrl && (
          <div className="flex flex-col items-center gap-2">
            <p className="text-sm text-gray-300">
              Scan QR to join
            </p>

            <img
              src={qrCodeUrl}
              alt="Transfer QR"
              className="w-48 h-48 bg-white p-2 rounded"
            />
          </div>
        )}

        {receiverId &&
          state ===
            "waiting-receiver" && (
            <button
              onClick={
                approveReceiver
              }
              className="bg-blue-600 px-4 py-2 rounded w-full"
            >
              Approve Receiver
            </button>
          )}

        {state === "connected" && (
          <>



            <div
            onClick={() => fileInputRef.current?.click()}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`w-full mt-2 p-6 border-2 border-dashed rounded-xl text-center cursor-pointer transition-all ${
                isDragging
                  ? "border-green-400 bg-green-900/20"
                  : "border-gray-500 bg-gray-800"
              }`}
            >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />

              <div className="text-4xl mb-2">📁</div>

              <p className="font-semibold">
                {isDragging
                  ? "Drop file here"
                  : "Drag & Drop file here"}
              </p>

              <p className="text-sm text-gray-400 mt-1">
                or click to browse
              </p>
            </div>




      {selectedFiles.length > 0 && (
        <div className="space-y-2">
          <p>
            Files: {selectedFiles.length}
          </p>

          <p>
            Total Size:{" "}
            {formatBytes(
              selectedFiles.reduce(
                (sum, file) => sum + file.size,
                0
              )
            )}
          </p>

          <p>
            Sent: {formatBytes(bytesSent)}
          </p>

          <p>
            Speed: {formatBytes(transferSpeed)}/s
          </p>

          <p>
            ETA: {formatEta(etaSeconds)}
          </p>

          <div className="mt-4">
            <div className="flex justify-between text-sm mb-1">
              <span>Progress</span>
              <span>
                {transferProgress.toFixed(1)}%
              </span>
            </div>

            <div className="w-full bg-gray-700 rounded-full h-4 overflow-hidden">
              <div
                className="bg-green-500 h-4 transition-all duration-300"
                style={{
                  width: `${transferProgress}%`,
                }}
              />
            </div>
          </div>

          <div className="max-h-40 overflow-y-auto rounded border p-2">
            {selectedFiles.map((file) => (
              <div
                key={`${file.name}-${file.size}`}
                className="text-sm"
              >
                {file.name} (
                {formatBytes(file.size)})
              </div>
            ))}
          </div>
        </div>
      )}

        {!transferCompletedRef.current &&(
            <button
              onClick={sendFile}
              disabled={
                !selectedFiles.length ||
                isSending
              }
              className="bg-green-600 px-4 py-2 rounded w-full disabled:opacity-50"
            >
              {isSending
                ? "Sending..."
                : "Send File"}
            </button>
          )}

            <button
              onClick={resetSender}
              className="bg-yellow-600 px-4 py-2 rounded w-full mt-3"
            >
              New Transfer
            </button> 


            {isSending && (
              <button
                onClick={
                  cancelTransfer
                }
                className="bg-red-600 px-4 py-2 rounded w-full"
              >
                Cancel Transfer
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}