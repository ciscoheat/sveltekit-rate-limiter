export type Rate = [number, RateUnit];

export type RateUnit =
  | 'ms'
  | '100ms'
  | '250ms'
  | '500ms'
  | 's'
  | '2s'
  | '5s'
  | '10s'
  | '15s'
  | '30s'
  | '45s'
  | 'm'
  | '2m'
  | '5m'
  | '10m'
  | '15m'
  | '30m'
  | '45m'
  | 'h'
  | '2h'
  | '6h'
  | '12h'
  | 'd';

export function TTLTime(unit: RateUnit) {
  switch (unit) {
    case 's':
      return 1000;
    case 'm':
      return 60000;
    case 'h':
      return 60 * 60000;
    case '2s':
      return 2000;
    case '5s':
      return 5000;
    case '10s':
      return 10000;
    case '15s':
      return 15000;
    case '30s':
      return 30000;
    case '45s':
      return 45000;
    case '2m':
      return 2 * 60000;
    case '5m':
      return 5 * 60000;
    case '10m':
      return 10 * 60000;
    case '15m':
      return 15 * 60000;
    case '30m':
      return 30 * 60000;
    case '45m':
      return 45 * 60000;
    case '100ms':
      return 100;
    case '250ms':
      return 250;
    case '500ms':
      return 500;
    case '2h':
      return 2 * 60 * 60000;
    case '6h':
      return 6 * 60 * 60000;
    case '12h':
      return 12 * 60 * 60000;
    case 'd':
      return 24 * 60 * 60000;
    case 'ms':
      return 1;
  }
  throw new Error('Invalid unit for TTLTime: ' + unit);
}
