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
    if (!username) {
      navigate(`/join?roomCode=${roomCode}`, { replace: true });
      return;
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
      setIsAdmin(data.admin === username);
      setLoading(false);
    };

    fetchRoom();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode]);

  // Connect socket & join room 
  useEffect(() => {
    if (!room || !username) return;

    const socket = socketStore.connect();

    const onConnect = () => {
      socket.emit("join-room", { roomCode, username });
    };

    if (socket.connected) {
      onConnect();
    } else {
      socket.once("connect", onConnect);
    }

    // Presence events
    socket.on("presence-sync", ({ membersList }) => setMembers(membersList || []));
    socket.on("user-joined", ({ username: u, membersList }) => {
      setMembers(membersList || []);
      if (u !== username) {
        chatStore.addSystem(`${u} joined the party 🎉`);
      }
    });
    socket.on("user-left", ({ username: u, membersList }) => {
      setMembers(membersList || []);
      chatStore.addSystem(`${u} left`);
    });

    // Room ended by host
    socket.on("room-ended", () => {
      toast.error("The host ended the party.");
      navigate("/", { replace: true });
    });

    // Reactions from others
    socket.on("new-reaction", ({ username: u, emoji }) => {
      setReactions(r => [...r, { id: Date.now() + Math.random(), emoji, username: u }]);
    });

    // Chat messages from others
    socket.on("new-message", ({ username: u, message }) => {
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

    return () => {
      socket.off("presence-sync");
      socket.off("user-joined");
      socket.off("user-left");
      socket.off("room-ended");
      socket.off("video-changed");
      socket.off("new-reaction");
      socket.off("new-message");
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room, username]);

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
    setReactions(r => [...r, { id: Date.now() + Math.random(), emoji, username: "You" }]);
  }, [socketStore]);

  const sendMessage = useCallback((text) => {
    chatStore.addMessage({ username: "You", text, time: getCurrentTime() });
    socketStore.socket?.emit("send-message", text);
  }, [chatStore, socketStore]);

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
    <div className="h-screen flex overflow-hidden" style={{ background: "var(--bg)" }}>
      {/* Main video area */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        {/* Video */}
        <div className="flex-1 relative bg-black">
          {room && (
            <VideoPlayer
              key={`${room.roomCode}:${room?.files?.[0]?.url || ""}`}
              room={room}
              isAdmin={isAdmin}
              socket={socketStore.socket}
            />
          )}

        </div>

        {/* Bottom bar */}
        <div
          className="flex items-center justify-between px-4 py-2.5 border-t shrink-0"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}
        >
          <div className="flex items-center gap-3">
            <div className="pulse-dot" />
            <span className="text-sm font-semibold text-white">{room?.roomName}</span>
            <span className="tag">{members.length} watching</span>
          </div>

          <div className="flex items-center gap-2">

          </div>
        </div>
      </div>

      {/* Sidebar */}
      {sidebarOpen && (
        <Sidebar
          room={room}
          isAdmin={isAdmin}
          username={username}
          members={members}
          socket={socketStore.socket}
          onLeave={handleLeave}
          onSendMessage={sendMessage}
        />
      )}
    </div>
  );
}
