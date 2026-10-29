import { useState, useEffect } from 'react';
import { usePublicClient } from 'wagmi';
import { tokenMetadataService, TokenMetadata } from './TokenMetadataService';

export function useTokenMetadata(address?: string, chainId?: number) {
  const [data, setData] = useState<TokenMetadata | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const publicClient = usePublicClient({ chainId });

  useEffect(() => {
    let isMounted = true;

    if (!address || !chainId || !publicClient) {
      setData(null);
      setIsLoading(false);
      return;
    }

    const fetchMetadata = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const metadata = await tokenMetadataService.getTokenMetadata(address, chainId, publicClient);
        if (isMounted) {
          setData(metadata);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err);
          // Fallback UI data on permanent failure
          setData({
            address,
            chainId,
            name: 'Unknown Token',
            symbol: 'UNKNOWN',
            decimals: 18,
            logoURI: '/icons/unknown-token.svg',
            updatedAt: Date.now()
          });
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchMetadata();

    return () => {
      isMounted = false;
    };
  }, [address, chainId, publicClient]);

  return { data, isLoading, error };
}
