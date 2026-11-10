import { Vector2 } from './math.js';
import { gameEvents } from './events.js';

export class Entity {

  static #nextId = 1; 

  constructor(x, y, radius, kind) {
    this.id = Entity.#nextId++; 
    this.pos = new Vector2(x, y);
    this.vel = new Vector2(0, 0);
    this.radius = radius;
    this.kind = kind;
    this.isDead = false; 
  }

  update(dt, world) {

    this.pos = this.pos.add(this.vel.mult(dt));
  }
}

export class Ship extends Entity {
  #hp; 
  
  constructor(x, y) {
    super(x, y, 12, 'ship'); 
    this.#hp = 100;
    this.angle = -Math.PI / 2;
    this.rotationSpeed = 3.5;
    this.thrust = 350;
    this.drag = 0.985;
    

    this.lastFireTime = 0;
  }


  get hp() {
    return this.#hp;
  }

  takeDamage(amount) {
    this.#hp -= amount;
    if (this.#hp <= 0) {
      this.isDead = true;
    }
  }

  update(dt, world, input) {

    if (input.isPressed('KeyA') || input.isPressed('ArrowLeft')) {
      this.angle -= this.rotationSpeed * dt;
    }
    if (input.isPressed('KeyD') || input.isPressed('ArrowRight')) {
      this.angle += this.rotationSpeed * dt;
    }


    if (input.isPressed('KeyW') || input.isPressed('ArrowUp')) {
      const thrustVec = new Vector2(Math.cos(this.angle), Math.sin(this.angle)).mult(this.thrust * dt);
      this.vel = this.vel.add(thrustVec);
    }


    this.vel = this.vel.mult(Math.pow(this.drag, dt * 60));


    super.update(dt, world);

  }

fire(world, currentTime) {
    if (currentTime - this.lastFireTime < 0.2) return;
    this.lastFireTime = currentTime;

    const noseX = this.pos.x + Math.cos(this.angle) * this.radius;
    const noseY = this.pos.y + Math.sin(this.angle) * this.radius;
    
    const bullet = new Entity(noseX, noseY, 3, 'bullet');
    const bulletSpeed = 500;
    bullet.vel = new Vector2(Math.cos(this.angle), Math.sin(this.angle)).mult(bulletSpeed);
    bullet.ttl = 1.5; 
    
    const baseUpdate = bullet.update.bind(bullet);
    bullet.update = (dt, w) => {
      bullet.ttl -= dt;
      if (bullet.ttl <= 0) bullet.isDead = true;
      baseUpdate(dt, w);
    };



    world.spawn(bullet);

    gameEvents.dispatchEvent(new CustomEvent('fired'));
  }
}