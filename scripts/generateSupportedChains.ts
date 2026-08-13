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
  // Absent for most tokens. Explicitly 0 means settlement is not automatic:
  // deposits are accepted but the withdrawal is processed on demand. A
  // non-zero value (e.g. Tron USDT) is an ordinary cap, not an on-demand flag.
  maxWithdrawLimit?: number
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

const ON_DEMAND_TIP =
  'Activated on request: acceptance enabled, settlement on demand'

// `maxWithdrawLimit: 0` marks a token that is accepted on a chain but settled
// on demand rather than automatically. The field is absent for most tokens,
// so check for an explicit zero — `!maxWithdrawLimit` would catch those too.
function isOnDemand(c: ChainConfig, token: string): boolean {
  return c.tokens[token]?.maxWithdrawLimit === 0
}

// Tooltips cannot nest, so a token that is both represented under another
// name and settled on demand carries a single combined tip.
function joinTips(tips: string[]): string {
  return tips
    .map((t, i) => (i === 0 ? t : t.charAt(0).toLowerCase() + t.slice(1)))
    .join('; ')
}

function formatToken(
  token: string,
  chainKey: string,
  reps: Representations,
  onDemand = false,
): string {
  const rep = reps[chainKey]?.[token]
  const tips: string[] = []
  if (rep === 'native') tips.push('native')
  else if (rep) tips.push(`Represented as ${rep} for this chain`)
  if (onDemand) tips.push(ON_DEMAND_TIP)
  if (!tips.length) return token
  return `<Tooltip tip="${joinTips(tips)}">${token}</Tooltip>`
}

