import React, { forwardRef, useMemo } from "react";
import { Effect } from "postprocessing";
import { Uniform } from "three";

// Обесцвечивание всего, кроме алого: красные пиксели сохраняют цвет
const fragment = /* glsl */ `
uniform float amount;
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 c = inputColor.rgb;
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  float red = smoothstep(0.06, 0.22, c.r - max(c.g, c.b));
  vec3 grey = vec3(l) * 1.05;
  vec3 res = mix(grey, c, red);
  outputColor = vec4(mix(c, res, amount), inputColor.a);
}`;

class SelectiveDesatImpl extends Effect {
  constructor() {
    super("SelectiveDesat", fragment, { uniforms: new Map([["amount", new Uniform(0)]]) });
  }
}

export const SelectiveDesat = forwardRef<SelectiveDesatImpl, { amount: number }>(({ amount }, ref) => {
  const effect = useMemo(() => new SelectiveDesatImpl(), []);
  (effect.uniforms.get("amount") as Uniform<number>).value = amount;
  return <primitive ref={ref} object={effect} dispose={null} />;
});
