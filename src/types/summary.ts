import type { SessionRecordFull } from '@/data/storage';

export interface SummaryLocationState {
  record: SessionRecordFull;
  demo?: boolean;
}

export const SUMMARY_HEADING_ID = 'summary-heading';
