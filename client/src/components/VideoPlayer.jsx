import React, { useEffect, useRef, useState, useMemo, useCallback } from "react";
import ReactPlayer from "react-player";

export default function VideoPlayer({ room, isAdmin, socket }) {
  const playerRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState("In sync");
  const [playing, setPlaying] = useState(false);

  // Sync state refs to prevent re-entrant loops
  const isUpdatingFromSocket = useRef(false);

  const files = room?.files || [];
  const videoFile = useMemo(() => files.find(f => f.type === "video"), [files]);
  const source = videoFile?.url || "";

  // Helper to reliably get current playback time from HTML5 video or ReactPlayer
  const getPlayerTime = useCallback(() => {
    const p = playerRef.current;
    if (!p) return 0;
    if (typeof p.currentTime === "number" && Number.isFinite(p.currentTime)) {
      return p.currentTime;
    }
    if (typeof p.getCurrentTime === "function") {
      const t = p.getCurrentTime();
      if (Number.isFinite(t)) return t;
    }
    const internal = p.getInternalPlayer?.();
    if (internal && typeof internal.currentTime === "number" && Number.isFinite(internal.currentTime)) {
      return internal.currentTime;
    }
    return 0;
  }, []);

  // Helper to reliably seek in HTML5 video or ReactPlayer
  const seekPlayer = useCallback((seconds) => {
    const p = playerRef.current;
    if (!p || !Number.isFinite(seconds)) return;
    const target = Math.max(0, seconds);
    try {
      if ("currentTime" in p && typeof p.currentTime === "number") {
        p.currentTime = target;
      }
      if (typeof p.seekTo === "function") {
        p.seekTo(target, "seconds");
      }
      const internal = p.getInternalPlayer?.();
      if (internal && typeof internal.currentTime === "number") {
        internal.currentTime = target;
      }
    } catch (err) {
      console.warn("Seek error:", err);
    }
  }, []);

  // Check if player is currently playing in the DOM
  const isPlayerPlaying = useCallback(() => {
    const p = playerRef.current;
    if (p && typeof p.paused === "boolean") {
      return !p.paused;
    }
    return playing;
  }, [playing]);

  // Host emits player controls to server
  const emitPlayerControl = useCallback((message, isPlayingOverride) => {
    if (!isAdmin || !socket || !playerRef.current) return;

    const actualPlaying = typeof isPlayingOverride === "boolean" ? isPlayingOverride : isPlayerPlaying();
    const actualTime = getPlayerTime();

    socket.emit("player-control", {
      message,
      currentTime: actualTime,
      isPlaying: actualPlaying,
    });
  }, [isAdmin, socket, isPlayerPlaying, getPlayerTime]);

  // Viewer receives remote playback updates from Host
  const applyRemoteState = useCallback((remoteIsPlaying, remoteCurrentTime) => {
    if (!playerRef.current) return;
    isUpdatingFromSocket.current = true;

    // Seek if viewer is out of sync by more than 1 second
    const localTime = getPlayerTime();
    if (Number.isFinite(remoteCurrentTime) && Math.abs(localTime - remoteCurrentTime) > 1.0) {
      seekPlayer(remoteCurrentTime);
    }

    // Set playing state to match host
    setPlaying(Boolean(remoteIsPlaying));
    setSyncStatus("In sync");

    setTimeout(() => {
      isUpdatingFromSocket.current = false;
    }, 500);
  }, [getPlayerTime, seekPlayer]);

  // Socket event listeners
  useEffect(() => {
    if (!socket) return;

    const onPlayerUpdate = ({ isPlaying: remotePlaying, currentTime: remoteTime }) => {
      if (isAdmin) return; // Host drives playback, ignores remote updates
      applyRemoteState(remotePlaying, remoteTime);
    };

    // Host responds to newly joined viewer requesting state
    const onRequestVideoState = ({ requestingSocketId }) => {
      if (!isAdmin || !playerRef.current) return;
      socket.emit("video-state-response", {
        requestingSocketId,
        currentTime: getPlayerTime(),
        isPlaying: isPlayerPlaying(),
      });
    };

    // Viewer receives initial state sync from Host
    const onSyncVideoState = ({ currentTime: remoteTime, isPlaying: remotePlaying }) => {
      if (isAdmin) return;
      applyRemoteState(remotePlaying, remoteTime);
    };

    socket.on("player-update", onPlayerUpdate);
    socket.on("request-video-state", onRequestVideoState);
    socket.on("sync-video-state", onSyncVideoState);

    return () => {
      socket.off("player-update", onPlayerUpdate);
      socket.off("request-video-state", onRequestVideoState);
      socket.off("sync-video-state", onSyncVideoState);
    };
  }, [socket, isAdmin, applyRemoteState, getPlayerTime, isPlayerPlaying]);

  // Host periodic heartbeat sync (every 1.5s while active)
  useEffect(() => {
    if (!isAdmin || !socket) return;

    const interval = setInterval(() => {
      if (!playerRef.current) return;
      emitPlayerControl("sync");
    }, 1500);

    return () => clearInterval(interval);
  }, [isAdmin, socket, emitPlayerControl]);

  // Handle Play
  const handlePlay = () => {
    if (isUpdatingFromSocket.current) return;
    setPlaying(true);
    if (isAdmin) {
      setTimeout(() => emitPlayerControl("play", true), 60);
    }
  };

  // Handle Pause
  const handlePause = () => {
    if (isUpdatingFromSocket.current) return;
    setPlaying(false);
    if (isAdmin) {
      setTimeout(() => emitPlayerControl("pause", false), 60);
    }
  };

  // Handle Seek
  const handleSeek = () => {
    if (isUpdatingFromSocket.current) return;
    if (isAdmin) {
      setTimeout(() => emitPlayerControl("seek"), 60);
    }
  };

  const handleReady = () => {
    setLoading(false);
    setSyncStatus(isAdmin ? "You control playback" : "In sync");
  };

  const handleError = (e) => {
    console.error("Player error:", e);
    setLoading(false);
  };

  return (
    <div className="w-full h-full flex flex-col relative bg-black">
      {loading && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-black pointer-events-none">
          <div className="spinner" />
          <p className="text-slate-400 text-sm">Loading stream...</p>
        </div>
      )}

      {/* Sync status indicator */}
      <div
        className="absolute top-3 left-3 z-10 flex items-center gap-2 px-2.5 py-1.5 rounded-full text-xs font-semibold transition-all pointer-events-none select-none shadow-lg"
        style={{ background: "rgba(10,12,18,0.75)", backdropFilter: "blur(10px)", border: "1px solid rgba(255,255,255,0.15)" }}
      >
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{ background: isAdmin ? "var(--accent)" : syncStatus === "In sync" ? "#22c55e" : "#f59e0b" }}
        />
        <span className="text-white text-[11px] sm:text-xs font-bold tracking-wide">
          {isAdmin ? "👑 HOST" : syncStatus}
        </span>
      </div>

      <div className="flex-1 w-full h-full relative bg-black">
        {source && (
          <ReactPlayer
            ref={playerRef}
            src={source}
            className="absolute top-0 left-0"
            width="100%"
            height="100%"
            controls={true}
            playing={playing}
            onReady={handleReady}
            onStart={handleReady}
            onPlay={handlePlay}
            onPause={handlePause}
            onSeeked={handleSeek}
            onError={handleError}
            playsInline
            config={{
              youtube: {
                modestbranding: 1,
                rel: 0,
                origin: typeof window !== "undefined" ? window.location.origin : ""
              },
              vimeo: {
                dnt: true,
              },
              hls: {
                lowLatencyMode: true,
              }
            }}
          />
        )}
      </div>
    </div>
  );
}
