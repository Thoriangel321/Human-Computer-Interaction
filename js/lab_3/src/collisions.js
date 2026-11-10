import { Entity } from './entity.js';
import { Vector2 } from './math.js';
import { gameEvents } from './events.js';

export function isColliding(e1, e2) {
  const dx = e1.pos.x - e2.pos.x;
  const dy = e1.pos.y - e2.pos.y;
  const distanceSq = dx * dx + dy * dy;
  const radiusSum = e1.radius + e2.radius;
  
  return distanceSq <= radiusSum * radiusSum;
}

export function spawnExplosion(world, x, y, color = '#ffaa00') {
  for (let i = 0; i < 12; i++) {
    const particle = new Entity(x, y, Math.random() * 3 + 1, 'particle');
    particle.color = color;
    particle.ttl = 0.5 + Math.random() * 0.5;
    
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 150 + 50;
    particle.vel = new Vector2(Math.cos(angle), Math.sin(angle)).mult(speed);
    
    const baseUpdate = particle.update.bind(particle);
    particle.update = (dt, w) => {
      particle.ttl -= dt;
      if (particle.ttl <= 0) particle.isDead = true;
      baseUpdate(dt, w);
    };
    
    world.spawn(particle);
  }
}

export function handleCollisions(world, addScore) {
  const bullets = Array.from(world.ofKind('bullet'));
  const asteroids = Array.from(world.ofKind('asteroid'));
  const ships = Array.from(world.ofKind('ship'));

  for (const bullet of bullets) {
    if (bullet.isDead) continue;
    for (const asteroid of asteroids) {
      if (asteroid.isDead) continue;
      
      if (isColliding(bullet, asteroid)) {
        bullet.isDead = true;
        asteroid.isDead = true; 
        spawnExplosion(world, asteroid.pos.x, asteroid.pos.y, '#aaaaaa');
        addScore(10);
        
        gameEvents.dispatchEvent(new CustomEvent('exploded'));
        break; 
      }
    }
  }

  for (const bullet of bullets) {
    if (bullet.isDead) continue;
    for (const ship of ships) {
      if (ship.isDead) continue;
      
      if (isColliding(bullet, ship)) {
        bullet.isDead = true;
        ship.takeDamage(20);
        spawnExplosion(world, bullet.pos.x, bullet.pos.y, '#ff0000');
        
        gameEvents.dispatchEvent(new CustomEvent('hit'));
        
        if (ship.isDead) {
          spawnExplosion(world, ship.pos.x, ship.pos.y, '#00ffcc');
          gameEvents.dispatchEvent(new CustomEvent('exploded'));
        }
        break;
      }
    }
  }
}