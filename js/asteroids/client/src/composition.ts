export type UnaryFn<TInput, TOutput> = (input: TInput) => TOutput;

export function pipe2<A, B, C>(ab: UnaryFn<A, B>, bc: UnaryFn<B, C>): UnaryFn<A, C> {
  return (a: A): C => bc(ab(a));
}

export function pipe3<A, B, C, D>(
  ab: UnaryFn<A, B>,
  bc: UnaryFn<B, C>,
  cd: UnaryFn<C, D>
): UnaryFn<A, D> {
  return (a: A): D => cd(bc(ab(a)));
}

export function compose2<A, B, C>(bc: UnaryFn<B, C>, ab: UnaryFn<A, B>): UnaryFn<A, C> {
  return (a: A): C => bc(ab(a));
}