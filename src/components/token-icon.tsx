import React from 'react';
import { useTokenMetadata } from '@/lib/tokens/useTokenMetadata';

export function TokenIcon({ 
  address, 
  chainId, 
  className,
  fallbackSrc = '/icons/unknown-token.svg'
}: { 
  address?: string; 
  chainId?: number; 
  className?: string;
  fallbackSrc?: string;
}) {
  const { data, isLoading } = useTokenMetadata(address, chainId);

  if (isLoading || !data) {
    return (
      <div className={className} style={{ 
        borderRadius: '50%', 
        backgroundColor: 'rgba(255,255,255,0.1)', 
        animation: 'pulse 1.5s infinite' 
      }} />
    );
  }

  return (
    <img 
      src={data.logoURI || fallbackSrc} 
      alt={data.symbol || 'Token'} 
      className={className} 
      onError={(e) => {
        (e.target as HTMLImageElement).src = fallbackSrc;
      }}
    />
  );
}
