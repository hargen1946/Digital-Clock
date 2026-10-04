export const INTERVALS = [5, 15, 30, 60];
export function nextBoundary(now, minutes) {
  if (!INTERVALS.includes(minutes)) throw new RangeError('通知間隔が無効です');
  const next = new Date(now);
  const minute = (now.getHours() * 60 + now.getMinutes());
  next.setHours(0, (Math.floor(minute / minutes) + 1) * minutes, 0, 0);
  return next;
}
export function announcement(now, previous, target) {
  if (!previous || now - previous > 2000 || now < previous) return null;
  const remaining = target - now;
  if (remaining <= 0) {
    return previous < target && -remaining <= 2000 ? {key: `${target.getTime()}:0`, text: `${timePhrase(target)}です`} : null;
  }
  const seconds = Math.ceil(remaining / 1000);
  if (seconds > 60 || seconds < 10 || seconds % 10 !== 0) return null;
  return {key: `${target.getTime()}:${seconds}`, text: seconds === 60 ? `まもなく${timePhrase(target)}、1分前です` : `${seconds}秒前です`};
}
export function timePhrase(now) { return `${now.getHours()}時${now.getMinutes()}分`; }
export function timeString(now) {
  return [now.getHours(), now.getMinutes(), now.getSeconds()].map(v => String(v).padStart(2, '0')).join(':');
}
export function dateString(now, year, monthDay) {
  const parts = [];
  if (year) parts.push(`${now.getFullYear()}年`);
  if (monthDay) parts.push(`${now.getMonth()+1}月${now.getDate()}日（${'日月火水木金土'[now.getDay()]}）`);
  return parts.join(' ');
}
