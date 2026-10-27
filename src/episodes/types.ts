import type { ReactNode } from "react";
import { AudioCue } from "../audio/Soundtrack";
import { CameraState } from "../camera/CameraRig";
import { Pose } from "../characters/rig";
import { Eyes } from "../characters/Stickman3D";
import { PostState } from "../effects/Post";
import { V3 } from "../lib/anim";

/**
 * Серия = сценарий: набор функций «время → состояние».
 * Компоненты (персонажи, станция, камера, звук) общие для всех серий;
 * новая серия — новый файл episodes/epN.ts с таким же интерфейсом.
 */
export type SuitcaseState =
  | { mode: "towed" } // тянется за героем
  | { mode: "fallen"; pos: V3; yaw: number; fall: number; tilt0: number }
  | { mode: "hidden" };

export type HeroState = { pose: Pose; eyes: Eyes; sweat: number; suitcase: SuitcaseState; visible: boolean };
export type CrowdState = { pose: Pose; scale: number; visible: boolean };
export type SaviorState = {
  pose: Pose;
  wind: number;
  glow: number;
  visible: boolean;
  /** серия 2+: распахнутость плаща, эмблема на груди (проявление надписи), исчезновение */
  open?: number;
  emblem?: number;
  vanish?: number;
};

export type FxState = {
  post: PostState;
  eyelids: { open: number; tilt: number; glow: number };
  black: number; // затемнение поверх кадра
  grain: number;
  card: boolean; // финальная карточка
  sparks: number; // 0..1 — алые искры в воздухе
  sparksT: number;
  /** фонарь, отбрасывающий тени, и куда он светит */
  shadowLamp?: { x: number; target: V3 };
  lampWarmth: number; // 1 — тёплый свет, 0 — нейтральный
  rimLight?: { pos: V3; target: V3; intensity: number };
  /** где сыплются алые искры (по умолчанию — место приземления Спасителя в серии 1) */
  sparksCenter?: V3;
  /** плотность тумана (по умолчанию 0.06) */
  fog?: number;
  /** сдвиг 3D-кадра в пикселях («плёнка гуляет в окне» во флешбэке) */
  offset?: [number, number];
  /** убрать поезд (флешбэк — «воспоминание» без лишнего) */
  hideTrain?: boolean;
};

export type Episode = {
  id: string;
  title: string; // «Серия 1»
  subtitle: string; // «Продолжение следует…»
  duration: number; // сек
  /** «сюжетное» время (замирает на стоп-кадре) */
  storyTime: (t: number) => number;
  hero: (t: number) => HeroState;
  crowd: { count: number; at: (t: number, i: number) => CrowdState };
  savior: (t: number) => SaviorState;
  camera: (t: number, vertical: boolean) => CameraState;
  fx: (t: number, vertical: boolean) => FxState;
  fogCards: { x: number; y: number; z: number; s: number; o: number }[];
  cardBeats: { logo: number; title: number; subtitle: number }; // сек
  audio: AudioCue[];
  /** рукописный слоган на финальной карточке (вместо subtitle) */
  slogan?: string;
  /** реквизит серии в 3D-сцене (обёртка, телефон, флешбэк…) */
  scene?: (st: number, t: number, vertical: boolean) => ReactNode;
  /** 2D-слои поверх кадра (плёнка флешбэка, вспышки) */
  overlay?: (t: number, frame: number, vertical: boolean) => ReactNode;
};
