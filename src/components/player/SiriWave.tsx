"use client";

// Siri Wave by 40973894 on 21st.dev (MIT), adapted for Hermes.
// Original component and GLSL animation: https://21st.dev/@40973894/components/siri-wave
// This adaptation adds playback-state time control, a muted tint, transparency
// and an optional level uniform. The wave equations are otherwise preserved.

import { useEffect, useRef, type CanvasHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type SiriWaveVariant = "wave" | "fluid-dots";

export interface SiriWaveProps
  extends Omit<CanvasHTMLAttributes<HTMLCanvasElement>, "children"> {
  variant?: SiriWaveVariant;
  size?: number;
  width?: number;
  height?: number;
  renderScale?: number;
  playing?: boolean;
  resetKey?: string | number;
  level?: number;
  tint?: [number, number, number];
  transparent?: boolean;
  amp?: number;
  spread?: number;
  glow?: number;
}

const VERTEX_SHADER =
  "attribute vec2 aPos; void main(){ gl_Position=vec4(aPos,0.0,1.0); }";

const WAVE_SHADER = `precision highp float;
uniform vec2 iResolution; uniform float iTime;
uniform vec3 uTint; uniform float uUseTint; uniform float uLevel; uniform float uTransparent;
uniform float uAmp; uniform float uSpread; uniform float uGlow;
const float PI = 3.14159265359;
const float AMPLITUDE   = 0.32;
const float FREQ        = 1.1;
const float ABER_FREQ   = 1.0;
const float SPEED       = 2.4;
const float WAVE_SCALE  = 0.78;
const float ABERRATION  = 2.6;
const float THICKNESS   = 3.0;
const float INTENSITY   = 2.;
const float FALLOFF     = 1.7;
const float EDGE_MASK   = 0.4;
const float EDGE_INSET  = 0.0;
const float BAND_FILL   = 30000.0;
const float BAND_THICK  = 0.08;
const float SOFTNESS    = 2.5;
const float LOW_AMP     = 6.0;
const float LOW_INT     = 1.5;
const float MID_ABER    = 0.8;
const float MID_ABAMP   = 0.05;
const float MID_BAND    = 20.0;
const float MID_SOFT    = 0.4;
const float HIGH_ABER   = 0.5;
const float HIGH_ABAMP  = 0.06;
const float RESOLVED    = 1.0;
const float UNRES_SCALE = 0.14;

vec3 spectral4(int s){
    float x = float(s);
    vec3 base = clamp(vec3(abs(x-3.0)-1.0, 2.0-abs(x-2.0), 2.0-abs(x-4.0)), 0.0, 1.0);
    return mix(base, uTint * (0.90 + 0.04 * x), uUseTint);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord){
    vec2 R = iResolution.xy;
    float aspect = R.x / R.y;
    vec2 p = (fragCoord + 0.5) * 2.0 / R - 1.0;
    p.x *= aspect;
    float yScreen = p.y;
    p /= max(WAVE_SCALE, 0.1);

    float t   = iTime;
    float low  = clamp(0.45 + 0.45*sin(t*0.8)*sin(t*0.37+1.0), 0.0, 1.0);
    float mid  = clamp(0.40 + 0.40*sin(t*1.7+2.0)*sin(t*0.53), 0.0, 1.0);
    float high = clamp(0.30 + 0.30*sin(t*2.9+4.0)*sin(t*0.71+2.0), 0.0, 1.0);

    float res   = clamp(RESOLVED, 0.0, 1.0);
    float drift = mod(t, 20.0*PI) * SPEED;

    float xN  = p.x / max(aspect, 1.0);
    float env = cos(PI*0.5 * min(abs(0.9*xN), 1.0));
    env *= env;

    float level = clamp(uLevel, 0.0, 1.0);
    float A1    = (AMPLITUDE + 0.01*low*LOW_AMP) * level * uAmp;
    float A2    = A1 + (mid*MID_ABAMP + high*HIGH_ABAMP) * level * uAmp;
    float AB    = (ABERRATION + mid*MID_ABER + high*HIGH_ABER)*res;
    float th    = mix(0.1, 0.01*THICKNESS, res) * uGlow;
    float inten = mix(0.1, 0.01*(INTENSITY + low*LOW_INT), res) * uGlow;
    float soft  = 0.01*res*max(0.0, SOFTNESS + mid*MID_SOFT);

    float dUnres = max(length(p) - mix(0.14, UNRES_SCALE, res), 0.0);
    float yMain = A1 * env * res * sin(p.x*FREQ + drift);

    float bandFillTh = max(BAND_THICK, 1e-4);
    float bandAmt    = 1e-4 * BAND_FILL * inten;
    vec3 num = vec3(0.0), den = vec3(0.0);
    for(int s = 0; s < 4; s++){
        vec3 hue = mix(vec3(1.0), spectral4(s), res);
        den += hue;
        float ab = mix(-AB, AB, float(s)/3.0);
        float yL = A2 * env * res * sin(p.x*ABER_FREQ + drift + ab);
        float d   = mix(dUnres, abs(p.y - yL), res);
        float lor = mix(1.0/(1.0 + (0.02*d)*(0.02*d)), 1.0, res);
        float line = inten / (sqrt(d*d + soft*soft) + th);
        float lo = min(yMain, yL), hi = max(yMain, yL);
        float dBand = max(0.0, max(p.y - hi, lo - p.y));
        float band  = bandAmt / (dBand + bandFillTh);
        num += hue * lor * (line + band);
    }
    vec3 col = num / den;

    float dM    = mix(dUnres, abs(p.y - yMain), res);
    float lorM  = mix(1.0/(1.0 + (0.02*dM)*(0.02*dM)), 1.0, res);
    float boost = (1.0 - res) * (14.0*low + 4.0);
    vec3 boostTint = mix(vec3(1.0), uTint, uUseTint);
    col += boostTint * 0.5 * inten * (lorM + boost) / (sqrt(dM*dM + soft*soft) + th);

    col *= 0.62;
    col = pow(max(col, 0.0), vec3(1.5));
    float emT = clamp((abs(yScreen) - 1.0 + EDGE_INSET) / (-max(EDGE_MASK, 1e-4)), 0.0, 1.0);
    float em  = emT*emT*(3.0 - 2.0*emT);
    float gauss = exp(-pow(xN*FALLOFF / max(uSpread, 1e-3), 2.0));
    col *= mix(1.0, em*gauss, res);
    col *= res;
    float alpha = mix(1.0, clamp(max(col.r, max(col.g, col.b)), 0.0, 1.0), uTransparent);
    fragColor = vec4(col, alpha);
}
void main(){ mainImage(gl_FragColor, gl_FragCoord.xy); }`;

const FLUID_DOTS_SHADER = `precision highp float;
uniform vec2 iResolution; uniform float iTime;
uniform float uTransparent;
const float TAU = 6.28318530718;
const int   N   = 6;
const float SMOOTH_K = 0.08;
const float INTENSITY  = 0.0025;
const float FALLOFF_P  = 1.35;
const float FADE_START = 0.02;
const float FADE_END   = 0.56;
const float ABERR = 0.005;
const vec3  SPECTRAL = vec3(0.0, 0.5, 1.0) * ABERR;
const float HUE_SPEED = 0.06;
const float COLOR_K   = 0.5;
const float SAT       = 0.01;
const float HUE_SPAN  = 0.667;
const float MERGE_PERIOD = 6.0;
const float T_MOVE   = 1.25;
const float STAGGER  = 0.33;
const float HOLD     = 0.0;
const float W = 4.6;
const float L = 3.2;
const float PIERCE  = 0.12;
const float RECOIL  = 0.035;
const float REC_LAG = 0.11;
const float GATHER_PERIOD = 12.0;
const float GATHER_START  = 9.2;
const float GATHER_HOLD   = 0.8;
const float GATHER_R      = 0.008;
const float GATHER_DIM    = 0.85;
const float GATHER_IN     = 1.8;
const float GATHER_IN_L   = 7.5;
const float BURST_W = 6.5;
const float BURST_L = 4.0;
const float CHARGE_T     = 0.30;
const float CHARGE_SHRK  = 0.18;
const float CHARGE_GLOW  = 0.35;
const float FLASH_GAIN   = 1.2;
const float FLASH_DECAY  = 7.0;

float hash11(float n){ return fract(sin(n*127.1 + 311.7)*43758.5453); }
float settleWL(float tau, float w, float l){
    if(tau <= 0.0) return 0.0;
    return 1.0 - exp(-l*tau)*cos(w*tau);
}
float settle(float tau){ return settleWL(tau, W, L); }
float settleCrit(float tau, float l){
    if(tau <= 0.0) return 0.0;
    return 1.0 - exp(-l*tau)*(1.0 + l*tau);
}
float smin(float a, float b, float k){
    float h = max(k - abs(a - b), 0.0) / k;
    return min(a, b) - h*h*k*0.25;
}
vec3 hue2rgb(float h){
    h = fract(h);
    float r = clamp(abs(h*6.0 - 3.0) - 1.0, 0.0, 1.0);
    float g = clamp(2.0 - abs(h*6.0 - 2.0), 0.0, 1.0);
    float b = clamp(2.0 - abs(h*6.0 - 4.0), 0.0, 1.0);
    return vec3(r, g, b);
}
float dotR(float fi, float seed, float t){
    return 0.036 + 0.010*sin(t*1.3 + seed*TAU) + 0.005*sin(t*2.4 + fi*1.3);
}
float dotSD(vec2 p, vec2 pos, float r, float t, float fi, float shapeDamp){
    vec2 d = p - pos;
    float sq = 0.075 * (0.5 + 0.5*sin(t*0.9 + fi*2.0)) * shapeDamp;
    float ca = cos(t*0.35 + fi), sa = sin(t*0.35 + fi);
    d = mat2(ca,-sa,sa,ca) * d;
    d *= vec2(1.0+sq, 1.0-sq);
    return length(d) - r;
}
vec3 scene(vec2 p, float t){
    float k  = floor(t/MERGE_PERIOD);
    float u  = fract(t/MERGE_PERIOD);
    float te = u * MERGE_PERIOD;
    float tg = mod(t, GATHER_PERIOD);
    float g  = settleCrit((tg - GATHER_START) * GATHER_IN, GATHER_IN_L)
             - settleWL(tg - GATHER_START - GATHER_HOLD, BURST_W, BURST_L);
    float gC = clamp(g, 0.0, 1.0);
    float tb     = tg - (GATHER_START + GATHER_HOLD);
    float charge = smoothstep(-CHARGE_T, 0.0, min(tb, 0.0)) * gC;
    float flash  = tb > 0.0 ? exp(-tb * FLASH_DECAY) : 0.0;
    float gBright = mix(1.0, GATHER_DIM, gC) * (1.0 + CHARGE_GLOW*charge + FLASH_GAIN*flash);
    vec3  total3 = vec3(1e5);
    vec3  cAcc   = vec3(0.0);
    float wAcc   = 1e-6;
    for(int i=0; i<N; i++){
        float fi   = float(i);
        float seed = hash11(fi);
        float ang = fi/float(N)*TAU + t*0.35;
        vec2 dir  = vec2(cos(ang), sin(ang));
        float R = 0.17 + 0.010*sin(t*1.0) + 0.007*sin(t*1.3 + seed*TAU);
        float pairId   = mod(fi, 3.0);
        float moverLow = mod(k + pairId, 2.0);
        float isMover  = (fi < 2.5) ? step(moverLow, 0.5) : step(0.5, moverLow);
        float goStart  = pairId * STAGGER;
        float retStart = 3.0*STAGGER + HOLD + pairId * STAGGER;
        float m   = (settle(te - goStart)           - settle(te - retStart))           * isMover;
        float rec = (settle(te - goStart - REC_LAG) - settle(te - retStart - REC_LAG)) * (1.0 - isMover);
        float rSelf = dotR(fi, seed, t);
        rSelf = mix(rSelf, 0.036, gC);
        rSelf *= 1.0 - CHARGE_SHRK * charge;
        float fj    = mod(fi + 3.0, 6.0);
        float rPart = dotR(fj, hash11(fj), t);
        float deep   = -(R + RECOIL) - PIERCE * rPart;
        float radial = mix(R, deep, m) + RECOIL * rec;
        radial = mix(radial, GATHER_R, g);
        vec2  pos    = radial * dir;
        float sdR = dotSD(p - SPECTRAL.r*dir, pos, rSelf, t, fi, 1.0 - gC);
        float sdG = dotSD(p - SPECTRAL.g*dir, pos, rSelf, t, fi, 1.0 - gC);
        float sdB = dotSD(p - SPECTRAL.b*dir, pos, rSelf, t, fi, 1.0 - gC);
        total3 = vec3( smin(total3.r, sdR, SMOOTH_K),
                       smin(total3.g, sdG, SMOOTH_K),
                       smin(total3.b, sdB, SMOOTH_K) );
        float hue = fract(fi/float(N) + t*HUE_SPEED) * HUE_SPAN;
        vec3 dotCol = mix(vec3(1.0), hue2rgb(hue), SAT);
        float w = exp(-sdG * COLOR_K);
        cAcc += w * dotCol;
        wAcc += w;
    }
    vec3 sd3    = max(total3, vec3(0.0)) + 1e-4;
    vec3 core3  = clamp(INTENSITY / pow(sd3, vec3(FALLOFF_P)), 0.0, 1.0);
    vec3 edge3  = 1.0 - smoothstep(vec3(FADE_START), vec3(FADE_END), sd3);
    vec3 bright = core3 * edge3 * gBright;
    return bright * (cAcc / wAcc);
}
void mainImage(out vec4 fragColor, in vec2 fragCoord){
    vec2 res = iResolution.xy;
    vec2 p = (2.0*fragCoord - res) / min(res.x, res.y);
    float t = iTime;
    p /= 1.0 + 0.03*sin(t*1.0);
    vec3 col = scene(p, t);
    col *= 1.0 + 0.05*sin(t*1.0 + 1.0);
    col = pow(col, vec3(1.0/1.2));
    col = min(col, 1.0);
    float n = fract(sin(dot(fragCoord, vec2(12.9898,78.233)))*43758.5453);
    col += (n - 0.5)/255.0;
    float alpha = mix(1.0, clamp(max(col.r, max(col.g, col.b)), 0.0, 1.0), uTransparent);
    fragColor = vec4(col, alpha);
}
void main(){ mainImage(gl_FragColor, gl_FragCoord.xy); }`;

const SHADERS: Record<SiriWaveVariant, string> = {
  wave: WAVE_SHADER,
  "fluid-dots": FLUID_DOTS_SHADER,
};

function clamp01(value: number, fallback = 1): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(1, value));
}

