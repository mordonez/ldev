export {actionKind} from './actions.js';

export function taskTime(value) {
  const date = new Date(value);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
}

export function changedTaskState(previous, next) {
  if (previous.length !== next.length) return true;
  return next.some((task, index) => !previous[index] || previous[index].id !== task.id || previous[index].status !== task.status);
}
