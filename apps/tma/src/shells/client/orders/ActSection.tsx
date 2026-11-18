import type { Order, ReceptionAct } from '@cs/shared';
import { formatAmount, formatDateLong } from '@cs/shared/format';
import { CHECKLIST_ITEMS } from '@cs/shared/vocabulary';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useApi } from '../../../bootstrap';
import { useLang, useT } from '../../../i18n';
import { actKey, errorText, orderKey, useAct } from '../../../lib/client-data';
import { Button } from '../../../ui/Button';
import { BottomBar } from '../../../ui/client-parts';
import { Notice } from '../../../ui/Notice';

/**
 * T6: the act of taking the car in, as the workshop wrote it (docs/PLAN.md, section 9.4): the
 * mileage, the fuel, what is in the car, the defects and the photos. When it has been sent and
 * waits for the client, a button confirms it; the work starts only after that.
 */
export function ActSection({ order }: { order: Order }) {
  const t = useT().client;
  const lang = useLang();
  const api = useApi();
  const queryClient = useQueryClient();
  const seen =
    order.status === 'confirmed' ||
    order.status === 'in_work' ||
    order.status === 'ready_for_pickup' ||
    order.status === 'completed';
  const loaded = useAct(order.id, seen);
  const confirm = useMutation({
    mutationFn: () => api.call('client.confirmAct', { params: { id: order.id } }),
    onSuccess: async (next) => {
      queryClient.setQueryData(actKey(order.id), next);
      await queryClient.invalidateQueries({ queryKey: orderKey(order.id) });
    },
  });

  const act = loaded.data?.act;
  if (!act) return null;
  const a = t.orders.act;
  const via = a.via[act.confirmedVia ?? 'verbal'];
  const when = act.confirmedAt
    ? `${formatDateLong(act.confirmedAt.date, lang)}, ${act.confirmedAt.time}`
    : '';

  return (
    <>
      <div className="card act">
        <h2 className="title">{a.title}</h2>
        <dl className="act__facts">
          <div>
            <dt className="secondary">{a.mileage}</dt>
            <dd className="num">
              {act.mileageKm === null ? '—' : `${formatAmount(act.mileageKm)} km`}
            </dd>
          </div>
          <div>
            <dt className="secondary">{a.fuel}</dt>
            <dd>{act.fuelLevel === null ? '—' : (a.fuelLevels[act.fuelLevel] ?? '')}</dd>
          </div>
        </dl>
        <Checklist act={act} />
        {act.personalItems && (
          <p>
            <span className="secondary">{a.personal}: </span>
            {act.personalItems}
          </p>
        )}
        <h3 className="caption">{a.defects}</h3>
        {act.defects.length === 0 ? (
          <p className="secondary">{a.noDefects}</p>
        ) : (
          <ol className="act__defects">
            {act.defects.map((defect, index) => (
              <li key={defect.id}>
                <span className="act__num">{index + 1}</span>
                <span>
                  {a.kinds[defect.kind]} · {a.views[defect.view]}
                  {defect.note && <span className="secondary">: {defect.note}</span>}
                </span>
                {defect.photo && (
                  <img className="act__thumb" src={defect.photo.url} alt="" loading="lazy" />
                )}
              </li>
            ))}
          </ol>
        )}
        {act.sides.length > 0 && (
          <>
            <h3 className="caption">{a.photos}</h3>
            <div className="act__sides">
              {act.sides.map((photo) => (
                <figure key={photo.mediaId} className="act__side">
                  <img src={photo.url} alt={a.sides[photo.side]} loading="lazy" />
                  <figcaption className="caption">{a.sides[photo.side]}</figcaption>
                </figure>
              ))}
            </div>
          </>
        )}
        {act.status === 'confirmed' && <Notice tone="info">{a.confirmedAt(via, when)}</Notice>}
        {loaded.data?.canConfirm && <Notice tone="warning">{a.ask}</Notice>}
        {confirm.isError && <Notice tone="danger">{errorText(t, confirm.error)}</Notice>}
      </div>
      {loaded.data?.canConfirm && (
        <BottomBar>
          <Button busy={confirm.isPending} onClick={() => confirm.mutate()}>
            {a.confirm}
          </Button>
        </BottomBar>
      )}
    </>
  );
}

function Checklist({ act }: { act: ReceptionAct }) {
  const t = useT().client.orders.act;
  const present = CHECKLIST_ITEMS.filter((item) => act.checklist[item] === true);
  if (present.length === 0) return null;
  return (
    <p>
      <span className="secondary">{t.checklist}: </span>
      {present.map((item) => t.checklistItems[item]).join(', ')}
    </p>
  );
}
