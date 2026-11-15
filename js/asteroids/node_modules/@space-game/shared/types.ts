declare const __brand: unique symbol;

export type Brand<T, TBrand extends string> = T & {
  readonly [__brand]: TBrand;
};

export type EntityId = Brand<number, 'EntityId'>;
export type Tick = Brand<number, 'Tick'>;
export type InputSeq = Brand<number, 'InputSeq'>;

function createBrand<T, TBrand extends string>(value: T): Brand<T, TBrand> {
  // [as #1]: Єдине приведення типу для створення номінальних (branded) типів із примітивів
  return value as Brand<T, TBrand>;
}

export const toEntityId = (id: number): EntityId => createBrand<number, 'EntityId'>(id);
export const toTick = (tick: number): Tick => createBrand<number, 'Tick'>(tick);
export const toInputSeq = (seq: number): InputSeq => createBrand<number, 'InputSeq'>(seq);

export function assertNever(value: never, context = 'Unexpected value'): never {
  throw new Error(`${context}: ${JSON.stringify(value)}`);
}