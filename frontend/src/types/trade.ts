export interface Trade {
  trade_id: string;
  direction: 'long' | 'short';
  status?: 'draft' | 'pending' | 'active';
  submitted_time?: number;
  filled_time?: number;
  entry_time: number;
  entry_price: number;
  stop_price: number;
  target_price: number;
  exit_time?: number;
  exit_price?: number;
  result_points?: number;
  notes?: string;
}
