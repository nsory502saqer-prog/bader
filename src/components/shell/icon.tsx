import {
  HomeIcon,
  PeopleIcon,
  InboxIcon,
  TasklistIcon,
  PackageIcon,
  CreditCardIcon,
  FileBadgeIcon,
  GraphIcon,
  GearIcon,
} from '@primer/octicons-react';
import type { IconName } from './nav-items';

/**
 * Octicons حصريًا، ومقاس 16px داخل النصوص والأزرار.
 * الخريطة هنا تمنع تسرّب أي مكتبة أيقونات أخرى إلى الواجهة.
 */
const ICONS = {
  home: HomeIcon,
  people: PeopleIcon,
  inbox: InboxIcon,
  tasklist: TasklistIcon,
  package: PackageIcon,
  cart: CreditCardIcon,
  receipt: FileBadgeIcon,
  graph: GraphIcon,
  gear: GearIcon,
} as const satisfies Record<IconName, unknown>;

export function NavIcon({ name }: { name: IconName }) {
  const Component = ICONS[name];
  return <Component size={16} className="shrink-0" aria-hidden="true" />;
}
