import { motion } from "motion/react";

export function SpeakingRing({ level, color, size = 64 }: { level: number; color: string; size?: number }) {
  const value = Math.max(0, Math.min(1, level));
  const stroke = 3;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const active = value > 0.06;

  return (
    <motion.svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="pointer-events-none absolute"
      style={{ left: -4, top: -4, width: size + 8, height: size + 8 }}
      animate={{ opacity: active ? 1 : 0, scale: active ? 1 + value * 0.06 : 0.96 }}
      transition={{ duration: 0.12 }}
    >
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - value)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: "stroke-dashoffset 90ms linear", filter: `drop-shadow(0 0 ${4 + value * 8}px ${color})` }}
      />
    </motion.svg>
  );
}
