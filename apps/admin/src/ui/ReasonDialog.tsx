import { useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { call } from '../api';
import { useLang, useT } from '../i18n';
import { apiMessage } from '../lib/errors';
import { CANCEL_REASONS_KEY } from '../lib/keys';
import { Button } from './Button';
import { Dialog } from './Dialog';
import { Notice } from './Notice';
import { SelectField } from './SelectField';

/** Asks for a reason from the list and, where the reason needs it, the words (cancel and reject). */
export function ReasonDialog({
  title,
  submitLabel,
  intro,
  pending,
  error,
  onSubmit,
  onClose,
}: {
  title: string;
  submitLabel: string;
  intro?: ReactNode;
  pending: boolean;
  error: unknown;
  onSubmit: (value: { reasonId: string; note: string | null }) => void;
  onClose: () => void;
}) {
  const t = useT();
  const lang = useLang();
  const [reasonId, setReasonId] = useState('');
  const [note, setNote] = useState('');
  const reasons = useQuery({
    queryKey: CANCEL_REASONS_KEY,
    queryFn: () => call('admin.cancelReasons'),
    staleTime: 5 * 60_000,
  });
  const reason = reasons.data?.items.find((item) => item.id === reasonId);
  const needsNote = reason?.requiresText === true;
  const ready = reason !== undefined && (!needsNote || note.trim() !== '');

  return (
    <Dialog title={title} onClose={onClose}>
      <form
        className="form-stack"
        onSubmit={(event) => {
          event.preventDefault();
          if (ready) onSubmit({ reasonId, note: note.trim() || null });
        }}
      >
        {intro}
        <SelectField
          label={t.orders.reject.reason}
          value={reasonId}
          onChange={(event) => setReasonId(event.target.value)}
        >
          <option value="">{t.orders.reject.chooseReason}</option>
          {reasons.data?.items.map((item) => (
            <option key={item.id} value={item.id}>
              {lang === 'ru' ? item.nameRu : item.nameUz}
            </option>
          ))}
        </SelectField>
        <div className="field">
          <label className="field__label" htmlFor="reason-note">
            {t.orders.reject.note}
          </label>
          <textarea
            id="reason-note"
            className="field__input field__input--area"
            rows={3}
            maxLength={500}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
          {needsNote && <span className="field__hint">{t.orders.reject.noteRequired}</span>}
        </div>
        {error !== null && error !== undefined && (
          <Notice tone="danger">{apiMessage(error, t)}</Notice>
        )}
        <div className="dialog__actions">
          <Button variant="secondary" onClick={onClose}>
            {t.form.cancel}
          </Button>
          <Button type="submit" busy={pending} disabled={!ready}>
            {submitLabel}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
