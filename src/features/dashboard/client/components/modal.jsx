import {h} from 'preact';

export function Modal({children, footer, isOpen, onClose, onRefresh, subtitle, title}) {
  if (!isOpen) return null;
  return (
    <div class="modal-overlay" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div class="modal">
        <div class="modal-header">
          <span class="modal-title">{title}</span>
          <span class="modal-subtitle">{subtitle || ''}</span>
          <button class="modal-close" type="button" onClick={onClose}>
            x
          </button>
        </div>
        <div class="modal-body">{children}</div>
        <div class="modal-footer">
          <span class="log-info">{footer || ''}</span>
          {onRefresh ? (
            <button class="btn-refresh-logs" type="button" onClick={onRefresh}>
              Refresh
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
