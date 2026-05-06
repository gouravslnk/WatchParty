import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Copy, Check, Crown, Link as LinkIcon, LogOut, Users, Video, X,
  Loader2, Send, Hash, ChevronDown, ChevronUp
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { useChatStore } from "../stores";
import { normalizeRoomCode } from "../lib/rooms";

export default function Sidebar({ room, isAdmin, username, members, socket, onLeave, onSendMessage }) {
  const chatStore = useChatStore();
  const messages = useChatStore(s => s.messages);

  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState("");
  const [changeVideoOpen, setChangeVideoOpen] = useState(false);
  const [newVideoUrl, setNewVideoUrl] = useState("");
  const [changingVideo, setChangingVideo] = useState(false);
  const [membersExpanded, setMembersExpanded] = useState(true);

  const chatEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const copyInvite = async () => {
    const url = `${window.location.origin}/join?roomCode=${room.roomCode}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success("Invite link copied!");
    setTimeout(() => setCopied(false), 1600);
  };

  const handleSend = (e) => {
    e.preventDefault();
    const text = message.trim();
    if (!text) return;
    onSendMessage(text);
    setMessage("");
    inputRef.current?.focus();
  };

  const handleChangeVideo = async (e) => {
    e.preventDefault();
    if (!isAdmin) return;
    const url = newVideoUrl.trim();
    if (!url) return;

    setChangingVideo(true);
    const { error } = await supabase
      .from("rooms")
      .update({ files: [{ type: "video", url }] })
      .eq("roomCode", room.roomCode);
    setChangingVideo(false);

    if (error) { toast.error("Failed to change video."); return; }

    socket?.emit("change-video", { newUrl: url });
    setNewVideoUrl("");
    setChangeVideoOpen(false);
    toast.success("Video changed for everyone!");
  };

  return (
    <div
      className="w-[320px] shrink-0 flex flex-col border-l slide-in"
      style={{ borderColor: "var(--border)", background: "var(--surface)" }}
    >
      {/* Room header */}
      <div className="p-4 border-b shrink-0" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: "var(--accent)" }}>
              {room?.roomType === "offline" ? "Local Sync" : "Online Stream"}
            </p>
            <h2 className="font-display font-bold text-white text-lg truncate">{room?.roomName}</h2>
            <p className="text-xs text-slate-400 mt-0.5">as <span className="text-white font-semibold">{username}</span></p>
          </div>
          {isAdmin && (
            <div
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold shrink-0"
              style={{ background: "rgba(234,179,8,0.1)", border: "1px solid rgba(234,179,8,0.25)", color: "#fbbf24" }}
            >
              <Crown className="h-3 w-3" /> Host
            </div>
          )}
        </div>

        {/* Invite */}
        <div className="flex gap-2">
          <button onClick={copyInvite} className="btn-ghost flex-1 text-xs py-2">
            {copied ? <Check className="h-3.5 w-3.5" /> : <LinkIcon className="h-3.5 w-3.5" />}
            Invite link
          </button>
          <div
            className="px-3 py-2 rounded-xl font-mono text-sm font-bold text-white flex items-center"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid var(--border-bright)" }}
          >
            {room?.roomCode}
          </div>
        </div>
      </div>

      {/* Members */}
      <div className="p-3 border-b shrink-0" style={{ borderColor: "var(--border)" }}>
        <button
          className="flex items-center justify-between w-full text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2"
          onClick={() => setMembersExpanded(e => !e)}
        >
          <span className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" />
            {members.length} watching
          </span>
          {membersExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
        {membersExpanded && (
          <div className="flex flex-wrap gap-1.5">
            {members.map(m => (
              <div key={m} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid var(--border)" }}>
                {m === room?.admin && <Crown className="h-3 w-3 shrink-0" style={{ color: "#fbbf24" }} />}
                <span className="text-xs font-medium text-slate-300">{m === username ? "You" : m}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Host controls */}
      {isAdmin && (
        <div className="p-3 border-b shrink-0" style={{ borderColor: "var(--border)" }}>
          <button onClick={() => setChangeVideoOpen(true)} className="btn-ghost w-full text-sm py-2">
            <Video className="h-4 w-4" /> Change Video
          </button>
        </div>
      )}

      {/* Chat */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="px-3 py-2 flex items-center gap-2 shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
          <Hash className="h-3.5 w-3.5 text-slate-500" />
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Chat</span>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {messages.length === 0 && (
            <p className="text-xs text-slate-600 text-center mt-4">No messages yet. Say hello! 👋</p>
          )}
          {messages.map(msg => (
            <MessageBubble key={msg.id} msg={msg} currentUsername={username} />
          ))}
          <div ref={chatEndRef} />
        </div>

        <form onSubmit={handleSend} className="p-3 border-t flex gap-2 shrink-0" style={{ borderColor: "var(--border)" }}>
          <input
            ref={inputRef}
            className="field flex-1 py-2 text-sm"
            placeholder="Send a message..."
            value={message}
            onChange={e => setMessage(e.target.value)}
            maxLength={500}
          />
          <button type="submit" className="btn-ghost w-10 h-10 p-0 shrink-0" disabled={!message.trim()}>
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>

      {/* Leave button */}
      <div className="p-3 border-t shrink-0" style={{ borderColor: "var(--border)" }}>
        <button onClick={onLeave} className="btn-danger w-full text-sm">
          <LogOut className="h-4 w-4" />
          {isAdmin ? "End Room" : "Leave Room"}
        </button>
      </div>

      {/* Change video modal */}
      {changeVideoOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }}>
          <div className="glass rounded-2xl p-5 w-full max-w-md fade-in">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="font-display font-bold text-white text-lg">Change Video</h3>
                <p className="text-sm text-slate-400 mt-0.5">New URL applies to everyone instantly.</p>
              </div>
              <button className="btn-ghost w-9 h-9 p-0" onClick={() => setChangeVideoOpen(false)}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleChangeVideo} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-300 mb-1.5">Video URL</label>
                <input
                  className="field"
                  type="url"
                  placeholder="https://example.com/video.m3u8"
                  value={newVideoUrl}
                  onChange={e => setNewVideoUrl(e.target.value)}
                  autoFocus
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" className="btn-ghost" onClick={() => setChangeVideoOpen(false)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={changingVideo}>
                  {changingVideo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4" />}
                  Change
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function MessageBubble({ msg, currentUsername }) {
  const isOwn = msg.username === "You" || msg.username === currentUsername;

  if (msg.type === "system" || msg.type === "log") {
    return (
      <div className="text-center">
        <span className="text-xs text-slate-600 italic">{msg.text || (msg.username + " " + msg.text)}</span>
      </div>
    );
  }

  return (
    <div className={`flex flex-col ${isOwn ? "items-end" : "items-start"} gap-0.5 fade-in`}>
      <div className="flex items-center gap-1.5">
        {!isOwn && <span className="text-xs font-bold text-slate-300">{msg.username}</span>}
        {isOwn && <span className="text-xs text-slate-500">{msg.time}</span>}
      </div>
      <div
        className="max-w-[220px] px-3 py-2 rounded-2xl text-sm leading-relaxed break-words"
        style={isOwn
          ? { background: "var(--accent)", color: "white", borderBottomRightRadius: "4px" }
          : { background: "rgba(255,255,255,0.07)", border: "1px solid var(--border)", borderBottomLeftRadius: "4px" }
        }
      >
        {msg.text}
      </div>
    </div>
  );
}
