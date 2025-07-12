import {
  BufferGeometry,
  Color,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  Vector3
} from "three";

export type LatLng = { lat: number; lng: number };

export interface Endpoint {
  name: string;
  latlng: LatLng;
  isServer: boolean;
}

function latLngToVec3(lat: number, lng: number, radius = 10): Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  return new Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

function createArcPoints(start: Vector3, end: Vector3, segments = 100, height = 3): Vector3[] {
  const points: Vector3[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const intermediate = start.clone().lerp(end, t).normalize();
    const elevation = Math.sin(Math.PI * t) * height;
    intermediate.multiplyScalar(10 + elevation);
    points.push(intermediate);
  }
  return points;
}

function haversineDistance(a: LatLng, b: LatLng): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  return 2 * R * Math.asin(Math.sqrt(h));
}

interface PulseData {
  points: Vector3[];
  time: number;
  speed: number;
}

export class Connections extends Group {
  private pulseSpheres: Mesh[] = [];
  private readonly latencyMultiplier = 0.0015;
  private readonly enableJitter = false;

  constructor(endpoints: Endpoint[]) {
    super();

    const servers = endpoints.filter((e) => e.isServer);
    const clients = endpoints.filter((e) => !e.isServer);

    for (const server of servers) {
      for (const client of clients) {
        const start = latLngToVec3(server.latlng.lat, server.latlng.lng);
        const end = latLngToVec3(client.latlng.lat, client.latlng.lng);
        const points = createArcPoints(start, end, 100, 3);

        const geometry = new BufferGeometry().setFromPoints(points);
        const line = new Line(geometry, new LineBasicMaterial({ color: new Color(0x4477ff), linewidth: 2 }));
        this.add(line);

        const latency = this.simulateLatency(server.latlng, client.latlng);
        const speed = 1 / (latency * this.latencyMultiplier);

        const pulse = new Mesh(
          new SphereGeometry(0.05, 8, 8),
          new MeshStandardMaterial({ color: 0xffffff, emissiveIntensity: 2, emissive: new Color(0xffffff) })
        );
        pulse.userData = { points, time: Math.random(), speed } satisfies PulseData;
        this.pulseSpheres.push(pulse);
        this.add(pulse);
      }
    }
  }

  private simulateLatency(a: LatLng, b: LatLng): number {
    const distance = haversineDistance(a, b);
    const base = 40;
    const variable = distance * 0.9;
    const jitter = this.enableJitter ? Math.random() * 5 : 0;
    return base + variable + jitter;
  }

  update(dt: number) {
    for (const pulse of this.pulseSpheres) {
      const { points, speed } = pulse.userData as PulseData;
      pulse.userData.time += dt * speed;
      const t = pulse.userData.time % 1;
      const idx = t * (points.length - 1);
      const i = Math.floor(idx);
      const alpha = idx - i;

      if (i < points.length - 1) {
        pulse.position.lerpVectors(points[i], points[i + 1], alpha);
      } else {
        pulse.position.copy(points[points.length - 1]);
      }
    }
  }
}
