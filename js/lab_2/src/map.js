import { Entity } from './entity.js';

export class World {
  constructor(bounds) {
    this.bounds = bounds;
    this.entities = new Map(); 
  }

  spawn(entity) {
    this.entities.set(entity.id, entity);
  }

  despawn(id) {
    const entity = this.entities.get(id);
    if (entity) {
      entity.isDead = true;
    }
  }

  *ofKind(kind) {
    for (const entity of this.entities.values()) {
      if (entity.kind === kind && !entity.isDead) {
        yield entity;
      }
    }
  }

  step(dt, input, currentTime) {
    for (const entity of this.entities.values()) {
      if (entity.isDead) continue;
      
      if (entity.kind === 'ship') {
        entity.update(dt, this, input);
      } else {
        entity.update(dt, this);
      }

      if (entity.pos.x < -entity.radius) entity.pos.x = this.bounds.width + entity.radius;
      if (entity.pos.x > this.bounds.width + entity.radius) entity.pos.x = -entity.radius;
      if (entity.pos.y < -entity.radius) entity.pos.y = this.bounds.height + entity.radius;
      if (entity.pos.y > this.bounds.height + entity.radius) entity.pos.y = -entity.radius;
    }

    for (const [id, entity] of this.entities.entries()) {
      if (entity.isDead) {
        this.entities.delete(id);
      }
    }
  }
}