export function SiriWave({
  variant = "wave",
  size = 420,
  width,
  height,
  renderScale = 0.75,
  playing = true,
  resetKey,
  level = 1,
  tint,
  transparent = false,
  amp = 1,
  spread = 1,
  glow = 1,
  className,
  style,
  ...props
}: SiriWaveProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const resolutionRef = useRef({
    width: Math.max(
      1,
      Math.round((width ?? size) * Math.max(0.1, renderScale)),
    ),
    height: Math.max(
      1,
      Math.round((height ?? size) * Math.max(0.1, renderScale)),
    ),
  });
  const playingRef = useRef(playing);
  const levelRef = useRef(clamp01(level));
  const resetKeyRef = useRef(resetKey);
  const elapsedRef = useRef(0);

  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  useEffect(() => {
    levelRef.current = clamp01(level);
  }, [level]);

  useEffect(() => {
    if (resetKeyRef.current === resetKey) return;
    resetKeyRef.current = resetKey;
    elapsedRef.current = 0;
  }, [resetKey]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", {
      alpha: true,
      premultipliedAlpha: false,
      antialias: true,
    });
    if (!gl) {
      canvas.dataset.webgl = "unavailable";
      return;
    }
    glRef.current = gl;

    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type);
      if (!shader) throw new Error("WebGL shader allocation failed.");
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error(log ?? "Shader compile error.");
      }
      return shader;
    };

    let program: WebGLProgram | null = null;
    let vertexShader: WebGLShader | null = null;
    let fragmentShader: WebGLShader | null = null;
    let buffer: WebGLBuffer | null = null;
    let frame = 0;

    try {
      program = gl.createProgram();
      if (!program) throw new Error("WebGL program allocation failed.");
      vertexShader = compile(gl.VERTEX_SHADER, VERTEX_SHADER);
      fragmentShader = compile(gl.FRAGMENT_SHADER, SHADERS[variant]);
      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(program) ?? "Shader link error.");
      }
      gl.useProgram(program);

      buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 3, -1, -1, 3]),
        gl.STATIC_DRAW,
      );
      const position = gl.getAttribLocation(program, "aPos");
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

      const resolution = gl.getUniformLocation(program, "iResolution");
      const time = gl.getUniformLocation(program, "iTime");
      const tintLocation = gl.getUniformLocation(program, "uTint");
      const useTint = gl.getUniformLocation(program, "uUseTint");
      const levelLocation = gl.getUniformLocation(program, "uLevel");
      const transparentLocation = gl.getUniformLocation(
        program,
        "uTransparent",
      );
      const ampLocation = gl.getUniformLocation(program, "uAmp");
      const spreadLocation = gl.getUniformLocation(program, "uSpread");
      const glowLocation = gl.getUniformLocation(program, "uGlow");

      canvas.width = resolutionRef.current.width;
      canvas.height = resolutionRef.current.height;
      gl.viewport(
        0,
        0,
        resolutionRef.current.width,
        resolutionRef.current.height,
      );

      if (tintLocation && tint) {
        gl.uniform3f(tintLocation, tint[0], tint[1], tint[2]);
      }
      if (useTint) gl.uniform1f(useTint, tint ? 1 : 0);
      if (transparentLocation) {
        gl.uniform1f(transparentLocation, transparent ? 1 : 0);
      }
      if (levelLocation) gl.uniform1f(levelLocation, levelRef.current);
      if (ampLocation) gl.uniform1f(ampLocation, Math.max(0.05, amp));
      if (spreadLocation) gl.uniform1f(spreadLocation, Math.max(0.25, spread));
      if (glowLocation) gl.uniform1f(glowLocation, Math.max(0.1, glow));

      const reducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      );
      let last = performance.now();
      const render = (now: number) => {
        const delta = Math.min(0.05, Math.max(0, (now - last) / 1000));
        last = now;
        const holdStill =
          reducedMotion.matches ||
          document.documentElement.dataset.motion === "reduced";
        if (playingRef.current && !holdStill) elapsedRef.current += delta;
        if (levelLocation) gl.uniform1f(levelLocation, levelRef.current);
        gl.uniform2f(
          resolution,
          resolutionRef.current.width,
          resolutionRef.current.height,
        );
        gl.uniform1f(time, elapsedRef.current);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        if (canvas.dataset.ready !== "true") canvas.dataset.ready = "true";
        frame = requestAnimationFrame(render);
      };
      frame = requestAnimationFrame(render);
    } catch {
      canvas.dataset.webgl = "unavailable";
    }

    return () => {
      cancelAnimationFrame(frame);
      glRef.current = null;
      if (program) gl.deleteProgram(program);
      if (vertexShader) gl.deleteShader(vertexShader);
      if (fragmentShader) gl.deleteShader(fragmentShader);
      if (buffer) gl.deleteBuffer(buffer);
      delete canvas.dataset.ready;
    };
  }, [variant, tint, transparent, amp, spread, glow]);

  useEffect(() => {
    const next = {
      width: Math.max(
        1,
        Math.round((width ?? size) * Math.max(0.1, renderScale)),
      ),
      height: Math.max(
        1,
        Math.round((height ?? size) * Math.max(0.1, renderScale)),
      ),
    };
    resolutionRef.current = next;

    const canvas = canvasRef.current;
    if (canvas) {
      if (canvas.width !== next.width) canvas.width = next.width;
      if (canvas.height !== next.height) canvas.height = next.height;
    }
    glRef.current?.viewport(0, 0, next.width, next.height);
  }, [width, height, size, renderScale]);

  return (
    <canvas
      ref={canvasRef}
      data-testid="siri-wave"
      data-variant={variant}
      data-playing={playing ? "true" : "false"}
      aria-hidden="true"
      className={cn(
        "block select-none",
        transparent ? "bg-transparent" : "rounded-[20px] bg-black",
        className,
      )}
      style={{
        width: width ?? size,
        height: height ?? size,
        ...style,
      }}
      {...props}
    />
  );
}
