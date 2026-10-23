// The GoGoCash bridge on Insights (premium plan D16): how many of this month's
// purchases were at shops where GoGoCash, Jotbun's sister app, gives cashback.
// See cashbackModel.ts for the rules. "Why am I seeing this?" says plainly
// what is matched, where, and who GoGoCash is; Open GoGoCash carries no data.
import { BUILTIN_CASHBACK_BRANDS, GOGOCASH_HOME } from '@gogospend/contracts';
import type { CashbackCatalogue, TransactionDto } from '@gogospend/contracts';
import { useEffect, useMemo, useState } from 'react';
import { Linking, View } from 'react-native';

import { V1Error } from '@mobile/api/client';
import { useCopy } from '@mobile/i18n/useCopy';
import { playHaptic } from '@mobile/lib/hapticMoment';
import { useAiCompanion } from '@mobile/spend/v1/ai/AiCompanionProvider';
import { cashbackView, countCashbackPurchases } from '@mobile/spend/v1/ai/cashbackModel';
import { BunText } from '@mobile/ui/BunText';
import { OutlinedCard } from '@mobile/ui/Card';
import { BUN_SPACE } from '@mobile/ui/layout';
import { PillButton } from '@mobile/ui/PillButton';
import { PromiseList } from '@mobile/ui/PromiseList';
import { Sheet } from '@mobile/ui/Sheet';

import { readCashbackDeclined, writeCashbackDeclined } from './cashbackDecline';

const BUILTIN: CashbackCatalogue = { source: 'builtin', updated_at: null, home_href: GOGOCASH_HOME, brands: [...BUILTIN_CASHBACK_BRANDS] };

/** The catalogue, or null while the bridge is switched off on the server (404). */
function useCatalogue(): CashbackCatalogue | null {
  const { resources } = useAiCompanion();
  const [catalogue, setCatalogue] = useState<CashbackCatalogue | null>(null);
  useEffect(() => {
    if (!resources) return;
    let active = true;
    resources.cashbackCatalogue().then(
      (read) => { if (active) setCatalogue(read); },
      (error) => { if (active) setCatalogue(error instanceof V1Error && error.outcome === 'not_found' ? null : BUILTIN); },
    );
    return () => { active = false; };
  }, [resources]);
  return catalogue;
}

export function CashbackCard({ records, daysLogged, open = (url: string) => void Linking.openURL(url) }: {
  records: readonly TransactionDto[];
  daysLogged: number;
  /** Opens GoGoCash (tests pass a spy). */
  open?: (url: string) => void;
}) {
  const tc = useCopy();
  const { preferences, update } = useAiCompanion();
  const catalogue = useCatalogue();
  const [declined, setDeclined] = useState<boolean | null>(null);
  const [why, setWhy] = useState(false);
  useEffect(() => {
    let active = true;
    void readCashbackDeclined().then((value) => { if (active) setDeclined(value); });
    return () => { active = false; };
  }, []);

  const counted = useMemo(() => (catalogue ? countCashbackPurchases(records, catalogue.brands) : { count: 0, brands: [] }), [catalogue, records]);
  if (!catalogue || declined === null) return null;
  const view = cashbackView({ tipsOn: preferences ? preferences.cashback_tips : null, declined, daysLogged, count: counted.count });
  if (!view) return null;

  const headline = counted.count === 1
    ? tc('1 purchase this month was at a shop where GoGoCash gives cashback.')
    : tc('{count} purchases this month were at shops where GoGoCash gives cashback.', { count: counted.count });
  const shops = counted.brands.slice(0, 3).map((b) => (b.count > 1 ? `${b.name} ×${b.count}` : b.name)).join(' · ');

  return (
    <OutlinedCard testID="cashback-card">
      <View style={{ gap: BUN_SPACE.xs }}>
        <BunText variant="heading" role="heading" accessibilityRole="header">{tc('Cashback you could get')}</BunText>
        <BunText>{headline}</BunText>
        {shops ? <BunText tone="muted">{shops}</BunText> : null}
        {view === 'ask' ? (
          <>
            <BunText tone="muted">{tc('Want Jotbun to point these out? GoGoCash is our sister app. Nothing from your diary is sent to it.')}</BunText>
            <PillButton label={tc('Show me')} onPress={() => void update({ cashback_tips: true }).then(() => playHaptic('saveLanded'), () => playHaptic('saveFailed'))} />
            <PillButton kind="secondary" label={tc('No thanks')} onPress={() => { setDeclined(true); void writeCashbackDeclined(); }} />
          </>
        ) : (
          <>
            <PillButton label={tc('Open GoGoCash')} accessibilityHint={tc('Opens GoGoCash. Nothing from your diary goes with it.')} onPress={() => open(catalogue.home_href)} />
            <PillButton kind="secondary" label={tc('Why am I seeing this?')} onPress={() => setWhy(true)} />
          </>
        )}
      </View>
      <Sheet visible={why} onClose={() => setWhy(false)} title={tc('Why am I seeing this?')}>
        <PromiseList
          items={[
            { key: 'match', text: tc('Jotbun compares the shop names in your entries with a public list of shops where GoGoCash gives cashback.') },
            { key: 'phone', text: tc('The comparing happens on your phone. Nothing from your diary is sent to GoGoCash or anyone else.') },
            { key: 'who', text: tc('GoGoCash is our sister app. Jotbun shows how many purchases matched, never an amount it would have to guess.') },
            { key: 'off', text: tc('You can turn cashback tips off in Settings.') },
          ]}
        />
      </Sheet>
    </OutlinedCard>
  );
}
