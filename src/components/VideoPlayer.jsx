import React, { useEffect, useRef, useState, useMemo } from "react";
import Plyr from "plyr";
import Hls from "hls.js";
import throttle from "lodash/throttle";
import { formatTime } from "../lib/rooms";

/**
 * VideoPlayer — the heart of the CN project.
 *
 * CLIENT-SERVER MODEL:
 *   HOST:    emits player-control → server broadcasts to all clients
 *   CLIENTS: receive player-update from server → apply to their local player
 *
 * Sync flow for late joiners:
 *   1. Server asks host for current state (request-video-state)
 *   2. Host responds with currentTime + isPlaying
 *   3. Server forwards to the new client (sync-video-state)
 *   4. Client applies state once player is ready
 */
export default function VideoPlayer({ room, isAdmin, socket, videoPath }) {
  const containerRef = useRef(null);
  const videoRef = useRef(null);
  const playerRef = useRef(null);
  const playerReadyRef = useRef(false);

  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState("Connecting...");

  // Refs for sync state management
  const isSynced = useRef(false);
  const isUpdatingFromSocket = useRef(false);
  const pendingSync = useRef(null);
  const seeking = useRef({ active: false, from: 0 });
  const doubleClickRef = useRef(false);

  const files = room?.files || [];
  const roomType = room?.roomType || "online";

  const videoFile = useMemo(() => files.find(f => f.type === "video"), [files]);

  // ─── Socket events ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    /**
     * CLIENT receives player update from server (which host originally sent)
     * This is the core sync mechanism.
     */
    const onPlayerUpdate = ({ isPlaying, currentTime, message }) => {
      if (isAdmin) return; // Host ignores these
      applyRemoteState(isPlaying, currentTime, message);
    };

    /**
     * HOST receives request from server to send state to a new joiner
     */
    const onRequestVideoState = ({ requestingSocketId }) => {
      if (!isAdmin || !playerRef.current) return;
      socket.emit("video-state-response", {
        requestingSocketId,
        currentTime: playerRef.current.currentTime,
        isPlaying: playerRef.current.playing,
      });
    };

    /**
     * CLIENT receives synced state from server (sent after joining)
     */
    const onSyncVideoState = ({ currentTime, isPlaying }) => {
      if (isSynced.current) return;
      pendingSync.current = { currentTime, isPlaying };
      if (playerReadyRef.current) applyPendingSync();
    };

    /**
     * Video was changed by host
     */
    const onVideoChanged = ({ newUrl }) => {
      window.location.reload(); // Simplest reload for new video
    };

    socket.on("player-update", onPlayerUpdate);
    socket.on("request-video-state", onRequestVideoState);
    socket.on("sync-video-state", onSyncVideoState);
    socket.on("video-changed", onVideoChanged);

    return () => {
      socket.off("player-update", onPlayerUpdate);
      socket.off("request-video-state", onRequestVideoState);
      socket.off("sync-video-state", onSyncVideoState);
      socket.off("video-changed", onVideoChanged);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, isAdmin]);

  // ─── Host periodic sync broadcast ────────────────────────────────────────
  useEffect(() => {
    if (!isAdmin || !socket) return;

    const interval = setInterval(() => {
      if (!playerRef.current?.playing) return;
      socket.emit("player-control", {
        message: "sync",
        currentTime: playerRef.current.currentTime,
        isPlaying: true,
      });
    }, 3000);

    return () => clearInterval(interval);
  }, [isAdmin, socket]);

  // ─── Initialize video player ──────────────────────────────────────────────
  useEffect(() => {
    let destroyed = false;

    const initPlayer = async () => {
      const plyrOpts = {
        fullscreen: { enabled: true, fallback: true, iosNative: false, container: "#video-container" },
        controls: isAdmin
          ? ["play-large", "play", "progress", "current-time", "duration", "mute", "volume", "captions", "settings", "fullscreen"]
          : ["play-large", "play", "progress", "current-time", "duration", "mute", "volume", "captions", "fullscreen"],
        tooltips: { controls: true, seek: true },
      };

      const source = videoFile?.url || "";

      if (roomType === "offline" && videoPath) {
        // Local file - only host has this
        videoRef.current.src = videoPath;
        playerRef.current = new Plyr(videoRef.current, plyrOpts);
      } else if (source.includes("youtube.com") || source.includes("youtu.be")) {
        playerRef.current = new Plyr(videoRef.current, plyrOpts);
        playerRef.current.source = {
          type: "video",
          sources: [{ src: source, provider: "youtube" }],
        };
      } else if (source.includes("vimeo.com")) {
        playerRef.current = new Plyr(videoRef.current, plyrOpts);
        playerRef.current.source = {
          type: "video",
          sources: [{ src: source, provider: "vimeo" }],
        };
      } else if (Hls.isSupported() && (source.includes(".m3u8") || source.includes("m3u8"))) {
        const hls = new Hls();
        hls.loadSource(source);
        hls.attachMedia(videoRef.current);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          if (!destroyed) {
            const qualities = hls.levels.map(l => l.height);
            qualities.unshift(0);
            plyrOpts.quality = { default: 0, options: qualities, forced: true, onChange: (q) => {
              if (q === 0) hls.currentLevel = -1;
              else hls.levels.forEach((l, i) => { if (l.height === q) hls.currentLevel = i; });
            }};
            plyrOpts.i18n = { qualityLabel: { 0: "Auto" } };
            playerRef.current = new Plyr(videoRef.current, plyrOpts);
            onPlayerReady();
          }
        });
        return; // onPlayerReady called from HLS event
      } else if (source) {
        videoRef.current.src = source;
        playerRef.current = new Plyr(videoRef.current, plyrOpts);
      } else {
        setLoading(false);
        return;
      }

      onPlayerReady();
    };

    const onPlayerReady = () => {
      if (!playerRef.current) return;

      playerRef.current.on("ready", () => {
        if (destroyed) return;
        playerReadyRef.current = true;
        setLoading(false);
        setSyncStatus(isAdmin ? "You control playback" : "Syncing with host...");
        if (pendingSync.current) applyPendingSync();
        else if (!isSynced.current) {
          setTimeout(() => { isSynced.current = true; setSyncStatus("In sync"); }, 2000);
        }
      });

      playerRef.current.on("canplay", () => {
        if (destroyed) return;
        setLoading(false);
        if (pendingSync.current && !isSynced.current) applyPendingSync();
      });

      attachPlayerListeners();
    };

    initPlayer();

    return () => {
      destroyed = true;
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
      playerReadyRef.current = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoFile?.url, roomType, videoPath]);

  const applyPendingSync = () => {
    if (!pendingSync.current || isSynced.current) return;
    const { currentTime, isPlaying } = pendingSync.current;
    pendingSync.current = null;
    isSynced.current = true;
    applyRemoteState(isPlaying, currentTime);
    setSyncStatus("In sync");
  };

  const applyRemoteState = (isPlaying, currentTime, logMessage) => {
    if (!playerRef.current) return;
    isUpdatingFromSocket.current = true;

    playerRef.current.currentTime = currentTime;
    if (isPlaying) {
      playerRef.current.play().catch(() => {
        playerRef.current.muted = true;
        playerRef.current.play().catch(() => {});
      });
    } else {
      playerRef.current.pause();
    }

    setSyncStatus("In sync");
    setTimeout(() => { isUpdatingFromSocket.current = false; }, 600);
  };

  const emitPlayerControl = (message, isPlaying) => {
    if (!isAdmin || !socket || !playerRef.current) return;
    if (!isSynced.current && message !== "sync") return;

    socket.emit("player-control", {
      message,
      currentTime: playerRef.current.currentTime,
      isPlaying,
    });
  };

  const attachPlayerListeners = () => {
    if (!playerRef.current) return;

    const onPlay = () => {
      if (isUpdatingFromSocket.current || !isAdmin) return;
      if (doubleClickRef.current) return;
      setTimeout(() => emitPlayerControl("play", true), 200);
    };

    const onPause = () => {
      if (isUpdatingFromSocket.current || !isAdmin) return;
      if (doubleClickRef.current) return;
      setTimeout(() => emitPlayerControl("pause", false), 200);
    };

    const onSeeking = () => {
      if (isUpdatingFromSocket.current) return;
      seeking.current.active = true;
      seeking.current.from = Math.floor(playerRef.current?.currentTime || 0);
    };

    const onSeeked = throttle(() => {
      if (!seeking.current.active || isUpdatingFromSocket.current) return;
      seeking.current.active = false;
      const to = Math.floor(playerRef.current?.currentTime || 0);
      if (seeking.current.from !== to) {
        setTimeout(() => emitPlayerControl("seek", playerRef.current?.playing ?? false), 200);
      }
    }, 600);

    playerRef.current.on("play", onPlay);
    playerRef.current.on("pause", onPause);
    playerRef.current.on("seeking", onSeeking);
    playerRef.current.on("seeked", onSeeked);
  };

  return (
    <div id="video-container" ref={containerRef} className="w-full h-full flex flex-col relative bg-black">
      {loading && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-black">
          <div className="spinner" />
          <p className="text-slate-400 text-sm">Loading stream...</p>
        </div>
      )}

      {/* Sync status indicator */}
      <div
        className="absolute top-3 left-3 z-10 flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-opacity"
        style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.1)" }}
      >
        <span
          className="w-2 h-2 rounded-full"
          style={{ background: isAdmin ? "var(--accent)" : syncStatus === "In sync" ? "#22c55e" : "#f59e0b" }}
        />
        {isAdmin ? "HOST" : syncStatus}
      </div>

      <video
        ref={videoRef}
        className="w-full h-full"
        playsInline
        crossOrigin="anonymous"
        style={{ display: "block" }}
      />
    </div>
  );
}
