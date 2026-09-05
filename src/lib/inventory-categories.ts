import type {
  BuiltInInventoryCategory,
  InventoryCategory,
  InventoryCategoryDefinition
} from '$lib/types';

export const BUILT_IN_INVENTORY_CATEGORIES: InventoryCategoryDefinition[] = [
  { value: 'action_figures', label: 'Action Figures', prefix: 'AFG' },
  { value: 'baseball_cards', label: 'Sports Cards', prefix: 'SPC' },
  { value: 'electronics', label: 'Electronics', prefix: 'ELC' },
  { value: 'movies', label: 'Movies & Media', prefix: 'MOV' },
  { value: 'video_games', label: 'Video Games', prefix: 'VGM' },
  { value: 'trading_cards', label: 'Trading Cards', prefix: 'TCG' },
  { value: 'clothing', label: 'Clothing & Apparel', prefix: 'APP' },
  { value: 'toys_games', label: 'Toys & Games', prefix: 'TOY' },
  { value: 'collectibles', label: 'Collectibles & Memorabilia', prefix: 'COL' },
  { value: 'home_bar_kitchen', label: 'Home, Bar & Kitchen', prefix: 'HBK' },
  { value: 'books_print', label: 'Books & Print', prefix: 'BKS' },
  { value: 'tools_hardware', label: 'Tools & Hardware', prefix: 'TLH' },
  { value: 'other', label: 'Other', prefix: 'OTH' }
];

const BUILT_IN_BY_VALUE = new Map(
  BUILT_IN_INVENTORY_CATEGORIES.map((category) => [category.value, category] as const)
);

export function builtInInventoryCategory(
  value: string
): InventoryCategoryDefinition | null {
  return BUILT_IN_BY_VALUE.get(value as BuiltInInventoryCategory) ?? null;
}

export function isBuiltInInventoryCategory(value: string) {
  return BUILT_IN_BY_VALUE.has(value as BuiltInInventoryCategory);
}

export function categoryLabelFallback(value: InventoryCategory) {
  return builtInInventoryCategory(value)?.label ?? value.replace(/^custom_/, 'Custom category ');
}
