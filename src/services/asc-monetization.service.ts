import { run } from '../utils/exec.js';
import { logger } from '../utils/logger.js';
import type {
  AppStorePricingConfig,
  AppStoreSubscriptionGroup,
  AppStoreSubscription,
  AppStoreAvailability,
} from '../types/appstore.js';

export async function createPricing(appId: string, pricing: AppStorePricingConfig): Promise<void> {
  const isFree = !pricing.price || pricing.price === '0';
  const targetPrice = isFree ? '0' : pricing.price;
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  // v1.x `asc pricing schedule create` only accepts --price-point (no --price),
  // so resolve a price-point ID that matches the target customer price first.
  const pricePoint = await findPricePointForPrice(appId, pricing.base_territory, targetPrice);
  if (!pricePoint) {
    const label = isFree ? 'free price point' : `price point for $${targetPrice}`;
    logger.warn(`Could not find a ${label} in ${pricing.base_territory}. Skipping price schedule.`);
    return;
  }

  const args = [
    'pricing', 'schedule', 'create',
    '--app', appId,
    '--base-territory', pricing.base_territory,
    '--start-date', today,
    '--price-point', pricePoint,
    '--output', 'json',
  ];
  const label = isFree ? 'Setting pricing (free)' : `Setting pricing ($${pricing.price})`;
  await run('asc', args, { label, allowFailure: true });

  // Set availability
  if (pricing.availability) {
    let territories = pricing.availability.territories;
    if (pricing.availability.include_all && territories.length === 0) {
      territories = await fetchAllTerritories();
    }
    if (territories.length > 0) {
      await setAppAvailability(appId, pricing.availability.available_in_new_territories, territories);
    }
  }
}

/**
 * Find a price-point ID in the given territory whose customer price matches the target.
 * Matching is tolerant of trailing-zero formatting ("6.99", "6.990", "0.00", "0").
 * Returns null if no exact numeric match is found.
 */
async function findPricePointForPrice(
  appId: string,
  territory: string,
  targetPrice: string,
): Promise<string | null> {
  const result = await run(
    'asc',
    ['pricing', 'price-points', '--app', appId, '--territory', territory, '--output', 'json'],
    { label: `Looking up price point for ${targetPrice === '0' ? 'free tier' : `$${targetPrice}`}`, allowFailure: true },
  );

  if (result.exitCode !== 0 || !result.stdout) return null;

  let points: Array<{ id?: string; attributes?: { customerPrice?: string }; customerPrice?: string }> = [];
  try {
    const data = JSON.parse(result.stdout);
    points = data?.data ?? data ?? [];
  } catch {
    return null;
  }

  const target = Number(targetPrice);
  if (!Number.isFinite(target)) return null;

  for (const p of points) {
    const attrs = p.attributes ?? p;
    const raw = attrs.customerPrice;
    if (raw === undefined || raw === null) continue;
    const num = Number(raw);
    if (Number.isFinite(num) && num === target) {
      return p.id ?? null;
    }
  }
  return null;
}

async function setAppAvailability(appId: string, availableInNew: boolean, territories: string[]): Promise<void> {
  // Use asc app-setup availability set — needs ASC_TIMEOUT for 175 territories
  await run('asc', [
    'app-setup', 'availability', 'set',
    '--app', appId,
    '--territory', territories.join(','),
    '--available', 'true',
    '--available-in-new-territories', String(availableInNew),
    '--output', 'json',
  ], {
    label: `Setting app availability (${territories.length} territories)`,
    allowFailure: true,
    timeout: 3 * 60_000,
    env: { ASC_TIMEOUT: '180s' },
  });
}

async function fetchAllTerritories(): Promise<string[]> {
  const result = await run(
    'asc',
    ['pricing', 'territories', 'list', '--output', 'json', '--paginate'],
    { label: 'Fetching all territories', allowFailure: true },
  );

  if (result.exitCode === 0 && result.stdout) {
    try {
      const data = JSON.parse(result.stdout);
      const territories = Array.isArray(data) ? data : (data?.data ?? []);
      return territories.map((t: { id?: string }) => t.id).filter(Boolean);
    } catch {
      // Fall through
    }
  }
  return [];
}

