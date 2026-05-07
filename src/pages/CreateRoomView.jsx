import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Copy, Film, Loader2, RefreshCw, Video } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "../lib/supabase";
import { useUserStore } from "../stores";
import { createRoomCode, normalizeRoomCode } from "../lib/rooms";

const SAMPLE = "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8";

export default function CreateRoomView() {
  const navigate = useNavigate();
  const { setUsername, setIsAdmin } = useUserStore();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    username: "",
    roomCode: createRoomCode(),
    roomName: "",
    videoUrl: "",
  });

  const update = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    const username = form.username.trim();
    const roomName = form.roomName.trim();
    const roomCode = normalizeRoomCode(form.roomCode);

    if (!username || !roomName || !roomCode) {
      setError("Please fill in all fields.");
      return;
    }

    setLoading(true);
    const url = form.videoUrl.trim();
    if (!url) {
      setLoading(false);
      setError("Please add a video URL.");
      return;
    }

    const files = [{ type: "video", url }];

    const { error: dbErr } = await supabase.from("rooms").insert([{
      roomCode,
      roomName,
      roomType: "online",
      admin: username,
      files,
    }]);

    if (dbErr) {
      setLoading(false);
      setError(dbErr.code === "23505" ? "Room code already taken — refresh to get a new one." : dbErr.message);
      return;
    }

    setUsername(username);
    setIsAdmin(true);

    navigate(`/room/${roomCode}`);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6" style={{ background: "var(--bg)" }}>
      <div className="w-full max-w-2xl">
        <Link to="/" className="btn-ghost inline-flex mb-8 text-sm">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>

        <h1 className="font-display text-3xl font-bold text-white mb-2">Create a Room</h1>
        <p className="text-slate-400 mb-8">You'll be the host — you control playback for everyone.</p>

        <form onSubmit={handleSubmit} className="glass rounded-2xl p-6 grid md:grid-cols-2 gap-6">
          {/* Left */}
          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--accent)" }}>Room Identity</p>

            <div>
              <label className="block text-sm font-semibold text-slate-300 mb-1.5">Your display name</label>
              <input className="field" placeholder="e.g. Alex" value={form.username} onChange={e => update("username", e.target.value)} required />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-300 mb-1.5">Room name</label>
              <input className="field" placeholder="e.g. Friday Night Premiere" value={form.roomName} onChange={e => update("roomName", e.target.value)} required />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-300 mb-1.5">Room code</label>
              <div className="flex gap-2">
                <input
                  className="field font-mono text-center tracking-[0.22em] uppercase"
                  value={form.roomCode}
                  onChange={e => update("roomCode", normalizeRoomCode(e.target.value))}
                  required
                />
                <button type="button" className="btn-ghost w-12 h-12 p-0 shrink-0" onClick={() => update("roomCode", createRoomCode())} title="Generate new code">
                  <RefreshCw className="h-4 w-4" />
                </button>
                <button type="button" className="btn-ghost w-12 h-12 p-0 shrink-0" onClick={() => { navigator.clipboard.writeText(form.roomCode); toast.success("Code copied!"); }} title="Copy code">
                  <Copy className="h-4 w-4" />
                </button>
              </div>
            </div>

          </div>

          {/* Right */}
          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--accent)" }}>Video Source</p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-300 mb-1.5">Video URL</label>
                <input
                  className="field"
                  type="url"
                  placeholder="https://example.com/stream.m3u8"
                  value={form.videoUrl}
                  onChange={e => update("videoUrl", e.target.value)}
                />
                <p className="mt-1.5 text-xs text-slate-500">Supports HLS (.m3u8), MP4, YouTube, Vimeo links</p>
              </div>
              <button
                type="button"
                className="btn-ghost text-sm w-full"
                onClick={() => { update("videoUrl", SAMPLE); update("roomName", form.roomName || "Friday Night Premiere"); toast.success("Demo stream loaded!"); }}
              >
                <Film className="h-4 w-4" />
                Load demo stream
              </button>
            </div>

            {error && (
              <div className="rounded-xl px-4 py-3 text-sm font-medium" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#fca5a5" }}>
                {error}
              </div>
            )}

            <button type="submit" className="btn-primary w-full mt-2" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4" />}
              Create Watch Room
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
