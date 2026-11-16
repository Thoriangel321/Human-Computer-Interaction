import { describe, expect, it } from 'vitest';
import { integrate, MutableVector2, Vector2 } from './math.js';

describe('Vector2', () => {
  it('adds two vectors immutably', () => {
    const a = new Vector2(3, 4);
    const b = new Vector2(-1, 6);
    const res = a.add(b);
    expect(res.x).toBe(2);
    expect(res.y).toBe(10);
    expect(a.x).toBe(3);
  });

  it('subtracts two vectors', () => {
    const res = new Vector2(10, 5).sub(new Vector2(4, 8));
    expect(res.x).toBe(6);
    expect(res.y).toBe(-3);
  });

  it('scales a vector', () => {
    const res = new Vector2(2.5, -4).scale(2);
    expect(res.x).toBe(5);
    expect(res.y).toBe(-8);
  });

  it('computes length and squared length', () => {
    const v = new Vector2(3, 4);
    expect(v.lengthSq()).toBe(25);
    expect(v.length()).toBe(5);
  });
});

describe('MutableVector2 and integrate', () => {
  it('sets and copies coordinates in place without allocation', () => {
    const v = new MutableVector2(1, 2);
    v.set(7, 9);
    expect(v.x).toBe(7);
    expect(v.y).toBe(9);

    const target = new MutableVector2();
    target.copyFrom(v);
    expect(target.x).toBe(7);
    expect(target.y).toBe(9);
  });

  it('performs addInPlace, subInPlace, addScaledInPlace, and scaleInPlace', () => {
    const v = new MutableVector2(10, 20);
    v.addInPlace({ x: 5, y: -5 });
    expect(v.x).toBe(15);
    expect(v.y).toBe(15);

    v.subInPlace({ x: 5, y: 10 });
    expect(v.x).toBe(10);
    expect(v.y).toBe(5);

    v.addScaledInPlace(2, -3, 4);
    expect(v.x).toBe(18);
    expect(v.y).toBe(-7);

    v.scaleInPlace(0.5);
    expect(v.x).toBe(9);
    expect(v.y).toBe(-3.5);
  });

  it('computes length and lengthSq on MutableVector2', () => {
    const v = new MutableVector2(6, 8);
    expect(v.lengthSq()).toBe(100);
    expect(v.length()).toBe(10);
  });

  it('integrates position by velocity and dt without mutating velocity', () => {
    const pos = new MutableVector2(100, 200);
    const vel = new MutableVector2(60, -30);
    integrate(pos, vel, 0.5);

    expect(pos.x).toBe(130);
    expect(pos.y).toBe(185);
    expect(vel.x).toBe(60);
    expect(vel.y).toBe(-30);
  });

  it('keeps position unchanged when dt is 0', () => {
    const pos = new MutableVector2(42, 84);
    integrate(pos, { x: 500, y: -500 }, 0);
    expect(pos.x).toBe(42);
    expect(pos.y).toBe(84);
  });
});