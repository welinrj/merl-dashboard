// icons.jsx — the portal's single icon vocabulary, sourced from Iconsax
// (iconsax.io) via the `iconsax-reactjs` package.
//
// WHY THIS MODULE EXISTS
// Iconsax's own export names describe its catalogue, not our intent — `Sms` is
// the email glyph, `Danger` the warning triangle, `Edit2` the pencil, `Add` the
// plus. Importing those names directly into twelve files would make every call
// site harder to read than it needs to be, and would scatter the library choice
// across the app. Everything here re-exports under the name of the glyph as it
// is actually used, so screens read plainly and there is exactly one file to
// touch if the icon set is ever changed again.
//
// HOUSE RULES
//  · Variant is always Linear — the stroke-outline style, 1.5 stroke on a 24px
//    grid. It is `iconsax-reactjs`'s default, so no call site passes `variant`.
//    The filled styles (Outline, Bold, Bulk) and the decorative ones (TwoTone,
//    Broken) are deliberately unused: this is an institutional reporting system.
//  · Stroke inherits `currentColor`, so existing CSS colour rules keep working
//    and no call site needs a `color` prop.
//  · Sizes stay on the 14-18px scale set by the earlier icon audit.
//  · Icons are functional only — an action, a state, a direction or a
//    navigation affordance. Nothing here exists to decorate a heading or a KPI.
//    Beneficiary pictograms are a separate, deliberate exception; see Gedsi.jsx.
import {
  // ── Sidebar navigation ──────────────────────────────────────────────────
  Category as LayoutDashboard,   // Overview
  Folder2 as FolderKanban,       // Projects
  Hierarchy as Target,           // Results Framework — objective → outcome → output
  Activity,                      // Indicators
  Task as ListChecks,            // Activities & Workplan
  Wallet2 as Wallet,             // Finances
  Location as MapPin,            // Locations
  Danger as AlertTriangle,       // Risks & Issues, and every warning in the app
  Chart2 as FileBarChart,        // Reports
  ClipboardTick as ClipboardCheck, // Review & Approval
  FolderOpen,                    // Documents & Evidence
  Setting2 as Settings,          // Administration

  // ── App chrome ──────────────────────────────────────────────────────────
  Logout as LogOut,
  HamburgerMenu as Menu,
  Notification as Bell,
  SearchNormal1 as Search,

  // ── Login ───────────────────────────────────────────────────────────────
  Sms as Mail,
  Lock,
  Eye,
  EyeSlash as EyeOff,
  Warning2 as AlertCircle,       // sign-in error
  ShieldTick as ShieldCheck,     // "secure access" note

  // ── Record actions ──────────────────────────────────────────────────────
  Add as Plus,
  Edit2 as Pencil,
  Trash as Trash2,
  Send2 as Send,
  Printer,
  DocumentDownload as Download,
  DocumentText as FileText,
  Refresh2 as RotateCcw,         // reset filters, return for correction, reopen
  Unlock,

  // ── State ───────────────────────────────────────────────────────────────
  TickCircle as CheckCircle2,    // approved / step complete / section has data
  InfoCircle as Info,            // contextual help

  // ── Direction ───────────────────────────────────────────────────────────
  ArrowRight,
  ArrowLeft,
  ArrowUp,                       // table sort ascending
  ArrowDown,                     // table sort descending
  ArrowLeft2 as ChevronLeft,     // pagination
  ArrowRight2 as ChevronRight,   // pagination, tree expand
  ArrowDown2 as ChevronDown,     // tree collapse
  LanguageSquare as Languages,   // the record's other language
} from 'iconsax-reactjs';

export {
  LayoutDashboard, FolderKanban, Target, Activity, ListChecks, Wallet, MapPin,
  AlertTriangle, FileBarChart, ClipboardCheck, FolderOpen, Settings,
  LogOut, Menu, Bell, Search,
  Mail, Lock, Eye, EyeOff, AlertCircle, ShieldCheck,
  Plus, Pencil, Trash2, Send, Printer, Download, FileText, RotateCcw, Unlock,
  CheckCircle2, Info, Languages,
  ArrowRight, ArrowLeft, ArrowUp, ArrowDown, ChevronLeft, ChevronRight, ChevronDown,
};

/**
 * X / close.
 *
 * Iconsax has no bare cross — only `CloseCircle` and `CloseSquare`, both of
 * which enclose the X in a container. Those read as muddy blobs at the 12-14px
 * we use for a filter-chip clear or a dialog close, and the container competes
 * with the round icon-buttons they sit inside. Rotating the plus 45° gives a
 * true ✕ drawn on the same grid, at the same 1.5 stroke, with the same round
 * caps — so it belongs to the family exactly, and stays crisp at any size.
 */
export function X({ size = 16, style, ...rest }) {
  return <Plus size={size} style={{ transform: 'rotate(45deg)', ...style }} {...rest} />;
}

/**
 * Bare tick.
 *
 * Iconsax's ticks are all enclosed (`TickCircle`, `TickSquare`). Where the
 * surrounding markup already draws its own circle, use this to avoid a
 * circle inside a circle — it is the tick path from `TickCircle`, on the same
 * 24px grid and 1.5 stroke, with the enclosing ring dropped.
 */
export function Check({ size = 16, ...rest }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size}
      viewBox="0 0 24 24" fill="none" {...rest}>
      <path d="m4.5 12.75 5.25 5.25 9.75-11.25" stroke="currentColor"
        strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
