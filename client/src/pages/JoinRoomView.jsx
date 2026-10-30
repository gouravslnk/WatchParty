import React, { useState } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, DoorOpen, Loader2 } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useUserStore } from "../stores";
import { normalizeRoomCode } from "../lib/rooms";

export default function JoinRoomView() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { setUsername, setIsAdmin } = useUserStore();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    username: "",
    roomCode: normalizeRoomCode(searchParams.get("roomCode") || ""),
  });

  const update = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    const username = form.username.trim();
    const roomCode = normalizeRoomCode(form.roomCode);

    if (!username || !roomCode) {
      setError("Please enter your name and room code.");
      return;
    }

    setLoading(true);
    const { data, error: dbErr } = await supabase
      .from("rooms")
      .select("roomCode, admin")
      .eq("roomCode", roomCode)
      .maybeSingle();
    setLoading(false);

    if (dbErr || !data) {
      setError("No active room found with that code.");
      return;
    }

    // A joiner cannot become host simply by entering the admin's name.
    // Only a tab possessing the secret hostToken for this room is recognized as host.
    const hostToken = sessionStorage.getItem(`wp_host_token_${roomCode}`);
    const isHost = Boolean(hostToken);

    sessionStorage.setItem("wp_username", username);
    localStorage.removeItem(`wp_host_${roomCode}`);

    setUsername(username);
    setIsAdmin(isHost);
    navigate(`/room/${roomCode}`);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6" style={{ background: "var(--bg)" }}>
      <div className="w-full max-w-md">
        <div className="flex items-center justify-between mb-8">
          <Link to="/" className="btn-ghost inline-flex text-sm">
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
          <Link to="/" className="flex items-center gap-2.5 hover:opacity-90 transition-opacity">
            <img src="/favicon.svg" alt="WatchParty" className="w-7 h-7 rounded-lg" />
            <span className="font-display font-bold text-white tracking-tight text-lg">watch<span style={{ color: "var(--accent)" }}>party</span></span>
          </Link>
        </div>

        <h1 className="font-display text-3xl font-bold text-white mb-2">Join a Room</h1>
        <p className="text-slate-400 mb-8">Enter the room code from your host to join the party.</p>

        <form onSubmit={handleSubmit} className="glass rounded-2xl p-6 space-y-5">
          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-1.5">Your display name</label>
            <input
              className="field"
              placeholder="e.g. Jordan"
              value={form.username}
              onChange={e => update("username", e.target.value)}
              autoComplete="off"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-1.5">Room code</label>
            <input
              className="field font-mono text-center text-2xl tracking-[0.26em] uppercase"
              placeholder="ABC123"
              value={form.roomCode}
              onChange={e => update("roomCode", normalizeRoomCode(e.target.value))}
              autoComplete="off"
              required
            />
          </div>

          {error && (
            <div className="rounded-xl px-4 py-3 text-sm font-medium" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#fca5a5" }}>
              {error}
            </div>
          )}

          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <DoorOpen className="h-4 w-4" />}
            Join Watch Party
          </button>
        </form>
      </div>
    </div>
  );
}
