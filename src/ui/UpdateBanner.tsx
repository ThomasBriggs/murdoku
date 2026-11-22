import { applyUpdate, dismissUpdate, useUpdateStore } from '../pwa/register';
import styles from './UpdateBanner.module.css';

/** Non-modal notice that a new version is ready; the player chooses when to reload. */
export function UpdateBanner() {
  const show = useUpdateStore((s) => s.needRefresh && !s.dismissed);
  if (!show) return null;
  return (
    <div className={`${styles.banner} print-hide`} role="status" data-testid="update-banner">
      <span className={styles.text}>A new version of Murdoku is available.</span>
      <button
        type="button"
        className={styles.primary}
        data-testid="update-reload"
        onClick={() => void applyUpdate()}
      >
        Reload
      </button>
      <button
        type="button"
        className={styles.later}
        data-testid="update-dismiss"
        onClick={dismissUpdate}
      >
        Later
      </button>
    </div>
  );
}
