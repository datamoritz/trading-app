export interface Signal {
  timestamp: number;            // unix seconds
  direction: 'long' | 'short';
  entry_price: number;
  stop_price: number;
  target_price: number;
  setup_name: string;
}
