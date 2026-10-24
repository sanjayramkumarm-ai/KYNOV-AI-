import { useState, type ReactNode } from 'react';
import { Modal } from './Modal';
import { Spinner } from './Spinner';

interface Props {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  requireText?: string;
  onConfirm: () => Promise<void> | void;
  onClose: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive,
  requireText,
  onConfirm,
  onClose,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState('');

  const blocked = Boolean(requireText) && text.trim() !== requireText;

  const handle = async () => {
    if (blocked) return;
    setBusy(true);
    try {
      await onConfirm();
      setText('');
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => !busy && onClose()}
      title={title}
      size="sm"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={destructive ? 'btn-danger' : 'btn-primary'}
            onClick={handle}
            disabled={busy || blocked}
          >
            {busy && <Spinner className="h-3.5 w-3.5" />}
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="space-y-3 text-sm text-muted">
        <div>{message}</div>
        {requireText && (
          <div>
            <p className="mb-1.5 text-xs">
              Type <span className="font-mono text-content">{requireText}</span> to continue.
            </p>
            <input
              className="input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={requireText}
              aria-label={`Type ${requireText} to confirm`}
            />
          </div>
        )}
      </div>
    </Modal>
  );
}
