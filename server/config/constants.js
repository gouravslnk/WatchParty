export const ROLES = {
  HOST: "host",
  VIEWER: "viewer",
};

export const SOCKET_EVENTS = {
  // Client -> Server
  JOIN_ROOM: "join-room",
  LEAVE_ROOM: "leave-room",
  PLAYER_CONTROL: "player-control",
  VIDEO_STATE_RESPONSE: "video-state-response",
  CHANGE_VIDEO: "change-video",
  TRANSFER_HOST: "transfer-host",
  KICK_USER: "kick-user",
  SEND_MESSAGE: "send-message",
  SEND_REACTION: "send-reaction",

  // Server -> Client
  ROLE_ASSIGNMENT: "role-assignment",
  PRESENCE_SYNC: "presence-sync",
  USER_JOINED: "user-joined",
  USER_LEFT: "user-left",
  USER_KICKED: "user-kicked",
  KICKED: "kicked",
  ROOM_ENDED: "room-ended",
  JOIN_ERROR: "join-error",
  ERROR_MESSAGE: "error-message",
  PLAYER_UPDATE: "player-update",
  REQUEST_VIDEO_STATE: "request-video-state",
  SYNC_VIDEO_STATE: "sync-video-state",
  VIDEO_CHANGED: "video-changed",
  HOST_CHANGED: "host-changed",
  NEW_MESSAGE: "new-message",
  NEW_REACTION: "new-reaction",
};
