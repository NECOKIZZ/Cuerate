import { ArrowLeft, Copy, Download, Upload, WalletCards } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../../lib/auth-context';
import { useBackendQuery } from '../../lib/useBackendQuery';
import { walletApi, type CircleWalletSummary } from '../../lib/wallet';

function shortenAddress(address?: string) {
  if (!address) {
    return 'Pending';
  }

  if (address.length <= 18) {
    return address;
  }

  return `${address.slice(0, 10)}...${address.slice(-6)}`;
}

function formatUsdcBalance(value?: string) {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) {
    return value ?? '0';
  }

  return amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  });
}

const emptyWallet: CircleWalletSummary = {
  walletReady: false,
  usdcBalance: '0',
  lockedBalance: '0',
  availableBalance: '0',
  tokenBalances: [],
};

export function Wallet() {
  const navigate = useNavigate();
  const { user, isLoading: authIsLoading } = useAuth();
  const [copied, setCopied] = useState(false);
  const { data: wallet, error, isLoading } = useBackendQuery(
    () => (user ? walletApi.getCircleWalletStatus() : Promise.resolve(emptyWallet)),
    emptyWallet,
    [user?.uid],
  );
  const [liveWallet, setLiveWallet] = useState<CircleWalletSummary | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const displayWallet = liveWallet ?? wallet;

  useEffect(() => {
    let mounted = true;

    if (!user || !wallet.walletReady) {
      setLiveWallet(null);
      return;
    }

    setRefreshError(null);
    void walletApi.refreshCircleWalletBalance()
      .then((freshWallet) => {
        if (mounted) {
          setLiveWallet(freshWallet);
        }
      })
      .catch((refreshFailure) => {
        if (mounted) {
          setRefreshError(
            refreshFailure instanceof Error ? refreshFailure.message : 'Could not refresh wallet balance.',
          );
        }
      });

    return () => {
      mounted = false;
    };
  }, [user?.uid, wallet.walletReady, wallet.walletId]);

  const isPending = authIsLoading || isLoading || !displayWallet.walletReady;

  const handleDeposit = async () => {
    if (!displayWallet.walletAddress) {
      return;
    }

    try {
      await navigator.clipboard.writeText(displayWallet.walletAddress);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const handleWithdraw = () => {
    window.alert('Withdrawals are coming next.');
  };

  return (
    <div className="min-h-screen pb-8">
      <div className="sticky top-0 z-40 glass-nav border-b border-[var(--cuerate-text-3)]">
        <div className="flex items-center gap-3 px-4 py-4 md:px-8 md:py-6">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-full hover:bg-[var(--cuerate-surface)] transition-colors"
            aria-label="Go back"
          >
            <ArrowLeft className="w-5 h-5 text-[var(--cuerate-text-1)]" />
          </button>
          <h1 className="font-primary font-semibold text-lg md:text-2xl text-[var(--cuerate-text-1)]">
            Wallet
          </h1>
        </div>
      </div>

      <div className="px-4 md:px-8 py-6">
        <div className="max-w-2xl md:mx-auto rounded-[var(--cuerate-r-lg)] glass-surface border border-[var(--cuerate-text-3)] p-6">
          <div className="mb-6 flex items-center gap-3">
            <div className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--cuerate-indigo)]/15">
              <WalletCards className="h-5 w-5 text-[var(--cuerate-indigo)]" />
            </div>
            <div className="min-w-0">
              <p className="font-primary text-xl font-semibold text-[var(--cuerate-text-1)]">
                Cuerate wallet
              </p>
              <p className="font-accent text-sm text-[var(--cuerate-text-2)]">
                {isPending ? 'Preparing your wallet' : displayWallet.blockchain ?? 'Circle'}
              </p>
            </div>
          </div>

          {error && (
            <div className="mb-5 rounded-[var(--cuerate-r-md)] border border-red-500/30 bg-red-500/10 p-4">
              <p className="font-accent text-sm text-red-200">{error}</p>
            </div>
          )}

          {!error && refreshError && (
            <div className="mb-5 rounded-[var(--cuerate-r-md)] border border-[#f5a623]/30 bg-[#f5a623]/10 p-4">
              <p className="font-accent text-sm text-[#ffe1a6]">{refreshError}</p>
            </div>
          )}

          <div className="grid gap-4">
            <div className="rounded-[var(--cuerate-r-md)] border border-[var(--cuerate-text-3)] bg-[var(--cuerate-bg)]/30 p-4">
              <p className="mb-2 font-accent text-xs uppercase tracking-[0.14em] text-[var(--cuerate-text-2)]">
                Available USDC
              </p>
              <p className="font-primary text-3xl font-semibold text-[var(--cuerate-text-1)]">
                {formatUsdcBalance(displayWallet.availableBalance ?? displayWallet.usdcBalance)} USDC
              </p>
              <div className="mt-2 space-y-1">
                <p className="font-accent text-xs text-[var(--cuerate-text-2)]">
                  Total: {formatUsdcBalance(displayWallet.usdcBalance)} USDC
                </p>
                {Number(displayWallet.lockedBalance ?? 0) > 0 && (
                  <p className="font-accent text-xs text-[var(--cuerate-text-2)]">
                    Reserved: {formatUsdcBalance(displayWallet.lockedBalance)} USDC
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-[var(--cuerate-r-md)] border border-[var(--cuerate-text-3)] bg-[var(--cuerate-bg)]/30 p-4">
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="font-accent text-xs uppercase tracking-[0.14em] text-[var(--cuerate-text-2)]">
                  Wallet address
                </p>
                <button
                  onClick={() => void handleDeposit()}
                  disabled={!displayWallet.walletAddress}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--cuerate-text-2)] transition-colors hover:bg-[var(--cuerate-surface)] hover:text-[var(--cuerate-text-1)] disabled:opacity-40"
                  aria-label="Copy wallet address"
                  title="Copy wallet address"
                >
                  <Copy className="h-4 w-4" />
                </button>
              </div>
              <p className="break-all font-accent text-sm leading-6 text-[var(--cuerate-text-1)]" title={displayWallet.walletAddress}>
                {shortenAddress(displayWallet.walletAddress)}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <button
                onClick={() => void handleDeposit()}
                disabled={!displayWallet.walletAddress}
                className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-[var(--cuerate-r-pill)] bg-[var(--cuerate-indigo)] px-4 py-3 font-accent text-sm font-medium text-white indigo-glow transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                <Download className="h-4 w-4" />
                <span>{copied ? 'Address copied' : 'Deposit'}</span>
              </button>

              <button
                onClick={handleWithdraw}
                disabled={!displayWallet.walletReady}
                className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-[var(--cuerate-r-pill)] border border-[var(--cuerate-text-3)] bg-[var(--cuerate-bg)]/30 px-4 py-3 font-accent text-sm font-medium text-[var(--cuerate-text-1)] transition-colors hover:border-[var(--cuerate-indigo)]/40 hover:bg-[var(--cuerate-surface)] disabled:opacity-50"
              >
                <Upload className="h-4 w-4" />
                <span>Withdraw</span>
              </button>
            </div>

            <div className="rounded-[var(--cuerate-r-md)] border border-[var(--cuerate-indigo)]/20 bg-[var(--cuerate-indigo)]/5 p-3">
              <p className="font-accent text-xs text-[var(--cuerate-indigo)]">
                Payments settle automatically every ~5 minutes. No action needed.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
