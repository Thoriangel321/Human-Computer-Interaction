import type { InputKeys } from '../../shared/entity.js';

export interface InputController {
  isPressed(code: string): boolean;
  readKeys(): InputKeys;
  destroy(): void;
}

export function createInput(): InputController {
  const pressed = new Set<string>();

  const onKeyDown = (e: KeyboardEvent): void => {
    pressed.add(e.code);
  };

  const onKeyUp = (e: KeyboardEvent): void => {
    pressed.delete(e.code);
  };

  const onBlur = (): void => {
    pressed.clear();
  };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);

  return {
    isPressed(code: string): boolean {
      return pressed.has(code);
    },
    readKeys(): InputKeys {
      return {
        up: pressed.has('KeyW') || pressed.has('ArrowUp'),
        left: pressed.has('KeyA') || pressed.has('ArrowLeft'),
        right: pressed.has('KeyD') || pressed.has('ArrowRight'),
        space: pressed.has('Space')
      };
    },
    destroy(): void {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      pressed.clear();
    }
  };
}