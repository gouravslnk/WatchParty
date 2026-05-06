import React, { useEffect } from "react";

export default function ReactionOverlay({ reactions, onExpire }) {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-20">
      {reactions.map(r => (
        <FloatingReaction key={r.id} reaction={r} onExpire={() => onExpire(r.id)} />
      ))}
    </div>
  );
}

function FloatingReaction({ reaction, onExpire }) {
  // Random horizontal position
  const left = 10 + Math.random() * 80;

  useEffect(() => {
    const t = setTimeout(onExpire, 1900);
    return () => clearTimeout(t);
  }, [onExpire]);

  return (
    <div
      className="absolute bottom-16 reaction-float flex flex-col items-center gap-0.5"
      style={{ left: `${left}%` }}
    >
      <span className="text-3xl leading-none drop-shadow-lg">{reaction.emoji}</span>
      {reaction.username && (
        <span
          className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
          style={{ background: "rgba(0,0,0,0.55)", color: "rgba(255,255,255,0.8)" }}
        >
          {reaction.username === "You" ? "You" : reaction.username}
        </span>
      )}
    </div>
  );
}
