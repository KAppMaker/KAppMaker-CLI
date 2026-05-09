export interface CreditPackDefault {
  credits: number;
  price: string;
  title: string;
  description: string;
}

export const DEFAULT_CREDIT_PACKS: CreditPackDefault[] = [
  { credits: 10, price: '4.99', title: 'Basic Credit Pack', description: '10 credits to use in the app.' },
  { credits: 30, price: '9.99', title: 'Pro Credit Pack', description: '30 credits to use in the app.' },
  { credits: 80, price: '19.99', title: 'Ultimate Credit Pack', description: '80 credits to use in the app.' },
];

export const CREDITS_PAYWALL_TITLE = 'Credits Paywall';
export const CREDITS_PLACEMENT_TITLE = 'Credits';
export const CREDITS_PLACEMENT_DEVELOPER_ID = 'credits_pack';

export function priceDigits(price: string): string {
  return price.replace('.', '');
}

export function creditPackProductId(credits: number, price: string, appNameLower: string): string {
  return `credit_pack_${credits}_${priceDigits(price)}_${appNameLower}`;
}
