'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider, createConfig, http } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { upchain } from '@/lib/constants'
import { useState, type ReactNode } from 'react'

const config = createConfig({
  chains: [upchain],
  connectors: [injected()],
  transports: {
    [upchain.id]: http(upchain.rpcUrls.default.http[0]),
  },
})

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  )
}
