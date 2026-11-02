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
    
    ctx.translate(ship.x, ship.y);
    ctx.rotate(ship.angle);

    // Draw ship's body
    ctx.beginPath();
    ctx.moveTo(16, 0);       // nose
    ctx.lineTo(-12, -10);   // L wing
    ctx.lineTo(-8, 0);      // torso
    ctx.lineTo(-12, 10);    // R wing
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
  }

  return {
    getBounds() {
      return { width, height };
    },
    render(prevShip, currentShip, alpha, input) {
      clear();

      let x = currentShip.x;
      let y = currentShip.y;

      if (Math.abs(currentShip.x - prevShip.x) < width / 2) {
        x = prevShip.x + (currentShip.x - prevShip.x) * alpha;
      }
      if (Math.abs(currentShip.y - prevShip.y) < height / 2) {
        y = prevShip.y + (currentShip.y - prevShip.y) * alpha;
      }

      const renderShipState = {
        ...currentShip,
        x,
        y
      };

      const isThrusting = input.isPressed('KeyW') || input.isPressed('ArrowUp');
      drawShip(renderShipState, isThrusting);

      ctx.restore(); // Скидаємо ctx.scale(dpr, dpr)
    }
  };
}