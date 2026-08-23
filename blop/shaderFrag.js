export const VERT = "attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}";
  export const FRAGMENT_SOURCE = `
precision highp float;
uniform vec2 uRes,uLook,uDrag;
uniform float uSquashY,uLean,uOpen,uHappy,uHop,uTilt,uEyeS,uWave,uWavePh,uBrow,uSag,uEyeY;
uniform float uAsymOpen,uAsymBrow,uAsymSize,uAsymY,uSpin;
uniform vec3 uTint,uPage;

const vec3 KEY = vec3(-0.38, 0.68, 0.72);
const float SEP   = 0.26;
const float MID_Y = -0.013;
const float ER    = 0.107;
const float EL    = 0.079;

vec3 env(vec3 n){
  float t = clamp(n.y*0.5+0.5, 0.0, 1.0);
  vec3 sky  = vec3(1.10, 1.12, 1.16);
  vec3 mid  = vec3(0.62, 0.64, 0.70);
  vec3 grnd = vec3(0.18, 0.19, 0.22);
  return t > 0.5 ? mix(mid, sky, (t-0.5)*2.0) : mix(grnd, mid, t*2.0);
}

float capsule(vec2 p, vec2 a, vec2 b, float r){
  vec2 pa = p-a, ba = b-a;
  float hh = clamp(dot(pa,ba)/dot(ba,ba), 0.0, 1.0);
  return length(pa-ba*hh)-r;
}

// Every eye parameter now takes a per-side offset. Symmetry is only wanted
// when the point is stiffness; the rest of the time a mirrored face reads as
// dead. On an angry or surprised face one side stretches while the other
// squishes, and that tension is the expression.
float eyeField(vec2 q){
  float d = 1e9;
  for(int i=0;i<2;i++){
    float side = (i==0) ? -1.0 : 1.0;

    // ONE-SIDED. The sign picks which eye is affected; the other keeps its
    // baseline exactly. A raised brow is one eye unchanged and the other
    // shorter, not both moving in opposite directions.
    float mine  = (uAsymOpen*side > 0.0) ? abs(uAsymOpen) : 0.0;
    float bmine = (uAsymBrow*side > 0.0) ? uAsymBrow : 0.0;
    float smine = (uAsymSize*side > 0.0) ? abs(uAsymSize) : 0.0;
    float ymine = (uAsymY*side > 0.0) ? uAsymY : 0.0;

    float k    = clamp(uOpen*(1.0 - mine), 0.045, 1.8);
    float brow = uBrow + bmine;
    float sz   = max(0.35, uEyeS*(1.0 + smine));

    vec2 ctr = vec2(side*SEP, MID_Y + uEyeY + ymine);
    vec2 p = q - ctr;
    vec2 dir = vec2(sin(uTilt), cos(uTilt));
    vec2 pp = vec2(p.x, p.y/k);
    float dCap = capsule(pp, -dir*EL*sz, dir*EL*sz, ER*sz)*k;

    vec2 bn = vec2(side*sin(brow*1.15), cos(brow*1.15));
    // The lid must scale with how far the eye is open. It never mattered
    // while k was capped at 1; now that an eye can open WIDER than normal,
    // an unscaled lid clips it back into a square.
    float lid = (EL+ER)*sz*k*(1.0 - abs(brow)*0.72);
    dCap = max(dCap, dot(p, bn) - lid);

    float hh  = (EL+ER)*sz;
    float lidR = 1.55*hh;
    vec2  lc  = vec2(0.0, mix(-(lidR+hh+0.04), -lidR+hh*0.52, uHappy));
    dCap = max(dCap, (lidR - length(pp - lc))*k);

    d = min(d, dCap);
  }
  return d;
}

float bodyR(vec3 q){
  float w = uWave*sin(q.y*3.0 - uWavePh)*(1.0 - q.y*q.y*0.55);
  float sg = uSag*(smoothstep(0.50,-1.0,q.y)*0.20 - smoothstep(-0.30,1.0,q.y)*0.11);
  return 1.0 + w + sg;
}

vec3 shade(vec2 uv, out float alpha){
  float sy = uSquashY;
  float sx = 1.0/sqrt(max(sy,0.35));
  float mn = min(sx, sy);
  vec3 ro = vec3(0.0, 0.16 - uHop, 3.05);
  vec3 rd = normalize(vec3(uv*1.34, -2.6));

  mat3 Minv  = mat3(1.0/sx, 0.0, 0.0,  -uLean/sx, 1.0/sy, 0.0,  0.0, 0.0, 1.0/sx);
  mat3 MinvT = mat3(1.0/sx, -uLean/sx, 0.0,  0.0, 1.0/sy, 0.0,  0.0, 0.0, 1.0/sx);

  vec3 o = Minv*ro, d = Minv*rd;
  float rb = 1.0 + abs(uWave);
  float A = dot(d,d), B = 2.0*dot(o,d), C = dot(o,o)-rb*rb;
  float disc = B*B-4.0*A*C;
  if(disc < 0.0){ alpha = 0.0; return vec3(0.0); }
  float t = (-B-sqrt(disc))/(2.0*A);
  if(t < 0.0){ alpha = 0.0; return vec3(0.0); }

  float hit = 0.0;
  for(int i=0;i<16;i++){
    vec3 qq = Minv*(ro+rd*t);
    float dist = (length(qq) - bodyR(qq))*mn;
    if(dist < 0.0009){ hit = 1.0; break; }
    t += dist;
    if(t > 6.0) break;
  }
  if(hit < 0.5){ alpha = 0.0; return vec3(0.0); }
  alpha = 1.0;

  vec3 po = Minv*(ro+rd*t);
  vec2 e2 = vec2(0.0018, 0.0);
  vec3 nq = normalize(vec3(
    (length(po+e2.xyy)-bodyR(po+e2.xyy)) - (length(po-e2.xyy)-bodyR(po-e2.xyy)),
    (length(po+e2.yxy)-bodyR(po+e2.yxy)) - (length(po-e2.yxy)-bodyR(po-e2.yxy)),
    (length(po+e2.yyx)-bodyR(po+e2.yyx)) - (length(po-e2.yyx)-bodyR(po-e2.yyx))));
  vec3 n = normalize(MinvT*nq);
  vec3 v = -normalize(rd);

  vec3 K = normalize(KEY);
  float wrap = pow(clamp(dot(n,K)*0.5+0.5, 0.0, 1.0), 1.45);
  vec3 amb = env(n);
  vec3 hv = normalize(K+v);
  float spec = pow(clamp(dot(n,hv),0.0,1.0), 36.0)*0.22;

  vec3 col = uTint*(amb*0.92 + wrap*0.22) + spec*0.42;
  vec3 nBase = normalize(MinvT*normalize(po));
  float edge = smoothstep(0.17, 0.045, dot(nBase,v));
  col = mix(col, vec3(0.07,0.08,0.10), edge*0.88);

  float cs = cos(uSpin), sn = sin(uSpin);
  vec3 pr = vec3(cs*po.x + sn*po.z, po.y, -sn*po.x + cs*po.z);
  vec2 q2 = pr.xy - vec2(uLook.x*0.175, uLook.y*0.125) - uDrag;
  float ef = eyeField(q2);
  float m = 1.0-smoothstep(0.0, 0.006, ef);
  m *= smoothstep(0.0, 0.25, pr.z);   // the rotated face, so a spin hides it round the back
  col = mix(col, vec3(0.022) + spec*0.12, m);

  return col;
}

void main(){
  vec2 base = (gl_FragCoord.xy*2.0-uRes)/uRes.y;
  float px = 2.0/uRes.y;
  vec3 acc = vec3(0.0);
  float aacc = 0.0;
  for(int i=0;i<2;i++) for(int j=0;j<2;j++){
    float a;
    vec2 uv = base + vec2(float(i)-0.5, float(j)-0.5)*px*0.5;
    vec3 c = shade(uv, a);
    acc += c*a; aacc += a;
  }
  float alpha = aacc*0.25;
  vec3 col = aacc > 0.0 ? acc/aacc : vec3(0.0);

  float sy = uSquashY;
  vec2 sp = (base - vec2(0.0, -0.82))/vec2((0.60+uHop*0.35)/sqrt(max(sy,0.35)), 0.085+uHop*0.05);
  float sh = exp(-dot(sp,sp)*1.6)*0.45*clamp(1.0-uHop*1.1, 0.12, 1.0);

  /* Composite over transparency instead of over uPage, so the canvas is not an
     opaque rectangle sitting on top of whatever the page draws behind it.
     Premultiplied: shadow layer first, body over it. */
  vec3 shadeCol = vec3(0.02,0.022,0.028);
  float shA = sh*0.9;
  float a = alpha + shA*(1.0-alpha);
  vec3 pre = col*alpha + shadeCol*shA*(1.0-alpha);
  gl_FragColor = vec4(pre, a);
}
`;
