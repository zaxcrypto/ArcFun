import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { 
  ChevronDown, 
  AlertTriangle, 
  MoreVertical, 
  Lock, 
  Shield, 
  Globe, 
  Moon, 
  Sun, 
  Copy, 
  Check, 
  ExternalLink, 
  FileText, 
  Coins, 
  Sparkles,
  LayoutDashboard
} from "lucide-react";
import { useAccount } from "wagmi";
import { useTheme } from "next-themes";
import { WalletDropdown, WALLET_CDN, getWalletFallbackIcon } from "./wallet-dropdown";
import { useWallet } from "@solana/wallet-adapter-react";
import { useStellar } from "@/lib/stellar-provider";
import { useSuiWallet } from "@/lib/sui-provider";
import { useEnsProfile } from "@/hooks/use-ens";
import { useEnvironment } from "@/contexts/EnvironmentContext";
import { isAdmin } from "@/lib/admin";

interface HeaderProps {
  admin?: boolean;
  onAdminClick?: () => void;
  activeTab?: string;
  onOpenFaucetHub?: () => void;
  onOpenPrivacyPolicy?: () => void;
  onOpenTermsOfService?: () => void;
  onOpenCookiePolicy?: () => void;
  onOpenRiskDisclosure?: () => void;
  onOpenAcceptableUsePolicy?: () => void;
  variant?: "mobile" | "desktop-card";
}

