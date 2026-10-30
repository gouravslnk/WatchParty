import React, { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "../lib/supabase";
import { useSocketStore, useUserStore, useChatStore } from "../stores";
import { getCurrentTime } from "../lib/rooms";
import VideoPlayer from "../components/VideoPlayer";
import Sidebar from "../components/Sidebar";
import { MessageSquare, X } from "lucide-react";

export default function RoomView() {
  const { roomCode } = useParams();
  const navigate = useNavigate();

  const socketStore = useSocketStore();
  const { username, isAdmin, setIsAdmin } = useUserStore();
  const chatStore = useChatStore();

  const [room, setRoom] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [members, setMembers] = useState([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [reactions, setReactions] = useState([]);

  const chatRef = useRef(null);

  // Load room from Supabase 
  useEffect(() => {
    const effectiveUsername = username || (typeof window !== "undefined" ? (sessionStorage.getItem("wp_username") || "") : "");
    if (!effectiveUsername) {
      navigate(`/join?roomCode=${roomCode}`, { replace: true });
      return;
    }
    if (!username && effectiveUsername) {
      useUserStore.getState().setUsername(effectiveUsername);
    }

    const fetchRoom = async () => {
      const { data, error: dbErr } = await supabase
        .from("rooms")
        .select("*")
        .eq("roomCode", roomCode)
        .maybeSingle();

      if (dbErr || !data) {
        setError("Room not found or has ended.");
        setLoading(false);
        return;
      }

      setRoom(data);

      // Only tab possessing secret hostToken can be tentatively considered host until socket verifies
      const hasHostToken = typeof window !== "undefined" && Boolean(sessionStorage.getItem(`wp_host_token_${roomCode}`));
      setIsAdmin(hasHostToken);
      setLoading(false);
    };

    fetchRoom();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode]);

  // Connect socket & join room 
  useEffect(() => {
    if (!room || !username) return;

    const socket = socketStore.connect();
    const hostToken = typeof window !== "undefined" ? sessionStorage.getItem(`wp_host_token_${roomCode}`) : null;

    const onConnect = () => {
      socket.emit("join-room", { roomCode, username, hostToken });
    };

    if (socket.connected) {
      onConnect();
    } else {
      socket.once("connect", onConnect);
    }

    // Server-authoritative role assignment (Sole Source of Truth)
    socket.on("role-assignment", ({ isHost, admin, hostToken: newHostToken }) => {
      setIsAdmin(Boolean(isHost));
      if (isHost && newHostToken && typeof window !== "undefined") {
        sessionStorage.setItem(`wp_host_token_${roomCode}`, newHostToken);
      } else if (!isHost && typeof window !== "undefined") {
        sessionStorage.removeItem(`wp_host_token_${roomCode}`);
      }
      setRoom(prev => (prev ? { ...prev, admin } : prev));
    });

    // Nickname collision error
    socket.on("join-error", ({ message }) => {
      toast.error(message || "Nickname already in use.");
      if (typeof window !== "undefined") {
        sessionStorage.removeItem("wp_username");
      }
      useUserStore.getState().setUsername("");
      navigate(`/join?roomCode=${roomCode}`, { replace: true });
    });

    // Presence events
    socket.on("presence-sync", ({ membersList }) => setMembers(membersList || []));
    socket.on("user-joined", ({ username: u, membersList }) => {
      setMembers(membersList || []);
      if (u && username && u.trim().toLowerCase() !== username.trim().toLowerCase()) {
        chatStore.addSystem(`${u} joined the party 🎉`);
      }
    });
    socket.on("user-left", ({ username: u, membersList }) => {
      setMembers(membersList || []);
      if (u && username && u.trim().toLowerCase() !== username.trim().toLowerCase()) {
        chatStore.addSystem(`${u} left`);
      }
    });

    // Room ended by host
    socket.on("room-ended", () => {
      toast.error("The host ended the party.");
      navigate("/", { replace: true });
    });

    // Reactions from others (ignore self echo)
    socket.on("new-reaction", ({ username: u, emoji }) => {
      if (u && username && u.trim().toLowerCase() === username.trim().toLowerCase()) return;
      const id = Date.now() + Math.random();
      const xOffset = Math.floor(Math.random() * 26);
      const driftX = `${(Math.random() * 16 - 8).toFixed(1)}px`;
      setReactions(r => [...r, { id, emoji, username: u, xOffset, driftX }]);
      setTimeout(() => {
        setReactions(r => r.filter(x => x.id !== id));
      }, 2100);
    });

    // Chat messages from others (ignore self echo)
    socket.on("new-message", ({ username: u, message }) => {
      if (u && username && u.trim().toLowerCase() === username.trim().toLowerCase()) return;
      chatStore.addMessage({ username: u, text: message, time: getCurrentTime() });
    });

    // Video changed by host
    socket.on("video-changed", ({ source, roomType }) => {
      setRoom(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          roomType: roomType || prev.roomType || "online",
          files: [{ type: "video", url: source }],
        };
      });
      if (!isAdmin) {
        toast.info("The host changed the video.");
      }
    });

    // Host handover notification (display only — role-assignment is the authority)
    socket.on("host-changed", ({ admin, previousAdmin }) => {
      setRoom(prev => (prev ? { ...prev, admin } : prev));
      const amNewHost = Boolean(username && admin && username.trim().toLowerCase() === admin.trim().toLowerCase());
      const wasPreviousHost = Boolean(previousAdmin && username && previousAdmin.trim().toLowerCase() === username.trim().toLowerCase());
      if (amNewHost) {
        toast.success("👑 You are now the host! You have playback controls.");
      } else if (wasPreviousHost) {
        toast.info(`You transferred host controls to ${admin}.`);
      } else {
        toast.info(`${admin} is now the host.`);
      }
    });

    // Server-side error messages (kick/transfer failures, etc.)
    socket.on("error-message", (msg) => {
      toast.error(msg || "An error occurred.");
    });

    // Kicked by host
    socket.on("kicked", ({ message }) => {
      toast.error(message || "You were removed from the room by the host.");
      if (typeof window !== "undefined") {
        sessionStorage.removeItem("wp_username");
        sessionStorage.removeItem(`wp_host_token_${roomCode}`);
      }
      useUserStore.getState().reset();
      socketStore.disconnect();
      navigate("/", { replace: true });
    });

    // Member kicked notification
    socket.on("user-kicked", ({ username: u, membersList }) => {
      setMembers(membersList || []);
      if (u) {
        chatStore.addSystem(`${u} was removed by the host`);
      }
    });

    return () => {
      socket.off("role-assignment");
      socket.off("join-error");
      socket.off("presence-sync");
      socket.off("user-joined");
      socket.off("user-left");
      socket.off("user-kicked");
      socket.off("kicked");
      socket.off("room-ended");
      socket.off("video-changed");
      socket.off("host-changed");
      socket.off("error-message");
      socket.off("new-reaction");
      socket.off("new-message");
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.roomCode, username]);

  const handleLeave = useCallback(async () => {
    const socket = socketStore.socket;
    if (socket) {
      socket.emit("leave-room");
    }
    socketStore.disconnect();
    useUserStore.getState().reset();
    chatStore.clearMessages();
    navigate("/", { replace: true });
  }, [socketStore, chatStore, navigate]);

  const sendReaction = useCallback((emoji) => {
    socketStore.socket?.emit("send-reaction", emoji);
    const id = Date.now() + Math.random();
    const xOffset = Math.floor(Math.random() * 26);
    const driftX = `${(Math.random() * 16 - 8).toFixed(1)}px`;
    setReactions(r => [...r, { id, emoji, username: "You", xOffset, driftX }]);
    setTimeout(() => {
      setReactions(r => r.filter(x => x.id !== id));
    }, 2100);
  }, [socketStore]);

  const sendMessage = useCallback((text) => {
    chatStore.addMessage({ username: "You", text, time: getCurrentTime() });
    socketStore.socket?.emit("send-message", text);
  }, [chatStore, socketStore]);

  const handleTransferHost = useCallback((targetUsername) => {
    if (!isAdmin) {
      toast.error("Only the host can transfer hosting privileges.");
      return;
    }
    socketStore.socket?.emit("transfer-host", { targetUsername });
  }, [isAdmin, socketStore]);

  const handleKickUser = useCallback((targetUsername) => {
    if (!isAdmin) {
      toast.error("Only the host can remove members.");
      return;
    }
    socketStore.socket?.emit("kick-user", { targetUsername });
  }, [isAdmin, socketStore]);



  // Dynamic document title for browser tab and social visibility
  useEffect(() => {
    if (room?.roomName) {
      document.title = `WatchParty • ${room.roomName}`;
    } else if (roomCode) {
      document.title = `WatchParty • Room ${roomCode}`;
    }
    return () => {
      document.title = "WatchParty";
    };
  }, [room?.roomName, roomCode]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg)" }}>
        <div className="flex flex-col items-center gap-4">
          <div className="spinner" />
          <p className="text-slate-400 text-sm">Joining room...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "var(--bg)" }}>
        <div className="glass rounded-2xl p-8 text-center max-w-sm">
          <p className="text-2xl mb-2">😕</p>
          <h2 className="font-display text-xl font-bold text-white mb-2">Room Not Found</h2>
          <p className="text-slate-400 text-sm mb-6">{error}</p>
          <button className="btn-primary w-full" onClick={() => navigate("/")}>Go Home</button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen h-[100dvh] w-full flex flex-col md:flex-row overflow-hidden bg-black" style={{ background: "var(--bg)" }}>
      {/* Main video area */}
      <div
        className={`flex flex-col min-w-0 relative ${
          sidebarOpen
            ? "w-full h-[38vh] min-h-[235px] max-h-[46vh] sm:h-[42vh] md:h-full md:max-h-none md:flex-1 shrink-0 md:shrink"
            : "w-full flex-1 h-full"
        }`}
      >
        {/* Video Player */}
        <div className="flex-1 relative bg-black overflow-hidden flex flex-col justify-center">
          {room && (
            <VideoPlayer
              key={`${room.roomCode}:${room?.files?.[0]?.url || ""}`}
              room={room}
              isAdmin={isAdmin}
              socket={socketStore.socket}
            />
          )}

          {/* Floating animated reactions stream - Smooth continuous float with zero border clipping */}
          <div className="absolute inset-0 z-20 pointer-events-none overflow-hidden">
            {reactions.map(r => (
              <div
                key={r.id}
                className="reaction-bubble flex items-center gap-2 px-3.5 py-1.5 rounded-full shadow-2xl"
                style={{
                  position: "absolute",
                  bottom: "20px",
                  right: `${24 + (r.xOffset || 0)}px`,
                  background: "rgba(14, 18, 28, 0.92)",
                  backdropFilter: "blur(16px)",
                  border: "1.5px solid rgba(255, 255, 255, 0.2)",
                  boxShadow: "0 8px 30px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.15)",
                  whiteSpace: "nowrap",
                  "--drift-x": r.driftX || "-4px",
                }}
              >
                <span className="text-sm select-none leading-none">{r.emoji}</span>
                <span className="text-[11px] sm:text-xs font-semibold text-slate-200 select-none tracking-wide">{r.username}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom bar */}
        <div
          className="flex items-center justify-between px-3 sm:px-4 py-2 border-t shrink-0 gap-2"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}
        >
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 shrink">
            <div className="pulse-dot shrink-0" />
            <span className="text-xs sm:text-sm font-semibold text-white truncate max-w-[120px] sm:max-w-[200px]">{room?.roomName}</span>
            <span className="tag shrink-0 hidden sm:inline-block">{members.length} watching</span>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Quick Reactions Bar */}
            <div className="flex items-center gap-0.5 sm:gap-1 bg-white/5 p-1 rounded-xl border border-white/5">
              {["❤️", "🔥", "😂", "🎉", "🍿"].map(emoji => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => sendReaction(emoji)}
                  className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded-lg hover:bg-white/10 active:scale-95 transition-all text-xs sm:text-sm"
                  title={`React ${emoji}`}
                >
                  {emoji}
                </button>
              ))}
            </div>

            {/* Sidebar toggle button */}
            <button
              type="button"
              onClick={() => setSidebarOpen(s => !s)}
              className={`btn-ghost text-xs py-1.5 px-2.5 sm:px-3 flex items-center gap-1.5 ${sidebarOpen ? "bg-white/10 border-white/20" : ""}`}
              title={sidebarOpen ? "Hide chat panel" : "Show chat panel"}
            >
              <MessageSquare className="h-4 w-4" />
              <span className="hidden sm:inline">{sidebarOpen ? "Hide Chat" : "Chat"}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Sidebar */}
      {sidebarOpen && (
        <div className="flex-1 min-h-0 w-full md:w-[360px] md:flex-none md:shrink-0 md:h-full overflow-hidden">
          <Sidebar
            room={room}
            isAdmin={isAdmin}
            username={username}
            members={members}
            socket={socketStore.socket}
            onLeave={handleLeave}
            onSendMessage={sendMessage}
            onClose={() => setSidebarOpen(false)}
            onTransferHost={handleTransferHost}
            onKickUser={handleKickUser}
          />
        </div>
      )}
    </div>
  );
}