export async function setupSubscriptions(
  appId: string,
  group: AppStoreSubscriptionGroup,
  availability?: AppStoreAvailability,
): Promise<void> {
  let groupId = await findGroupByName(appId, group.reference_name);

  // Resolve territories for subscription availability
  let territories: string[] = [];
  if (availability) {
    territories = availability.territories;
    if (availability.include_all && territories.length === 0) {
      territories = await fetchAllTerritories();
    }
  }

  for (const sub of group.subscriptions) {
    await setupSubscription(appId, group.reference_name, groupId, sub, territories);
    // After first subscription creates the group, fetch its ID for subsequent ones
    if (!groupId) {
      groupId = await findGroupByName(appId, group.reference_name);
    }
  }

  // Set group localizations (setup command doesn't handle these)
  if (group.localizations && group.localizations.length > 0) {
    // Re-fetch group ID if it was just created
    if (!groupId) {
      groupId = await findGroupByName(appId, group.reference_name);
    }
    if (groupId) {
      for (const loc of group.localizations) {
        const args = [
          'subscriptions', 'groups', 'localizations', 'create',
          '--group-id', groupId,
          '--locale', loc.locale,
          '--name', loc.name,
        ];
        if (loc.custom_app_name) args.push('--custom-app-name', loc.custom_app_name);
        args.push('--output', 'json');
        await run('asc', args, {
          label: `Setting group localization (${loc.locale})`,
          allowFailure: true,
        });
      }
    }
  }
}

async function setupSubscription(
  appId: string,
  groupReferenceName: string,
  existingGroupId: string | null,
  sub: AppStoreSubscription,
  territories: string[],
): Promise<void> {
  const args = ['subscriptions', 'setup', '--app', appId];

  if (existingGroupId) {
    args.push('--group-id', existingGroupId);
  } else {
    args.push('--group-reference-name', groupReferenceName);
  }

  args.push(
    '--reference-name', sub.ref_name,
    '--product-id', sub.product_id,
    '--subscription-period', sub.subscription_period,
  );

  if (sub.family_sharable) args.push('--family-sharable');

  const loc = sub.localizations[0];
  if (loc) {
    args.push('--locale', loc.locale);
    args.push('--display-name', loc.name);
    if (loc.description) args.push('--description', loc.description);
  }

  const price = sub.prices[0];
  if (price) {
    if (price.price) {
      args.push('--price', price.price);
    } else if (price.tier) {
      args.push('--tier', price.tier);
    }
    args.push('--price-territory', price.territory);
  }

  if (territories.length > 0) {
    args.push('--territories', territories.join(','));
    args.push('--available-in-new-territories');
  }

  args.push('--output', 'json');

  const result = await run('asc', args, {
    label: `Setting up subscription: ${sub.ref_name}`,
    allowFailure: true,
  });

  if (result.exitCode !== 0) {
    if (result.stdout.includes('already been used') || result.stderr.includes('already been used')) {
      logger.info(`Subscription "${sub.ref_name}" (${sub.product_id}) already exists, skipping.`);
    } else {
      const errMsg = result.stderr || result.stdout;
      logger.warn(`Could not create subscription "${sub.ref_name}": ${errMsg.slice(0, 150)}`);
    }
    return;
  }

  // Equalize pricing across all territories
  const basePrice = sub.prices[0];
  if (basePrice?.price) {
    let subscriptionId: string | null = null;
    try {
      const data = JSON.parse(result.stdout);
      subscriptionId = data?.subscriptionId ?? null;
    } catch {
      // Fall through
    }
    if (subscriptionId) {
      await run('asc', [
        'subscriptions', 'pricing', 'equalize',
        '--subscription-id', subscriptionId,
        '--base-price', basePrice.price,
        '--base-territory', basePrice.territory,
        '--confirm',
        '--output', 'json',
      ], {
        label: `Equalizing prices for ${sub.ref_name} ($${basePrice.price} base)`,
        allowFailure: true,
        timeout: 2 * 60_000,
      });
    }
  }
}

async function findGroupByName(appId: string, referenceName: string): Promise<string | null> {
  const result = await run(
    'asc',
    ['subscriptions', 'groups', 'list', '--app', appId, '--output', 'json'],
    { label: 'Looking up existing subscription groups', allowFailure: true },
  );

  if (result.exitCode === 0 && result.stdout) {
    try {
      const data = JSON.parse(result.stdout);
      const groups = data?.data ?? data ?? [];
      for (const g of groups) {
        const attrs = g.attributes ?? g;
        if (attrs.referenceName === referenceName || attrs.reference_name === referenceName) {
          return g.id;
        }
      }
    } catch {
      // Fall through
    }
  }
  return null;
}
