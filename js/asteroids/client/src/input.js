export function createInput() {
  const pressedKeys = new Set();

  const handleKeyDown = (event) => {
    if (!event.repeat) {
      pressedKeys.add(event.code);
    }
  };

  const handleKeyUp = (event) => {
    pressedKeys.delete(event.code);
  };

  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', handleKeyUp);

  return {
    isPressed(code) {
      return pressedKeys.has(code);
    },

    destroy() {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    }
  };
}