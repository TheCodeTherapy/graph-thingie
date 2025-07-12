export const fragmentShader = /* glsl */ `
varying vec3 vNormal;
varying vec3 eyeVector;
uniform float atmOpacity;
uniform float atmPowFactor;
uniform float atmMultiplier;

void main() {
  float dotP = dot( vNormal, eyeVector );
  float factor = pow(dotP, atmPowFactor) * atmMultiplier;
  vec3 atmColor = vec3(0.35 + dotP/4.5, 0.35 + dotP/4.5, 1.0);
  gl_FragColor = vec4(atmColor, atmOpacity) * factor;

  // gl_FragColor = linearToOutputTexel( gl_FragColor );
}
`;
