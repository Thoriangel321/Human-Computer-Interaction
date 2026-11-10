export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let dpr = window.devicePixelRatio || 1;
  let width = 0;
  let height = 0;

  function resize() {
    dpr = window.devicePixelRatio || 1;
    width = window.innerWidth;
    height = window.innerHeight;

    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);

    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
  }

  resize();
  window.addEventListener('resize', resize);

  function clear() {
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#050510';
    ctx.fillRect(0, 0, width, height);
  }

  function drawShip(ship, isThrusting) {
    ctx.save();
    ctx.translate(ship.pos.x, ship.pos.y);
    ctx.rotate(ship.angle);

    ctx.beginPath();
    ctx.moveTo(16, 0);      
    ctx.lineTo(-12, -10);   
    ctx.lineTo(-8, 0);      
    ctx.lineTo(-12, 10);    
    ctx.closePath();

    ctx.strokeStyle = '#00ffcc';
    ctx.lineWidth = 2;
    ctx.fillStyle = '#0a2520';
    ctx.fill();
    ctx.stroke();

    if (isThrusting) {
      ctx.beginPath();
      ctx.moveTo(-8, 0);
      ctx.lineTo(-18, -4);
      ctx.lineTo(-24, 0);
      ctx.lineTo(-18, 4);
      ctx.closePath();
      ctx.fillStyle = '#ff6600';
      ctx.fill();
    }
    ctx.restore();

    if (ship.hp !== undefined) {
      ctx.save();
      ctx.translate(ship.pos.x, ship.pos.y - 25);
      ctx.fillStyle = '#ff0000';
      ctx.fillRect(-15, 0, 30, 4);
      ctx.fillStyle = '#00ff00';
      const hpPct = Math.max(0, ship.hp / 100);
      ctx.fillRect(-15, 0, 30 * hpPct, 4);
      ctx.restore();
    }
  }

  function drawBullet(bullet) {
    ctx.save();
    ctx.translate(bullet.pos.x, bullet.pos.y);
    ctx.beginPath();
    ctx.arc(0, 0, bullet.radius, 0, Math.PI * 2);
    ctx.fillStyle = '#ff0055';
    ctx.shadowBlur = 8;
    ctx.shadowColor = '#ff0055';
    ctx.fill();
    ctx.restore();
  }

  function drawAsteroid(asteroid) {
    ctx.save();
    ctx.translate(asteroid.pos.x, asteroid.pos.y);
    ctx.beginPath();
    ctx.arc(0, 0, asteroid.radius, 0, Math.PI * 2);
    ctx.strokeStyle = '#888';
    ctx.lineWidth = 2;
    ctx.fillStyle = '#222';
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function drawParticle(particle) {
    ctx.save();
    ctx.translate(particle.pos.x, particle.pos.y);
    if (particle.ttl !== undefined) {
      ctx.globalAlpha = Math.max(0, particle.ttl);
    }
    ctx.beginPath();
    ctx.arc(0, 0, particle.radius, 0, Math.PI * 2);
    ctx.fillStyle = particle.color || '#ffaa00';
    ctx.fill();
    ctx.restore();
  }

  return {
    getBounds() {
      return { width, height };
    },
    
    // Нова сигнатура з 3 аргументами
    render(world, alpha, input) {
      clear();

      for (const particle of world.ofKind('particle')) {
        drawParticle(particle);
      }

      for (const asteroid of world.ofKind('asteroid')) {
        drawAsteroid(asteroid);
      }

      for (const bullet of world.ofKind('bullet')) {
        drawBullet(bullet);
      }

      for (const ship of world.ofKind('ship')) {
        const isThrusting = input.isPressed('KeyW') || input.isPressed('ArrowUp');
        drawShip(ship, isThrusting);
      }

      ctx.restore(); 
    }
  };
}