export function Header({
  admin,
  onAdminClick,
  onOpenFaucetHub,
  onOpenPrivacyPolicy,
  onOpenTermsOfService,
  onOpenCookiePolicy,
  onOpenRiskDisclosure,
  onOpenAcceptableUsePolicy,
  variant = "desktop-card"
}: HeaderProps = {}) {
  const { isConnected, address: evmAddress, connector: activeConnector } = useAccount();
  const { isConnected: stellarConnected, address: stellarAddress } = useStellar();
  const { isConnected: suiConnected, address: suiAddress } = useSuiWallet();
  const solanaWalletHeader = useWallet();
  const solanaConnectedHeader = solanaWalletHeader.connected;

  const { ensName, ensAvatar } = useEnsProfile(isConnected ? evmAddress : undefined);

  // Identity computation for header
  let activeDisplayName = "Connect";
  let activeWalletIcon = WALLET_CDN.ethereum;
  let activeAddressRaw = "";
  const anyConnectedHeader = Boolean(isConnected || evmAddress || solanaConnectedHeader || stellarConnected || suiConnected);

  if (ensName) {
    activeDisplayName = ensName;
    activeAddressRaw = evmAddress || "";
    activeWalletIcon = activeConnector?.icon || getWalletFallbackIcon(activeConnector?.id || "", activeConnector?.name || "") || WALLET_CDN.metamask;
  } else if (evmAddress) {
    activeDisplayName = `${evmAddress.slice(0, 4)}...${evmAddress.slice(-4)}`;
    activeAddressRaw = evmAddress;
    activeWalletIcon = activeConnector?.icon || getWalletFallbackIcon(activeConnector?.id || "", activeConnector?.name || "") || WALLET_CDN.metamask;
  } else if (solanaConnectedHeader && solanaWalletHeader.publicKey) {
    const pk = solanaWalletHeader.publicKey.toBase58();
    activeDisplayName = `${pk.slice(0, 4)}...${pk.slice(-4)}`;
    activeAddressRaw = pk;
    activeWalletIcon = solanaWalletHeader.wallet?.adapter?.icon || WALLET_CDN.phantom || WALLET_CDN.solana;
  } else if (stellarConnected && stellarAddress) {
    activeDisplayName = `${stellarAddress.slice(0, 4)}...${stellarAddress.slice(-4)}`;
    activeAddressRaw = stellarAddress;
    activeWalletIcon = "/icons/stellar.png";
  } else if (suiConnected && suiAddress) {
    activeDisplayName = `${suiAddress.slice(0, 4)}...${suiAddress.slice(-4)}`;
    activeAddressRaw = suiAddress;
    activeWalletIcon = WALLET_CDN.sui;
  }

  // Slide-over wallet drawer state
  const [walletOpen, setWalletOpen] = useState(false);
  const walletBtnRef = useRef<HTMLButtonElement>(null);

  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const { mode, setMode } = useEnvironment();

  // 3-dot dropdown states
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [desktopMenuOpen, setDesktopMenuOpen] = useState(false);
  const [copiedHeaderAddress, setCopiedHeaderAddress] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const desktopMenuRef = useRef<HTMLDivElement>(null);

  const handleCopy = (addr: string) => {
    if (!addr) return;
    navigator.clipboard.writeText(addr);
    setCopiedHeaderAddress(true);
    setTimeout(() => setCopiedHeaderAddress(false), 2000);
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(e.target as Node)) {
        setMobileMenuOpen(false);
      }
      if (desktopMenuRef.current && !desktopMenuRef.current.contains(e.target as Node)) {
        setDesktopMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, []);

  const isUserAdmin = Boolean(admin || isAdmin(evmAddress));

  const renderDropdownContent = (isMobile: boolean) => (
    <div
      style={{
        position: "absolute",
        top: "calc(100% + 10px)",
        right: 0,
        minWidth: isMobile ? 180 : 200,
        borderRadius: 16,
        padding: 6,
        background: isDark ? "rgba(18, 22, 32, 0.98)" : "rgba(255, 255, 255, 0.98)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        border: isDark ? "1px solid rgba(255, 255, 255, 0.12)" : "1px solid rgba(0, 0, 0, 0.08)",
        boxShadow: isDark
          ? "0 20px 48px -8px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.06)"
          : "0 20px 48px -8px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.04)",
        zIndex: 100,
        display: "flex",
        flexDirection: "column",
        gap: 2,
        animation: "fadeIn 0.18s cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      {/* Admin Panel Option */}
      {admin && onAdminClick && (
        <>
          <button
            type="button"
            onClick={() => {
              onAdminClick();
              if (isMobile) setMobileMenuOpen(false);
              else setDesktopMenuOpen(false);
            }}
            style={{
              display: "flex",
              alignItems: "center",
              width: "100%",
              padding: "9px 12px",
              borderRadius: 10,
              border: "none",
              background: "transparent",
              color: "var(--text-primary)",
              fontSize: 14,
              fontWeight: 500,
              cursor: "pointer",
              textAlign: "left",
              transition: "background 0.15s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
          >
            Admin Panel
          </button>
          <div style={{ height: 1, background: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)", margin: "2px 4px" }} />
        </>
      )}

      {/* Mainnet Toggle (Locked for non-admin users) */}
      <div
        onClick={() => {
          if (isUserAdmin) {
            setMode(mode === "mainnet" ? "testnet" : "mainnet");
          }
        }}
        title={isUserAdmin ? "Toggle Mainnet / Testnet" : "No access"}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "9px 12px",
          borderRadius: 10,
          cursor: isUserAdmin ? "pointer" : "not-allowed",
          opacity: isUserAdmin ? 1 : 0.75,
          transition: "background 0.15s ease",
          userSelect: "none",
        }}
        onMouseEnter={(e) => {
          if (isUserAdmin) {
            e.currentTarget.style.background = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)";
          }
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "transparent";
        }}
      >
        <span style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)" }}>Mainnet</span>

        {/* Toggle Switch */}
        <div
          style={{
            width: 36,
            height: 20,
            borderRadius: 99,
            background: isUserAdmin && mode === "mainnet" ? "#22c55e" : (isDark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.14)"),
            position: "relative",
            transition: "background 0.2s ease",
            flexShrink: 0,
            opacity: isUserAdmin ? 1 : 0.5,
          }}
        >
          <div
            style={{
              width: 16,
              height: 16,
              borderRadius: "50%",
              background: "#ffffff",
              position: "absolute",
              top: 2,
              left: isUserAdmin && mode === "mainnet" ? 18 : 2,
              transition: "left 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
              boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
            }}
          />
        </div>
      </div>

      <div style={{ height: 1, background: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)", margin: "2px 4px" }} />

      {/* Dark Mode Toggle */}
      <div
        onClick={() => setTheme(isDark ? "light" : "dark")}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "9px 12px",
          borderRadius: 10,
          cursor: "pointer",
          transition: "background 0.15s ease",
          userSelect: "none",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "transparent";
        }}
      >
        <span style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)" }}>Dark Theme</span>

        {/* Toggle Switch */}
        <div
          style={{
            width: 36,
            height: 20,
            borderRadius: 99,
            background: isDark ? "#3b82f6" : "rgba(0,0,0,0.14)",
            position: "relative",
            transition: "background 0.2s ease",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: 16,
              height: 16,
              borderRadius: "50%",
              background: "#ffffff",
              position: "absolute",
              top: 2,
              left: isDark ? 18 : 2,
              transition: "left 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
              boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
            }}
          />
        </div>
      </div>
    </div>
  );

  return (
    <>
      {variant === "mobile" ? (
        /* Mobile Top Bar - iOS App Style */
        <header
          style={{
            position: "sticky",
            top: 0,
            zIndex: 50,
            width: "100%",
            background: resolvedTheme === "dark" ? "rgba(10, 13, 18, 0.85)" : "rgba(255, 255, 255, 0.85)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            borderBottom: "1px solid var(--border-soft)",
          }}
          className="md:hidden"
        >
          <div
            style={{
              width: "100%",
              display: "flex",
              height: 52,
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0 14px",
              gap: 8,
            }}
          >
            {/* Mobile Logo */}
            <div className="flex items-center shrink min-w-0" style={{ gap: 8 }}>
              <Image
                src="/rocket-logo.png"
                alt="Arc.Fun Logo"
                width={28}
                height={28}
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 8,
                  objectFit: "cover",
                  flexShrink: 0,
                }}
                priority
              />
              <span
                className="mobile-brand-text hidden min-[440px]:inline"
                style={{
                  fontSize: 17,
                  fontWeight: 300,
                  color: "var(--text-primary)",
                  letterSpacing: "0.12em",
                  whiteSpace: "nowrap",
                  textTransform: "uppercase",
                  fontFamily: "var(--font-inter), sans-serif",
                }}
              >
                ARCFUN
              </span>
            </div>

            {/* Mobile Controls */}
            <ConnectButton.Custom>
              {({
                account,
                chain,
                openChainModal,
                authenticationStatus,
                mounted,
              }) => {
                const ready = mounted && authenticationStatus !== "loading";
                const connected = ready && account && chain && (!authenticationStatus || authenticationStatus === "authenticated");

                return (
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {/* Mobile Network Selector */}
                    {connected && !chain?.unsupported && (
                      <button
                        onClick={openChainModal}
                        style={{
                          height: 32,
                          padding: "0 8px",
                          borderRadius: 99,
                          background: "var(--surface)",
                          border: "1px solid var(--border)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: "pointer",
                          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                        }}
                        type="button"
                        title={chain.name ?? "Network"}
                      >
                        {chain.hasIcon && chain.iconUrl && (
                          <img
                            alt={chain.name ?? "Chain icon"}
                            src={chain.iconUrl}
                            style={{ width: 16, height: 16, borderRadius: "50%" }}
                          />
                        )}
                      </button>
                    )}

                    {/* Mobile Wallet Button */}
                    <button
                      ref={walletBtnRef}
                      onClick={() => setWalletOpen(true)}
                      style={{
                        height: 32,
                        padding: anyConnectedHeader ? "0 10px 0 4px" : "0 12px",
                        borderRadius: 99,
                        background: "var(--surface)",
                        border: "1px solid var(--border)",
                        fontSize: 12,
                        fontWeight: 600,
                        color: "var(--text-primary)",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                      }}
                    >
                      {anyConnectedHeader && (
                        <div
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: "50%",
                            overflow: "hidden",
                            WebkitMaskImage: "-webkit-radial-gradient(white, black)",
                            flexShrink: 0,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            background: "var(--surface-soft, rgba(255,255,255,0.08))",
                            border: "1px solid var(--border)",
                            padding: 0,
                          }}
                        >
                          {ensAvatar ? (
                            <img
                              src={ensAvatar}
                              alt="ENS Avatar"
                              style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%", display: "block" }}
                            />
                          ) : (
                            <img
                              src={activeWalletIcon}
                              alt="Wallet"
                              style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%", display: "block" }}
                              className={activeWalletIcon === "/icons/stellar.png" ? "dark:invert" : ""}
                            />
                          )}
                        </div>
                      )}
                      <span style={{ maxWidth: 88, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{activeDisplayName}</span>
                      <ChevronDown size={12} />
                    </button>

                    {/* Mobile 3-dot Menu */}
                    <div ref={mobileMenuRef} style={{ position: "relative" }}>
                      <button
                        onClick={() => setMobileMenuOpen(prev => !prev)}
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: "50%",
                          background: "var(--surface)",
                          border: "1px solid var(--border)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: "pointer",
                          color: "var(--text-primary)",
                          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                          transition: "all 0.15s ease",
                        }}
                        type="button"
                        title="Menu"
                      >
                        <MoreVertical size={16} />
                      </button>
                      {mobileMenuOpen && renderDropdownContent(true)}
                    </div>
                  </div>
                );
              }}
            </ConnectButton.Custom>
          </div>
        </header>
      ) : (
        /* Desktop Top Right Controls Inside Card (Polymarket / Solflare Modern Scale) */
        <div
          className="hidden md:flex desktop-header-controls"
          style={{
            position: "absolute",
            top: 14,
            right: 18,
            zIndex: 30,
            alignItems: "center",
            gap: 10,
          }}
        >

          {/* Connect Button & RainbowKit Chain / Profile */}
          <ConnectButton.Custom>
            {({
              account,
              chain,
              openChainModal,
              authenticationStatus,
              mounted,
            }) => {
              const ready = mounted && authenticationStatus !== "loading";
              const connected =
              ready &&
              account &&
              chain &&
              (!authenticationStatus ||
                authenticationStatus === "authenticated");

              const solanaWallet = useWallet();
              const solanaConnected = solanaWallet.connected;
              const totalConnected =
                (connected ? 1 : 0) +
                (solanaConnected ? 1 : 0) +
                (stellarConnected ? 1 : 0) +
                (suiConnected ? 1 : 0);

              // Identity computation for profile pill
              let displayName = "Connect";
              let primaryWalletIcon = WALLET_CDN.ethereum;

              if (ensName) {
                displayName = ensName;
                primaryWalletIcon = (account as any)?.connector?.icon || activeConnector?.icon || getWalletFallbackIcon(activeConnector?.id || "", activeConnector?.name || "") || WALLET_CDN.metamask;
              } else if (connected && account?.address) {
                displayName = `${account.address.slice(0, 4)}...${account.address.slice(-4)}`;
                primaryWalletIcon = (account as any)?.connector?.icon || activeConnector?.icon || getWalletFallbackIcon(activeConnector?.id || "", activeConnector?.name || "") || WALLET_CDN.metamask;
              } else if (solanaConnected && solanaWallet.publicKey) {
                const pk = solanaWallet.publicKey.toBase58();
                displayName = `${pk.slice(0, 4)}...${pk.slice(-4)}`;
                primaryWalletIcon = solanaWallet.wallet?.adapter?.icon || WALLET_CDN.phantom || WALLET_CDN.solana;
              } else if (stellarConnected && stellarAddress) {
                displayName = `${stellarAddress.slice(0, 4)}...${stellarAddress.slice(-4)}`;
                primaryWalletIcon = "/icons/stellar.png";
              } else if (suiConnected && suiAddress) {
                displayName = `${suiAddress.slice(0, 4)}...${suiAddress.slice(-4)}`;
                primaryWalletIcon = WALLET_CDN.sui;
              }

              const effectiveAvatar =
                ensAvatar ||
                account?.ensAvatar ||
                (displayName.includes(".eth") ? `https://euc.li/${displayName}` : null);

              return (
                <div
                  {...(!ready && {
                    "aria-hidden": true,
                    style: {
                      opacity: 0,
                      pointerEvents: "none",
                      userSelect: "none",
                    },
                  })}
                  style={{ display: "flex", alignItems: "center", gap: 10 }}
                >
                  {/* Network selection pill (Network name and logo) */}
                  {connected && chain?.unsupported && (
                    <button
                      onClick={openChainModal}
                      style={{
                        height: 42,
                        padding: "0 14px",
                        borderRadius: 99,
                        background: "rgba(239, 68, 68, 0.12)",
                        border: "1px solid rgba(239, 68, 68, 0.35)",
                        color: "#ef4444",
                        fontSize: 13,
                        fontWeight: 600,
                        display: "flex",
                        alignItems: "center",
                        gap: 7,
                        cursor: "pointer",
                        boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
                      }}
                      className="hover:scale-105 active:scale-95 transition-all"
                      type="button"
                    >
                      <AlertTriangle size={15} />
                      <span>Wrong Network</span>
                    </button>
                  )}

                  {connected && !chain?.unsupported && (
                    <button
                      onClick={openChainModal}
                      style={{
                        height: 42,
                        padding: "0 14px",
                        borderRadius: 99,
                        background: "var(--surface)",
                        backdropFilter: "blur(14px)",
                        WebkitBackdropFilter: "blur(14px)",
                        border: "1px solid var(--border)",
                        color: "var(--text-primary)",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 8,
                        fontSize: 13,
                        fontWeight: 600,
                        boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
                        transition: "all 0.15s ease",
                      }}
                      className="hover:border-[var(--text-primary)]/40 hover:scale-[1.02] active:scale-[0.98]"
                      type="button"
                      title={chain.name ?? "Network"}
                    >
                      {chain.hasIcon ? (
                        <div
                          style={{
                            background: "transparent",
                            width: 20,
                            height: 20,
                            borderRadius: "50%",
                            overflow: "hidden",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                          }}
                        >
                          {chain.iconUrl && (
                            <img
                              alt={chain.name ?? "Chain icon"}
                              src={chain.iconUrl}
                              style={{ width: 20, height: 20, objectFit: "cover" }}
                            />
                          )}
                        </div>
                      ) : (
                        <div
                          style={{
                            width: 20,
                            height: 20,
                            borderRadius: "50%",
                            background: "var(--surface-soft, rgba(0,0,0,0.06))",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 11,
                            fontWeight: 700,
                            color: "var(--text-muted)",
                          }}
                        >
                          {chain.name?.charAt(0) ?? "?"}
                        </div>
                      )}
                      <span className="hidden sm:inline font-medium">{chain.name}</span>
                    </button>
                  )}

                  {/* Profile & Wallet Button */}
                  <button
                    id="wallet-dropdown-trigger"
                    ref={walletBtnRef}
                    onClick={() => setWalletOpen(true)}
                    type="button"
                    style={{
                      height: 42,
                      padding: totalConnected === 0 ? "0 20px" : "4px 14px 4px 6px",
                      borderRadius: 99,
                      background: "var(--surface)",
                      backdropFilter: "blur(14px)",
                      WebkitBackdropFilter: "blur(14px)",
                      border: "1px solid var(--border)",
                      color: "var(--text-primary)",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      fontSize: 14,
                      fontWeight: 600,
                      boxShadow: "0 2px 10px rgba(0,0,0,0.08)",
                      transition: "all 0.15s ease",
                    }}
                    className="hover:border-[var(--text-primary)]/40 hover:scale-[1.02] active:scale-[0.98]"
                  >
                    {totalConnected === 0 ? (
                      <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>Connect</span>
                    ) : (
                      <>
                        {/* Circular avatar or connected wallet logo */}
                        <div
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: "50%",
                            background: "var(--surface-soft, rgba(255, 255, 255, 0.08))",
                            border: "1px solid var(--border)",
                            color: "var(--text-primary)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                            overflow: "hidden",
                            WebkitMaskImage: "-webkit-radial-gradient(white, black)",
                            padding: 0,
                          }}
                        >
                          {effectiveAvatar ? (
                            <img
                              src={effectiveAvatar}
                              alt={displayName}
                              style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%", display: "block" }}
                              onError={(e) => {
                                (e.target as HTMLElement).style.display = "none";
                              }}
                            />
                          ) : (
                            <img
                              src={primaryWalletIcon}
                              alt={displayName}
                              style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%", display: "block" }}
                              className={primaryWalletIcon === "/icons/stellar.png" ? "dark:invert" : ""}
                            />
                          )}
                        </div>

                        {/* ENS / Wallet Address Display */}
                        <span style={{ maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 14 }}>
                          {displayName}
                        </span>

                        <ChevronDown size={15} style={{ color: "var(--text-muted)" }} />
                      </>
                    )}
                  </button>
                </div>
              );
            }}
          </ConnectButton.Custom>

          {/* Desktop 3-dot Menu */}
          <div ref={desktopMenuRef} style={{ position: "relative" }}>
            <button
              onClick={() => setDesktopMenuOpen(prev => !prev)}
              style={{
                width: 42,
                height: 42,
                borderRadius: "50%",
                background: "var(--surface)",
                backdropFilter: "blur(14px)",
                WebkitBackdropFilter: "blur(14px)",
                border: "1px solid var(--border)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--text-primary)",
                boxShadow: "0 2px 10px rgba(0,0,0,0.08)",
                transition: "all 0.15s ease",
              }}
              className="hover:scale-105 active:scale-95 hover:border-[var(--text-primary)]"
              type="button"
              title="Menu"
            >
              <MoreVertical size={18} />
            </button>
            {desktopMenuOpen && renderDropdownContent(false)}
          </div>
        </div>
      )}

      {/* Slide-over Drawer component */}
      <WalletDropdown
        isOpen={walletOpen}
        onClose={() => setWalletOpen(false)}
        anchorRef={walletBtnRef}
        evmAccount={evmAddress ? { address: evmAddress } : undefined}
        solanaAccount={solanaConnectedHeader && solanaWalletHeader.publicKey ? { address: solanaWalletHeader.publicKey.toBase58() } : undefined}
        ensName={ensName}
        ensAvatar={ensAvatar || (ensName ? `https://euc.li/${ensName}` : null)}
        admin={admin}
        onAdminClick={onAdminClick}
      />
    </>
  );
}
