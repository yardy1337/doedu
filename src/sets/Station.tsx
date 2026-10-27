import React, { useMemo } from "react";
import * as THREE from "three";
import { MeshReflectorMaterial } from "@react-three/drei";
import { BRAND } from "../brand";
import { rng } from "../lib/anim";

/**
 * Ночная станция. Платформа вдоль оси X, поверхность y = 0.
 * Край платформы и поезд — со стороны −Z, фонари — со стороны +Z,
 * глухая стена — в конце платформы (x = WALL_X).
 */
export const STATION = {
  startX: -46,
  WALL_X: 12.4,
  edgeZ: -2.8,
  backZ: 4.2,
  trainZ: -4.75,
  lampZ: 2.9,
  lampXs: [-36, -28, -20, -12, -4, 4, 9.6],
};

/** Плитка: процедурная текстура (рисуется детерминированно) */
const useTileTexture = () =>
  useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const g = c.getContext("2d")!;
    const r = rng(7);
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < 4; j++) {
        const v = 46 + Math.floor(r() * 14);
        g.fillStyle = `rgb(${v},${v},${v})`;
        g.fillRect(i * 64, j * 64, 64, 64);
      }
    g.strokeStyle = "#151515";
    g.lineWidth = 4;
    for (let i = 0; i <= 4; i++) {
      g.beginPath();
      g.moveTo(i * 64, 0);
      g.lineTo(i * 64, 256);
      g.moveTo(0, i * 64);
      g.lineTo(256, i * 64);
      g.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }, []);

/** Прозрачность конуса света: ярче у фонаря, к полу сходит на нет (v = 1 — вершина) */
let coneFadeTex: THREE.CanvasTexture | null = null;
const useConeFade = () =>
  useMemo(() => {
    if (coneFadeTex) return coneFadeTex;
    const c = document.createElement("canvas");
    c.width = 4;
    c.height = 128;
    const g = c.getContext("2d")!;
    const grd = g.createLinearGradient(0, 0, 0, 128);
    grd.addColorStop(0, "rgb(70,70,70)");
    grd.addColorStop(0.35, "rgb(28,28,28)");
    grd.addColorStop(1, "rgb(0,0,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 4, 128);
    coneFadeTex = new THREE.CanvasTexture(c);
    return coneFadeTex;
  }, []);

export const Lamp: React.FC<{ x: number; on?: number; shadow?: boolean; target?: [number, number, number]; cam?: [number, number, number] }> = ({
  x,
  on = 1,
  shadow = false,
  target,
  cam,
}) => {
  const z = STATION.lampZ;
  const H = 3.9;
  const coneFade = useConeFade();
  const light = useMemo(() => {
    const l = new THREE.SpotLight(BRAND.lamp, 1, 13, 0.62, 0.65, 1.6);
    return l;
  }, []);
  light.intensity = 38 * on;
  light.position.set(x, H - 0.15, z - 0.75);
  light.target.position.set(...(target ?? [x - 0.2, 0, z - 1.6]));
  light.target.updateMatrixWorld();
  light.castShadow = shadow;
  if (shadow) {
    light.shadow.mapSize.set(1024, 1024);
    light.shadow.bias = -0.0004;
    light.shadow.camera.near = 0.5;
    light.shadow.camera.far = 14;
  }
  return (
    <group>
      <mesh position={[x, H / 2, z]} castShadow>
        <cylinderGeometry args={[0.05, 0.07, H, 12]} />
        <meshStandardMaterial color={BRAND.grey.g15} roughness={0.6} metalness={0.4} />
      </mesh>
      <mesh position={[x, H, z - 0.38]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.035, 0.035, 0.8, 8]} />
        <meshStandardMaterial color={BRAND.grey.g15} roughness={0.6} metalness={0.4} />
      </mesh>
      <mesh position={[x, H - 0.06, z - 0.75]}>
        <cylinderGeometry args={[0.12, 0.28, 0.16, 20]} />
        <meshStandardMaterial color={BRAND.grey.g10} roughness={0.5} metalness={0.5} />
      </mesh>
      <mesh position={[x, H - 0.16, z - 0.75]}>
        <sphereGeometry args={[0.09, 16, 12]} />
        <meshStandardMaterial color={BRAND.lamp} emissive={BRAND.lamp} emissiveIntensity={3.5 * on} toneMapped={false} />
      </mesh>
      {/* конус света (объёмный свет — прозрачная аддитивная форма); если камера внутри — не рисуем */}
      {!(cam && cam[1] < H && Math.hypot(cam[0] - x, cam[2] - (z - 0.75)) < 1.55 * (1 - cam[1] / H) + 0.6) && <mesh position={[x, H / 2 - 0.12, z - 0.75]}>
        <coneGeometry args={[1.55, H - 0.25, 40, 1, true]} />
        <meshBasicMaterial
          color={BRAND.lamp}
          alphaMap={coneFade}
          transparent
          opacity={0.32 * on}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          side={THREE.DoubleSide}
          fog={false}
        />
      </mesh>}
      <primitive object={light} />
      <primitive object={light.target} />
    </group>
  );
};

