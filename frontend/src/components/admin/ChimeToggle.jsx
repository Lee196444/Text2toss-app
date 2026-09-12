import React, { useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { isChimeMuted, setChimeMuted, playCashChime } from "../../lib/chime";
import { toast } from "../../lib/toast";

const ChimeToggle = () => {
  const [muted, setMuted] = useState(isChimeMuted());
  const toggle = () => {
    const next = !muted;
    setChimeMuted(next);
    setMuted(next);
    if (next) {
      toast.success("Payment chime muted");
    } else {
      playCashChime({ force: true });
      toast.success("Payment chime on");
    }
  };
  return (
    <button
      type="button"
      onClick={toggle}
      data-testid="chime-toggle-btn"
      aria-pressed={muted}
      aria-label={muted ? "Unmute payment chime" : "Mute payment chime"}
      title={muted ? "Payment chime muted — click to turn on" : "Payment chime on — click to mute"}
      className={`h-9 w-9 inline-flex items-center justify-center rounded-md border transition-colors ${muted ? "bg-white/5 border-white/20 text-white/50 hover:text-white" : "bg-white/10 border-white/30 text-cyan-300 hover:bg-white/20"}`}
    >
      {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
    </button>
  );
};

export default ChimeToggle;
