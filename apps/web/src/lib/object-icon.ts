import {
  Box,
  Briefcase,
  Building2,
  Calendar,
  ClipboardList,
  Contact,
  DollarSign,
  FileText,
  Handshake,
  Mail,
  MapPin,
  Package,
  Phone,
  ShoppingCart,
  Tag,
  Target,
  Ticket,
  Truck,
  Users,
  type LucideIcon,
} from 'lucide-react';

/** Fixed dictionary of icon names an object's `icon` field may reference. Unknown values fall back to Box. */
const ICON_MAP: Record<string, LucideIcon> = {
  box: Box,
  briefcase: Briefcase,
  building: Building2,
  building2: Building2,
  calendar: Calendar,
  clipboard: ClipboardList,
  'clipboard-list': ClipboardList,
  contact: Contact,
  'dollar-sign': DollarSign,
  dollar: DollarSign,
  'file-text': FileText,
  file: FileText,
  handshake: Handshake,
  mail: Mail,
  'map-pin': MapPin,
  map: MapPin,
  package: Package,
  phone: Phone,
  cart: ShoppingCart,
  'shopping-cart': ShoppingCart,
  tag: Tag,
  target: Target,
  ticket: Ticket,
  truck: Truck,
  users: Users,
  user: Users,
};

export function getObjectIcon(icon: string | null | undefined): LucideIcon {
  if (!icon) return Box;
  return ICON_MAP[icon.toLowerCase()] ?? Box;
}
