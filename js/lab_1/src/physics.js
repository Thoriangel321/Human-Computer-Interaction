export function createShip(x, y) {
  return {
    x,
    y,
    vx: 0,
    vy: 0,
    angle: -Math.PI / 2, // -90*
    rotationSpeed: 3.5,  // not sure
    thrust: 350,        
    drag: 0.985,       
    radius: 12   
  };
}

export function integrate(ship, input, dt, bounds) {
  let angle = ship.angle;
  let vx = ship.vx;
  let vy = ship.vy;

  if (input.isPressed('KeyA') || input.isPressed('ArrowLeft')) {
    angle -= ship.rotationSpeed * dt;
  }
  if (input.isPressed('KeyD') || input.isPressed('ArrowRight')) {
    angle += ship.rotationSpeed * dt;
  }

  if (input.isPressed('KeyW') || input.isPressed('ArrowUp')) {
    vx += Math.cos(angle) * ship.thrust * dt;
    vy += Math.sin(angle) * ship.thrust * dt;
  }

  //inertia
  vx *= Math.pow(ship.drag, dt * 60);
  vy *= Math.pow(ship.drag, dt * 60);

  let x = ship.x + vx * dt;
  let y = ship.y + vy * dt;

  // (Screen Wrapping)
  if (x < -ship.radius) x = bounds.width + ship.radius;
  if (x > bounds.width + ship.radius) x = -ship.radius;
  if (y < -ship.radius) y = bounds.height + ship.radius;
  if (y > bounds.height + ship.radius) y = -ship.radius;

  return {
    ...ship,
    x,
    y,
    vx,
    vy,
    angle
  };
}