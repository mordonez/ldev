import {h} from 'preact';
import {useEffect, useRef, useState} from 'preact/hooks';

import {cx} from '../lib/cx.js';
import {IconCheck, IconCopy} from '../lib/icons.jsx';

export function useCopyState(text, onCopy) {
  const [done, setDone] = useState(false);
  const timer = useRef(null);

  const handleClick = (e) => {
    e.stopPropagation();
    navigator.clipboard?.writeText(text).catch(() => {});
    onCopy?.(text);
    setDone(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setDone(false), 1600);
  };

  useEffect(() => () => clearTimeout(timer.current), []);

  return [done, handleClick];
}

export function CopyBtn({text, onCopy, copied, title = 'Copy', style}) {
  const [local, handleClick] = useCopyState(text, onCopy);
  const done = copied || local;
  return (
    <button class={cx('copy-btn', done && 'done')} title={title} type="button" style={style} onClick={handleClick}>
      {done ? <IconCheck size={12} /> : <IconCopy size={12} />}
    </button>
  );
}
