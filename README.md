# rhino.fi Public Docs

Public documentation for [rhino.fi](https://rhino.fi), built with [Mintlify](https://mintlify.com).

## Development

Install the [Mintlify CLI](https://www.npmjs.com/package/mintlify) to preview changes locally:

```
npm i -g mintlify
```

Then run at the project root (where `docs.json` is):

```
mintlify dev
```

## Updating the Supported Chains page

The `get-started/supported-chains.mdx` page is generated from the live [bridge configs API](https://api.rhino.fi/bridge/configs). To regenerate it:

```
npx tsx scripts/generateSupportedChains.ts
```

This fetches the current chain/token data from the API and writes the MDX file.

**When a new chain or token is added to the API**, the script will print a warning about missing entries. To add tooltip text for the new token, edit `scripts/tokenConfig.json`:

```jsonc
// "native" → token is natively issued on this chain
// "USDT0"  → shows "Represented as USDT0 for this chain"
// (omit)   → no tooltip shown
{
  "representations": {
    "CHAIN_KEY": {
      "TOKEN": "native"
    }
  }
}
```

Then re-run the script.

## Publishing Changes

Changes are deployed to production automatically after pushing to the default branch via the Mintlify GitHub App.

## Troubleshooting

- **Mintlify dev isn't running** — Run `mintlify install` to re-install dependencies.
- **Page loads as a 404** — Make sure you are running in a folder with `docs.json`.