const Train: React.FC = () => {
  const z = STATION.trainZ;
  const cars = [-44, -27.5, -11, 5.5];
  return (
    <group>
      {cars.map((x0, i) => (
        <group key={i} position={[x0 + 8, 0, z]}>
          <mesh position={[0, 0.65, 0]} castShadow receiveShadow>
            <boxGeometry args={[16.2, 3.3, 3.0]} />
            <meshStandardMaterial color="#1c1c1c" roughness={0.45} metalness={0.5} />
          </mesh>
          {/* окна: тёмное стекло, пара еле освещённых */}
          {Array.from({ length: 7 }).map((_, k) => (
            <mesh key={k} position={[-6.6 + k * 2.2, 1.25, 1.505]}>
              <planeGeometry args={[1.4, 0.95]} />
              <meshStandardMaterial
                color={(i + k) % 5 === 2 ? "#3a3a3a" : "#0b0b0b"}
                emissive={(i + k) % 5 === 2 ? "#5c5c5c" : "#000000"}
                emissiveIntensity={0.5}
                roughness={0.08}
                metalness={0.8}
              />
            </mesh>
          ))}
          {/* двери */}
          {[-3.4, 3.4].map((dx) => (
            <mesh key={dx} position={[dx, 0.55, 1.506]}>
              <planeGeometry args={[1.25, 2.4]} />
              <meshStandardMaterial color="#141414" roughness={0.3} metalness={0.6} />
            </mesh>
          ))}
          <mesh position={[0, -0.25, 1.507]}>
            <planeGeometry args={[16.2, 0.06]} />
            <meshStandardMaterial color={BRAND.grey.g40} roughness={0.4} metalness={0.6} />
          </mesh>
        </group>
      ))}
    </group>
  );
};

