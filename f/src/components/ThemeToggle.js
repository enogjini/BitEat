import React from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';
import { useTheme } from '../theme/ThemeProvider';

const CONFIG = {
  light: { Icon: Sun, label: 'E çelët', next: 'e errët' },
  dark: { Icon: Moon, label: 'E errët', next: 'sistemi' },
  system: { Icon: Monitor, label: 'Sistemi', next: 'e çelët' },
};

/**
 * Cycles light -> dark -> system. `variant="onColor"` is for placing the
 * button on the orange/red brand gradient, where the normal surface styling
 * would disappear.
 */
export default function ThemeToggle({ variant = 'default', className = '' }) {
  const { mode, cycleMode } = useTheme();
  const { Icon, label, next } = CONFIG[mode] ?? CONFIG.system;

  const base =
    'flex items-center gap-2 px-3 py-2 rounded-xl font-bold transition-colors ' +
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2';

  const skin =
    variant === 'onColor'
      ? 'bg-white/20 text-white hover:bg-white/30 focus-visible:ring-offset-transparent'
      : 'bg-muted text-ink-muted hover:text-ink focus-visible:ring-offset-canvas';

  return (
    <button
      type="button"
      onClick={cycleMode}
      className={`${base} ${skin} ${className}`}
      title={`Tema: ${label} — kliko për ${next}`}
      aria-label={`Tema: ${label}. Kliko për të kaluar te ${next}.`}
    >
      <Icon size={18} aria-hidden="true" />
      <span className="text-sm hidden sm:inline">{label}</span>
    </button>
  );
}
