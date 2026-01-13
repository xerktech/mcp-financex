declare module 'black-scholes' {
  export function blackScholes(
    S: number,
    K: number,
    t: number,
    v: number,
    r: number,
    callPut: 'call' | 'put'
  ): number;

  export function blackScholesObject(params: {
    s: number;
    k: number;
    t: number;
    v: number;
    r: number;
    callPut: 'call' | 'put';
  }): {
    blackScholes: number;
    greeks: {
      delta: number;
      gamma: number;
      theta: number;
      vega: number;
      rho: number;
    };
  };
}
