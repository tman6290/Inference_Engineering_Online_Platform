export const APP_NAME = 'Forward Pass';
export const SECTION_COUNT = 42;
export const STUDY_TIMEZONE = 'Africa/Lagos';
export const CONFIDENCE_LEVELS = ['shaky', 'okay', 'solid'] as const;
export type Confidence = (typeof CONFIDENCE_LEVELS)[number];
