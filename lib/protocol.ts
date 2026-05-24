import { IceCandidatePayload } from "@/types/transfer";

export type Role = "sender" | "receiver";

/* CLIENT -> BACKEND */

export interface RegisterMessage {
  type: "register";
  role: Role;
}

export interface CreateSessionMessage {
  type: "create-session";
}

export interface JoinSessionMessage {
  type: "join-session";
  transferId: string;
}

export interface ApproveJoinMessage {
  type: "approve-join";
  transferId: string;
  token: string;
  receiverId: string;
}

export interface OfferMessage {
  type: "offer";
  transferId: string;
  sdp: string;
}

export interface AnswerMessage {
  type: "answer";
  transferId: string;
  sdp: string;
}

export interface IceCandidateMessage {
  type: "ice-candidate";
  transferId: string;
  candidate: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
}

export interface HeartbeatMessage {
  type: "heartbeat";
}

export interface DisconnectMessage {
  type: "disconnect";
}

export type ClientMessage =
  | RegisterMessage
  | CreateSessionMessage
  | JoinSessionMessage
  | ApproveJoinMessage
  | OfferMessage
  | AnswerMessage
  | IceCandidateMessage
  | HeartbeatMessage
  | DisconnectMessage;

/* BACKEND -> CLIENT */

export interface RegisteredMessage {
  type: "registered";
  peerId: string;
}

export interface SessionCreatedMessage {
  type: "session-created";
  transferId: string;
  token: string;
}

export interface JoinRequestMessage {
  type: "join-request";
  receiverId: string;
}

export interface SessionJoinedMessage {
  type: "session-joined";
  transferId: string;
}

export interface PeerJoinedMessage {
  type: "peer-joined";
  peerId: string;
  role: Role;
}

export interface PeerDisconnectedMessage {
  type: "peer-disconnected";
  peerId: string;
  role: Role;
}

export interface RelayOfferMessage {
  type: "relay-offer";
  sdp: string;
}

export interface RelayAnswerMessage {
  type: "relay-answer";
  sdp: string;
}

export interface RelayIceCandidateMessage {
  type: "relay-ice-candidate";
  candidate: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
}

export interface HeartbeatAckMessage {
  type: "heartbeat-ack";
}

export interface ErrorMessage {
  type: "error";
  code: string;
  message: string;
}

export type ServerPayload =
  | RegisteredMessage
  | SessionCreatedMessage
  | JoinRequestMessage
  | SessionJoinedMessage
  | PeerJoinedMessage
  | PeerDisconnectedMessage
  | RelayOfferMessage
  | RelayAnswerMessage
  | RelayIceCandidateMessage
  | HeartbeatAckMessage
  | ErrorMessage;

export type VersionedServerMessage = ServerPayload & {
  version: string;
};

export function isVersionedServerMessage(
  data: unknown
): data is VersionedServerMessage {
  if (!data || typeof data !== "object") return false;

  return "version" in data && "type" in data;
}