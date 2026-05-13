import {h} from 'preact';

import {IconX} from '../lib/icons.jsx';

export function ModalFrame({children, maxWidth, onClose, subtitle, title}) {
  return (
    <div class="modal-overlay" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div class="modal" style={{maxWidth, maxHeight: 'none', alignSelf: 'center'}}>
        <div class="modal-header">
          <span class="modal-title">{title}</span>
          <span class="modal-subtitle">{subtitle}</span>
          <button aria-label="Close" class="modal-close" type="button" onClick={onClose}>
            <IconX size={16} />
          </button>
        </div>
        <div class="modal-body">{children}</div>
      </div>
    </div>
  );
}
