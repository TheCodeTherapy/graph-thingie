import {
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  TextureLoader,
  Group,
  DirectionalLight,
  Texture,
  Scene,
  Color,
  ShaderMaterial,
  AdditiveBlending,
  BackSide,
  EquirectangularReflectionMapping,
  Uniform
} from "three";

import albedo from "./assets/albedo.jpg";
import back from "./assets/back.png";
import bump from "./assets/bump.jpg";
import clouds from "./assets/clouds.png";
import lights from "./assets/lights.png";
import ocean from "./assets/ocean.png";
import { fragmentShader } from "./shaders/fragment";
import { vertexShader } from "./shaders/vertex";

export const loadTexture = (url: string): Promise<Texture> => {
  return new Promise((resolve) => {
    new TextureLoader().load(url, resolve);
  });
};

export class Globe {
  public earth: Mesh | null = null;
  public clouds: Mesh | null = null;
  public atmos: Mesh | null = null;
  public dirLight: DirectionalLight;
  public group: Group | null = null;

  constructor(private scene: Scene) {
    this.dirLight = new DirectionalLight(0xffffff, 0.8);
    this.dirLight.position.set(-50, 0, 30);
    this.init();
  }

  private async init() {
    const [albedoMap, bumpMap, cloudsMap, oceanMap, lightsMap, envMap] = await Promise.all([
      loadTexture(albedo),
      loadTexture(bump),
      loadTexture(clouds),
      loadTexture(ocean),
      loadTexture(lights),
      loadTexture(back)
    ]);

    envMap.mapping = EquirectangularReflectionMapping;
    this.scene.background = envMap;
    this.scene.backgroundIntensity = 0.1;

    this.group = new Group();
    this.group.rotation.z = (23.5 / 360) * 2 * Math.PI;

    const earthGeo = new SphereGeometry(10, 64, 64);
    const earthMat = new MeshStandardMaterial({
      map: albedoMap,
      bumpMap: bumpMap,
      bumpScale: 0.03,
      roughnessMap: oceanMap,
      metalness: 0.3,
      metalnessMap: oceanMap,
      emissiveMap: lightsMap,
      emissive: new Color(0xffff88)
    });
    this.earth = new Mesh(earthGeo, earthMat);
    this.group.add(this.earth);

    const cloudGeo = new SphereGeometry(10.05, 64, 64);
    const cloudsMat = new MeshStandardMaterial({
      alphaMap: cloudsMap,
      transparent: true
    });
    this.clouds = new Mesh(cloudGeo, cloudsMat);
    this.group.add(this.clouds);

    this.earth.rotation.y = -0.3;
    this.clouds.rotation.y = -0.3;

    const atmosGeo = new SphereGeometry(12.5, 64, 64);
    const atmosMat = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        atmOpacity: new Uniform(0.5),
        atmPowFactor: new Uniform(4.1),
        atmMultiplier: new Uniform(5)
      },
      blending: AdditiveBlending,
      side: BackSide,
      transparent: true
    });
    this.atmos = new Mesh(atmosGeo, atmosMat);
    this.group.add(this.atmos);

    this.scene.add(this.group);
    this.scene.add(this.dirLight);

    earthMat.onBeforeCompile = (shader) => {
      shader.uniforms.tClouds = { value: cloudsMap };
      shader.uniforms.uv_xOffset = { value: 0 };
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <common>",
        /* glsl */ `#include <common>
          uniform sampler2D tClouds;
          uniform float uv_xOffset;
      `
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <roughnessmap_fragment>",
        /* glsl */ `float roughnessFactor = roughness;
          #ifdef USE_ROUGHNESSMAP
            vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );
            texelRoughness = vec4(1.0) - texelRoughness;
            roughnessFactor *= clamp(texelRoughness.g, 0.5, 1.0);
          #endif
      `
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <emissivemap_fragment>",
        /* glsl */ `#ifdef USE_EMISSIVEMAP
          vec4 emissiveColor = texture2D( emissiveMap, vEmissiveMapUv );
          emissiveColor *= 1.0 - smoothstep(-0.02, 0.0, dot(normal, directionalLights[0].direction));
          totalEmissiveRadiance *= emissiveColor.rgb;
        #endif
        
        float cloudsMapValue = texture2D(tClouds, vec2(vMapUv.x - uv_xOffset, vMapUv.y)).r;
        diffuseColor.rgb *= max(1.0 - cloudsMapValue, 0.2);
        float intensity = 1.4 - dot(normal, vec3(0.0, 0.0, 1.0));
        vec3 atmosphere = vec3(0.3, 0.6, 2.0) * pow(intensity, 5.0);
        diffuseColor.rgb += atmosphere;
      `
      );

      earthMat.userData.shader = shader;
    };
  }
}
