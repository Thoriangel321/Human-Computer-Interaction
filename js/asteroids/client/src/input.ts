import type { InputKeys } from '../../shared/entity.js';

export interface InputController {
  readKeys(): InputKeys;
  setTouchKey(key: keyof InputKeys, pressed: boolean): void;
  destroy(): void;
}

export function createInput(): InputController {
  const pressed = new Set<string>();
  const touchState = {
    up: false,
    left: false,
    right: false,
    space: false
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    pressed.add(event.code);
  };

  const onKeyUp = (event: KeyboardEvent): void => {
    pressed.delete(event.code);
  };

  const onBlur = (): void => {
    pressed.clear();
    touchState.up = false;
    touchState.left = false;
    touchState.right = false;
    touchState.space = false;
  };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);

  return {
    readKeys(): InputKeys {
      return {
        up: touchState.up || pressed.has('ArrowUp') || pressed.has('KeyW'),
        left: touchState.left || pressed.has('ArrowLeft') || pressed.has('KeyA'),
        right: touchState.right || pressed.has('ArrowRight') || pressed.has('KeyD'),
        space: touchState.space || pressed.has('Space')
      };
    },
    setTouchKey(key: keyof InputKeys, isPressed: boolean): void {
      touchState[key] = isPressed;
    },
    destroy(): void {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      pressed.clear();
    }
  };
}