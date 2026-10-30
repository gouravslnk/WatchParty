import React, { useEffect, useRef, useState, useMemo } from "react";
import ReactPlayer from "react-player";

export default function VideoPlayer({ room, isAdmin, socket }) {
  const playerRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState("Connecting...");
  const [playing, setPlaying] = useState(false);
  const [needsPlaybackUnlock, setNeedsPlaybackUnlock] = useState(false);

  // Refs for sync state management
  const isSynced = useRef(false);
  const isUpdatingFromSocket = useRef(false);
  const pendingSync = useRef(null);
  const viewerPlaybackUnlocked = useRef(false);
  const latestRemoteState = useRef({ currentTime: 0, isPlaying: false });

  const files = room?.files || [];
  const videoFile = useMemo(() => files.find(f => f.type === "video"), [files]);
  const source = videoFile?.url || "";

  const getPlayerTime = () => {
    const player = playerRef.current;
    if (!player) return 0;
    return Number.isFinite(player.currentTime) ? player.currentTime : 0;
  };

  const seekPlayer = (seconds) => {
    const player = playerRef.current;
    if (!player || !Number.isFinite(seconds)) return;
    player.currentTime = Math.max(0, seconds);
  };

  const getPlayerIsPlaying = () => {
    const player = playerRef.current;
    return player ? !player.paused : playing;
  };

  // Socket events 
  useEffect(() => {
    if (!socket) return;

    const onPlayerUpdate = ({ isPlaying, currentTime, message }) => {
      if (isAdmin) return; // Host ignores these
      applyRemoteState(isPlaying, currentTime, message);
    };

    const onRequestVideoState = ({ requestingSocketId }) => {
      if (!isAdmin || !playerRef.current) return;
      socket.emit("video-state-response", {
        requestingSocketId,
        currentTime: getPlayerTime(),
        isPlaying: getPlayerIsPlaying(),
      });
    };

    const onSyncVideoState = ({ currentTime, isPlaying }) => {
      if (isSynced.current) return;
      pendingSync.current = { currentTime, isPlaying };
      if (!loading) applyPendingSync();
    };

    const onVideoChanged = () => {};

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
  }, [socket, isAdmin, playing, loading]);

  // Failsafe Loading Timeout 
  useEffect(() => {
    setLoading(true);
    setPlaying(false);
    setNeedsPlaybackUnlock(false);
    isSynced.current = false;
    pendingSync.current = null;
    viewerPlaybackUnlocked.current = isAdmin;
    latestRemoteState.current = { currentTime: 0, isPlaying: false };
    setSyncStatus(isAdmin ? "Loading host player..." : "Syncing with host...");

    const timer = setTimeout(() => {
      setLoading(false);
      if (pendingSync.current) applyPendingSync();
      else if (!isSynced.current) {
        isSynced.current = true;
        setSyncStatus(isAdmin ? "You control playback" : "In sync");
      }
    }, 2500); // 2.5 seconds maximum loading screen
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, isAdmin]);

  // Host periodic sync broadcast 
  useEffect(() => {
    if (!isAdmin || !socket) return;

    const interval = setInterval(() => {
      if (!getPlayerIsPlaying() || !playerRef.current) return;
      socket.emit("player-control", {
        message: "sync",
        currentTime: getPlayerTime(),
        isPlaying: true,
      });
    }, 3000);

    return () => clearInterval(interval);
  }, [isAdmin, socket, playing]);

  const applyPendingSync = () => {
    if (!pendingSync.current || isSynced.current) return;
    const { currentTime, isPlaying } = pendingSync.current;
    pendingSync.current = null;
    isSynced.current = true;
    applyRemoteState(isPlaying, currentTime);
    setSyncStatus("In sync");
  };

  const applyRemoteState = (remoteIsPlaying, remoteCurrentTime, logMessage) => {
    if (!playerRef.current) return;
    isUpdatingFromSocket.current = true;
    latestRemoteState.current = { currentTime: remoteCurrentTime, isPlaying: remoteIsPlaying };

    // Seek if out of sync
    const localTime = getPlayerTime();
    if (Math.abs(localTime - remoteCurrentTime) > 2) {
      seekPlayer(remoteCurrentTime);
    }

    if (!isAdmin && remoteIsPlaying && !viewerPlaybackUnlocked.current) {
      setPlaying(false);
      setNeedsPlaybackUnlock(true);
      setSyncStatus("Click to sync");
      setTimeout(() => { isUpdatingFromSocket.current = false; }, 800);
      return;
    }

    if (!remoteIsPlaying) {
      setNeedsPlaybackUnlock(false);
    }

    setPlaying(remoteIsPlaying);
    setSyncStatus("In sync");
    
    setTimeout(() => { isUpdatingFromSocket.current = false; }, 800);
  };

  const emitPlayerControl = (message, isPlayingOverride = playing) => {
    if (!isAdmin || !socket || !playerRef.current) return;
    if (!isSynced.current && message !== "sync") return;

    socket.emit("player-control", {
      message,
      currentTime: getPlayerTime(),
      isPlaying: isPlayingOverride,
    });
  };

  const handlePlay = () => {
    if (isUpdatingFromSocket.current || !isAdmin) return;
    setPlaying(true);
    setTimeout(() => emitPlayerControl("play", true), 100);
  };

  const handlePause = () => {
    if (isUpdatingFromSocket.current || !isAdmin) return;
    setPlaying(false);
    setTimeout(() => emitPlayerControl("pause", false), 100);
  };

  const handleSeek = () => {
    if (isUpdatingFromSocket.current || !isAdmin) return;
    setTimeout(() => emitPlayerControl("seek", playing), 100);
  };

  const handleReady = () => {
    setLoading(false);
    setSyncStatus(isAdmin ? "You control playback" : "Syncing with host...");
    if (pendingSync.current) applyPendingSync();
    else if (!isSynced.current) {
      setTimeout(() => { isSynced.current = true; setSyncStatus("In sync"); }, 2000);
    }
  };

  const handleError = (e) => {
    console.error("Player error", e);
    setLoading(false); // remove loading state so user doesn't get stuck forever
  };

  const handleUnlockPlayback = async () => {
    const { currentTime, isPlaying } = latestRemoteState.current;
    viewerPlaybackUnlocked.current = true;
    setNeedsPlaybackUnlock(false);
    setSyncStatus("In sync");
    seekPlayer(currentTime);
    setPlaying(isPlaying);

    if (isPlaying && playerRef.current?.play) {
      try {
        await playerRef.current.play();
      } catch (error) {
        console.warn("Playback unlock failed", error);
        viewerPlaybackUnlocked.current = false;
        setNeedsPlaybackUnlock(true);
        setPlaying(false);
        setSyncStatus("Click to sync");
      }
    }
  };

  return (
    <div className="w-full h-full flex flex-col relative bg-black">
      {loading && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-black pointer-events-none">
          <div className="spinner" />
          <p className="text-slate-400 text-sm">Loading stream...</p>
        </div>
      )}

      {needsPlaybackUnlock && !loading && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 px-6">
          <button
            type="button"
            onClick={handleUnlockPlayback}
            className="btn-primary"
          >
            Enable synced playback
          </button>
        </div>
      )}

      {/* Sync status indicator */}
      <div
        className="absolute top-3 left-3 z-10 flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-opacity pointer-events-none"
        style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.1)" }}
      >
        <span
          className="w-2 h-2 rounded-full"
          style={{ background: isAdmin ? "var(--accent)" : syncStatus === "In sync" ? "#22c55e" : "#f59e0b" }}
        />
        {isAdmin ? "HOST" : syncStatus}
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
            playing={isAdmin ? undefined : playing}
            onReady={handleReady}
            onLoadedMetadata={handleReady}
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
