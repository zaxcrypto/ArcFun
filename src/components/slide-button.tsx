import React, { useState, useEffect, useRef } from "react";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import { ArrowRight, Loader2 } from "lucide-react";

export function SlideButton({ 
  onComplete, 
  loading, 
  disabled = false, 
  text = "Slide to Swap", 
  loadingText = "Swapping..." 
}: { 
  onComplete: () => void; 
  loading: boolean; 
  disabled?: boolean; 
  text?: string; 
  loadingText?: string; 
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragLimit, setDragLimit] = useState(260);
  const loadingRef = useRef(loading);
  loadingRef.current = loading;
  
  const x = useMotionValue(0);
  const textOpacity = useTransform(x, [0, Math.max(1, dragLimit * 0.45)], [1, 0.15]);

  useEffect(() => {
    if (!trackRef.current) return;

    const updateLimit = () => {
      if (trackRef.current) {
        // Track width minus thumb size (48px) and margin (4px left + 4px right)
        const limit = Math.max(0, trackRef.current.clientWidth - 56);
        setDragLimit(limit);
      }
    };

    updateLimit();
    const observer = new ResizeObserver(updateLimit);
    observer.observe(trackRef.current);
    
    window.addEventListener("resize", updateLimit);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateLimit);
    };
  }, []);

  // Forcefully and instantly reset slider thumb position whenever loading ends or button becomes disabled
  useEffect(() => {
    if (disabled || !loading) {
      animate(x, 0, { type: "spring", stiffness: 500, damping: 28 });
    }
  }, [disabled, loading, x]);

  const handleDragEnd = () => {
    if (disabled || loading) return;
    
    const currentX = x.get();
    // If user dragged past 50% threshold: snap to end and execute instantly
    if (currentX > dragLimit * 0.5) {
      animate(x, dragLimit, {
        type: "tween",
        ease: "easeOut",
        duration: 0.12,
      });
      onComplete(); // Instant execution trigger
      
      // Safety auto-reset: if parent does not enter loading state (e.g. sync rejection or error), spring back
      setTimeout(() => {
        if (!loadingRef.current) {
          animate(x, 0, { type: "spring", stiffness: 500, damping: 28 });
        }
      }, 350);
    } else {
      // Spring back to start
      animate(x, 0, {
        type: "spring",
        stiffness: 500,
        damping: 28,
      });
    }
  };

  return (
    <div className="w-full sm:w-[calc(100%-24px)] mx-auto relative mt-2 mb-2 select-none">
      <div
        ref={trackRef}
        className={`relative w-full h-[56px] rounded-full transition-all duration-300 ${
          loading
            ? "pointer-events-none border border-[var(--border)] bg-[var(--surface-soft)]"
            : disabled
            ? "opacity-60 pointer-events-none cursor-not-allowed border border-[var(--border)] bg-[var(--surface-soft)]"
            : "border border-[var(--border)] hover:border-black/30 dark:hover:border-white/30 bg-[var(--surface-soft)]"
        }`}
        style={{
          boxShadow: "inset 0 1px 2px rgba(0,0,0,0.04)",
        }}
      >
        {/* State 1: Disabled mode -> Clean centered reason text, no thumb, no slide UI */}
        {disabled && !loading ? (
          <div className="w-full h-full rounded-full flex items-center justify-center px-4">
            <span className="text-[12px] sm:text-[13px] font-semibold tracking-tight text-[var(--text-muted)] text-center whitespace-nowrap overflow-hidden text-ellipsis">
              {text}
            </span>
          </div>
        ) : loading ? (
          /* State 2: Loading mode -> Clean loading text and spinner on the right */
          <>
            <div className="w-full h-full rounded-full flex items-center justify-center pl-6 pr-14 pointer-events-none">
              <span className="text-[12px] sm:text-[13px] font-semibold tracking-tight text-[var(--text-primary)] text-center whitespace-nowrap overflow-hidden text-ellipsis">
                {loadingText}
              </span>
            </div>
            <div className="absolute right-[4px] top-1/2 -translate-y-1/2 w-[48px] h-[48px] bg-[#27272a] text-white border border-[#3f3f46] dark:bg-[#27272a] dark:text-white dark:border-white/20 rounded-full flex items-center justify-center shadow-sm z-20">
              <Loader2 className="w-5 h-5 animate-spin" strokeWidth={2.5} />
            </div>
          </>
        ) : (
          /* State 3: Active interactive Slide UI -> Draggable thumb on left, Slide prompt text */
          <>
            <motion.div
              className="w-full h-full rounded-full flex items-center justify-center relative overflow-hidden pl-[52px] pr-3 pointer-events-none"
              style={{ opacity: textOpacity }}
            >
              <span className="text-[11.5px] xs:text-[12px] sm:text-[13px] font-semibold tracking-tight leading-none whitespace-nowrap text-center text-[var(--text-primary)] overflow-hidden text-ellipsis">
                {text}
              </span>
            </motion.div>

            <motion.div
              drag="x"
              dragConstraints={{ left: 0, right: dragLimit }}
              dragElastic={0.06}
              dragMomentum={false}
              style={{
                x,
                touchAction: "none",
              }}
              whileDrag={{ scale: 1.06, cursor: "grabbing" }}
              whileTap={{ scale: 0.97 }}
              onDragEnd={handleDragEnd}
              className="absolute left-[4px] top-1/2 -translate-y-1/2 w-[48px] h-[48px] bg-[#27272a] text-white hover:bg-[#3f3f46] dark:bg-[#27272a] dark:text-white dark:hover:bg-[#3f3f46] border border-[#3f3f46] dark:border-white/20 rounded-full flex items-center justify-center shadow-sm z-20 cursor-grab"
            >
              <ArrowRight className="w-5 h-5" strokeWidth={2.5} />
            </motion.div>
          </>
        )}
      </div>
    </div>
  );
}
