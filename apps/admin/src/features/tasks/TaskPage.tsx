import type { AdminTask } from '@cs/shared';
import { formatDuration } from '@cs/shared/format';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { call } from '../../api';
import { useCan } from '../../auth/session';
import { useLang, useT } from '../../i18n';
import { apiMessage } from '../../lib/errors';
import {
  MASTERS_KEY,
  ORDERS_KEY,
  POLL_MS,
  TASKS_KEY,
  TODAY_KEY,
  orderKey,
  taskKey,
} from '../../lib/keys';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
import { Notice } from '../../ui/Notice';
import { PhotoStrip } from '../../ui/PhotoViewer';
import { PlateChip } from '../../ui/PlateChip';
import { SelectField } from '../../ui/SelectField';
import { TaskChip } from '../../ui/TaskChip';
import './tasks.css';

/** One task and its report (design A3): the photos before and after, the words, the decision. */
export function TaskPage() {
  const t = useT();
  const { id = '' } = useParams();
  const task = useQuery({
    queryKey: taskKey(id),
    queryFn: () => call('admin.task', { params: { id } }),
    refetchInterval: POLL_MS,
  });
  return (
    <section className="task">
      <Link className="back-link" to="/tasks">
        <ArrowLeft size={16} aria-hidden="true" />
        {t.tasks.back}
      </Link>
      {task.isError && <Notice tone="danger">{apiMessage(task.error, t)}</Notice>}
      {task.data && <TaskView task={task.data} />}
    </section>
  );
}

function TaskView({ task }: { task: AdminTask }) {
  const t = useT();
  const lang = useLang();
  const can = useCan();
  const queryClient = useQueryClient();
  const [remark, setRemark] = useState('');
  const [sendingBack, setSendingBack] = useState(false);
  const [reassigning, setReassigning] = useState(false);

  const refresh = async (updated?: AdminTask) => {
    if (updated) queryClient.setQueryData(taskKey(task.id), updated);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: taskKey(task.id) }),
      queryClient.invalidateQueries({ queryKey: TASKS_KEY }),
      queryClient.invalidateQueries({ queryKey: orderKey(task.orderId) }),
      queryClient.invalidateQueries({ queryKey: ORDERS_KEY }),
      queryClient.invalidateQueries({ queryKey: TODAY_KEY }),
    ]);
  };
  const accept = useMutation({
    mutationFn: () => call('admin.acceptTask', { params: { id: task.id } }),
    onSuccess: (updated) => refresh(updated),
    onError: () => refresh(),
  });
  const rework = useMutation({
    mutationFn: () =>
      call('admin.reworkTask', { params: { id: task.id }, body: { remark: remark.trim() } }),
    onSuccess: async (updated) => {
      setSendingBack(false);
      setRemark('');
      await refresh(updated);
    },
    onError: () => refresh(),
  });

  const nameOf = (item: { nameUz: string; nameRu: string }) =>
    lang === 'ru' ? item.nameRu : item.nameUz;
  const when = (instant: { date: string; time: string }) =>
    `${instant.date.slice(8)}.${instant.date.slice(5, 7)} ${instant.time}`;

  return (
    <>
      <header className="task__head">
        <h1 className="page-title">{t.tasks.order(task.orderNumber)}</h1>
        <TaskChip status={task.status} />
        <Link className="table__link" to={`/orders/${task.orderId}`}>
          {t.tasks.openOrder}
        </Link>
      </header>

      <div className="task__grid">
        <div className="task__main">
          {[...task.attempts].reverse().map((attempt) => (
            <section key={attempt.attempt} className="card task__panel">
              <header className="task__attempt">
                <h2 className="section-title">{t.tasks.attempt(attempt.attempt)}</h2>
                {attempt.decision && (
                  <span
                    className={
                      attempt.decision === 'accepted'
                        ? 'chip act-chip--confirmed'
                        : 'chip chip--danger'
                    }
                  >
                    {t.tasks.decision[attempt.decision]}
                  </span>
                )}
                <span className="muted">
                  {attempt.submittedAt
                    ? t.tasks.submitted(when(attempt.submittedAt))
                    : t.tasks.notSubmitted}
                </span>
              </header>
              {(['before', 'after'] as const).map((kind) => (
                <div key={kind} className="task__photos">
                  <h3 className="field__label">{t.tasks[kind]}</h3>
                  <PhotoStrip
                    photos={attempt.photos
                      .filter((photo) => photo.kind === kind)
                      .map((photo, index) => ({
                        ...photo,
                        caption: `${t.tasks[kind]} ${index + 1}`,
                      }))}
                    empty={t.tasks.noPhotos}
                  />
                </div>
              ))}
              <div>
                <h3 className="field__label">{t.tasks.comment}</h3>
                <p>
                  {attempt.comment ? (
                    attempt.comment
                  ) : (
                    <span className="muted">{t.tasks.noComment}</span>
                  )}
                </p>
              </div>
              {attempt.remark && <Notice tone="danger">{attempt.remark}</Notice>}
            </section>
          ))}
        </div>

        <aside className="task__side">
          <section className="card task__panel">
            <dl className="facts">
              <div>
                <dt>{t.tasks.master}</dt>
                <dd>{task.master.fullName}</dd>
              </div>
              {task.assistant && (
                <div>
                  <dt>{t.tasks.assistant}</dt>
                  <dd>{task.assistant.fullName}</dd>
                </div>
              )}
              <div>
                <dt>{t.order.car}</dt>
                <dd className="order__car">
                  {task.car.label} <PlateChip plate={task.car.plate} />
                </dd>
              </div>
              <div>
                <dt>{t.tasks.items}</dt>
                <dd>{task.items.map(nameOf).join(', ')}</dd>
              </div>
              <div>
                <dt>{t.tasks.norm}</dt>
                <dd className="num">{formatDuration(task.normMinutes, lang)}</dd>
              </div>
              {task.instruction && (
                <div>
                  <dt>{t.tasks.instruction}</dt>
                  <dd>{task.instruction}</dd>
                </div>
              )}
            </dl>
            {can('tasks.review') && task.canReassign && (
              <Button variant="secondary" onClick={() => setReassigning(true)}>
                {t.tasks.reassign}
              </Button>
            )}
          </section>

          {can('tasks.review') && task.canAccept && (
            <section className="card task__panel">
              {accept.isError && <Notice tone="danger">{apiMessage(accept.error, t)}</Notice>}
              <Button busy={accept.isPending} onClick={() => accept.mutate()}>
                {t.tasks.accept}
              </Button>
              <Button
                variant="secondary"
                className="btn--danger"
                onClick={() => setSendingBack(true)}
              >
                {t.tasks.rework}
              </Button>
            </section>
          )}
        </aside>
      </div>

      {sendingBack && (
        <Dialog title={t.tasks.rework} onClose={() => setSendingBack(false)}>
          <form
            className="form-stack"
            onSubmit={(event) => {
              event.preventDefault();
              if (remark.trim()) rework.mutate();
            }}
          >
            <div className="field">
              <label className="field__label" htmlFor="remark">
                {t.tasks.remark}
              </label>
              <textarea
                id="remark"
                className="field__input field__input--area"
                rows={4}
                maxLength={1000}
                value={remark}
                onChange={(event) => setRemark(event.target.value)}
              />
              <span className="field__hint">{t.tasks.remarkHint}</span>
            </div>
            {rework.isError && <Notice tone="danger">{apiMessage(rework.error, t)}</Notice>}
            <div className="dialog__actions">
              <Button variant="secondary" onClick={() => setSendingBack(false)}>
                {t.form.cancel}
              </Button>
              <Button type="submit" busy={rework.isPending} disabled={!remark.trim()}>
                {t.tasks.sendBack}
              </Button>
            </div>
          </form>
        </Dialog>
      )}
      {reassigning && (
        <ReassignDialog task={task} onClose={() => setReassigning(false)} onDone={refresh} />
      )}
    </>
  );
}