// Chains that only support their native asset (e.g. Bitcoin) come back from the
// API with an empty `tokens` map — fall back to the native token name.
function chainTokens(c: ChainConfig): string[] {
  const tokens = Object.keys(c.tokens)
  return tokens.length ? tokens : [c.nativeTokenName]
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

// Some chains represent a token under a different *ticker* (e.g. ETH is WETH
// on Avalanche). The bridging table lists chain names only, so we flag those
// chains with a tooltip on the chain name. Suffix-only representations
// (USDT0, USDT.e, ETH.e, WBTC0 …) are still the same ticker → no tooltip.
function bridgingRepTicker(
  token: string,
  chainKey: string,
  reps: Representations,
): string | null {
  const rep = reps[chainKey]?.[token]
  if (!rep || rep === 'native') return null
  const base = rep.replace(/\.[a-z]+$/i, '').replace(/\d+$/, '')
  return base === token ? null : base
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function genBridgingTab(
  chains: [string, ChainConfig][],
  reps: Representations,
): string {
  const stablecoins = new Set(config.stablecoins)

  // Invert: token → [chainKey, chainConfig]
  const tokenChains: Record<string, [string, ChainConfig][]> = {}
  for (const [key, c] of chains) {
    for (const token of chainTokens(c)) {
      ;(tokenChains[token] ??= []).push([key, c])
    }
  }

  // Tokens on a single chain cannot be bridged anywhere, but they are still
  // listed here so this table stays a complete view of supported assets —
  // the dagger footnote explains that they are swap-only.
  return Object.entries(tokenChains)
    .sort(([tA, a], [tB, b]) => {
      if (b.length !== a.length) return b.length - a.length
      const sa = stablecoins.has(tA) ? 0 : 1
      const sb = stablecoins.has(tB) ? 0 : 1
      if (sa !== sb) return sa - sb
      return tA.localeCompare(tB)
    })
    .map(([token, cs]) => {
      const sorted = [...cs].sort(([, a], [, b]) => a.name.localeCompare(b.name))
      // Wrap on plain names first so rows without tooltips are unaffected,
      // then inject the chain-name tooltips.
      let cell = wrapLines(sorted.map(([, c]) => c.name).join(', '))
      for (const [key, c] of sorted) {
        const name = c.name
        const ticker = bridgingRepTicker(token, key, reps)
        if (!ticker) continue
        const re = new RegExp(`(?<![A-Za-z])${escapeRegExp(name)}(?![A-Za-z])`)
        cell = cell.replace(
          re,
          `<Tooltip tip="Represented as ${ticker} for this chain">${name}</Tooltip>`,
        )
      }
      // On demand is a per chain/token property, but this table lists chains
      // rather than tokens, so it is flagged once on the asset whenever it
      // applies to any of them. The per-chain detail is on the next tab.
      const onDemand = sorted.some(([, c]) => isOnDemand(c, token))
      const asset = onDemand
        ? `<Tooltip tip="${ON_DEMAND_TIP}">${token}</Tooltip>`
        : token
      return `    | ${asset} | ${cell} |`
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
      const tokens = chainTokens(c)
      const stables = tokens.filter((t) => stablecoins.has(t)).sort()
      const others = tokens.filter((t) => !stablecoins.has(t)).sort()
      const fmt = (t: string) => formatToken(t, key, reps, isOnDemand(c, t))
      const stableCell = stables.map(fmt).join(', ')
      const otherCell = others.map(fmt).join(', ')
      return `    | ${c.name} | ${stableCell} | ${otherCell} |`
    })
    .join('\n')
}

function tokenList(tokens: string[]): string {
  return `  ${[...tokens].sort((a, b) => a.localeCompare(b)).join(', ')}`
}

// Both caveats below are otherwise only discoverable by hovering a tooltip or
// by noticing that a row lists a single chain. Neither survives the page being
// flattened to plain markdown (llms.txt, an agent fetching the docs), so they
// are spelled out once below the tables where they can actually be read.
function genNotes(chains: [string, ChainConfig][]): string {
  const onDemand = new Set<string>()
  const tokenChains: Record<string, string[]> = {}
  for (const [, c] of chains) {
    for (const token of chainTokens(c)) {
      ;(tokenChains[token] ??= []).push(c.name)
      if (isOnDemand(c, token)) onDemand.add(token)
    }
  }

  const sections: string[] = []
  if (onDemand.size) {
    sections.push(
      `  **Assets activated on request.** The assets below are supported, but acceptance is enabled with settlement on demand rather than automatic, so they are activated on request. If a route you need involves one of them, [talk to the team](https://rhino.fi/contact) to have it enabled.

${tokenList([...onDemand])}`,
    )
  }
  const single = Object.keys(tokenChains).filter(
    (t) => tokenChains[t].length === 1,
  )
  if (single.length) {
    sections.push(
      `  **Assets supported on a single chain.** The assets below are supported on one chain only, so they cannot be bridged. They can still be swapped to an asset on another chain via Bridge \\+ swap.

${tokenList(single)}`,
    )
  }
  if (!sections.length) return ''
  return `<Note>
${sections.join('\n\n')}
</Note>

`
}

function genSDATab(
  chains: [string, ChainConfig][],
  reps: Representations,
): string {
  const stablecoins = new Set(config.stablecoins)
  return chains
    .filter(([, c]) => c.enabledDepositAddress)
    .map(([key, c]) => {
      // The native token is normally excluded (it is the gas token), but on
      // native-only chains it *is* the deposit asset — keep it there.
      const available = chainTokens(c)
      const tokens = Object.keys(c.tokens).length
        ? available.filter((t) => t !== c.nativeTokenName)
        : available
      const stables = tokens.filter((t) => stablecoins.has(t)).sort()
      const others = tokens.filter((t) => !stablecoins.has(t)).sort()
      const all = [...stables, ...others]
      const cell = all
        .map((t) => formatToken(t, key, reps, isOnDemand(c, t)))
        .join(', ')
      return `    | ${c.name} | ${cell} |`
    })
    .join('\n')
}

// ---------------------------------------------------------------------------
// MDX template
// ---------------------------------------------------------------------------

function template(
  bridging: string,
  swapping: string,
  sda: string,
  notes: string,
): string {
  return `---
title: "Supported Chains"
description: 'List of chains that Rhino.fi smart contracts are deployed on and tokens supported. The chains in the "Smart Deposit Address" tab are those chains on which you can generate SDAs. Funds from these deposit addresses can be bridged to any of our supported chains.'
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

    **The following table details what chains a token can be bridged across:**

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

    N.B ETH can be bridged to/from on the below chains when sending from an Externally Owned Account (EOA). If sending from a smart contract then Base is not supported. Please also note that ETH cannot be specified as the destination asset, it can only be the source asset and swapped to stablecoins.

    **The following table details what tokens can be sent from, and swapped to, using the Rhino.fi bridge:**

    | Chain | Stablecoins | Other Assets |
    | --- | --- | --- |
${swapping}
  </Tab>
  <Tab title="Smart Deposit Addresses">
    **Smart Deposit Addresses (SDAs)** allow you to receive supported tokens on a supported chain and route them onwards. They have inbuilt bridging and swapping functionality, therefore once assets are received into the SDA, then they can be swapped and bridged to the chains listed on the 'Bridging and Swapping' tab.

    For SDA activity, always check:

    - that the token being **sent into the SDA** is supported on that SDA chain
    - that the token being **received on the destination chain** is supported on the destination chain

    > **SDA Examples:**
    >
    > - _USDT on Tron → USDT on Polygon works because USDT is supported on both chains._
    > - _USDC on Polygon → USDT on Celo works because USDC is supported on Polygon and USDT is supported on Celo._
    > - _USDT on Kaia → USDC on Tron will not work because Tron does not support USDC._

    \\*To understand what tokens can be swapped and/or bridged without using Rhino.fi Smart Deposit Addresses, please look at the 'Bridging' or 'Bridging and Swapping' tab.

    N.B ETH can be received into a Rhino.fi Smart Deposit Address on the below chains when sending from an Externally Owned Account (EOA). If sending from a smart contract then Base is not supported.

    **The following table details what tokens can be sent to a Rhino.fi Smart Deposit Address:**

    | **Chain** | **Tokens that can be sent to a Smart Deposit Address on this chain** |
    | :-- | :-- |
${sda}
  </Tab>
</Tabs>

${notes}`
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

  const bridging = genBridgingTab(enabled, reps)
  const swapping = genSwappingTab(enabled, reps)
  const sda = genSDATab(enabled, reps)

  const mdx = template(bridging, swapping, sda, genNotes(enabled))
  const out = resolve('../get-started/supported-chains.mdx')
  writeFileSync(out, mdx)
  console.log(`Written to ${out}`)

  // Warn about missing representations
  const missing: string[] = []
  for (const [key, c] of enabled) {
    for (const token of chainTokens(c)) {
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
