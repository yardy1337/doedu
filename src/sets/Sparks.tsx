import React, { useMemo } from "react";
import { BRAND } from "../brand";
import { rng } from "../lib/anim";

/** Алые искры, медленно опускающиеся в воздухе. t — секунды с момента появления. */
export const Sparks: React.FC<{ t: number; amount: number; center: [number, number, number]; count?: number }> = ({
  t,
  amount,
  center,
  count = 70,
}) => {
  const seeds = useMemo(() => {
    const r = rng(1337);
    return Array.from({ length: count }, () => ({
      x: (r() - 0.5) * 7,
      z: (r() - 0.5) * 4,
      y0: 1.2 + r() * 3.2,
      speed: 0.18 + r() * 0.25,
      sway: 0.2 + r() * 0.4,
      ph: r() * 6.28,
      size: 0.012 + r() * 0.018,
      delay: r() * 0.8,
    }));
  }, [count]);
  if (amount <= 0 || t < 0) return null;
  return (
    <group position={center}>
      {seeds.map((s, i) => {
        const tt = Math.max(0, t - s.delay);
        const y = s.y0 + 0.9 * Math.exp(-tt * 3) - s.speed * tt;
        if (y < 0.02 || t < s.delay) return null;
        const flicker = 0.7 + 0.3 * Math.sin(t * 9 + s.ph);
        return (
          <mesh key={i} position={[s.x + Math.sin(tt * 1.3 + s.ph) * s.sway, y, s.z + Math.cos(tt * 1.1 + s.ph) * s.sway * 0.6]}>
            <sphereGeometry args={[s.size * amount, 8, 6]} />
            <meshStandardMaterial color={BRAND.red} emissive={BRAND.red} emissiveIntensity={6 * flicker} toneMapped={false} />
          </mesh>
        );
      })}
    </group>
  );
};
