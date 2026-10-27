import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { V3 } from "../lib/anim";

export type CameraState = { pos: V3; target: V3; fov: number; roll?: number; shake?: V3 };

/**
 * Ставит камеру из состояния, рассчитанного по номеру кадра (без useFrame).
 * Выполняется синхронно при рендере, до того как ThreeCanvas отрисует кадр.
 */
export const CameraRig: React.FC<{ cam: CameraState }> = ({ cam }) => {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const sh = cam.shake ?? [0, 0, 0];
  camera.position.set(cam.pos[0] + sh[0], cam.pos[1] + sh[1], cam.pos[2] + sh[2]);
  camera.up.set(0, 1, 0);
  camera.lookAt(cam.target[0] + sh[0] * 0.5, cam.target[1] + sh[1] * 0.5, cam.target[2] + sh[2] * 0.5);
  if (cam.roll) camera.rotateZ(cam.roll);
  if (camera.fov !== cam.fov) {
    camera.fov = cam.fov;
    camera.updateProjectionMatrix();
  }
  camera.near = 0.05;
  camera.far = 120;
  camera.updateMatrixWorld();
  return null;
};