function ReassignDialog({
  task,
  onClose,
  onDone,
}: {
  task: AdminTask;
  onClose: () => void;
  onDone: (updated: AdminTask) => Promise<void>;
}) {
  const t = useT();
  const masters = useQuery({
    queryKey: MASTERS_KEY,
    queryFn: () => call('admin.masters'),
    staleTime: 60_000,
  });
  const [masterId, setMasterId] = useState('');
  const move = useMutation({
    mutationFn: () => call('admin.updateTask', { params: { id: task.id }, body: { masterId } }),
    onSuccess: async (updated) => {
      await onDone(updated);
      onClose();
    },
  });
  const options = masters.data?.items.filter((master) => master.id !== task.master.id) ?? [];
  return (
    <Dialog title={t.tasks.reassignTitle} onClose={onClose}>
      <form
        className="form-stack"
        onSubmit={(event) => {
          event.preventDefault();
          if (masterId) move.mutate();
        }}
      >
        <SelectField
          label={t.tasks.master}
          value={masterId}
          onChange={(event) => setMasterId(event.target.value)}
        >
          <option value="">{t.work.tasks.dialog.chooseMaster}</option>
          {options.map((master) => (
            <option key={master.id} value={master.id}>
              {master.fullName}
              {master.specialization ? ` · ${master.specialization}` : ''}
            </option>
          ))}
        </SelectField>
        {move.isError && <Notice tone="danger">{apiMessage(move.error, t)}</Notice>}
        <div className="dialog__actions">
          <Button variant="secondary" onClick={onClose}>
            {t.form.cancel}
          </Button>
          <Button type="submit" busy={move.isPending} disabled={!masterId}>
            {t.tasks.reassignSubmit}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
