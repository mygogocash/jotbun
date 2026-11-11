// The Bun Wallet month recap catalogue sections (P2-T32, development only):
// standard recap (bw-recap), recap over budget (bw-recap-over), private mode
// (bw-recap-private), and recap with cashback tips (bw-recap-cashback).
// A section never imports the wallet test harness, which loads vitest.
import type { Minor } from '@gogospend/contracts';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { useWalletColors } from '@mobile/theme/ThemeProvider';
import { BUN_RADIUS, BUN_SPACE } from '@mobile/ui/layout';
import { BunFace } from '@mobile/wallet/looks/BunFace';
import { WalletAmount } from '@mobile/wallet/money/WalletAmount';
import { PRIVATE_MODE_NAME, PrivateModeProvider } from '@mobile/wallet/privacy/PrivateModeProvider';
import type { KeyValueStore } from '@mobile/wallet/store/walletStore';
import { WalletText } from '@mobile/wallet/WalletText';
import { Specimen, SpecimenLabel } from '../parts';
import type { CatalogueSection } from '../registry';

function memoryStore(seed: Readonly<Record<string, string>>): KeyValueStore {
  const kept = new Map(Object.entries(seed));
  return {
    get: async (name) => kept.get(name) ?? null,
    set: async (name, value) => {
      kept.set(name, value);
    },
    remove: async (name) => {
      kept.delete(name);
    },
    eraseAll: async () => {
      kept.clear();
    },
  };
}

function RecapGround({ label, children }: { label: string; children: ReactNode }) {
  const colors = useWalletColors();
  return (
    <View style={{ backgroundColor: colors.ground, borderRadius: BUN_RADIUS.card, padding: BUN_SPACE.md, gap: BUN_SPACE.sm }}>
      <SpecimenLabel>{label}</SpecimenLabel>
      {children}
    </View>
  );
}

function MockRecapCard({
  spentMinor,
  budgetMinor,
  isOver = false,
  biggestDay = '25 ก.ย. วันเงินเดือนออก · ฿2,380',
}: {
  spentMinor: Minor;
  budgetMinor: Minor;
  isOver?: boolean;
  biggestDay?: string;
}) {
  const colors = useWalletColors();
  const spentBig = BigInt(spentMinor);
  const budgetBig = BigInt(budgetMinor);
  const diff = isOver ? spentBig - budgetBig : budgetBig - spentBig;

  return (
    <View style={{ backgroundColor: colors.card, borderRadius: 22, padding: 16, gap: 8 }}>
      <WalletText style={{ fontSize: 13, color: colors.quiet }}>ใช้ไปทั้งเดือน</WalletText>
      <WalletAmount minor={spentMinor} size={36} />
      <View style={{ borderTopWidth: 1, borderTopColor: colors.hairline, marginVertical: 6 }} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <WalletText style={{ color: colors.quiet }}>งบ</WalletText>
        <WalletAmount minor={budgetMinor} size={17} />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <WalletText style={{ color: colors.quiet }}>{isOver ? 'เกิน' : 'เหลือ'}</WalletText>
        <WalletAmount
          minor={String(diff) as Minor}
          size={17}
          tone={isOver ? 'over' : 'under'}
          color={isOver ? undefined : '#1A7F4B'}
        />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <WalletText style={{ color: colors.quiet }}>วันที่ใช้มากสุด</WalletText>
        <WalletText style={{ color: colors.ink }}>{biggestDay}</WalletText>
      </View>
    </View>
  );
}

export const WALLET_RECAP_SECTIONS: readonly CatalogueSection[] = [
  {
    id: 'bw-recap',
    title: 'Bun Wallet: Month recap',
    group: 'Kit',
    render: () => (
      <Specimen label="Bun Wallet: Month recap">
        <RecapGround label="สรุปเดือน ปกติ (ใต้ งบ)">
          <View style={{ alignItems: 'center', gap: 6 }}>
            <BunFace face="happy" size={76} />
            <WalletText style={{ fontSize: 24, fontWeight: '700' }}>สรุปเดือนกันยายน</WalletText>
            <WalletText style={{ fontSize: 15, color: '#6B6878' }}>จดครบ 27 จาก 30 วัน</WalletText>
          </View>
          <MockRecapCard spentMinor="1692000" budgetMinor="1800000" isOver={false} />
        </RecapGround>
      </Specimen>
    ),
  },
  {
    id: 'bw-recap-over',
    title: 'Bun Wallet: Month recap over budget',
    group: 'Kit',
    render: () => (
      <Specimen label="Bun Wallet: Month recap over budget">
        <RecapGround label="สรุปเดือน เกินงบ">
          <MockRecapCard spentMinor="2140000" budgetMinor="1800000" isOver={true} />
        </RecapGround>
      </Specimen>
    ),
  },
  {
    id: 'bw-recap-private',
    title: 'Bun Wallet: Month recap private',
    group: 'Kit',
    render: () => (
      <Specimen label="Bun Wallet: Month recap private">
        <PrivateModeProvider store={memoryStore({ [PRIVATE_MODE_NAME]: '1' })}>
          <RecapGround label="สรุปเดือน ใน Private Mode (ซ่อนตัวเลขทั้งหมด)">
            <MockRecapCard spentMinor="1692000" budgetMinor="1800000" />
          </RecapGround>
        </PrivateModeProvider>
      </Specimen>
    ),
  },
  {
    id: 'bw-recap-cashback',
    title: 'Bun Wallet: Month recap cashback',
    group: 'Kit',
    render: () => (
      <Specimen label="Bun Wallet: Month recap cashback">
        <RecapGround label="สรุปเดือน มีการ์ดเงินคืน GoGoCash">
          <View style={{ backgroundColor: '#111014', borderRadius: 20, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#2A2830', alignItems: 'center', justifyContent: 'center' }}>
              <WalletText style={{ color: '#FFFFFF', fontSize: 16 }}>✦</WalletText>
            </View>
            <View style={{ flex: 1 }}>
              <WalletText style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '700' }}>14 รายการเดือนนี้ อาจได้เงินคืนผ่าน GoGoCash</WalletText>
              <WalletText style={{ color: '#C9C6D4', fontSize: 12 }}>จาก Shopee และ Lazada · GoGoCash เป็นบริการในเครือ</WalletText>
            </View>
          </View>
        </RecapGround>
      </Specimen>
    ),
  },
];
