import React from "react";
import { Link } from "react-router-dom";
import { Film, Users, Zap, Shield, Wifi, MessageSquare } from "lucide-react";

export default function HomeView() {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--bg)" }}>
      {/* Hero */}
      <div className="flex flex-col items-center justify-center flex-1 px-6 py-20 text-center relative overflow-hidden">
        {/* Background glow */}
        <div className="absolute inset-0 pointer-events-none">
          <div
            className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full opacity-10"
            style={{ background: "radial-gradient(circle, var(--accent) 0%, transparent 70%)" }}
          />
        </div>

        {/* Logo */}
        <div className="relative mb-8 flex items-center gap-3">
          <div
            className="flex h-14 w-14 items-center justify-center rounded-2xl"
            style={{ background: "linear-gradient(135deg, var(--accent), var(--accent2))", boxShadow: "0 0 40px rgba(124,111,234,0.4)" }}
          >
            <Film className="h-7 w-7 text-white" />
          </div>
          <span className="font-display text-4xl font-bold text-white tracking-tight">
            watch<span style={{ color: "var(--accent)" }}>party</span>
          </span>
        </div>

        <h1 className="font-display text-4xl font-bold text-white mb-4 max-w-xl">
          Watch together, <span style={{ color: "var(--cyan)" }}>perfectly in sync</span>
        </h1>
        <p className="text-slate-400 text-lg max-w-md mb-12 leading-relaxed">
          Create a room, share the code, and stream any video to friends — synchronized in real-time via WebSockets.
        </p>

        <div className="flex flex-col sm:flex-row gap-4">
          <Link to="/create" className="btn-primary px-8 py-4 text-base">
            <Zap className="h-5 w-5" />
            Create a Room
          </Link>
          <Link
            to="/join"
            className="btn-ghost px-8 py-4 text-base font-semibold"
            style={{ borderColor: "var(--border-bright)" }}
          >
            <Users className="h-5 w-5" />
            Join with Code
          </Link>
        </div>

        {/* Feature pills */}
        <div className="flex flex-wrap justify-center gap-3 mt-16">
          {[
            { icon: Wifi, label: "Real-time sync via WebSockets" },
            { icon: MessageSquare, label: "Live group chat" },
            { icon: Shield, label: "No sign-up needed" },
            { icon: Users, label: "Auto-cleanup when host leaves" },
          ].map(({ icon: Icon, label }) => (
            <div key={label} className="tag flex items-center gap-2">
              <Icon className="h-3.5 w-3.5" style={{ color: "var(--accent)" }} />
              {label}
            </div>
          ))}
        </div>
      </div>

      {/* How it works */}
      <div className="border-t px-6 py-16" style={{ borderColor: "var(--border)" }}>
        <div className="max-w-3xl mx-auto">
          <p
            className="text-center text-xs font-semibold uppercase tracking-[0.2em] mb-8"
            style={{ color: "var(--accent)" }}
          >
            How It Works
          </p>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { step: "01", title: "Host creates a room", desc: "Pick a video URL. A unique room code is generated." },
              { step: "02", title: "Friends join via code", desc: "Share the 6-character code. No accounts — just enter a name." },
              { step: "03", title: "Stay in sync", desc: "The host's play/pause/seek is broadcast to everyone via the socket server." },
            ].map(({ step, title, desc }) => (
              <div key={step} className="glass rounded-2xl p-5">
                <div
                  className="font-mono text-xs font-bold mb-3"
                  style={{ color: "var(--accent)" }}
                >
                  {step}
                </div>
                <h3 className="font-display font-bold text-white mb-2">{title}</h3>
                <p className="text-sm text-slate-400 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
