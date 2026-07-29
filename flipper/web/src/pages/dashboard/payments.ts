import { getJson } from '../../utils/api';

export async function checkPendingPaymentsAndReturnTrack(): Promise<string | null> {
  try {
    const data = await getJson('/payment/history');
    const pending = (data.payments || []).filter((p: any) => p.status === 'pending');
    if (pending.length > 0) {
      return pending[0].oxapay_track_id || pending[0].track_id || pending[0].track || null;
    }
  } catch (e) {
    console.debug('checkPendingPayments failed', e);
  }
  return null;
}
