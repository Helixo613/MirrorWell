import type { SessionRecordFull } from '@/data/schema';

export interface SummaryLocationState {
  record: SessionRecordFull;
  demo?: boolean;
}

export const SUMMARY_HEADING_ID = 'summary-heading';
