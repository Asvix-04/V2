import { useEffect, useState } from "react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export const ShootingStars = ({ number = 10, className }) => {
  const [meteors, setMeteors] = useState([]);

  useEffect(() => {
    // Generate random meteors
    const newMeteors = new Array(number || 10).fill(true).map(() => ({
      left: Math.floor(Math.random() * 80) + 20 + "%", // Start from 20% to 100% (Bias right)
      delay: (Math.random() * 4 + 0.5) + "s",
      duration: Math.floor(Math.random() * 5 + 3) + "s",
    }));
    setMeteors(newMeteors);
  }, [number]);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {meteors.map((el, idx) => (
        <span
          key={"meteor" + idx}
          className={cn(
            "pointer-events-none absolute h-1 w-1 rotate-[135deg] animate-meteor", // 135deg = Down-Left
            className
          )}
          style={{
            top: -50,
            left: el.left,
            animationDelay: el.delay,
            animationDuration: el.duration,
          }}
        >
          {/* Meteor Head */}
          <div className="absolute top-1/2 -translate-y-1/2 left-0 h-[4px] w-[4px] rounded-full bg-white shadow-[0_0_15px_4px_#ffffff] z-50" />

          {/* Meteor Tail */}
          <div className="pointer-events-none absolute top-1/2 -translate-y-1/2 right-full w-[300px] bg-gradient-to-r from-transparent via-blue-500/50 to-white/80 h-[1px]" />
        </span>
      ))}
      <style>{`
        @keyframes meteor {
          0% {
            transform: rotate(135deg) translate3d(0, 0, 0);
            opacity: 1;
          }
          70% {
            opacity: 1;
          }
          100% {
            transform: rotate(135deg) translate3d(150vh, 0, 0);
            opacity: 0;
          }
        }
        .animate-meteor {
          animation: meteor 10s linear infinite;
        }
      `}</style>
    </div>
  );
};
