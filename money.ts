// Money is always integer minor units + currency. Never floats (Plan §6.2).
export interface Money { readonly amountMinor: bigint; readonly currency: string }

export const kes = (shillings: number | bigint, cents = 0): Money => {
  if (typeof shillings === 'number' && !Number.isInteger(shillings)) throw new Error('use whole shillings plus cents');
  return { amountMinor: BigInt(shillings) * 100n + BigInt(cents), currency: 'KES' };
};

export function add(a: Money, b: Money): Money {
  if (a.currency !== b.currency) throw new Error('currency mismatch');
  return { amountMinor: a.amountMinor + b.amountMinor, currency: a.currency };
}

export function format(m: Money): string {
  const neg = m.amountMinor < 0n, abs = neg ? -m.amountMinor : m.amountMinor;
  const whole = (abs / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const cents = (abs % 100n).toString().padStart(2, '0');
  return `${neg ? '-' : ''}${m.currency} ${whole}${cents === '00' ? '' : '.' + cents}`;
}
