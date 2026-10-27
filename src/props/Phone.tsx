import React from "react";
import { RoundedBox } from "@react-three/drei";
import { useCanvasTexture } from "../lib/canvasTexture";
import { V3 } from "../lib/anim";
import { drawRouteUI, RouteUIState, UI_H, UI_W } from "./RouteUI";

export const PHONE = { w: 0.085, h: 0.175, d: 0.011 };

/**
 * Смартфон: чёрный корпус со скруглёнными краями, светящийся экран с интерфейсом «Доеду».
 * Начало координат — центр телефона, экран смотрит в +Z.
 */
export const Phone: React.FC<{ pos: V3; rot: V3; ui: RouteUIState; scale?: number; light?: number }> = ({ pos, rot, ui, scale = 1, light = 1 }) => {
  const tex = useCanvasTexture(UI_W, UI_H, (g, w, h) => drawRouteUI(g, w, h, ui));
  const sw = PHONE.w * 0.92;
  const sh = PHONE.h * 0.94;
  return (
    <group position={pos} rotation={rot} scale={scale}>
      <RoundedBox args={[PHONE.w, PHONE.h, PHONE.d]} radius={0.0075} smoothness={4} castShadow>
        <meshStandardMaterial color="#0c0c0c" roughness={0.3} metalness={0.55} />
      </RoundedBox>
      {/* экран */}
      <mesh position={[0, 0, PHONE.d / 2 + 0.0004]}>
        <planeGeometry args={[sw, sh]} />
        <meshBasicMaterial map={tex} toneMapped={false} />
      </mesh>
      {/* камера на задней стороне */}
      <RoundedBox args={[0.026, 0.026, 0.003]} radius={0.006} smoothness={2} position={[-0.022, 0.06, -PHONE.d / 2 - 0.0012]}>
        <meshStandardMaterial color="#1c1c1c" roughness={0.25} metalness={0.7} />
      </RoundedBox>
      {/* свет экрана на руку и лицо */}
      <pointLight position={[0, 0, 0.12]} intensity={0.9 * light * ui.appear} distance={1.6} decay={2} color="#ffffff" />
      <pointLight position={[0, -0.02, 0.1]} intensity={0.6 * light * ui.merge} distance={1.2} decay={2} color="#E31E24" />
    </group>
  );
};
