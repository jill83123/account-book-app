import { defineComponent, h, type Component } from 'vue'
import {
  Archive as LArchive,
  ArrowLeftRight as LArrowLeftRight,
  Bell as LBell,
  BellRing as LBellRing,
  BookMarked as LBookMarked,
  Calculator as LCalculator,
  CalendarClock as LCalendarClock,
  Clock as LClock,
  Coins as LCoins,
  CalendarDays as LCalendarDays,
  Camera as LCamera,
  ChartNoAxesColumn as LChartNoAxesColumn,
  Check as LCheck,
  ChevronDown as LChevronDown,
  ChevronUp as LChevronUp,
  ChevronLeft as LChevronLeft,
  ChevronRight as LChevronRight,
  ClipboardPaste as LClipboardPaste,
  Cloud as LCloud,
  CloudCheck as LCloudCheck,
  CloudOff as LCloudOff,
  Copy as LCopy,
  CreditCard as LCreditCard,
  Delete as LDelete,
  Download as LDownload,
  ExternalLink as LExternalLink,
  Eye as LEye,
  EyeOff as LEyeOff,
  GripVertical as LGripVertical,
  HandCoins as LHandCoins,
  Hourglass as LHourglass,
  ImagePlus as LImagePlus,
  Layers as LLayers,
  LoaderCircle as LLoaderCircle,
  LogIn as LLogIn,
  LogOut as LLogOut,
  Pencil as LPencil,
  PencilLine as LPencilLine,
  Inbox as LInbox,
  Minus as LMinus,
  Plus as LPlus,
  RefreshCw as LRefreshCw,
  Repeat as LRepeat,
  ScanLine as LScanLine,
  Search as LSearch,
  Settings2 as LSettings2,
  Star as LStar,
  SlidersHorizontal as LSlidersHorizontal,
  Store as LStore,
  TableProperties as LTableProperties,
  Trash2 as LTrash2,
  Upload as LUpload,
  Scale as LScale,
  Users as LUsers,
  Wallet as LWallet,
  WalletCards as LWalletCards,
  X as LX,
  Palette as LPalette,
  RotateCcw as LRotateCcw,
  DatabaseBackup as LDatabaseBackup,
  Info as LInfo,
  Sun as LSun,
  Moon as LMoon,
  MonitorSmartphone as LMonitorSmartphone,
  ListChecks as LListChecks,
  Circle as LCircle,
  CircleCheck as LCircleCheck,
  Tag as LTag,
  Sparkles as LSparkles,
  History as LHistory,
  Pin as LPin,
} from '@lucide/vue'

/**
 * Interface icons are lucide line icons, a little heavier than the thin look it had at first.
 * Category and account tiles use Font Awesome instead (see icons.ts).
 */
const light = (icon: Component, name: string) =>
  defineComponent({
    name,
    inheritAttrs: false,
    props: {
      size: { type: [Number, String], default: 24 },
      strokeWidth: { type: [Number, String], default: 2.1 },
    },
    setup(props, { attrs }) {
      return () => h(icon, { ...attrs, size: props.size, strokeWidth: props.strokeWidth })
    },
  })

export const ArrowLeftRight = light(LArrowLeftRight, 'ArrowLeftRight')
export const Bell = light(LBell, 'Bell')
export const BellRing = light(LBellRing, 'BellRing')
export const BookMarked = light(LBookMarked, 'BookMarked')
export const Calculator = light(LCalculator, 'Calculator')
export const CalendarClock = light(LCalendarClock, 'CalendarClock')
export const Clock = light(LClock, 'Clock')
export const CalendarDays = light(LCalendarDays, 'CalendarDays')
export const Camera = light(LCamera, 'Camera')
export const ChartNoAxesColumn = light(LChartNoAxesColumn, 'ChartNoAxesColumn')
export const Check = light(LCheck, 'Check')
export const ChevronDown = light(LChevronDown, 'ChevronDown')
export const ChevronUp = light(LChevronUp, 'ChevronUp')
export const Archive = light(LArchive, 'Archive')
export const ChevronLeft = light(LChevronLeft, 'ChevronLeft')
export const ChevronRight = light(LChevronRight, 'ChevronRight')
export const ClipboardPaste = light(LClipboardPaste, 'ClipboardPaste')
export const Cloud = light(LCloud, 'Cloud')
export const CloudCheck = light(LCloudCheck, 'CloudCheck')
export const CloudOff = light(LCloudOff, 'CloudOff')
export const Copy = light(LCopy, 'Copy')
export const CreditCard = light(LCreditCard, 'CreditCard')
export const Delete = light(LDelete, 'Delete')
export const Download = light(LDownload, 'Download')
export const ExternalLink = light(LExternalLink, 'ExternalLink')
export const Eye = light(LEye, 'Eye')
export const EyeOff = light(LEyeOff, 'EyeOff')
export const GripVertical = light(LGripVertical, 'GripVertical')
export const Coins = light(LCoins, 'Coins')
export const HandCoins = light(LHandCoins, 'HandCoins')
export const Hourglass = light(LHourglass, 'Hourglass')
export const ImagePlus = light(LImagePlus, 'ImagePlus')
export const Layers = light(LLayers, 'Layers')
export const LoaderCircle = light(LLoaderCircle, 'LoaderCircle')
export const LogIn = light(LLogIn, 'LogIn')
export const LogOut = light(LLogOut, 'LogOut')
export const Pencil = light(LPencil, 'Pencil')
export const PencilLine = light(LPencilLine, 'PencilLine')
export const Inbox = light(LInbox, 'Inbox')
export const Minus = light(LMinus, 'Minus')
export const Plus = light(LPlus, 'Plus')
export const RefreshCw = light(LRefreshCw, 'RefreshCw')
export const Repeat = light(LRepeat, 'Repeat')
export const ScanLine = light(LScanLine, 'ScanLine')
export const Search = light(LSearch, 'Search')
export const Settings2 = light(LSettings2, 'Settings2')
export const Star = light(LStar, 'Star')
export const Store = light(LStore, 'Store')
export const TableProperties = light(LTableProperties, 'TableProperties')
export const Trash2 = light(LTrash2, 'Trash2')
export const Upload = light(LUpload, 'Upload')
export const Wallet = light(LWallet, 'Wallet')
export const Scale = light(LScale, 'Scale')
export const Users = light(LUsers, 'Users')
export const X = light(LX, 'X')
export const RotateCcw = light(LRotateCcw, 'RotateCcw')
export const Palette = light(LPalette, 'Palette')
export const DatabaseBackup = light(LDatabaseBackup, 'DatabaseBackup')
export const Info = light(LInfo, 'Info')
export const Sun = light(LSun, 'Sun')
export const Moon = light(LMoon, 'Moon')
export const MonitorSmartphone = light(LMonitorSmartphone, 'MonitorSmartphone')
export const ListChecks = light(LListChecks, 'ListChecks')
export const Circle = light(LCircle, 'Circle')
export const CircleCheck = light(LCircleCheck, 'CircleCheck')
export const Tag = light(LTag, 'Tag')
export const Sparkles = light(LSparkles, 'Sparkles')
export const History = light(LHistory, 'History')
export const Pin = light(LPin, 'Pin')

// bottom navigation
export const NavBills = light(LWalletCards, 'NavBills')
export const NavAssets = light(LWallet, 'NavAssets')
export const NavStats = light(LChartNoAxesColumn, 'NavStats')
export const NavMore = light(LSlidersHorizontal, 'NavMore')
