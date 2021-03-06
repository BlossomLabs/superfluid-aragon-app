export const MINUTE = 60;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
export const WEEK = 7 * DAY;
export const MONTH = 30 * DAY;
export const YEAR = 365 * DAY;

export const getCurrentTimestamp = () => Math.floor(Date.now() / 1000);

export const timestampToDate = timestamp => new Date(timestamp * 1000);
