/**
 * Generates get-started/supported-chains.mdx from the live bridge configs API.
 *
 * Run: npx tsx scripts/generateSupportedChains.ts
 *
 * Token representation names (tooltips) are read from scripts/tokenConfig.json.
 * When a new chain or token is added to the API, the script will warn about
 * missing entries — just add the representation to tokenConfig.json and re-run.
 *
 * Config values:
 *   "native"       → <Tooltip tip="native">TOKEN</Tooltip>
 *   "USDT0"        → <Tooltip tip="Represented as USDT0 for this chain">TOKEN</Tooltip>
 *   (absent)       → TOKEN  (no tooltip)
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const resolve = (rel: string) => fileURLToPath(new URL(rel, import.meta.url))

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TokenInfo {
  token: string
  address: string
  decimals: number
}

interface ChainConfig {
  name: string
  nativeTokenName: string
  status: string
  tokens: Record<string, TokenInfo>
  enabledDepositAddress: boolean
}

type Representations = Record<string, Record<string, string>>

interface Config {
  stablecoins: string[]
  representations: Representations
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatToken(
  token: string,
  chainKey: string,
  reps: Representations,
): string {
  const rep = reps[chainKey]?.[token]
  if (!rep) return token
  if (rep === 'native') return `<Tooltip tip="native">${token}</Tooltip>`
  return `<Tooltip tip="Represented as ${rep} for this chain">${token}</Tooltip>`
}

function wrapLines(text: string, max = 70): string {
  if (text.length <= max) return text
  const parts: string[] = []
  let rest = text
  while (rest.length > max) {
    const i = rest.lastIndexOf(', ', max)
    const breakAt = i >= 0 ? i : rest.indexOf(', ')
    if (breakAt < 0) break
    parts.push(rest.slice(0, breakAt + 2))
    rest = rest.slice(breakAt + 2)
  }
  if (rest) parts.push(rest)
  return parts.join('<br />')
}

// ---------------------------------------------------------------------------
// Tab generators
// ---------------------------------------------------------------------------

function genBridgingTab(chains: [string, ChainConfig][]): string {
  const stablecoins = new Set(config.stablecoins)

  // Invert: token → chain names
  const tokenChains: Record<string, string[]> = {}
  for (const [, c] of chains) {
    for (const token of Object.keys(c.tokens)) {
      ;(tokenChains[token] ??= []).push(c.name)
    }
  }

  return Object.entries(tokenChains)
    .filter(([, cs]) => cs.length >= 2)
    .sort(([tA, a], [tB, b]) => {
      if (b.length !== a.length) return b.length - a.length
      const sa = stablecoins.has(tA) ? 0 : 1
      const sb = stablecoins.has(tB) ? 0 : 1
      if (sa !== sb) return sa - sb
      return tA.localeCompare(tB)
    })
    .map(([token, cs]) => {
      const sorted = [...cs].sort((a, b) => a.localeCompare(b))
      return `    | ${token} | ${wrapLines(sorted.join(', '))} |`
    })
    .join('\n')
}

function genSwappingTab(
  chains: [string, ChainConfig][],
  reps: Representations,
): string {
  const stablecoins = new Set(config.stablecoins)
  return chains
    .map(([key, c]) => {
      const tokens = Object.keys(c.tokens)
      const stables = tokens.filter((t) => stablecoins.has(t)).sort()
      const others = tokens.filter((t) => !stablecoins.has(t)).sort()
      const stableCell = stables.map((t) => formatToken(t, key, reps)).join(', ')
      const otherCell = others.map((t) => formatToken(t, key, reps)).join(', ')
      return `    | ${c.name} | ${stableCell} | ${otherCell} |`
    })
    .join('\n')
}

function genSDATab(
  chains: [string, ChainConfig][],
  reps: Representations,
): string {
  const stablecoins = new Set(config.stablecoins)
  return chains
    .filter(([, c]) => c.enabledDepositAddress)
    .map(([key, c]) => {
      const tokens = Object.keys(c.tokens).filter(
        (t) => t !== c.nativeTokenName,
      )
      const stables = tokens.filter((t) => stablecoins.has(t)).sort()
      const others = tokens.filter((t) => !stablecoins.has(t)).sort()
      const all = [...stables, ...others]
      const cell = all.map((t) => formatToken(t, key, reps)).join(', ')
      return `    | ${c.name} | ${cell} |`
    })
    .join('\n')
}

// ---------------------------------------------------------------------------
// MDX template
// ---------------------------------------------------------------------------

function template(bridging: string, swapping: string, sda: string): string {
  return `---
title: "Supported Chains"
description: 'List of chains that rhino.fi smart contracts are deployed on and tokens supported. The chains in the "Smart Deposit Address" tab are those chains on which you can generate SDAs. Funds from these deposit addresses can be bridged to any of our supported chains.'
---

<Tabs>
  <Tab title="Bridging">
    Rhino.fi supports two route types:

    - **Bridge:** moves the same token between chains
    - **Bridge \\+ swap:** moves between chains and convert into a different supported token on the destination

    For bridge-only activity, always check that the source chain and destination chain support the same token

    > **Bridge- only Example:**
    >
    > - _USDT on Tron → USDT on Polygon works because USDT is supported on both Tron and Polygon._
    > - _USDT on Sonic → USDT on Paradex will not work as USDT is not supported on Paradex_

    \\*To understand what tokens can be swapped between chains please look at 'Bridging and Swapping' tab.

    | Asset | Blockchains it can be bridged between |
    | --- | --- |
${bridging}
  </Tab>
  <Tab title="Bridging and Swapping">
    Rhino.fi supports two route types:

    - **Bridge:** moves the same token between chains
    - **Bridge \\+ swap:** moves between chains and convert into a different supported token on the destination

    For bridge and swap activity, check that the token you wish to send is supported on the source chain and the token you wish to receive is supported on the destination chain

    > **Bridge and Swap Example:**
    >
    > _USDC on Optimism → USDT on Celo works because USDC is supported on Optimism and USDT is supported on Celo._

    \\*To understand what blockchains the same token can be bridged between, please look at 'Bridging' tab

    | Chain | Stablecoins | Other Assets |
    | --- | --- | --- |
${swapping}
  </Tab>
  <Tab title="Smart Deposit Addresses">
    **Smart Deposit Addresses (SDAs)** allow you to receive supported tokens on a supported chain and route them onwards.

    For SDA activity, always check:

    - that the token being **sent into the SDA** is supported on that SDA chain
    - that the token being **received on the destination chain** is supported on the destination chain

    > **SDA Examples:**
    >
    > - _USDT on Tron → USDT on Polygon works because USDT is supported on both chains._
    > - _USDC on Polygon → USDT on Celo works because USDC is supported on Polygon and USDT is supported on Celo._
    > - _USDT on Kaia → USDC on Tron will not work because Tron does not support USDC._

    \\*To understand what tokens can be swapped and/or bridged without using Rhino.fi Smart Deposit Addresses, please look at the 'Bridging' or 'Bridging and Swapping' tab.

    **Rhino.fi Smart Deposit Addresses have inbuilt bridging and swapping functionality, therefore once these assets are received into the SDA, then they can be swapped and bridged to the chains listed on the 'Bridging and Swapping' tab.**

    **The following table details what tokens can be sent to a Rhino.fi Smart Deposit Address for the full list of supported chains.**

    | **Chain** | **Tokens that can be sent to a Smart Deposit Address on this chain** |
    | :-- | :-- |
${sda}
  </Tab>
</Tabs>
`
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const config: Config = JSON.parse(
  readFileSync(resolve('./tokenConfig.json'), 'utf-8'),
)

async function main() {
  const res = await fetch('https://api.rhino.fi/bridge/configs')
  const configs: Record<string, ChainConfig> = await res.json()

  const enabled = Object.entries(configs)
    .filter(([, c]) => c.status === 'enabled')
    .sort(([, a], [, b]) => a.name.localeCompare(b.name))

  const reps = config.representations

  const bridging = genBridgingTab(enabled)
  const swapping = genSwappingTab(enabled, reps)
  const sda = genSDATab(enabled, reps)

  const mdx = template(bridging, swapping, sda)
  const out = resolve('../get-started/supported-chains.mdx')
  writeFileSync(out, mdx)
  console.log(`Written to ${out}`)

  // Warn about missing representations
  const missing: string[] = []
  for (const [key, c] of enabled) {
    for (const token of Object.keys(c.tokens)) {
      if (!reps[key]?.[token]) {
        missing.push(`  ${c.name} (${key}): ${token}`)
      }
    }
  }
  if (missing.length) {
    console.warn(
      '\nMissing representations in tokenConfig.json (no tooltip will be shown):',
    )
    missing.forEach((m) => console.warn(m))
  }
}

main().catch(console.error)
