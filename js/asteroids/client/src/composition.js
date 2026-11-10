import { Vector2 } from './math.js';

export function withHoming(entity, target) {
  const baseUpdate = entity.update.bind(entity);
  
  entity.update = (dt, world) => {
    if (target && !target.isDead) {
      const dx = target.pos.x - entity.pos.x;
      const dy = target.pos.y - entity.pos.y;
      
      const desiredAngle = Math.atan2(dy, dx);
      const speed = entity.vel.mag(); 
      
      entity.vel = new Vector2(Math.cos(desiredAngle), Math.sin(desiredAngle)).mult(speed);
    }
    baseUpdate(dt, world);
  };
  
  return entity;
}

export function withPickup(entity, effectCallback) {
  entity.isPickup = true;
  entity.onPickup = effectCallback;
  return entity;
}