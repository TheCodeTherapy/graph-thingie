import {
  Scene,
  PerspectiveCamera,
  WebGLRenderer,
  Clock,
  AmbientLight,
  Vector2,
  ReinhardToneMapping,
  SRGBColorSpace
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

import { Connections, Endpoint } from "./connections";
import { Globe } from "./globe";

export class App {
  private scene = new Scene();
  private camera = new PerspectiveCamera(60, 1, 0.1, 100);
  private renderer: WebGLRenderer;
  private controls: OrbitControls;
  private clock = new Clock();
  private connections: Connections | null = null;

  private composer: EffectComposer;
  private renderPass: RenderPass;
  private bloomPass: UnrealBloomPass;

  constructor(private parentElement: HTMLElement) {
    this.renderer = new WebGLRenderer({ antialias: true });

    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ReinhardToneMapping;

    this.parentElement.appendChild(this.renderer.domElement);
    this.camera.position.set(0, 0, 25);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;

    this.composer = new EffectComposer(this.renderer);

    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);
    this.bloomPass = new UnrealBloomPass(new Vector2(window.innerWidth, window.innerHeight), 3.1, 0.1, 0.5);
    this.composer.addPass(this.bloomPass);

    this.scene.add(new AmbientLight(0xffffff, 0.5));
    new Globe(this.scene);

    this.loadConnections();

    window.addEventListener("resize", this.resize);
    this.resize();
    this.animate();
  }

  private async loadConnections() {
    const servers: Endpoint[] = [
      {
        name: "SF Server",
        latlng: { lat: 37.7749, lng: -122.4194 },
        isServer: true
      },
      {
        name: "London Server",
        latlng: { lat: 51.5074, lng: -0.1278 },
        isServer: true
      }
    ];

    try {
      const res = await fetch("http://localhost:8080/land-points");
      const data: [number, number][] = await res.json();

      const clients: Endpoint[] = data.map(([lat, lng], i) => ({
        name: `Client ${i + 1}`,
        latlng: { lat, lng },
        isServer: false
      }));

      this.connections = new Connections([...servers, ...clients]);
      this.scene.add(this.connections);
    } catch (err) {
      console.error("Failed to load land points:", err);
    }
  }

  private resize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.bloomPass.resolution.set(window.innerWidth, window.innerHeight);
    this.composer.setSize(w, h);

    this.renderer.setSize(w, h);
  };

  private animate = () => {
    requestAnimationFrame(this.animate);
    const dt = this.clock.getDelta();
    if (this.connections) {
      this.connections.update(dt);
    }
    this.controls.update();
    this.composer.render();
  };
}