/** Клочья тумана: мягкие полупрозрачные плоскости, дрейфуют по времени t */
const FogCards: React.FC<{ t: number; cam: [number, number, number]; cards: { x: number; y: number; z: number; s: number; o: number }[] }> = ({ t, cam, cards }) => {
  const tex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d")!;
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, "rgba(255,255,255,0.55)");
    grd.addColorStop(0.5, "rgba(255,255,255,0.18)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }, []);
  return (
    <group>
      {cards.map((c, i) => (
        <mesh
          key={i}
          position={[c.x + Math.sin(t * 0.2 + i) * 0.6, c.y, c.z]}
          rotation={[0, Math.atan2(cam[0] - c.x, cam[2] - c.z), 0]}
        >
          <planeGeometry args={[c.s * 2.2, c.s]} />
          <meshBasicMaterial
            map={tex}
            color={BRAND.grey.g60}
            transparent
            opacity={c.o * Math.min(1, Math.max(0, (Math.hypot(cam[0] - c.x, cam[1] - c.y, cam[2] - c.z) - 1.5) / 3))}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
};

export const Station: React.FC<{
  t: number;
  shadowLampX?: number; // фонарь, который отбрасывает тени
  shadowTarget?: [number, number, number];
  reflections?: boolean;
  fogCards?: { x: number; y: number; z: number; s: number; o: number }[];
  cam?: [number, number, number];
  train?: boolean;
}> = ({ t, shadowLampX, shadowTarget, reflections = true, fogCards = [], cam = [0, 1, 5], train = true }) => {
  const tiles = useTileTexture();
  const len = STATION.WALL_X - STATION.startX;
  const cx = (STATION.WALL_X + STATION.startX) / 2;
  const depth = STATION.backZ - STATION.edgeZ;
  const cz = (STATION.backZ + STATION.edgeZ) / 2;
  tiles.repeat.set(len / 1.2, depth / 1.2);
  return (
    <group>
      {/* мокрый пол платформы с отражениями */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, 0, cz]} receiveShadow>
        <planeGeometry args={[len, depth]} />
        {reflections ? (
          <MeshReflectorMaterial
            map={tiles}
            color="#9a9a9a"
            roughness={0.55}
            metalness={0.35}
            mirror={0.6}
            mixBlur={1.4}
            mixStrength={2.2}
            blur={[280, 90]}
            resolution={256}
            depthScale={0.6}
            minDepthThreshold={0.4}
            maxDepthThreshold={1.3}
          />
        ) : (
          <meshStandardMaterial map={tiles} color="#9a9a9a" roughness={0.35} metalness={0.3} />
        )}
      </mesh>
      {/* жёлтая — серая полоса безопасности у края */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, 0.003, STATION.edgeZ + 0.35]}>
        <planeGeometry args={[len, 0.14]} />
        <meshStandardMaterial color={BRAND.grey.g75} roughness={0.6} />
      </mesh>
      {/* торец платформы и пути */}
      <mesh position={[cx, -0.6, STATION.edgeZ]} rotation={[0, 0, 0]}>
        <boxGeometry args={[len, 1.2, 0.08]} />
        <meshStandardMaterial color={BRAND.grey.g20} roughness={0.9} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, -1.2, STATION.trainZ]}>
        <planeGeometry args={[len, 5]} />
        <meshStandardMaterial color={BRAND.grey.g10} roughness={1} />
      </mesh>
      {train && <Train />}
      {/* задняя стена и колонны */}
      <mesh position={[cx, 3, STATION.backZ + 0.3]} receiveShadow>
        <boxGeometry args={[len, 6, 0.4]} />
        <meshStandardMaterial color="#202020" roughness={0.95} />
      </mesh>
      {Array.from({ length: 8 }).map((_, i) => (
        <mesh key={i} position={[STATION.startX + 4 + i * 7.6, 3, STATION.backZ - 0.2]} castShadow receiveShadow>
          <boxGeometry args={[0.6, 6, 0.6]} />
          <meshStandardMaterial color="#2a2a2a" roughness={0.9} />
        </mesh>
      ))}
      {/* глухая бетонная стена в конце платформы */}
      <group position={[STATION.WALL_X + 0.3, 3, -0.6]}>
        <mesh receiveShadow castShadow>
          <boxGeometry args={[0.6, 6.5, 11]} />
          <meshStandardMaterial color="#5a5a5a" roughness={0.97} />
        </mesh>
        {[-3.6, -1.2, 1.2, 3.6].map((z) => (
          <mesh key={z} position={[-0.302, 0, z]}>
            <planeGeometry args={[0.03, 6.5]} />
            <meshStandardMaterial color="#3d3d3d" roughness={1} />
          </mesh>
        ))}
        {[-1.6, 0.6, 2.4].map((y) => (
          <mesh key={y} position={[-0.302, y, 0]} rotation={[0, -Math.PI / 2, 0]}>
            <planeGeometry args={[11, 0.03]} />
            <meshStandardMaterial color="#3d3d3d" roughness={1} />
          </mesh>
        ))}
      </group>
      {STATION.lampXs.map((x) => (
        <Lamp key={x} x={x} cam={cam} shadow={shadowLampX === x} target={shadowLampX === x ? shadowTarget : undefined} />
      ))}
      <FogCards t={t} cam={cam} cards={fogCards} />
    </group>
  );
};

/** Контровой прожектор (цель добавлена в сцену, чтобы направление было верным) */
export const RimLight: React.FC<{ pos: [number, number, number]; target: [number, number, number]; intensity: number }> = ({ pos, target, intensity }) => {
  const light = useMemo(() => new THREE.SpotLight("#ffffff", 1, 14, 0.5, 0.7, 1.4), []);
  light.intensity = intensity;
  light.position.set(...pos);
  light.target.position.set(...target);
  light.target.updateMatrixWorld();
  return (
    <>
      <primitive object={light} />
      <primitive object={light.target} />
    </>
  );
};
