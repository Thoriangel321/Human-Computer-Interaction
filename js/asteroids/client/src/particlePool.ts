import { ObjectPool } from '../../shared/pool.js';

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  active: boolean;
}

export class ParticleSystem {
  public readonly pool: ObjectPool<Particle>;
  public readonly activeParticles: Particle[] = [];

  constructor(initialCapacity = 256) {
    this.pool = new ObjectPool<Particle>(
      () => ({
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        life: 0,
        maxLife: 1,
        size: 2,
        color: '#facc15',
        active: false
      }),
      (p) => {
        p.active = false;
        p.life = 0;
      },
      initialCapacity
    );
  }

  public emit(
    x: number,
    y: number,
    vx: number,
    vy: number,
    maxLife: number,
    size: number,
    color: string
  ): void {
    const p = this.pool.acquire();
    p.x = x;
    p.y = y;
    p.vx = vx;
    p.vy = vy;
    p.life = maxLife;
    p.maxLife = maxLife;
    p.size = size;
    p.color = color;
    p.active = true;
    this.activeParticles.push(p);
  }

  public update(dt: number): void {
    let writeIdx = 0;
    for (let i = 0; i < this.activeParticles.length; i++) {
      const p = this.activeParticles[i];
      if (p === undefined) continue;

      p.life -= dt;
      if (p.life <= 0) {
        this.pool.release(p);
        continue;
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;
      this.activeParticles[writeIdx] = p;
      writeIdx += 1;
    }
    this.activeParticles.length = writeIdx;
  }
}