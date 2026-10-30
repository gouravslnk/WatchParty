import React, { useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import {
  Copy, Check, Crown, Link as LinkIcon, LogOut, Users, Video, X,
  Loader2, Send, MessageSquare, UserX
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { useChatStore } from "../stores";

export default function Sidebar({
  room,
  isAdmin,
  username,
  members,
  socket,
  onLeave,
  onSendMessage,
  onClose,
  onTransferHost,
  onKickUser,
}) {
  const messages = useChatStore(s => s.messages);
  const unreadCount = useChatStore(s => s.unreadCount);
  const markRead = useChatStore(s => s.markRead);

  const [activeTab, setActiveTab] = useState("chat"); // "chat" | "info"
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState("");
  const [changeVideoOpen, setChangeVideoOpen] = useState(false);
  const [newVideoUrl, setNewVideoUrl] = useState("");
  const [changingVideo, setChangingVideo] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null); // { type: "transfer" | "kick", username: string } | null

  const chatEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (activeTab === "chat") {
      markRead();
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages.length, activeTab, markRead]);

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
    if (!url) {
      toast.error("Please enter a video URL.");
      return;
    }

    setChangingVideo(true);
    const { error } = await supabase
      .from("rooms")
      .update({ roomType: "online", files: [{ type: "video", url }] })
      .eq("roomCode", room.roomCode);
    setChangingVideo(false);

    if (error) {
      toast.error("Failed to change video.");
      return;
    }

    socket?.emit("change-video", { roomType: "online", source: url });
    setNewVideoUrl("");
    setChangeVideoOpen(false);
    toast.success("Video changed for everyone!");
  };

  return (
    <div
      className="w-full h-full flex flex-col border-t md:border-t-0 md:border-l overflow-hidden slide-in"
      style={{ borderColor: "var(--border)", background: "var(--surface)" }}
    >
      {/* Tab Navigation Header */}
      <div
        className="px-3 py-2 border-b flex items-center justify-between shrink-0"
        style={{ borderColor: "var(--border)", background: "rgba(255,255,255,0.02)" }}
      >
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setActiveTab("chat")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all relative ${
              activeTab === "chat"
                ? "bg-white/10 text-white"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            <span>Chat</span>
            {activeTab !== "chat" && unreadCount > 0 && (
              <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("info")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === "info"
                ? "bg-white/10 text-white"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Users className="h-3.5 w-3.5" />
            <span>Room Info ({members.length})</span>
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          {isAdmin && (
            <div
              className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold"
              style={{ background: "rgba(234,179,8,0.1)", border: "1px solid rgba(234,179,8,0.25)", color: "#fbbf24" }}
            >
              <Crown className="h-3 w-3" /> Host
            </div>
          )}

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="btn-ghost w-7 h-7 p-0 md:hidden"
              title="Close panel"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* TAB 1: LIVE CHAT */}
      {activeTab === "chat" && (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {/* Messages list */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center p-6 text-slate-500">
                <MessageSquare className="h-8 w-8 mb-2 opacity-30" />
                <p className="text-xs">No messages yet.</p>
                <p className="text-[11px] text-slate-600">Send a message to say hello to everyone in the party!</p>
              </div>
            )}
            {messages.map(msg => (
              <MessageBubble key={msg.id} msg={msg} currentUsername={username} />
            ))}
            <div ref={chatEndRef} />
          </div>

          {/* Chat Input Form (Always pinned at bottom, zero overlap) */}
          <form
            onSubmit={handleSend}
            className="p-2.5 sm:p-3 border-t flex gap-2 shrink-0"
            style={{ borderColor: "var(--border)", background: "var(--surface)" }}
          >
            <input
              ref={inputRef}
              className="field flex-1 py-2 px-3 text-sm"
              placeholder="Send a message..."
              value={message}
              onChange={e => setMessage(e.target.value)}
              maxLength={500}
            />
            <button
              type="submit"
              className="btn-primary w-9 h-9 sm:w-10 sm:h-10 p-0 shrink-0"
              disabled={!message.trim()}
              title="Send message"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}

      {/* TAB 2: ROOM INFO & PEOPLE */}
      {activeTab === "info" && (
        <div className="flex-1 flex flex-col min-h-0 overflow-y-auto p-3 sm:p-4 space-y-4">
          {/* Room details */}
          <div className="glass rounded-xl p-3.5 space-y-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--accent)" }}>
                Watch Party Room
              </p>
              <h3 className="font-display font-bold text-white text-base truncate">{room?.roomName}</h3>
              <p className="text-xs text-slate-400 mt-0.5">Joined as <span className="text-white font-semibold">{username}</span></p>
            </div>

            {/* Invite Button & Code */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={copyInvite}
                className="btn-ghost flex-1 text-xs py-2 flex items-center justify-center gap-1.5"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <LinkIcon className="h-3.5 w-3.5 text-brand-400" />}
                <span className={copied ? "text-emerald-300 font-semibold" : "text-slate-300"}>
                  {copied ? "Link Copied!" : "Copy Invite Link"}
                </span>
              </button>
              <div
                className="px-3 py-2 rounded-xl font-mono text-sm font-bold text-white flex items-center shrink-0"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid var(--border-bright)" }}
                title="Room Code"
              >
                {room?.roomCode}
              </div>
            </div>
          </div>

          {/* Host Controls */}
          {isAdmin ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Host Controls</p>
              <button
                type="button"
                onClick={() => {
                  setNewVideoUrl("");
                  setChangeVideoOpen(true);
                }}
                className="btn-ghost w-full text-xs py-2.5 flex items-center justify-center gap-2"
              >
                <Video className="h-4 w-4 text-purple-400" />
                Change Video Stream
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <div
                className="p-3 rounded-xl flex items-center justify-between gap-2"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)" }}
              >
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-white truncate">Playback Host</p>
                  <p className="text-[11px] text-slate-400 truncate">
                    Host: <span className="text-amber-400 font-semibold">{room?.admin || "Unknown"}</span>
                  </p>
                </div>
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium" style={{ background: "rgba(16,185,129,0.1)", color: "#34d399", border: "1px solid rgba(16,185,129,0.2)" }}>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  In sync
                </div>
              </div>
            </div>
          )}

          {/* Members list */}
          <div className="space-y-2 flex-1">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center justify-between">
              <span>Watching Now</span>
              <span className="tag text-[10px]">{members.length}</span>
            </p>
            <div className="space-y-1.5">
                {members.map((m, idx) => {
                  const memberName = typeof m === "string" ? m : (m?.username || `Member ${idx + 1}`);
                  const isMemberAdmin = Boolean(memberName && room?.admin && memberName.trim().toLowerCase() === room.admin.trim().toLowerCase());
                  const isSelf = Boolean(memberName && username && memberName.trim().toLowerCase() === username.trim().toLowerCase());

                  return (
                    <div
                      key={memberName}
                      className="flex items-center justify-between px-3 py-2 rounded-xl gap-2 transition-all"
                      style={{
                        background: isMemberAdmin ? "rgba(234,179,8,0.06)" : "rgba(255,255,255,0.04)",
                        border: isMemberAdmin ? "1px solid rgba(234,179,8,0.25)" : "1px solid var(--border)",
                      }}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {isMemberAdmin ? (
                          <Crown className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                        ) : (
                          <div className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                        )}
                        <span className="text-xs font-semibold text-white truncate">
                          {isSelf ? `${memberName} (You)` : memberName}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {isMemberAdmin && (
                          <span className="text-[10px] uppercase font-bold text-amber-400 tracking-wider">Host</span>
                        )}

                        {isAdmin && !isMemberAdmin && !isSelf && (
                          confirmAction?.username === memberName ? (
                            <div className="flex items-center gap-1">
                              {confirmAction.type === "transfer" ? (
                                <>
                                  <span className="text-[10px] text-amber-400 font-bold">Transfer?</span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (onTransferHost) onTransferHost(memberName);
                                      setConfirmAction(null);
                                    }}
                                    className="text-[10px] font-bold bg-amber-500 hover:bg-amber-400 text-black px-2 py-0.5 rounded shadow-sm transition-all"
                                    title={`Confirm transferring host to ${memberName}`}
                                  >
                                    Yes
                                  </button>
                                </>
                              ) : (
                                <>
                                  <span className="text-[10px] text-rose-400 font-bold">Kick?</span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (onKickUser) onKickUser(memberName);
                                      setConfirmAction(null);
                                    }}
                                    className="text-[10px] font-bold bg-rose-600 hover:bg-rose-500 text-white px-2 py-0.5 rounded shadow-sm transition-all"
                                    title={`Confirm removing ${memberName}`}
                                  >
                                    Yes
                                  </button>
                                </>
                              )}
                              <button
                                type="button"
                                onClick={() => setConfirmAction(null)}
                                className="text-[10px] font-medium text-slate-400 hover:text-white px-1.5 py-0.5"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => setConfirmAction({ type: "transfer", username: memberName })}
                                className="text-[11px] font-semibold text-amber-300 hover:text-amber-200 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 px-2 py-0.5 rounded-lg flex items-center gap-1 transition-all"
                                title={`Transfer host controls to ${memberName}`}
                              >
                                <Crown className="h-3 w-3 text-amber-400" />
                                <span>Make Host</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmAction({ type: "kick", username: memberName })}
                                className="text-[11px] font-semibold text-rose-400 hover:text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 px-1.5 py-0.5 rounded-lg flex items-center gap-1 transition-all"
                                title={`Remove ${memberName} from the party`}
                              >
                                <UserX className="h-3 w-3 text-rose-400" />
                                <span>Kick</span>
                              </button>
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>

          {/* Leave/End room button (Safely placed inside Info tab, never overlapping) */}
          <div className="pt-2 border-t shrink-0" style={{ borderColor: "var(--border)" }}>
            <button
              onClick={onLeave}
              className="btn-danger w-full text-xs py-2.5 flex items-center justify-center gap-2"
            >
              <LogOut className="h-4 w-4" />
              {isAdmin ? "End Watch Party" : "Leave Party"}
            </button>
          </div>
        </div>
      )}

      {/* Change video modal */}
      {changeVideoOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)" }}>
          <div className="glass rounded-2xl p-5 w-full max-w-md fade-in">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="font-display font-bold text-white text-lg">Change Video</h3>
                <p className="text-sm text-slate-400 mt-0.5">Enter a new video URL for the whole room.</p>
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
      <div className="text-center py-1">
        <span className="text-[11px] text-slate-500 italic bg-white/5 px-2.5 py-0.5 rounded-full">{msg.text || (msg.username + " " + msg.text)}</span>
      </div>
    );
  }

  return (
    <div className={`flex flex-col ${isOwn ? "items-end" : "items-start"} gap-0.5 fade-in`}>
      <div className="flex items-center gap-1.5 px-1">
        {!isOwn && <span className="text-[11px] font-bold text-slate-300">{msg.username}</span>}
        {isOwn && <span className="text-[10px] text-slate-500">{msg.time}</span>}
      </div>
      <div
        className="max-w-[240px] px-3 py-1.5 rounded-2xl text-xs sm:text-sm leading-relaxed break-words shadow-sm"
        style={isOwn
          ? { background: "linear-gradient(135deg, var(--accent), var(--accent2))", color: "white", borderBottomRightRadius: "4px" }
          : { background: "rgba(255,255,255,0.08)", border: "1px solid var(--border)", borderBottomLeftRadius: "4px" }
        }
      >
        {msg.text}
      </div>
    </div>
  );
}
