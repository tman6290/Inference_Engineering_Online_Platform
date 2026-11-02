export const APP_NAME = 'Forward Pass';
/** Numbered sections in the published book (1.1 to 7.6). The Preface and Chapter 0 are read but not counted. */
export const SECTION_COUNT = 36;
export const STUDY_TIMEZONE = 'Africa/Lagos';
export const CONFIDENCE_LEVELS = ['shaky', 'okay', 'solid'] as const;
export type Confidence = (typeof CONFIDENCE_LEVELS)[number];
